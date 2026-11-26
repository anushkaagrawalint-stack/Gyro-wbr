import { allowedLocations, tabsFor } from '../auth/access';
import type { Storage } from '../storage';
import { PLATFORMS, loadDeliveryStatus, loadFormats, loadLocations, loadMapping } from './config';
import { buildLocData, channelsFor, fillUnmapped, type Channel, type LocData } from './revenue';
import { addDays, getWeek, latestWeekStart, listWeeks, sectionFor } from './weeks';
import type { DeliveryStatus, FormatConfig, LoyaltyData, PublicPerson, ReviewsData, UeAdRow, WeekData } from '../types';

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** The object the dashboard script reads as window.__BOOT__. Built per person and per week, on the server. */
export interface Boot {
  user: { email: string; role: string; name: string };
  tabs: string[];
  locations: string[];
  channels: Channel[];
  locData: LocData;
  integrations: Record<string, string[]>;
  sections: {
    reviews?: ReviewsData;
    tpd?: unknown;
    loyalty?: LoyaltyData;
    marketing?: unknown;
    ueAds?: UeAdRow[];
    catering?: unknown;
  };
  week: { weekOf: string; weekStart: string };
  /**
   * Location logins only: the company totals (all locations added together) for the Location tab's "All Locations" view.
   * Totals only: no other location's own figures are sent.
   */
  company?: Company;
  /** section -> week it actually came from, when this week's upload did not include it. */
  asOf: Record<string, string>;
  formats: FormatConfig[];
  /** Admin's DoorDash / Uber Eats badges per restaurant (only the restaurants this person can see). */
  deliveryStatus: DeliveryStatus;
}

/** Key of the company-wide entry in locData for location logins. */
export const COMPANY_KEY = '__company';

export interface Company {
  reviews?: { so7_90: unknown[][]; so30: unknown[][] };
  tpd?: { ue: Record<string, number>; dd: Record<string, number> };
  loyalty?: Record<string, number | null>;
  catering?: { total: Record<string, number> | null; weekTotals: Record<string, number>[] };
}

export interface BootResult {
  boot: Boot;
  weeks: { weekStart: string; label: string }[];
  /** Dining options in this week that the mapping does not know yet. */
  unmapped: string[];
}

