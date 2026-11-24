/**
 * Reads the weekly input workbook into plain JSON. Pure: runs in the browser (admin upload) and in Node (tests).
 * Nothing here knows about mapping: Toast rows are kept raw (dining option, sales category, net sales).
 */
import * as XLSX from 'xlsx';
import { PERIODS, type ApolloRow, type Kind, type LocationConfig, type LoyaltyData, type LoyaltyLocation, type MarketingData, type PeriodKey, type ReviewRow, type ReviewsData, type ToastRow, type UeAdRow } from '../types';

export const ALL_LOCATIONS = 'All Locations';

export interface ParsedWorkbook {
  /** Monday of the week being reported, guessed from the review sheets (the admin confirms it). */
  weekStart: string | null;
  toast: Partial<Record<PeriodKey, Partial<Record<Kind, Record<string, ToastRow[]>>>>>;
  reviews?: ReviewsData;
  loyalty?: LoyaltyData;
  marketing?: MarketingData;
  ueAds?: UeAdRow[];
  /** Names in the workbook that match no configured location or alias, with where they were seen. */
  unknownLocations: { name: string; where: string }[];
  /** Human-readable notes: missing tabs, skipped rows. */
  warnings: string[];
  /** Counts for the upload preview. */
  summary: { toastSheets: number; toastRows: number; reviewRows: number; loyaltyLocations: number; campaigns: number; apolloRows: number };
}

const PERIOD_BY_WORD: Record<string, PeriodKey> = { weekly: 'weekly', ptd: 'ptd', mtd: 'mtd', qtd: 'quarterly', quarterly: 'quarterly', ytd: 'ytd' };

type Cell = string | number | null;
const rowsOf = (ws: XLSX.WorkSheet): Cell[][] => XLSX.utils.sheet_to_json<Cell[]>(ws, { header: 1, defval: null, blankrows: false });
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(+v.replace(/[$,]/g, '')) ? +v.replace(/[$,]/g, '') : 0);
const txt = (v: unknown): string => (v == null ? '' : String(v).trim());
/** House style: no em dashes anywhere in the UI. */
const noEm = (s: string) => s.replace(/—/g, '-');

export function resolveLocationName(raw: string, locs: LocationConfig[]): string | null {
  const t = raw.trim().toLowerCase();
  for (const l of locs) if (l.name.toLowerCase() === t || l.aliases.some((a) => a.toLowerCase() === t)) return l.name;
  return null;
}

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
/** "Oct 12 - Oct 18, 2026" -> "2026-10-12". A range that crosses New Year ("Dec 28 - Jan 03, 2027") starts in the year before. */
export function weekStartFromRange(range: string): string | null {
  const m = /^\s*([A-Za-z]{3})[a-z]*\s+(\d{1,2})\s*-\s*([A-Za-z]{3})[a-z]*\s+(\d{1,2}),?\s*(\d{4})\s*$/.exec(range);
  if (!m) return null;
  const sm = MONTHS[m[1].toLowerCase()], em = MONTHS[m[3].toLowerCase()];
  if (!sm || !em) return null;
  const year = +m[5] - (sm > em ? 1 : 0);
  return `${year}-${String(sm).padStart(2, '0')}-${String(+m[2]).padStart(2, '0')}`;
}

