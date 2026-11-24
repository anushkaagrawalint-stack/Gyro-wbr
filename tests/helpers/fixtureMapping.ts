import type { Mapping } from '../../src/lib/types';
import { embedded } from './reference';

const nz = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Raw dining options that the reference file merges into a line by hand (not by spelling). */
const ALIASES: Record<string, string> = {
  'Dine In': 'In-Store',
  'Dine In Guid': 'In-Store',
  Curbside: 'App Curbside',
  'Mobile App - Delivery': 'App Delivery',
  'Mobile App - Pickup': 'App Pickup',
  'Online Ordering - Takeout': 'App Pickup',
  'Toast Delivery Services': 'App Delivery',
  'Catering Online Ordering - Pick Up': 'App Catering Pickup',
};

/**
 * The mapping reference/index.html applies today, rebuilt from its own channel list. It is NOT shipped as a default
 * (the admin maps everything by hand); the parity test uses it to show the pipeline reproduces the reference numbers.
 */
export function referenceMapping(rawOptions: string[]): Mapping {
  const e = embedded();
  const channels = e.channels.map((c) => ({ ...c, lines: [...c.lines] }));
  for (const [line, ch] of Object.entries(e.extraLines)) channels.find((c) => c.name === ch)!.lines.push(line);
  const allLines = channels.flatMap((c) => c.lines);
  const owner = (o: string): string | undefined => ALIASES[o] ?? allLines.find((l) => nz(l) === nz(o));
  const opts = new Map<string, string[]>();
  for (const o of rawOptions) {
    const l = owner(o);
    if (l) opts.set(l, [...(opts.get(l) ?? []), o]);
  }
  return { categories: channels.map((c) => ({ name: c.name, color: c.color, lines: c.lines.map((l) => ({ name: l, options: opts.get(l) ?? [] })) })) };
}