export function weekOfLabel(weekStart: string): string {
  const d = new Date(weekStart + 'T00:00:00Z');
  return `${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

type Obj = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const sumKeys = (rows: Obj[]): Obj => {
  const t: Obj = {};
  for (const r of rows) for (const [k, v] of Object.entries(r)) if (typeof v === 'number') t[k] = (t[k] ?? 0) + v;
  return t;
};
const pick = <T,>(o: Record<string, T> | undefined, keys: string[]): Record<string, T> => {
  const out: Record<string, T> = {};
  for (const k of keys) if (o && k in o) out[k] = o[k];
  return out;
};

/** Company totals from the full (unfiltered) sections, for location logins. Only sums are returned. */
export function companyTotals(visible: string[], s: Boot['sections']): Company {
  const vis = new Set(visible);
  const c: Company = {};
  if (s.reviews) {
    const sumRows = (rows: (string | number)[][]) => {
      const m = new Map<string, (string | number)[]>();
      for (const r of rows) {
        if (!vis.has(r[1] as string)) continue;
        const key = r[0] + '|' + r[2];
        const t = m.get(key) ?? [r[0], 'All Locations', r[2], 0, 0, 0, 0, 0];
        for (let i = 3; i < 8; i++) t[i] = (t[i] as number) + ((r[i] as number) || 0);
        m.set(key, t);
      }
      return [...m.values()];
    };
    c.reviews = { so7_90: sumRows(s.reviews.so7_90 as never), so30: sumRows(s.reviews.so30 as never) };
  }
  if (s.tpd) {
    const t = s.tpd as Obj;
    const total = (o: Obj | undefined): Record<string, number> => {
      const sum: Record<string, number> = {};
      const add = (k: string, v: number) => { sum[k] = (sum[k] ?? 0) + v; };
      for (const [loc, d] of Object.entries(o ?? {}) as [string, Obj][]) {
        if (!vis.has(loc)) continue;
        for (const [k, v] of Object.entries(d)) if (typeof v === 'number') add(k, v);
        add('waitW', (d.waitMin || 0) * (d.delivered || 0)); add('avoidW', (d.avoidWaitMin || 0) * (d.delivered || 0));
        add('upSum', d.uptime ?? 0); add('upN', d.uptime == null ? 0 : 1);
      }
      return sum;
    };
    c.tpd = { ue: total(t.ue), dd: total(t.dd) };
  }
  if (s.loyalty) {
    const rows = Object.entries(s.loyalty.locations).filter(([l]) => vis.has(l)).map(([, v]) => v as Obj);
    const sum = sumKeys(rows);
    const prior = rows.reduce((t, d) => t + (d.salesVar == null ? 0 : d.sales / (1 + d.salesVar / 100)), 0);
    c.loyalty = { ...sum, salesVar: prior ? ((sum.sales ?? 0) / prior - 1) * 100 : null };
  }
  if (s.catering) {
    const cat = s.catering as Obj;
    c.catering = { total: cat.location?.total ?? null, weekTotals: (cat.locationWeeks ?? []).map((b: Obj) => b.total ?? {}) };
  }
  return c;
}

/** Cuts every section down to what this person may see. Runs on the server, before anything is sent. */
export function filterSections(role: PublicPerson['role'], allowed: string[], s: Boot['sections']): Boot['sections'] {
  const out: Boot['sections'] = {};
  const ok = new Set(allowed);
  if (s.reviews) out.reviews = { so7_90: s.reviews.so7_90.filter((r) => ok.has(r[1])), so30: s.reviews.so30.filter((r) => ok.has(r[1])) };
  if (s.tpd) {
    const t = s.tpd as Obj;
    out.tpd = { ...t, ue: pick(t.ue, allowed), dd: pick(t.dd, allowed) };
  }
  if (s.ueAds) out.ueAds = role === 'location' ? s.ueAds.filter((a) => a.location.split(', ').some((l) => ok.has(l))) : s.ueAds;
  if (s.loyalty) out.loyalty = { locations: pick(s.loyalty.locations, allowed), campaigns: role === 'location' ? [] : s.loyalty.campaigns };
  if (role !== 'location') {
    if (s.marketing) out.marketing = s.marketing;
    if (s.catering) out.catering = s.catering;
  } else if (s.catering) {
    // Location people never get the Catering tab, but the Location tab shows outreach for their own sites
    const c = s.catering as Obj;
    const cut = (b: Obj): Obj => {
      const locations = pick<Obj>(b.locations, allowed);
      return { ...b, locations, total: sumKeys(Object.values(locations)) };
    };
    out.catering = { location: c.location ? cut(c.location) : undefined, locationWeeks: (c.locationWeeks ?? []).map(cut) };
  }
  return out;
}

/** Everything a person is allowed to see for one week (default: the latest). */
export async function buildBoot(s: Storage, person: PublicPerson, weekStart?: string | null): Promise<BootResult | null> {
  const weeks = await listWeeks(s);
  const ws = weekStart && weeks.some((w) => w.weekStart === weekStart) ? weekStart : await latestWeekStart(s);
  const [locCfg, mapping, formats, statusAll] = await Promise.all([loadLocations(s), loadMapping(s), loadFormats(s), loadDeliveryStatus(s)]);
  const visible = locCfg.filter((l) => !l.hidden).map((l) => l.name);
  const allowed = allowedLocations(person, visible);
  const only = (m: Record<string, string>) => Object.fromEntries(Object.entries(m).filter(([l]) => allowed.includes(l)));
  const deliveryStatus: DeliveryStatus = { ue: only(statusAll.ue), dd: only(statusAll.dd) };
  const base = { weeks: weeks.map((w) => ({ weekStart: w.weekStart, label: weekOfLabel(w.weekStart) })) };
  const user = { email: person.email, role: person.role, name: person.name };
  const integrations: Record<string, string[]> = {};
  for (const p of PLATFORMS) integrations[p] = allowed.filter((l) => locCfg.find((c) => c.name === l)?.platforms.includes(p));

  if (!ws) {
    // nothing uploaded yet: an empty dashboard, so the admin can still reach the Admin tab
    const boot: Boot = { user, tabs: tabsFor(person.role), locations: allowed, channels: channelsFor(mapping, false), locData: {}, integrations, sections: {}, week: { weekOf: '-', weekStart: '' }, asOf: {}, formats, deliveryStatus };
    return { boot, ...base, unmapped: [] };
  }
  const week = (await getWeek(s, ws)) as WeekData;
  const { locData, hasUnmapped, unmappedOptions } = buildLocData(week, { allowed, mapping });

  // "vs last week": the same series from the week before, when it has been uploaded
  const prev = await getWeek(s, addDays(ws, -7));
  if (prev) {
    const pl = buildLocData(prev, { allowed, mapping });
    for (const [p, kinds] of Object.entries(pl.locData)) if (kinds.actual && locData[p]) locData[p].lw = kinds.actual;
    if (pl.hasUnmapped) { /* previous week's unmapped sales sit under the Unmapped line too */ }
  }
  if (hasUnmapped || Object.values(locData).some((k) => Object.values(k).some((b) => Object.values(b).some((e) => 'Unmapped' in e.lines)))) fillUnmapped(locData);

  const sections: Boot['sections'] = {};
  const asOf: Record<string, string> = {};
  // 3rd Party Delivery and Catering are not read from the workbook yet: they come from the copy that was embedded in the reference dashboard
  const embedded = await s.get<{ weekStart: string; tpd?: unknown; catering?: unknown }>('config/embedded.json');
  for (const k of ['reviews', 'tpd', 'loyalty', 'marketing', 'ueAds', 'catering'] as const) {
    let f: { data: unknown; from: string } | null = await sectionFor(s, week, k);
    if (!f && (k === 'tpd' || k === 'catering') && embedded?.[k] != null) f = { data: embedded[k], from: embedded.weekStart };
    if (!f) continue;
    (sections as Obj)[k] = f.data;
    if (f.from !== ws) asOf[k] = f.from;
  }
  const filtered = filterSections(person.role, allowed, sections);
  let tabs = tabsFor(person.role);
  // a location login only gets the Catering tab when catering outreach is tracked at one of their stores
  if (person.role === 'location' && !Object.keys((filtered.catering as Obj | undefined)?.location?.locations ?? {}).length) tabs = tabs.filter((t) => t !== 'Catering');
  const shown = (k: string) => (k === 'marketing' ? tabs.includes('Marketing') : k === 'catering' ? tabs.includes('Catering') : true);
  for (const k of Object.keys(asOf)) if (!shown(k)) delete asOf[k];

  let company: Company | undefined;
  if (person.role === 'location') {
    company = companyTotals(visible, sections);
    // the Location tab's company comparison: the overall Toast sheet, kept apart from "All Locations" (the person's own total) used by the other tabs
    const whole = buildLocData(week, { allowed: visible, mapping }).locData;
    for (const [p, kinds] of Object.entries(whole)) for (const [kind, byLoc] of Object.entries(kinds)) {
      if (byLoc['All Locations']) ((locData[p] ??= {})[kind] ??= {})[COMPANY_KEY] = byLoc['All Locations'];
    }
    if (hasUnmapped) fillUnmapped(locData);
  }
  const boot: Boot = {
    user, tabs, locations: allowed, channels: channelsFor(mapping, hasUnmapped), locData, integrations,
    sections: filtered, company, week: { weekOf: weekOfLabel(ws), weekStart: ws }, asOf, formats, deliveryStatus,
  };
  return { boot, ...base, unmapped: unmappedOptions };
}