export function parseWorkbook(wb: XLSX.WorkBook, locations: LocationConfig[]): ParsedWorkbook {
  const warnings: string[] = [];
  const unknown = new Map<string, string>();
  const noteUnknown = (name: string, where: string) => { if (name && !unknown.has(name)) unknown.set(name, where); };
  const out: ParsedWorkbook = {
    weekStart: null, toast: {}, unknownLocations: [], warnings,
    summary: { toastSheets: 0, toastRows: 0, reviewRows: 0, loyaltyLocations: 0, campaigns: 0, apolloRows: 0 },
  };

  /* ---------- Toast sales tabs ---------- */
  const overall = /^Toast\s+(Weekly|PTD|MTD|Quarterly|QTD|YTD)\s*-\s*(Actual|LY)$/i;
  const perLoc = /^(Weekly|PTD|MTD|Quarterly|QTD|YTD)\s*-\s*(.+?)\s+(Actual|LY)$/i;
  for (const name of wb.SheetNames) {
    const sheet = name.trim();
    let period: PeriodKey | undefined, kind: Kind | undefined, loc: string | undefined;
    let m = overall.exec(sheet);
    if (m) { period = PERIOD_BY_WORD[m[1].toLowerCase()]; kind = m[2].toLowerCase() === 'ly' ? 'ly' : 'actual'; loc = ALL_LOCATIONS; }
    else if ((m = perLoc.exec(sheet))) {
      period = PERIOD_BY_WORD[m[1].toLowerCase()]; kind = m[3].toLowerCase() === 'ly' ? 'ly' : 'actual';
      const resolved = resolveLocationName(m[2], locations);
      if (!resolved) { noteUnknown(m[2], `Toast tab "${sheet}"`); continue; }
      loc = resolved;
    }
    if (!period || !kind || !loc) continue;
    const rows: ToastRow[] = [];
    for (const r of rowsOf(wb.Sheets[name]).slice(1)) {
      const opt = txt(r[0]);
      if (!opt) continue;
      const cat = txt(r[1]);
      rows.push([opt, cat || null, Math.round(num(r[3]) * 100) / 100]);
    }
    ((out.toast[period] ??= {})[kind] ??= {})[loc] = rows;
    out.summary.toastSheets++;
    out.summary.toastRows += rows.length;
  }
  for (const p of PERIODS) {
    const k = out.toast[p];
    if (!k) { warnings.push(`No Toast tabs found for the ${p.toUpperCase()} period.`); continue; }
    for (const kind of ['actual', 'ly'] as Kind[]) if (!k[kind]?.[ALL_LOCATIONS]) warnings.push(`Missing overall Toast ${p} ${kind === 'ly' ? 'LY' : 'Actual'} tab.`);
  }

  /* ---------- reviews (SO 7 & 90, SO 30) ---------- */
  const parseSo = (sheetName: string): ReviewRow[] | null => {
    const ws = wb.Sheets[wb.SheetNames.find((n) => n.trim().toLowerCase() === sheetName.toLowerCase()) ?? ''];
    if (!ws) { warnings.push(`Tab "${sheetName}" not found: reviews not updated.`); return null; }
    const rows: ReviewRow[] = [];
    for (const r of rowsOf(ws).slice(1)) {
      const platform = txt(r[0]), rawLoc = txt(r[1]);
      if (!platform || !rawLoc) continue;
      const loc = resolveLocationName(rawLoc, locations);
      if (!loc) { noteUnknown(rawLoc, `"${sheetName}" reviews`); continue; }
      const ws0 = weekStartFromRange(txt(r[3]));
      if (!ws0) { warnings.push(`"${sheetName}": could not read the week "${txt(r[3])}"; row skipped.`); continue; }
      rows.push([platform, loc, ws0, num(r[6]), num(r[7]), num(r[8]), num(r[9]), num(r[10])]);
    }
    return rows;
  };
  const so790 = parseSo('SO 7 & 90'), so30 = parseSo('SO 30');
  if (so790 || so30) {
    out.reviews = { so7_90: so790 ?? [], so30: so30 ?? [] };
    out.summary.reviewRows = (so790?.length ?? 0) + (so30?.length ?? 0);
    const weeks = (so790 ?? []).map((r) => r[2]).sort();
    out.weekStart = weeks.length ? weeks[weeks.length - 1] : null;
  }

  /* ---------- loyalty (AppFront) ---------- */
  const afLoc = wb.Sheets[wb.SheetNames.find((n) => n.trim().toLowerCase() === 'appfront location') ?? ''];
  const afCamp = wb.Sheets[wb.SheetNames.find((n) => n.trim().toLowerCase() === 'appfront campagin' || n.trim().toLowerCase() === 'appfront campaign') ?? ''];
  if (afLoc || afCamp) {
    const loyalty: LoyaltyData = { locations: {}, campaigns: [] };
    if (afLoc) for (const r of rowsOf(afLoc).slice(1)) {
      const raw = txt(r[0]);
      if (!raw) continue;
      const loc = resolveLocationName(raw, locations);
      if (!loc) { noteUnknown(raw, '"AppFront Location"'); continue; }
      const m = /^\s*\$?([\d,]+(?:\.\d+)?)\s*(?:\(([+-]?\d+(?:\.\d+)?)%\))?\s*$/.exec(txt(r[1]));
      const d: LoyaltyLocation = {
        sales: m ? +m[1].replace(/,/g, '') : null, salesVar: m && m[2] != null ? +m[2] : null,
        activeUsers: num(r[2]), activeMembers: num(r[3]), totalUsers: num(r[4]), totalMembers: num(r[5]), loyaltyPct: num(r[6]),
        newMembers: num(r[7]), newApp: num(r[8]), newWeb: num(r[9]),
      };
      loyalty.locations[loc] = d;
    } else warnings.push('Tab "AppFront Location" not found.');
    if (afCamp) for (const r of rowsOf(afCamp).slice(1)) {
      const name = noEm(txt(r[0]));
      if (!name || /^total$/i.test(name)) continue;
      loyalty.campaigns.push({ name, generated: num(r[1]), redeemed: num(r[2]), discount: num(r[3]), sales: num(r[4]) });
    } else warnings.push('Tab "AppFront Campagin" not found.');
    out.loyalty = loyalty;
    out.summary.loyaltyLocations = Object.keys(loyalty.locations).length;
    out.summary.campaigns = loyalty.campaigns.length;
  }

  /* ---------- marketing (Apollo) ---------- */
  const apo = wb.Sheets[wb.SheetNames.find((n) => n.trim().toLowerCase() === 'apollo') ?? ''];
  if (apo) {
    const m: MarketingData = { apollo: { '7': [], '30': [] } };
    let cur: '7' | '30' | null = null;
    for (const r of rowsOf(apo)) {
      const a = txt(r[0]);
      const h = /Last\s+(7|30)\s+Days/i.exec(a);
      if (h) { cur = h[1] as '7' | '30'; continue; }
      if (!cur || !a || /^campaigns$/i.test(a) || /^total$/i.test(a)) continue;
      const row: ApolloRow = { name: noEm(a), sent: num(r[1]), delivered: num(r[2]), bounced: num(r[3]), spamBlocked: num(r[4]), unsubscribed: num(r[5]), opened: num(r[6]), replied: num(r[7]) };
      m.apollo[cur].push(row);
    }
    out.marketing = m;
    out.summary.apolloRows = m.apollo['7'].length + m.apollo['30'].length;
  } else warnings.push('Tab "Apollo" not found: marketing not updated.');

  /* ---------- Uber Eats ads ("UE ADS") ---------- */
  const ads = wb.Sheets[wb.SheetNames.find((n) => n.trim().toLowerCase() === 'ue ads') ?? ''];
  if (ads) {
    const all = rowsOf(ads);
    const head = (all[0] ?? []).map((c) => txt(c).toLowerCase());
    const col = (...names: string[]) => head.findIndex((h) => names.some((n) => h === n));
    const cName = col('campaign name'), cShop = col('shops (based on your access)', 'shops'), cSales = col('ad sales (usd)', 'ad sales'), cSpend = col('ad spend (usd)', 'ad spend'), cRoas = col('roas'),
      cImp = col('impressions'), cClk = col('clicks'), cOrd = col('orders'), cCpo = col('average cost per order (usd)', 'average cost per order'), cNew = head.findIndex((h) => /^new customers?/.test(h));
    if (cName < 0 || cShop < 0 || cSales < 0 || cSpend < 0) warnings.push('Tab "UE ADS" is missing the Campaign name, Shops, Ad sales or Ad spend column: ads not updated.');
    else {
      const list: UeAdRow[] = [];
      const pct = (a: number, b: number) => (b ? (a / b) * 100 : null);
      for (const r of all.slice(1)) {
        const name = noEm(txt(r[cName]));
        if (!name) continue;
        const shops = txt(r[cShop]).split(',').map((x) => x.trim()).filter(Boolean);
        const names: string[] = [];
        for (const sh of shops) {
          const inner = /\(([^)]+)\)/.exec(sh)?.[1] ?? sh.replace(/^gyro republic\s*/i, '');
          const loc = resolveLocationName(inner, locations) ?? resolveLocationName(sh, locations);
          if (loc) names.push(loc); else noteUnknown(sh, '"UE ADS"');
        }
        if (!names.length) continue;
        const sales = num(r[cSales]), spend = num(r[cSpend]), imp = cImp >= 0 ? num(r[cImp]) : 0, clk = cClk >= 0 ? num(r[cClk]) : 0, ord = cOrd >= 0 ? num(r[cOrd]) : 0;
        const cpo = cCpo >= 0 && r[cCpo] != null ? num(r[cCpo]) : ord ? spend / ord : null;
        list.push({ campaign: name, location: [...new Set(names)].join(', '), sales, spend, roas: cRoas >= 0 && r[cRoas] != null ? num(r[cRoas]) : spend ? sales / spend : null,
          impressions: imp, clicks: clk, ctr: pct(clk, imp), orders: ord, conv: pct(ord, clk), cpo, newCustomers: cNew >= 0 && r[cNew] != null ? num(r[cNew]) : null });
      }
      out.ueAds = list;
    }
  }

  out.unknownLocations = [...unknown].map(([name, where]) => ({ name, where }));
  return out;
}

