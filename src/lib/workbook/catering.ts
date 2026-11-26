/**
 * Reads the separate WBR catering workbook. Pure: runs in the browser (admin upload) and in Node (tests).
 *
 * Tab 1 (name contains "Outbound", else the first tab): "Outbound Catering Team - Input & Output Metrics".
 *   One column per week, headed "Week of Aug 12". Rows are found by their label, not by position.
 * Tab 2 (name contains "Location", else the second tab): one block per week, with "Week of ..." as the heading
 *   above the table. The table has a column per location and a Total column; rows are found by label too.
 * Percent rows are ignored: the dashboard recomputes them from the counts.
 */
import * as XLSX from 'xlsx';
import type { LocationConfig } from '../types';
import { resolveLocationName } from './parse';

export interface CateringWeek {
  week: string; calls: number; connected: number; over90: number; emails: number; opens: number; mqls: number; mqlFup: number;
  ordersConfirmed: number | null; ordersPaid: number | null; valueConfirmed: number | null; valuePaid: number | null;
}
export type CateringCounts = { calls: number; connected: number; over90: number; emails: number; opens: number; mqls: number; mqlFup: number };
export interface CateringBlock { week: string; locations: Record<string, CateringCounts>; total: CateringCounts }
export interface CateringData { weeks: CateringWeek[]; location: CateringBlock | null; locationWeeks: CateringBlock[] }
export interface ParsedCatering { data: CateringData; warnings: string[] }

type Cell = string | number | null;
const rowsOf = (ws: XLSX.WorkSheet): Cell[][] => XLSX.utils.sheet_to_json<Cell[]>(ws, { header: 1, defval: null, blankrows: false });
const txt = (v: unknown): string => (v == null ? '' : String(v).replace(/\s+/g, ' ').trim());
const numOrNull = (v: unknown): number | null => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string') { const t = v.replace(/[$,\s]/g, ''); if (t !== '' && Number.isFinite(+t)) return +t; }
  return null;
};
const isWeekHead = (v: unknown) => /^week\s*of\b/i.test(txt(v));
const weekLabel = (v: unknown) => txt(v).replace(/^week\s*of\s*/i, '').replace(/\./g, '').trim();

const COUNT_KEYS = ['calls', 'connected', 'over90', 'emails', 'opens', 'mqls', 'mqlFup'] as const;
type CountKey = (typeof COUNT_KEYS)[number];

