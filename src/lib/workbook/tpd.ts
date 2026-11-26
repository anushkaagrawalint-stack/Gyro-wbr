/**
 * Reads the Uber Eats and DoorDash tabs of the weekly workbook into per-location weekly aggregates (the 3rd Party Delivery tab).
 * Pure: runs in the browser (admin upload) and in Node (tests). Columns are found by their header text, never by position.
 *
 * Uber Eats : UE Payment Details (sales = SUM "Sales (excl. tax)" of Completed orders; orders = count Completed; payout = SUM "Total payout" of ALL rows;
 *             adSpend = rows whose "Other payments description" is "Ad spend"), UE Order Accuracy, UE Items with errors (missing / customisation / wrong),
 *             UE Order History (courier waits, orders with an avoidable wait), UE Customer Delivery & Ratings, UE Downtime (uptime = 100 - offline share),
 *             SO 7 & 90 (latest week's negative review tags = top complaint).
 * DoorDash  : DD Sales (gross sales and orders minus fully cancelled rows), DD Payout (SUM Net total), DD Operations, DD Promo
 *             (spend = customer discounts funded by you + marketing fees), DD Sponsor (spend = marketing fees + DoorDash marketing credit), SO 7 & 90.
 */
import * as XLSX from 'xlsx';
import type { LocationConfig } from '../types';
import { resolveLocationName, weekStartFromRange } from './parse';

export type TpdLocation = Record<string, number | string>;
export interface TpdTable { head: string[]; rows: string[][] }
/** Tables of the "UBER EATS-DOOR DASH" tab, as text. */
export interface TpdSheet { uePerf?: TpdTable; ueOps?: TpdTable; ddRating?: TpdTable }
export interface TpdData { ue: Record<string, TpdLocation>; dd: Record<string, TpdLocation>; sheet?: TpdSheet }

type Cell = string | number | null;
const rowsOf = (ws: XLSX.WorkSheet): Cell[][] => XLSX.utils.sheet_to_json<Cell[]>(ws, { header: 1, defval: null, blankrows: false });
const txt = (v: unknown): string => (v == null ? '' : String(v).replace(/\s+/g, ' ').trim());
const isNil = (v: unknown) => v == null || txt(v) === '' || txt(v).toUpperCase() === 'NULL';
const num = (v: unknown): number => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const t = txt(v).replace(/[$,%\s]/g, '');
  return t !== '' && Number.isFinite(+t) ? +t : 0;
};
const r2 = (v: number) => Math.round(v * 100) / 100;

/** Store names the sheets use for a location whose Toast name is different (kept as defaults; an alias in the admin panel also works). */
const STORE_HINTS: Record<string, string> = { 'southwest freeway': 'Fondren', 'fondren houston': 'Fondren', 'waterview town center dr': 'Richmond' };

export interface TpdContext { locations: LocationConfig[]; noteUnknown: (name: string, where: string) => void; warnings: string[] }

/** "Gyro Republic (Sugar Land)" / "Gyro Republic - Pearland" -> the configured location, or null. */
function locOf(raw: string, where: string, cx: TpdContext): string | null {
  const s = txt(raw);
  if (!s) return null;
  const inner = /\(([^)]+)\)/.exec(s)?.[1] ?? s.replace(/^gyro republic\s*(-\s*)?/i, '');
  const hit = resolveLocationName(inner, cx.locations) ?? resolveLocationName(s, cx.locations) ?? (STORE_HINTS[inner.trim().toLowerCase()] ? resolveLocationName(STORE_HINTS[inner.trim().toLowerCase()], cx.locations) : null);
  if (!hit) cx.noteUnknown(s, where);
  return hit;
}

function findSheet(wb: XLSX.WorkBook, name: string): XLSX.WorkSheet | null {
  const n = wb.SheetNames.find((x) => x.trim().toLowerCase() === name.toLowerCase());
  return n ? wb.Sheets[n] : null;
}

interface Table { col: (...names: string[]) => number; rows: Cell[][] }
/** The rows under the first row that has a cell equal to `anchor` (the sheet may start with a description row). */
function table(ws: XLSX.WorkSheet, anchor: string): Table | null {
  const all = rowsOf(ws);
  const h = all.findIndex((r) => r.some((c) => txt(c).toLowerCase() === anchor.toLowerCase()));
  if (h < 0) return null;
  const head = all[h].map((c) => txt(c).toLowerCase());
  return { rows: all.slice(h + 1), col: (...names) => { for (const n of names) { const i = head.indexOf(n.toLowerCase()); if (i >= 0) return i; } return -1; } };
}

