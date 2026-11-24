import { describe, expect, it } from 'vitest';
import { DEFAULT_LOCATIONS } from '../src/lib/data/config';
import { diningOptionsIn, parseWorkbook, weekStartFromRange } from '../src/lib/workbook/parse';
import { embedded, hasReference, workbook } from './helpers/reference';

describe('week range', () => {
  it('reads the start of the week', () => {
    expect(weekStartFromRange('Oct 12 - Oct 18, 2026')).toBe('2026-10-12');
    expect(weekStartFromRange('Dec 28 - Jan 03, 2027')).toBe('2026-12-28');
    expect(weekStartFromRange('nonsense')).toBeNull();
  });
});

describe.skipIf(!hasReference)('workbook parser vs reference/index.html', () => {
  const p = () => parseWorkbook(workbook(), DEFAULT_LOCATIONS);
  const noEm = (s: string) => s.replace(/—/g, '-');

  it('finds the week and no unknown locations', () => {
    expect(p().weekStart).toBe(embedded().weekStart);
    expect(p().unknownLocations).toEqual([]);
  });

  it('reviews match (Klein reads as Spring)', () => {
    const e = embedded().reviews, r = p().reviews!;
    const key = (rows: unknown[][]) => rows.map((x) => JSON.stringify(x)).sort();
    expect(key(r.so7_90)).toEqual(key(e.so7_90));
    expect(key(r.so30)).toEqual(key(e.so30));
  });

  it('loyalty matches', () => {
    const e = embedded().loyalty, l = p().loyalty!;
    expect(l.locations).toEqual(e.locations);
    expect(l.campaigns).toEqual(e.campaigns.map((c) => ({ ...c, name: noEm(String(c.name)) })));
  });

  it('marketing (Apollo) matches', () => {
    expect(p().marketing).toEqual(embedded().marketing);
  });

  it('keeps Toast rows raw and lists every dining option', () => {
    const t = p().toast;
    expect(Object.keys(t).sort()).toEqual(['mtd', 'quarterly', 'weekly', 'ytd']); // this workbook has no PTD tabs
    expect(t.weekly!.actual!['All Locations'][0]).toEqual(['Dine In', null, 46705.15]);
    expect(t.weekly!.actual!['Fondren'].length).toBeGreaterThan(50);
    const opts = diningOptionsIn(t).map((o) => o.name);
    expect(opts).toContain('Dine In');
    expect(opts).toContain('DoorDash -  Delivery'); // the spelling variants are kept as-is, for the admin to merge
    expect(opts).toContain('Doordash Delivery');
    expect(new Set(opts).size).toBe(opts.length);
  });
});
