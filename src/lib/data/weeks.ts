import type { Storage } from '../storage';
import { ALL, PERIODS, type ApolloRow, type Kind, type LoyaltyData, type MarketingData, type PeriodKey, type ReviewRow, type ReviewsData, type ToastRow, type UeAdRow, type WeekData, type WeekIndexEntry } from '../types';

export class WeekError extends Error {}
export class WeekConflict extends WeekError {}
export class UnmappedError extends WeekError { constructor(message: string, public unmapped: { name: string; netSales: number }[]) { super(message); } }

const INDEX = 'weeks/index.json';
const key = (weekStart: string) => `weeks/${weekStart}.json`;
const ISO = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(s: unknown): s is string {
  if (typeof s !== 'string' || !ISO.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export const sectionsOf = (w: WeekData): string[] =>
  (['toast', 'reviews', 'loyalty', 'marketing', 'ueAds', 'tpd', 'catering'] as const).filter((k) => (w as unknown as Record<string, unknown>)[k] != null);

export async function listWeeks(s: Storage): Promise<WeekIndexEntry[]> {
  const idx = (await s.get<WeekIndexEntry[]>(INDEX)) ?? [];
  return [...idx].sort((a, b) => (a.weekStart < b.weekStart ? 1 : -1)); // newest first
}

export async function getWeek(s: Storage, weekStart: string): Promise<WeekData | null> {
  if (!isIsoDate(weekStart)) return null;
  return s.get<WeekData>(key(weekStart));
}

export async function latestWeekStart(s: Storage): Promise<string | null> {
  return (await listWeeks(s))[0]?.weekStart ?? null;
}

/** Strict shape check for a week that arrives from the browser. Throws WeekError with a readable message. */
export function validateWeek(input: unknown): WeekData {
  const w = input as Partial<WeekData> | null;
  if (!w || typeof w !== 'object') throw new WeekError('No week data received.');
  if (!isIsoDate(w.weekStart)) throw new WeekError('The week start must be a date like 2026-10-12.');
  if (!w.toast || typeof w.toast !== 'object') throw new WeekError('The week has no Toast sales data.');
  const toast: WeekData['toast'] = {};
  let sheets = 0;
  for (const [p, kinds] of Object.entries(w.toast)) {
    if (!(PERIODS as readonly string[]).includes(p)) throw new WeekError(`Unknown period "${p}".`);
    for (const [k, byLoc] of Object.entries(kinds ?? {})) {
      if (k !== 'actual' && k !== 'ly') throw new WeekError(`Unknown series "${k}".`);
      for (const [loc, rows] of Object.entries(byLoc ?? {})) {
        if (!Array.isArray(rows)) throw new WeekError(`Toast rows for ${loc} are not a list.`);
        const clean: ToastRow[] = rows.map((r) => {
          if (!Array.isArray(r) || typeof r[0] !== 'string' || !(r[1] === null || typeof r[1] === 'string') || typeof r[2] !== 'number' || !Number.isFinite(r[2])) throw new WeekError(`Bad Toast row in ${p}/${k}/${loc}.`);
          return [r[0], r[1], r[2]];
        });
        (((toast[p as PeriodKey] ??= {})[k as Kind] ??= {}))[loc] = clean;
        sheets++;
      }
    }
  }
  if (!sheets) throw new WeekError('The week has no Toast sales data.');
  if (!toast.weekly?.actual?.[ALL] && !Object.keys(toast.weekly?.actual ?? {}).length) throw new WeekError('The week needs at least the weekly Actual sales.');
  const out: WeekData = { weekStart: w.weekStart, uploadedAt: new Date().toISOString(), toast };
  if (typeof w.workbook === 'string') out.workbook = w.workbook.slice(0, 200);
  // tpd and catering are never accepted from the browser: they are carried over on the server
  if (w.reviews != null) out.reviews = checkReviews(w.reviews);
  if (w.loyalty != null) out.loyalty = checkLoyalty(w.loyalty);
  if (w.marketing != null) out.marketing = checkMarketing(w.marketing);
  if (w.ueAds != null) out.ueAds = checkUeAds(w.ueAds);
  return out;
}

export async function saveWeek(s: Storage, week: WeekData): Promise<WeekIndexEntry> {
  await s.put(key(week.weekStart), week);
  const entry: WeekIndexEntry = { weekStart: week.weekStart, uploadedAt: week.uploadedAt, sections: sectionsOf(week) };
  const idx = ((await s.get<WeekIndexEntry[]>(INDEX)) ?? []).filter((e) => e.weekStart !== week.weekStart);
  await s.put(INDEX, [...idx, entry].sort((a, b) => (a.weekStart < b.weekStart ? -1 : 1)));
  return entry;
}

export async function deleteWeek(s: Storage, weekStart: string): Promise<void> {
  if (!isIsoDate(weekStart)) throw new WeekError('Bad week.');
  await s.delete(key(weekStart));
  const idx = ((await s.get<WeekIndexEntry[]>(INDEX)) ?? []).filter((e) => e.weekStart !== weekStart);
  await s.put(INDEX, idx);
}

export function addDays(iso: string, n: number): string {
  return new Date(new Date(iso + 'T00:00:00Z').getTime() + n * 864e5).toISOString().slice(0, 10);
}

/** Section data for `weekStart`: its own copy, or the latest earlier week that has one. */
export async function sectionFor<K extends 'reviews' | 'loyalty' | 'marketing' | 'ueAds' | 'tpd' | 'catering'>(
  s: Storage, week: WeekData, k: K,
): Promise<{ data: NonNullable<WeekData[K]>; from: string } | null> {
  if (week[k] != null) return { data: week[k] as NonNullable<WeekData[K]>, from: week.weekStart };
  for (const e of await listWeeks(s)) {
    if (e.weekStart >= week.weekStart || !e.sections.includes(k)) continue;
    const w = await getWeek(s, e.weekStart);
    if (w?.[k] != null) return { data: w[k] as NonNullable<WeekData[K]>, from: e.weekStart };
  }
  return null;
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

function checkUeAds(v: unknown): UeAdRow[] {
  if (!Array.isArray(v)) throw new WeekError('The Uber Eats ads are not a list.');
  const n = (x: unknown) => (isNum(x) ? x : null);
  return v.map((r) => {
    if (!isObj(r) || typeof r.campaign !== 'string' || typeof r.location !== 'string') throw new WeekError('Bad Uber Eats ads row.');
    return { campaign: r.campaign.slice(0, 200), location: r.location.slice(0, 200), sales: n(r.sales) ?? 0, spend: n(r.spend) ?? 0, roas: n(r.roas), impressions: n(r.impressions) ?? 0, clicks: n(r.clicks) ?? 0,
      ctr: n(r.ctr), orders: n(r.orders) ?? 0, conv: n(r.conv), cpo: n(r.cpo), newCustomers: n(r.newCustomers) };
  });
}

function checkReviews(r: unknown): ReviewsData {
  const rows = (v: unknown, label: string): ReviewRow[] => {
    if (!Array.isArray(v)) throw new WeekError(`Reviews (${label}) are not a list.`);
    return v.map((x) => {
      if (!Array.isArray(x) || x.length !== 8 || typeof x[0] !== 'string' || typeof x[1] !== 'string' || !isIsoDate(x[2]) || !x.slice(3).every(isNum)) throw new WeekError(`Bad review row in ${label}.`);
      return x as ReviewRow;
    });
  };
  const o = r as Record<string, unknown>;
  return { so7_90: rows(o.so7_90 ?? [], 'SO 7 & 90'), so30: rows(o.so30 ?? [], 'SO 30') };
}

const LOYALTY_NUM = ['activeUsers', 'activeMembers', 'totalUsers', 'totalMembers', 'loyaltyPct', 'newMembers', 'newApp', 'newWeb'] as const;
function checkLoyalty(l: unknown): LoyaltyData {
  if (!isObj(l) || !isObj(l.locations) || !Array.isArray(l.campaigns)) throw new WeekError('Loyalty data is malformed.');
  const locations: LoyaltyData['locations'] = {};
  for (const [name, d] of Object.entries(l.locations)) {
    if (!isObj(d) || !LOYALTY_NUM.every((k) => isNum(d[k])) || !(d.sales === null || isNum(d.sales)) || !(d.salesVar === null || isNum(d.salesVar))) throw new WeekError(`Loyalty row for ${name} is malformed.`);
    locations[name] = d as unknown as LoyaltyData['locations'][string];
  }
  const campaigns = l.campaigns.map((c) => {
    if (!isObj(c) || typeof c.name !== 'string' || !['generated', 'redeemed', 'discount', 'sales'].every((k) => isNum(c[k]))) throw new WeekError('A loyalty campaign row is malformed.');
    return { name: c.name, generated: c.generated as number, redeemed: c.redeemed as number, discount: c.discount as number, sales: c.sales as number };
  });
  return { locations, campaigns };
}

const APOLLO_NUM = ['sent', 'delivered', 'bounced', 'spamBlocked', 'unsubscribed', 'opened', 'replied'] as const;
function checkMarketing(m: unknown): MarketingData {
  if (!isObj(m) || !isObj(m.apollo)) throw new WeekError('Marketing data is malformed.');
  const one = (v: unknown) => {
    if (!Array.isArray(v)) throw new WeekError('Apollo rows are not a list.');
    return v.map((r) => {
      if (!isObj(r) || typeof r.name !== 'string' || !APOLLO_NUM.every((k) => isNum(r[k]))) throw new WeekError('An Apollo row is malformed.');
      return r as unknown as ApolloRow;
    });
  };
  return { apollo: { '7': one(m.apollo['7'] ?? []), '30': one(m.apollo['30'] ?? []) } };
}