/** Reads a tab, or warns once and returns null when it (or a needed column) is missing. */
function need(wb: XLSX.WorkBook, sheet: string, anchor: string, cols: string[][], cx: TpdContext): { t: Table; c: number[] } | null {
  const ws = findSheet(wb, sheet);
  if (!ws) { cx.warnings.push(`Tab "${sheet}" not found: its 3rd Party Delivery numbers are not updated.`); return null; }
  const t = table(ws, anchor);
  if (!t) { cx.warnings.push(`Tab "${sheet}" has no "${anchor}" column: its 3rd Party Delivery numbers are not updated.`); return null; }
  const c = cols.map((n) => t.col(...n));
  const miss = cols.filter((_, i) => c[i] < 0).map((n) => n[0]);
  if (miss.length) { cx.warnings.push(`Tab "${sheet}" is missing: ${miss.join(', ')}. Its 3rd Party Delivery numbers are not updated.`); return null; }
  return { t, c };
}

type Acc = Record<string, TpdLocation>;
const slot = (acc: Acc, loc: string): TpdLocation => (acc[loc] ??= {});
const add = (o: TpdLocation, k: string, v: number) => { o[k] = ((o[k] as number) ?? 0) + v; };

/** The latest week's negative review tags per location for one platform (SO 7 & 90). */
function topComplaints(wb: XLSX.WorkBook, platform: string, cx: TpdContext): Record<string, string> {
  const out: Record<string, string> = {};
  const got = need(wb, 'SO 7 & 90', 'Platform', [['platform'], ['location name'], ['week range'], ['negative reviews tags']], cx);
  if (!got) return out;
  const [cP, cL, cW, cT] = got.c;
  const mine = got.t.rows.filter((r) => txt(r[cP]).toLowerCase() === platform.toLowerCase());
  const latest = mine.map((r) => weekStartFromRange(txt(r[cW])) ?? '').sort().pop();
  for (const r of mine) {
    if ((weekStartFromRange(txt(r[cW])) ?? '') !== latest) continue;
    const loc = locOf(txt(r[cL]), 'SO 7 & 90', cx);
    if (loc) out[loc] = txt(r[cT]);
  }
  return out;
}

function uberEats(wb: XLSX.WorkBook, cx: TpdContext): Acc | null {
  const acc: Acc = {};
  let any = false;
  const pay = need(wb, 'UE Payment Details', 'Shop name', [['shop name'], ['order status'], ['sales (excl. tax)'], ['total payout'], ['other payments description'], ['other payments']], cx);
  if (pay) {
    any = true;
    const [cS, cSt, cSa, cPo, cD, cO] = pay.c;
    for (const r of pay.t.rows) {
      const loc = locOf(txt(r[cS]), 'UE Payment Details', cx);
      if (!loc) continue;
      const o = slot(acc, loc);
      add(o, 'payout', num(r[cPo]));
      if (txt(r[cSt]).toLowerCase() === 'completed') { add(o, 'sales', num(r[cSa])); add(o, 'orders', 1); }
      if (txt(r[cD]).toLowerCase() === 'ad spend') add(o, 'adSpend', Math.abs(num(r[cO])));
    }
  }
  const acu = need(wb, 'UE Order Accuracy', 'Store', [['store'], ['total number of completed orders'], ['number of inaccurate orders']], cx);
  if (acu) for (const r of acu.t.rows) {
    const loc = locOf(txt(r[acu.c[0]]), 'UE Order Accuracy', cx);
    if (loc) { const o = slot(acc, loc); add(o, 'accOrders', num(r[acu.c[1]])); add(o, 'inaccurate', num(r[acu.c[2]])); }
  }
  const err = need(wb, 'UE Items with errors', 'Restaurant', [['restaurant'], ['item issue']], cx);
  if (err) {
    const cust = err.t.col('inaccurate customisation', 'inaccurate customization');
    for (const r of err.t.rows) {
      const loc = locOf(txt(r[err.c[0]]), 'UE Items with errors', cx);
      if (!loc) continue;
      const issue = txt(r[err.c[1]]).toUpperCase();
      if (cust >= 0 && !isNil(r[cust])) add(slot(acc, loc), 'custErr', 1);
      else if (issue === 'MISSING_ITEM') add(slot(acc, loc), 'missing', 1);
      else if (issue === 'WRONG_ORDER') add(slot(acc, loc), 'wrong', 1);
    }
  }
  const hist = need(wb, 'UE Order History', 'Restaurant', [['restaurant'], ['courier waiting time (restaurant)'], ['avoidable courier waiting time (restaurant)'], ['order status']], cx);
  if (hist) for (const r of hist.t.rows) {
    if (txt(r[hist.c[3]]).toLowerCase() !== 'completed') continue;                     // cancelled orders carry a 0 wait that is not a real hand-off
    const loc = locOf(txt(r[hist.c[0]]), 'UE Order History', cx);
    if (!loc) continue;
    const o = slot(acc, loc);
    if (!isNil(r[hist.c[1]])) { add(o, 'waitSum', num(r[hist.c[1]])); add(o, 'waitN', 1); }
    if (!isNil(r[hist.c[2]])) { add(o, 'avoidSum', num(r[hist.c[2]])); add(o, 'avoidN', 1); if (num(r[hist.c[2]]) > 0) add(o, 'avoidOrders', 1); }
  }
  const rat = need(wb, 'UE Customer Delivery & Ratings', 'Restaurant', [['restaurant'], ['rating value']], cx);
  if (rat) for (const r of rat.t.rows) {
    const loc = locOf(txt(r[rat.c[0]]), 'UE Customer Delivery & Ratings', cx);
    if (loc && !isNil(r[rat.c[1]])) { const o = slot(acc, loc); add(o, 'ratSum', num(r[rat.c[1]])); add(o, 'ratN', 1); }
  }
  const down = need(wb, 'UE Downtime', 'Restaurant', [['restaurant'], ['restaurant online'], ['restaurant offline']], cx);
  if (down) {
    const tot: Record<string, [number, number]> = {};
    for (const r of down.t.rows) {
      const loc = locOf(txt(r[down.c[0]]), 'UE Downtime', cx);
      if (!loc) continue;
      const t = (tot[loc] ??= [0, 0]);
      t[0] += num(r[down.c[1]]); t[1] += num(r[down.c[2]]);
    }
    for (const [loc, [on, off]] of Object.entries(tot)) slot(acc, loc).uptime = on + off ? 100 - (off / (on + off)) * 100 : 100;
  }
  if (!any && !Object.keys(acc).length) return null;
  const tc = topComplaints(wb, 'Uber Eats', cx);
  for (const loc of Object.keys(acc)) acc[loc].topComplaint = tc[loc] ?? '';
  return acc;
}