/** Label -> key for the count rows. Percent rows and anything unknown return null. */
function countKey(label: string): CountKey | null {
  const l = label.toLowerCase();
  if (l.includes('%')) return null;
  if (/calls\s*(\/|per)\s*week|^#?\s*calls$/.test(l)) return 'calls';
  if (/calls?\s*connected/.test(l)) return 'connected';
  if (/calls?\s*(>|≥|>=)\s*90/.test(l)) return 'over90';
  if (/emails?/.test(l)) return 'emails';
  if (/opens?/.test(l)) return 'opens';
  if (/fup/.test(l)) return 'mqlFup';
  if (/^mqls?$/.test(l)) return 'mqls';
  return null;
}

const firstLabel = (row: Cell[], upTo: number): string => { for (let i = 0; i < upTo; i++) if (txt(row[i])) return txt(row[i]); return ''; };

function parseOutbound(ws: XLSX.WorkSheet, warnings: string[]): CateringWeek[] {
  const rows = rowsOf(ws);
  const h = rows.findIndex((r) => r.filter(isWeekHead).length >= 1);
  if (h < 0) { warnings.push('The Outbound tab has no "Week of ..." column headings.'); return []; }
  const cols = rows[h].map((v, i) => (isWeekHead(v) ? i : -1)).filter((i) => i >= 0);
  const firstCol = cols[0];
  const weeks: CateringWeek[] = cols.map((c) => ({ week: weekLabel(rows[h][c]), calls: 0, connected: 0, over90: 0, emails: 0, opens: 0, mqls: 0, mqlFup: 0, ordersConfirmed: null, ordersPaid: null, valueConfirmed: null, valuePaid: null }));
  let confirmed = 0, paid = 0;                                   // "Orders (Confirmed)" / "Orders (Paid)" appear twice: first the counts, then the $ values
  for (const r of rows.slice(h + 1)) {
    const label = firstLabel(r, firstCol).toLowerCase();
    if (!label || label.includes('%')) continue;
    const put = (set: (w: CateringWeek, v: number | null) => void) => cols.forEach((c, i) => set(weeks[i], numOrNull(r[c])));
    const k = countKey(label);
    if (k) { put((w, v) => { w[k] = v ?? 0; }); continue; }
    if (/^orders\s*\(?confirmed/.test(label)) { if (confirmed++ === 0) put((w, v) => { w.ordersConfirmed = v; }); else put((w, v) => { w.valueConfirmed = v; }); }
    else if (/^orders\s*\(?paid/.test(label)) { if (paid++ === 0) put((w, v) => { w.ordersPaid = v; }); else put((w, v) => { w.valuePaid = v; }); }
  }
  return weeks;
}

const zero = (): CateringCounts => ({ calls: 0, connected: 0, over90: 0, emails: 0, opens: 0, mqls: 0, mqlFup: 0 });

function parseLocationWise(ws: XLSX.WorkSheet, locations: LocationConfig[], warnings: string[]): CateringBlock[] {
  const rows = rowsOf(ws);
  const heads = rows.map((r, i) => (r.some(isWeekHead) ? i : -1)).filter((i) => i >= 0);
  if (!heads.length) { warnings.push('The Location Wise tab has no "Week of ..." headings.'); return []; }
  const blocks: CateringBlock[] = [];
  const unknown = new Set<string>();
  heads.forEach((start, bi) => {
    const end = bi + 1 < heads.length ? heads[bi + 1] : rows.length;
    const week = weekLabel(rows[start].find(isWeekHead));
    // the column headings are on the heading row itself or on the first row below it that has location names
    let hr = -1;
    for (let i = start; i < end && hr < 0; i++) if (rows[i].some((v) => /^total$/i.test(txt(v)))) hr = i;
    if (hr < 0) { warnings.push(`Week of ${week}: no table with a Total column was found under this heading.`); return; }
    const totalCol = rows[hr].findIndex((v) => /^total$/i.test(txt(v)));
    // location names sit above an "Actual | Mix%" sub-heading row (the value is in the Actual column); with no sub-heading they share the Total row
    const SKIP = /^(metrics?|actual|mix\s*%?|total)$/i;
    const names = (r: Cell[]) => r.map((v, i) => ({ t: txt(v), i })).filter((x) => x.t && !isWeekHead(x.t) && !SKIP.test(x.t));
    const above = hr - 1 > start ? names(rows[hr - 1]) : [];
    const cols: { name: string; col: number }[] = (above.length ? above : names(rows[hr])).map(({ t, i }) => {
      const known = resolveLocationName(t, locations);
      if (!known) unknown.add(t);
      return { name: known ?? t, col: i };
    });
    const block: CateringBlock = { week, locations: Object.fromEntries(cols.map((c) => [c.name, zero()])), total: zero() };
    const firstData = Math.min(...cols.map((c) => c.col), totalCol >= 0 ? totalCol : Infinity);
    for (const r of rows.slice(hr + 1, end)) {
      const k = countKey(firstLabel(r, firstData).toLowerCase());
      if (!k) continue;
      for (const c of cols) block.locations[c.name][k] = numOrNull(r[c.col]) ?? 0;
      block.total[k] = totalCol >= 0 ? numOrNull(r[totalCol]) ?? 0 : cols.reduce((s, c) => s + block.locations[c.name][k], 0);
    }
    blocks.push(block);
  });
  if (unknown.size) warnings.push(`Locations not set up in the admin panel (shown under the name in the sheet): ${[...unknown].join(', ')}.`);
  return blocks;
}

/** Order of a "Mon D" label within a year, used when the Outbound tab does not list the week. */
const dayKey = (label: string): number => {
  const m = /^([A-Za-z]{3})[a-z]*\s+(\d{1,2})/.exec(label);
  const mo = m ? ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(m[1].toLowerCase()) + 1 : 0;
  return mo * 100 + (m ? +m[2] : 0);
};

export function parseCateringWorkbook(wb: XLSX.WorkBook, locations: LocationConfig[]): ParsedCatering {
  const warnings: string[] = [];
  const names = wb.SheetNames;
  const outName = names.find((n) => /outbound/i.test(n)) ?? names[0];
  const locName = names.find((n) => /location/i.test(n)) ?? names.find((n) => n !== outName);
  const weeks = outName ? parseOutbound(wb.Sheets[outName], warnings) : [];
  const blocks = locName ? parseLocationWise(wb.Sheets[locName], locations, warnings) : [];
  if (!locName) warnings.push('No Location Wise tab was found.');
  const order = new Map(weeks.map((w, i) => [w.week, i]));
  const rank = (b: CateringBlock) => (order.has(b.week) ? order.get(b.week)! : 1000 + dayKey(b.week));
  const locationWeeks = [...blocks].sort((a, b) => rank(a) - rank(b));
  return { data: { weeks, location: locationWeeks[locationWeeks.length - 1] ?? null, locationWeeks }, warnings };
}