/** Every distinct dining option in the parsed Toast rows, with its total net sales (subtotal rows only). */
export function diningOptionsIn(toast: ParsedWorkbook['toast']): { name: string; netSales: number }[] {
  const m = new Map<string, number>();
  for (const kinds of Object.values(toast)) for (const byLoc of Object.values(kinds ?? {})) for (const [loc, rows] of Object.entries(byLoc ?? {})) {
    if (loc !== ALL_LOCATIONS) continue; // the overall sheet already contains every location
    for (const [opt, cat, net] of rows) if (cat == null) m.set(opt, (m.get(opt) ?? 0) + net);
  }
  // options that only appear in a single-location tab still need a home
  for (const kinds of Object.values(toast)) for (const byLoc of Object.values(kinds ?? {})) for (const [loc, rows] of Object.entries(byLoc ?? {})) {
    if (loc === ALL_LOCATIONS) continue;
    for (const [opt] of rows) if (!m.has(opt)) m.set(opt, 0);
  }
  return [...m].map(([name, netSales]) => ({ name, netSales })).sort((a, b) => a.name.localeCompare(b.name));
}

export function readWorkbookBuffer(buf: ArrayBuffer | Uint8Array): XLSX.WorkBook {
  return XLSX.read(buf, { type: 'array' });
}
