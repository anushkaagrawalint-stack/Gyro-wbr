import type { Storage } from '../storage';
import type { FormatConfig, LocationConfig, Mapping, MappingCategory } from '../types';

export const UNMAPPED = 'Unmapped';
export const UNMAPPED_COLOR = '#d1d5db';

export class ConfigError extends Error {}

/* ---------- locations ---------- */

const ALL_PLATFORMS = ['Google', 'Uber Eats', 'DoorDash'];
export const DEFAULT_LOCATIONS: LocationConfig[] = [
  { name: 'Fondren', hidden: false, platforms: [...ALL_PLATFORMS, 'Yelp'], aliases: ['Southwest Freeway', 'Fondren Houston'] },
  { name: 'Sugar Land', hidden: false, platforms: [...ALL_PLATFORMS], aliases: [] },
  { name: 'Richmond', hidden: false, platforms: [...ALL_PLATFORMS, 'Yelp'], aliases: ['Waterview Town Center Dr'] },
  { name: 'Katy', hidden: false, platforms: [...ALL_PLATFORMS], aliases: [] },
  { name: 'Missouri City', hidden: false, platforms: [...ALL_PLATFORMS], aliases: [] },
  { name: 'Spring', hidden: false, platforms: [...ALL_PLATFORMS], aliases: ['Klein'] },
  { name: 'Pearland', hidden: false, platforms: [...ALL_PLATFORMS], aliases: [] },
];
export const PLATFORMS = ['Google', 'Yelp', 'Uber Eats', 'DoorDash'];

export async function loadLocations(s: Storage): Promise<LocationConfig[]> {
  return (await s.get<LocationConfig[]>('config/locations.json')) ?? DEFAULT_LOCATIONS.map((l) => ({ ...l, platforms: [...l.platforms], aliases: [...l.aliases] }));
}

export function validateLocations(list: LocationConfig[]): LocationConfig[] {
  const seen = new Set<string>();
  const out = list.map((l) => {
    const name = String(l.name ?? '').trim();
    if (!name) throw new ConfigError('Every location needs a name.');
    if (seen.has(name.toLowerCase())) throw new ConfigError(`Duplicate location: ${name}`);
    seen.add(name.toLowerCase());
    const platforms = [...new Set((l.platforms ?? []).filter((p) => PLATFORMS.includes(p)))];
    const aliases = [...new Set((l.aliases ?? []).map((a) => String(a).trim()).filter((a) => a && a.toLowerCase() !== name.toLowerCase()))];
    return { name, hidden: !!l.hidden, platforms, aliases };
  });
  if (!out.length) throw new ConfigError('There must be at least one location.');
  return out;
}

export async function saveLocations(s: Storage, list: LocationConfig[]): Promise<LocationConfig[]> {
  const v = validateLocations(list);
  await s.put('config/locations.json', v);
  return v;
}

/** Resolve a name found in an upload (tab name, review sheet) to a configured location name, or null. */
export function resolveLocation(raw: string, locs: LocationConfig[]): string | null {
  const t = raw.trim().toLowerCase();
  for (const l of locs) if (l.name.toLowerCase() === t || l.aliases.some((a) => a.toLowerCase() === t)) return l.name;
  return null;
}

/* ---------- mapping ---------- */

/** The five categories always exist. They start with no lines: the admin maps every dining option. */
export const DEFAULT_MAPPING: Mapping = {
  categories: [
    { name: 'In-Store', color: '#9f7cef', lines: [] },
    { name: 'Take Out', color: '#f9a8d4', lines: [] },
    { name: 'Delivery', color: '#86efac', lines: [] },
    { name: 'Catering', color: '#fcd34d', lines: [] },
    { name: 'Others', color: '#93c5fd', lines: [] },
  ],
};

export async function loadMapping(s: Storage): Promise<Mapping> {
  return (await s.get<Mapping>('config/mapping.json')) ?? JSON.parse(JSON.stringify(DEFAULT_MAPPING));
}

