import { describe, expect, it } from 'vitest';
import { DEFAULT_LOCATIONS, DEFAULT_MAPPING, UNMAPPED } from '../src/lib/data/config';
import { applyMapping, buildLocData, channelsFor, unmappedIn } from '../src/lib/data/revenue';
import { diningOptionsIn, parseWorkbook } from '../src/lib/workbook/parse';
import type { Mapping, WeekData } from '../src/lib/types';
import { referenceMapping } from './helpers/fixtureMapping';
import { embedded, hasReference, workbook } from './helpers/reference';

const LOCS = DEFAULT_LOCATIONS.map((l) => l.name);
const week = (): WeekData => ({ weekStart: '2026-10-12', uploadedAt: '', ...(() => { const p = parseWorkbook(workbook(), DEFAULT_LOCATIONS); return { toast: p.toast }; })() });

describe('mapping engine', () => {
  const m: Mapping = { categories: [{ name: 'In-Store', color: '#8b5cf6', lines: [{ name: 'In-Store', options: ['Dine In'] }] }, { name: 'Delivery', color: '#86efac', lines: [{ name: 'DoorDash', options: ['DoorDash Delivery', 'Doordash Delivery'] }] }] };
  const rows: [string, string | null, number][] = [['Dine In', null, 100], ['Dine In', 'Rice', 60], ['DoorDash Delivery', null, 30], ['Doordash Delivery', null, 20], ['Mystery', null, 7.5], ['Mystery', 'Fries', 7.5]];
  it('merges several options into one line and keeps unmapped sales in the totals', () => {
    const e = applyMapping(rows, m);
    expect(e.lines).toEqual({ 'In-Store': 100, DoorDash: 50, [UNMAPPED]: 7.5 });
    expect(e.total).toBe(157.5);
    expect(e.cats).toEqual({ 'In-Store': { Rice: 60 }, [UNMAPPED]: { Fries: 7.5 } });
    expect(e.unmapped).toEqual({ Mystery: 7.5 });
  });
  it('adds an Unmapped channel only when something is unmapped', () => {
    expect(channelsFor(m, false).map((c) => c.name)).toEqual(['In-Store', 'Delivery']);
    const ch = channelsFor(m, true);
    expect(ch[ch.length - 1]).toMatchObject({ name: UNMAPPED, lines: [UNMAPPED] });
  });
  it('starts with no mapping at all: everything is Unmapped but nothing is lost', () => {
    const e = applyMapping(rows, DEFAULT_MAPPING);
    expect(e.lines).toEqual({ [UNMAPPED]: 157.5 });
    expect(e.total).toBe(157.5);
  });
  it('lists the dining options a mapping does not know', () => {
    const toast: WeekData['toast'] = { weekly: { actual: { 'All Locations': rows } } };
    expect(unmappedIn(toast, m)).toEqual([{ name: 'Mystery', netSales: 7.5 }]);
  });
});

describe.skipIf(!hasReference)('revenue data vs reference/index.html', () => {
  const w = week();
  const opts = diningOptionsIn(w.toast).map((o) => o.name);
  const { locData, hasUnmapped } = buildLocData(w, { allowed: LOCS, mapping: referenceMapping(opts) });

  it('with the reference mapping nothing is unmapped', () => expect(hasUnmapped).toBe(false));

  it('every total, channel line and sales category equals the reference, for every period and location', () => {
    const ref = embedded().locData;
    let compared = 0;
    for (const [period, kinds] of Object.entries(ref)) {
      if (!locData[period]) continue; // the sample workbook has no PTD tabs
      for (const [kind, byLoc] of Object.entries(kinds)) for (const [loc, v] of Object.entries(byLoc)) {
        const mine = locData[period]?.[kind]?.[loc];
        expect(mine, `${period}/${kind}/${loc}`).toBeDefined();
        expect(mine.total, `${period}/${kind}/${loc} total`).toBeCloseTo(v.total, 2);
        for (const [line, val] of Object.entries(v.lines)) expect(mine.lines[line] ?? 0, `${period}/${kind}/${loc} ${line}`).toBeCloseTo(val, 2);
        for (const [line, val] of Object.entries(mine.lines)) expect(v.lines[line] ?? 0, `${period}/${kind}/${loc} extra ${line}`).toBeCloseTo(val, 2);
        const refCats = v.cats ?? {};
        for (const line of new Set([...Object.keys(refCats), ...Object.keys(mine.cats)])) {
          for (const c of new Set([...Object.keys(refCats[line] ?? {}), ...Object.keys(mine.cats[line] ?? {})])) {
            expect(mine.cats[line]?.[c] ?? 0, `${period}/${kind}/${loc} ${line}/${c}`).toBeCloseTo(refCats[line]?.[c] ?? 0, 2);
          }
        }
        compared++;
      }
    }
    expect(compared).toBeGreaterThan(60); // 4 periods x 2 series x 8 sheets = 64 (PTD is absent from this workbook)
  });

  it('a person who sees only some locations gets All Locations as the sum of theirs', () => {
    const only = buildLocData(w, { allowed: ['Fondren', 'Katy'], mapping: referenceMapping(opts) }).locData;
    const f = only.weekly.actual.Fondren.total, k = only.weekly.actual.Katy.total;
    expect(Object.keys(only.weekly.actual).sort()).toEqual(['All Locations', 'Fondren', 'Katy']);
    expect(only.weekly.actual['All Locations'].total).toBeCloseTo(f + k, 2);
    expect(only.weekly.actual['Sugar Land']).toBeUndefined();
  });
});
