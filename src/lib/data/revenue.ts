import { ALL, type Kind, type Mapping, type PeriodKey, type ToastRow, type WeekData } from '../types';
import { mappingIndex, UNMAPPED, UNMAPPED_COLOR } from './config';

/** What the dashboard's Revenue/Overview code reads: net sales per line, and per sales category under each line. */
export interface LocEntry {
  total: number;
  lines: Record<string, number>;
  tab: string;
  cats: Record<string, Record<string, number>>;
}
export type LocData = Record<string, Record<string, Record<string, LocEntry>>>; // period -> kind -> location -> entry
export interface Channel { name: string; color: string; lines: string[] }

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Applies the admin's mapping to raw Toast rows. Dining options that are not mapped go to the "Unmapped" line,
 * so they still count in every total.
 */
export function applyMapping(rows: ToastRow[], m: Mapping, tab = ''): LocEntry & { unmapped: Record<string, number> } {
  const idx = mappingIndex(m);
  const lines: Record<string, number> = {};
  for (const c of m.categories) for (const l of c.lines) lines[l.name] = 0; // every mapped line is present (as 0) like the reference
  const cats: Record<string, Record<string, number>> = {};
  const unmapped: Record<string, number> = {};
  let total = 0;
  for (const [opt, cat, net] of rows) {
    const line = idx.get(opt)?.line ?? UNMAPPED;
    if (line === UNMAPPED && cat == null) unmapped[opt] = (unmapped[opt] ?? 0) + net;
    if (cat == null) {
      lines[line] = (lines[line] ?? 0) + net;
      total += net;
    } else {
      const c = (cats[line] ??= {});
      c[cat] = (c[cat] ?? 0) + net;
    }
  }
  for (const k of Object.keys(lines)) lines[k] = r2(lines[k]);
  for (const l of Object.values(cats)) for (const k of Object.keys(l)) l[k] = r2(l[k]);
  return { total: r2(total), lines, tab, cats, unmapped };
}

function addInto(a: LocEntry, b: LocEntry): void {
  a.total = r2(a.total + b.total);
  for (const [k, v] of Object.entries(b.lines)) a.lines[k] = r2((a.lines[k] ?? 0) + v);
  for (const [line, cs] of Object.entries(b.cats)) {
    const t = (a.cats[line] ??= {});
    for (const [c, v] of Object.entries(cs)) t[c] = r2((t[c] ?? 0) + v);
  }
}

export interface BuildLocDataOptions {
  /** Locations the person may see (already filtered, configured order). */
  allowed: string[];
  mapping: Mapping;
}

/**
 * period -> kind -> location -> entry, for one week. `All Locations` uses the overall Toast sheet when the person
 * may see every location in the workbook, otherwise it is the sum of their locations.
 */
export function buildLocData(week: WeekData, o: BuildLocDataOptions): { locData: LocData; hasUnmapped: boolean; unmappedOptions: string[] } {
  const locData: LocData = {};
  const unmappedOptions = new Set<string>();
  for (const [period, kinds] of Object.entries(week.toast) as [PeriodKey, NonNullable<WeekData['toast'][PeriodKey]>][]) {
    for (const [kind, byLoc] of Object.entries(kinds) as [Kind, Record<string, ToastRow[]>][]) {
      const present = Object.keys(byLoc).filter((l) => l !== ALL);
      const seesEverything = present.every((l) => o.allowed.includes(l));
      const out: Record<string, LocEntry> = {};
      for (const loc of o.allowed) {
        if (!byLoc[loc]) continue;
        const e = applyMapping(byLoc[loc], o.mapping, `${period}-${loc}-${kind}`);
        Object.keys(e.unmapped).forEach((u) => unmappedOptions.add(u));
        const { unmapped: _u, ...entry } = e;
        out[loc] = entry;
      }
      if (seesEverything && byLoc[ALL]) {
        const e = applyMapping(byLoc[ALL], o.mapping, `${period}-${ALL}-${kind}`);
        Object.keys(e.unmapped).forEach((u) => unmappedOptions.add(u));
        const { unmapped: _u, ...entry } = e;
        out[ALL] = entry;
      } else if (Object.keys(out).length) {
        const sum: LocEntry = { total: 0, lines: {}, tab: `${period}-${ALL}-${kind}`, cats: {} };
        for (const e of Object.values(out)) addInto(sum, e);
        out[ALL] = sum;
      }
      if (Object.keys(out).length) ((locData[period] ??= {})[kind] = out);
    }
  }
  return { locData, hasUnmapped: unmappedOptions.size > 0, unmappedOptions: [...unmappedOptions].sort() };
}

/** Channels for the dashboard: the mapping's categories, plus an "Unmapped" channel when some sales are not mapped yet. */
export function channelsFor(m: Mapping, hasUnmapped: boolean): Channel[] {
  const ch: Channel[] = m.categories.map((c) => ({ name: c.name, color: c.color, lines: c.lines.map((l) => l.name) }));
  if (hasUnmapped) ch.push({ name: UNMAPPED, color: UNMAPPED_COLOR, lines: [UNMAPPED] });
  return ch;
}

/** When Unmapped exists, every entry gets an explicit Unmapped line (0 if nothing), like the other lines. */
export function fillUnmapped(locData: LocData): void {
  for (const kinds of Object.values(locData)) for (const byLoc of Object.values(kinds)) for (const e of Object.values(byLoc)) e.lines[UNMAPPED] ??= 0;
}

/** Dining options in a week that the mapping does not know, with their net sales (overall sheets first). */
export function unmappedIn(toast: WeekData['toast'], m: Mapping): { name: string; netSales: number }[] {
  const idx = mappingIndex(m);
  const found = new Map<string, number>();
  for (const kinds of Object.values(toast)) for (const byLoc of Object.values(kinds ?? {})) for (const [loc, rows] of Object.entries(byLoc ?? {})) {
    for (const [opt, cat, net] of rows) {
      if (idx.has(opt)) continue;
      if (!found.has(opt)) found.set(opt, 0);
      if (cat == null && loc === ALL) found.set(opt, (found.get(opt) ?? 0) + net);
    }
  }
  return [...found].map(([name, netSales]) => ({ name, netSales: r2(netSales) })).sort((a, b) => a.name.localeCompare(b.name));
}
