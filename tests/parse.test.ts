import { describe, expect, it } from 'vitest';
import { DEFAULT_LOCATIONS } from '../src/lib/data/config';
import { validateWeek } from '../src/lib/data/weeks';
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

  it('Uber Eats and DoorDash match the numbers embedded in the reference dashboard', () => {
    const t = p().tpd!, e = embedded().tpd as Record<'ue' | 'dd', Record<string, Record<string, number | string>>>;
    for (const side of ['ue', 'dd'] as const) {
      expect(Object.keys(t[side]).sort()).toEqual(Object.keys(e[side]).sort());
      for (const loc of Object.keys(e[side])) for (const k of new Set([...Object.keys(e[side][loc]), ...Object.keys(t[side][loc])])) {
        const want = e[side][loc][k] ?? (typeof t[side][loc][k] === 'string' ? '' : 0), got = t[side][loc][k] ?? (typeof want === 'string' ? '' : 0);   // a zero count is left out of the reference
        if (typeof want === 'number') expect(got as number, `${side} ${loc} ${k}`).toBeCloseTo(want, 1);
        else expect(got, `${side} ${loc} ${k}`).toBe(want);
      }
    }
  });

  it('a parsed week with Uber Eats and DoorDash passes the server check and keeps them', () => {
    const w = p();
    const saved = validateWeek({ weekStart: w.weekStart, toast: w.toast, reviews: w.reviews, loyalty: w.loyalty, marketing: w.marketing, tpd: w.tpd });
    expect(saved.tpd).toEqual(w.tpd);
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