export function validateMapping(m: Mapping): Mapping {
  const catNames = new Set<string>(), lineNames = new Set<string>(), opts = new Map<string, string>();
  const categories: MappingCategory[] = (m.categories ?? []).map((c) => {
    const name = String(c.name ?? '').trim();
    if (!name) throw new ConfigError('Every category needs a name.');
    if (name === UNMAPPED) throw new ConfigError(`"${UNMAPPED}" is reserved for sales that have not been mapped yet.`);
    if (catNames.has(name.toLowerCase())) throw new ConfigError(`Duplicate category: ${name}`);
    catNames.add(name.toLowerCase());
    const color = /^#[0-9a-f]{6}$/i.test(c.color) ? c.color : '#9ca3af';
    const lines = (c.lines ?? []).map((l) => {
      const ln = String(l.name ?? '').trim();
      if (!ln) throw new ConfigError(`A line in ${name} has no name.`);
      if (ln === UNMAPPED) throw new ConfigError(`"${UNMAPPED}" is reserved for sales that have not been mapped yet.`);
      if (lineNames.has(ln.toLowerCase())) throw new ConfigError(`Duplicate line name: ${ln}`);
      lineNames.add(ln.toLowerCase());
      const options = [...new Set((l.options ?? []).map((o) => String(o)))];
      for (const o of options) {
        if (opts.has(o)) throw new ConfigError(`"${o}" is assigned to both "${opts.get(o)}" and "${ln}".`);
        opts.set(o, ln);
      }
      return { name: ln, options };
    });
    return { name, color, lines };
  });
  return { categories };
}

export async function saveMapping(s: Storage, m: Mapping): Promise<Mapping> {
  const v = validateMapping(m);
  await s.put('config/mapping.json', v);
  return v;
}

/** raw dining option -> { line, category }. Options with no entry are unmapped. */
export function mappingIndex(m: Mapping): Map<string, { line: string; category: string }> {
  const idx = new Map<string, { line: string; category: string }>();
  for (const c of m.categories) for (const l of c.lines) for (const o of l.options) idx.set(o, { line: l.name, category: c.name });
  return idx;
}

/* ---------- colour formats ---------- */

export async function loadFormats(s: Storage): Promise<FormatConfig[]> {
  return (await s.get<FormatConfig[]>('config/formats.json')) ?? [];
}

const OPS = ['<', '<=', '>', '>=', '=', 'between'];
export function validateFormats(list: FormatConfig[]): FormatConfig[] {
  return list.map((f) => {
    if (!f.table?.trim() || !f.column?.trim()) throw new ConfigError('Every colour rule needs a table and a column.');
    const rules = (f.rules ?? []).map((r) => {
      if (!OPS.includes(r.op)) throw new ConfigError(`Unknown comparison "${r.op}".`);
      if (!Number.isFinite(+r.v)) throw new ConfigError('Rule values must be numbers.');
      if (r.op === 'between' && !Number.isFinite(+(r.v2 as number))) throw new ConfigError('"between" needs two numbers.');
      if (!/^(green|amber|red|purple|grey|#[0-9a-f]{6})$/i.test(r.color)) throw new ConfigError(`Unknown colour "${r.color}".`);
      return { op: r.op, v: +r.v, ...(r.op === 'between' ? { v2: +(r.v2 as number) } : {}), color: r.color };
    });
    return { table: f.table.trim(), column: f.column.trim(), axis: f.axis === 'row' ? 'row' : 'column', mode: (['pill', 'cell', 'text'].includes(f.mode) ? f.mode : 'pill') as FormatConfig['mode'], rules };
  });
}
export async function saveFormats(s: Storage, list: FormatConfig[]): Promise<FormatConfig[]> {
  const v = validateFormats(list);
  await s.put('config/formats.json', v);
  return v;
}
