import { listPeople } from '../auth/people';
import type { Storage } from '../storage';
import { ALL, type LocationConfig, type Person, type WeekData } from '../types';
import { ConfigError, loadLocations, loadMapping, validateLocations } from './config';
import { unmappedIn } from './revenue';
import { deleteWeek, getWeek, listWeeks, saveWeek, UnmappedError, validateWeek, WeekConflict } from './weeks';

const OPTIONS_KEY = 'config/dining-options.json';
export type DiningOptions = Record<string, { netSales: number; lastWeek: string }>;

/** Every dining option ever seen in an upload (so the mapping screen can list them all). */
export async function loadDiningOptions(s: Storage): Promise<DiningOptions> {
  return (await s.get<DiningOptions>(OPTIONS_KEY)) ?? {};
}

async function recordDiningOptions(s: Storage, week: WeekData): Promise<void> {
  const cur = await loadDiningOptions(s);
  const seen = new Map<string, number>();
  for (const kinds of Object.values(week.toast)) for (const byLoc of Object.values(kinds ?? {})) for (const [loc, rows] of Object.entries(byLoc ?? {})) {
    for (const [opt, cat, net] of rows) {
      if (!seen.has(opt)) seen.set(opt, 0);
      if (cat == null && loc === ALL && week.toast.weekly?.actual?.[ALL] === rows) seen.set(opt, (seen.get(opt) ?? 0) + net);
    }
  }
  for (const [name, net] of seen) {
    const prev = cur[name];
    if (!prev || prev.lastWeek <= week.weekStart) cur[name] = { netSales: Math.round(net * 100) / 100, lastWeek: week.weekStart };
  }
  await s.put(OPTIONS_KEY, cur);
}

export interface PublishOptions { replace?: boolean; allowUnmapped?: boolean }

/**
 * Saves an uploaded week. A week that already exists is only replaced when asked. Dining options the mapping does not
 * know stop the publish (so the admin can map them) unless `allowUnmapped` says to publish them on the Unmapped line.
 */
export async function publishWeek(s: Storage, input: unknown, o: PublishOptions = {}): Promise<{ weekStart: string; unmapped: { name: string; netSales: number }[]; replaced: boolean }> {
  const week = validateWeek(input);
  const prev = await getWeek(s, week.weekStart);
  if (prev && !o.replace) throw new WeekConflict(`The week of ${week.weekStart} is already published. Choose "Replace" to overwrite it.`);
  const unmapped = unmappedIn(week.toast, await loadMapping(s));
  if (unmapped.length && !o.allowUnmapped) throw new UnmappedError(`${unmapped.length} dining option(s) are not mapped yet.`, unmapped);
  // 3rd Party Delivery and Catering are not in the workbook: keep the old copy when replacing, or the embedded one for its own week
  const embedded = await s.get<{ weekStart: string; tpd?: unknown; catering?: unknown }>('config/embedded.json');
  for (const k of ['tpd', 'catering'] as const) {
    if (prev?.[k] != null) week[k] = prev[k];
    else if (embedded && embedded.weekStart === week.weekStart && embedded[k] != null) week[k] = embedded[k];
  }
  // a re-upload without a section (say Apollo) keeps the previous copy of that section
  for (const k of ['reviews', 'loyalty', 'marketing'] as const) if (week[k] == null && prev?.[k] != null) (week as unknown as Record<string, unknown>)[k] = prev[k];
  await saveWeek(s, week);
  await recordDiningOptions(s, week);
  return { weekStart: week.weekStart, unmapped, replaced: !!prev };
}

export async function removeWeek(s: Storage, weekStart: string): Promise<void> {
  await deleteWeek(s, weekStart);
}

/* ---------- locations ---------- */

function renameInWeek(w: WeekData, from: string, to: string): WeekData {
  const rk = <T,>(o: Record<string, T> | undefined) => {
    if (!o || !(from in o)) return o;
    const { [from]: v, ...rest } = o;
    return { ...rest, [to]: v };
  };
  for (const kinds of Object.values(w.toast)) for (const k of Object.keys(kinds ?? {}) as ('actual' | 'ly')[]) kinds![k] = rk(kinds![k]) as Record<string, never>;
  if (w.reviews) for (const list of [w.reviews.so7_90, w.reviews.so30]) for (const r of list) if (r[1] === from) r[1] = to;
  if (w.loyalty) w.loyalty.locations = rk(w.loyalty.locations)!;
  const t = w.tpd as { ue?: Record<string, unknown>; dd?: Record<string, unknown> } | undefined;
  if (t) { t.ue = rk(t.ue); t.dd = rk(t.dd); }
  const c = w.catering as { location?: { locations?: Record<string, unknown> }; locationWeeks?: { locations?: Record<string, unknown> }[] } | undefined;
  if (c) {
    if (c.location) c.location.locations = rk(c.location.locations);
    for (const b of c.locationWeeks ?? []) b.locations = rk(b.locations);
  }
  return w;
}

/**
 * Saves the location list. `renames` ({old: new}) also renames the location in every stored week and in people's access,
 * so past weeks keep showing. A location that is removed is only dropped from the list: its data stays in the weeks.
 */
export async function saveLocationsWithMigration(s: Storage, list: LocationConfig[], renames: Record<string, string> = {}): Promise<LocationConfig[]> {
  const next = validateLocations(list);
  const before = await loadLocations(s);
  const names = new Set(next.map((l) => l.name));
  for (const [from, to] of Object.entries(renames)) {
    if (!before.some((l) => l.name === from)) throw new ConfigError(`Cannot rename "${from}": it is not a current location.`);
    if (!names.has(to)) throw new ConfigError(`Renamed location "${to}" is missing from the list.`);
  }
  const renamedFrom = new Set(Object.keys(renames));
  const removed = before.filter((l) => !names.has(l.name) && !renamedFrom.has(l.name)).map((l) => l.name);
  const people = await listPeople(s);
  const afterNames = (p: Person) => p.locations.map((l) => renames[l] ?? l).filter((l) => names.has(l));
  const stranded = people.filter((p) => p.role === 'location' && afterNames(p).length === 0);
  if (stranded.length) throw new ConfigError(`${stranded.map((p) => p.email).join(', ')} would be left with no location. Change their access first.`);

  if (Object.keys(renames).length) {
    for (const e of await listWeeks(s)) {
      const w = await getWeek(s, e.weekStart);
      if (!w) continue;
      let changed = false;
      for (const [from, to] of Object.entries(renames)) { const before = JSON.stringify(w); renameInWeek(w, from, to); if (JSON.stringify(w) !== before) changed = true; }
      if (changed) await saveWeek(s, w);
    }
  }
  if (Object.keys(renames).length || removed.length) {
    await s.put('config/people.json', people.map((p) => (p.role === 'location' ? { ...p, locations: afterNames(p) } : p)));
  }
  await s.put('config/locations.json', next);
  return next;
}