function doorDash(wb: XLSX.WorkBook, cx: TpdContext): Acc | null {
  const acc: Acc = {};
  const pay = need(wb, 'DD Payout', 'Store name', [['store name'], ['net total']], cx);
  if (pay) for (const r of pay.t.rows) { const loc = locOf(txt(r[pay.c[0]]), 'DD Payout', cx); if (loc) add(slot(acc, loc), 'payout', num(r[pay.c[1]])); }

  const sal = need(wb, 'DD Sales', 'Store name', [['store name'], ['total orders/deliveries (including cancelled)'], ['total cancelled orders/deliveries'], ['gross sales']], cx);
  if (sal) for (const r of sal.t.rows) {
    const loc = locOf(txt(r[sal.c[0]]), 'DD Sales', cx);
    if (!loc) continue;
    const o = slot(acc, loc), n = num(r[sal.c[1]]), cancelled = num(r[sal.c[2]]);
    add(o, 'ordersInclCancel', n); add(o, 'cancelledSales', cancelled);
    add(o, 'orders', n - cancelled);
    if (!(n > 0 && cancelled >= n)) add(o, 'sales', num(r[sal.c[3]]));
  }

  const ops = need(wb, 'DD Operations', 'Store Name', [['store name'], ['total orders including cancelled orders'], ['total delivered or picked up orders'], ['total missing or incorrect orders'], ['total error charges'],
    ['total cancelled orders'], ['total avoidable cancellations'], ['average avoidable dasher wait'], ['average dasher wait'], ['uptime %'], ['total downtime in minutes'],
    ['total number of ratings received in period of time'], ['number of dislikes'], ['number of loved']], cx);
  if (ops) for (const r of ops.t.rows) {
    const loc = locOf(txt(r[ops.c[0]]), 'DD Operations', cx);
    if (!loc) continue;
    const o = slot(acc, loc), v = (i: number) => num(r[ops.c[i]]);
    o.opsOrders = v(1); o.delivered = v(2); o.errOrders = v(3); o.errCharges = v(4); o.cancels = v(5); o.avoidCancels = v(6);
    o.avoidWaitMin = v(7); o.waitMin = v(8); o.uptime = v(9); o.downMin = v(10);
    o.ratN = v(11); o.dislike = v(12); o.loved = v(13); o.like = Math.max(0, v(11) - v(12) - v(13));
  }

  const promo = need(wb, 'DD Promo', 'Store name', [['store name'], ['orders'], ['sales'], ['customer discounts from marketing | (funded by you)'], ['marketing fees | (including any applicable taxes)']], cx);
  if (promo) for (const r of promo.t.rows) {
    const loc = locOf(txt(r[promo.c[0]]), 'DD Promo', cx);
    if (!loc) continue;
    const o = slot(acc, loc);
    add(o, 'pOrders', num(r[promo.c[1]])); add(o, 'pSales', num(r[promo.c[2]])); add(o, 'pSpend', num(r[promo.c[3]]) + num(r[promo.c[4]]));
  }

  const sp = need(wb, 'DD Sponsor', 'Store name', [['store name'], ['impressions'], ['clicks'], ['orders'], ['sales'], ['marketing fees | (including any applicable taxes)'], ['doordash marketing credit']], cx);
  if (sp) for (const r of sp.t.rows) {
    const loc = locOf(txt(r[sp.c[0]]), 'DD Sponsor', cx);
    if (!loc) continue;
    const o = slot(acc, loc);
    add(o, 'sImpr', num(r[sp.c[1]])); add(o, 'sClicks', num(r[sp.c[2]])); add(o, 'sOrders', num(r[sp.c[3]])); add(o, 'sSales', num(r[sp.c[4]])); add(o, 'sSpend', num(r[sp.c[5]]) + num(r[sp.c[6]]));
  }
  if (!Object.keys(acc).length) return null;
  const tc = topComplaints(wb, 'DoorDash', cx);
  for (const loc of Object.keys(acc)) acc[loc].topComplaint = tc[loc] ?? '';
  return acc;
}

/** Rounds money-like sums to cents so floating point noise does not reach the stored week. */
function clean(acc: Acc): Acc {
  for (const o of Object.values(acc)) for (const [k, v] of Object.entries(o)) if (typeof v === 'number') o[k] = k === 'uptime' ? Math.round(v * 100) / 100 : r2(v);
  return acc;
}

/**
 * The "UBER EATS-DOOR DASH" tab: three ready-made tables shown as they are (cell text as the sheet displays it).
 * Uber Eats "Performance Overview" and "Operations Overview" sit on the left, DoorDash "Rating Distribution" on the right.
 * Each table is found by its title cell; its header is the next row, its rows run until the first empty location cell.
 */
function sheetTables(wb: XLSX.WorkBook, cx: TpdContext): TpdSheet | null {
  const name = wb.SheetNames.find((n) => n.toLowerCase().replace(/[^a-z]/g, '') === 'ubereatsdoordash');
  if (!name) return null;
  const all = XLSX.utils.sheet_to_json<Cell[]>(wb.Sheets[name], { header: 1, defval: null, blankrows: true, raw: false });
  const out: TpdSheet = {};
  const grab = (title: string, key: keyof TpdSheet) => {
    let tr = -1, tc = -1;
    all.forEach((r, i) => { if (tr < 0) r.forEach((c, j) => { if (tr < 0 && txt(c).toLowerCase() === title.toLowerCase()) { tr = i; tc = j; } }); });
    if (tr < 0) { cx.warnings.push(`Tab "${name}" has no "${title}" table: it is not updated.`); return; }
    let h = tr + 1;
    while (h < all.length && txt(all[h]?.[tc]).toLowerCase() !== 'location') h++;
    if (h >= all.length) { cx.warnings.push(`Table "${title}" in tab "${name}" has no Location header: it is not updated.`); return; }
    const head: string[] = [];
    for (let j = tc; txt(all[h][j]) !== ''; j++) head.push(txt(all[h][j]));
    const rows: string[][] = [];
    for (let i = h + 1; i < all.length && txt(all[i]?.[tc]) !== ''; i++) {
      const raw = txt(all[i][tc]);
      const loc = /^all stores$/i.test(raw) ? 'All Stores' : locOf(raw, name, cx);
      if (!loc) continue;
      rows.push([loc, ...head.slice(1).map((_, k) => txt(all[i][tc + 1 + k]))]);
    }
    out[key] = { head, rows };
  };
  grab('Performance Overview', 'uePerf');
  grab('Operations Overview', 'ueOps');
  grab('Rating Distribution', 'ddRating');
  return out.uePerf || out.ueOps || out.ddRating ? out : null;
}

/** Both platforms from one workbook. Returns null when neither platform has any data (then the old copy is kept). */
export function parseTpd(wb: XLSX.WorkBook, cx: TpdContext): TpdData | null {
  const ue = uberEats(wb, cx), dd = doorDash(wb, cx), sheet = sheetTables(wb, cx);
  if (!ue && !dd && !sheet) return null;
  return { ue: clean(ue ?? {}), dd: clean(dd ?? {}), ...(sheet ? { sheet } : {}) };
}
