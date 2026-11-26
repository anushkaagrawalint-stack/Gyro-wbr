import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { publishWeek, saveLocationsWithMigration } from '../src/lib/data/admin';
import { buildBoot } from '../src/lib/data/boot';
import { loadDeliveryStatus, loadLocations, saveDeliveryStatus, saveMapping } from '../src/lib/data/config';
import { getWeek } from '../src/lib/data/weeks';
import { LocalStorage } from '../src/lib/storage/local';
import type { PublicPerson } from '../src/lib/types';
import { DEFAULT_LOCATIONS } from '../src/lib/data/config';
import { diningOptionsIn, parseWorkbook } from '../src/lib/workbook/parse';
import { referenceMapping } from './helpers/fixtureMapping';
import { embedded, hasReference, workbook } from './helpers/reference';

const admin: PublicPerson = { id: 'a', email: 'a@x.com', name: 'A', role: 'admin', locations: [] };
const client: PublicPerson = { ...admin, id: 'c', role: 'client' };
const katy: PublicPerson = { ...admin, id: 'k', role: 'location', locations: ['Katy'] };

describe.skipIf(!hasReference)('what each access level receives (built on the server)', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'wbr-boot-'));
  const s = new LocalStorage(dir);
  const p = () => parseWorkbook(workbook(), DEFAULT_LOCATIONS);
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  beforeAll(async () => {
    const parsed = p();
    await saveMapping(s, referenceMapping(diningOptionsIn(parsed.toast).map((o) => o.name)));
    const e = embedded();
    await s.put('config/embedded.json', { weekStart: e.weekStart, tpd: e.tpd, catering: e.catering });
    await publishWeek(s, { weekStart: parsed.weekStart, toast: parsed.toast, reviews: parsed.reviews, loyalty: parsed.loyalty, marketing: parsed.marketing });
  });

  it('opens on the latest week', async () => {
    const r = await buildBoot(s, admin);
    expect(r!.boot.week.weekStart).toBe('2026-10-12');
    expect(r!.boot.week.weekOf).toBe('October 12');
  });

  it('Admin gets the Admin tab and everything; Client gets everything but the Admin tab', async () => {
    const a = (await buildBoot(s, admin))!.boot, c = (await buildBoot(s, client))!.boot;
    expect(a.tabs).toContain('Admin');
    expect(c.tabs).not.toContain('Admin');
    expect(c.locations).toHaveLength(7);
    expect(c.sections.marketing).toBeDefined();
    expect(c.sections.catering).toBeDefined();
    expect(c.locData.weekly.actual['All Locations'].total).toBeCloseTo(77077.74, 2);
  });

  it('delivery app statuses: saved, validated, and each person only receives their own restaurants', async () => {
    expect(await loadDeliveryStatus(s)).toEqual({ ue: {}, dd: {} });
    const saved = await saveDeliveryStatus(s, { ue: { Katy: 'Top Eats', Fondren: '' }, dd: { Katy: 'Need Work', Richmond: 'Most Loved' } });
    expect(saved).toEqual({ ue: { Katy: 'Top Eats' }, dd: { Katy: 'Need Work', Richmond: 'Most Loved' } });   // a blank status is dropped
    await expect(saveDeliveryStatus(s, { ue: { Katy: 'Most Loved' }, dd: {} })).rejects.toThrow(/not a Uber Eats status/);   // DoorDash badges are not valid on Uber Eats
    await expect(saveDeliveryStatus(s, { ue: {}, dd: { Nowhere: 'Poor' } })).rejects.toThrow(/not a restaurant/);
    expect((await buildBoot(s, client))!.boot.deliveryStatus).toEqual(saved);
    expect((await buildBoot(s, katy))!.boot.deliveryStatus).toEqual({ ue: { Katy: 'Top Eats' }, dd: { Katy: 'Need Work' } });   // Richmond's badge is not sent to Katy
    await saveDeliveryStatus(s, { ue: {}, dd: {} });
  });

  it('a Location person only ever receives their own location, and no Marketing data', async () => {
    const k = (await buildBoot(s, katy))!.boot;
    expect(k.tabs).not.toContain('Marketing');
    expect(k.tabs).not.toContain('Catering'); // Katy has no catering outreach, so no Catering tab
    expect(k.tabs).not.toContain('Admin');
    expect(k.locations).toEqual(['Katy']);
    expect(k.sections.marketing).toBeUndefined();
    expect(k.sections.loyalty!.campaigns).toEqual([]);
    expect(Object.keys(k.sections.loyalty!.locations)).toEqual(['Katy']);
    expect(Object.keys((k.sections.tpd as { ue: object }).ue)).toEqual(['Katy']);
    expect(new Set(k.sections.reviews!.so7_90.map((r) => r[1]))).toEqual(new Set(['Katy']));
    expect(Object.keys(k.locData.weekly.actual).sort()).toEqual(['All Locations', 'Katy', '__company']);
    // the other tabs' "All Locations" is the person's own total; the real company total is kept apart for the Location tab
    const adminBoot = (await buildBoot(s, { id: 'x', email: 'x@x', name: 'x', role: 'admin', locations: [] }))!.boot;
    expect(k.locData.weekly.actual['All Locations'].total).toBeCloseTo(k.locData.weekly.actual.Katy.total, 2);
    expect(k.locData.weekly.actual.__company.total).toBeCloseTo(adminBoot.locData.weekly.actual['All Locations'].total, 2);
    expect(k.locData.weekly.actual.__company.total).toBeGreaterThan(k.locData.weekly.actual.Katy.total);
    expect(k.company?.loyalty?.newMembers).toBeGreaterThan(Number(k.sections.loyalty!.locations.Katy.newMembers));
    expect(k.integrations.Yelp).toEqual([]); // Katy has no Yelp
    const cat = k.sections.catering as { weeks?: unknown; location: { locations: object; total: object } };
    expect(cat.weeks).toBeUndefined(); // no team-wide trend
    expect(Object.keys(cat.location.locations)).toEqual([]); // Katy has no catering outreach, and nobody else's leaks
    // nothing about other locations appears anywhere in what is sent
    const json = JSON.stringify(k);
    for (const other of ['Fondren', 'Sugar Land', 'Richmond', 'Missouri City', 'Spring', 'Pearland']) expect(json, other).not.toContain(other);
    expect(json).not.toContain('Halloween');
  });

  it('hidden locations disappear for everyone and All Locations becomes the sum of the rest', async () => {
    const locs = await loadLocations(s);
    await saveLocationsWithMigration(s, locs.map((l) => (l.name === 'Spring' ? { ...l, hidden: true } : l)));
    const c = (await buildBoot(s, client))!.boot;
    expect(c.locations).not.toContain('Spring');
    const sum = c.locations.reduce((t, l) => t + c.locData.weekly.actual[l].total, 0);
    expect(c.locData.weekly.actual['All Locations'].total).toBeCloseTo(sum, 2);
    await saveLocationsWithMigration(s, locs);
  });

  it('shows Var vs LW from the previous week once it exists', async () => {
    const parsed = p();
    expect((await buildBoot(s, admin))!.boot.locData.weekly.lw).toBeUndefined();
    await publishWeek(s, { weekStart: '2026-10-19', toast: parsed.toast, reviews: parsed.reviews });
    const b = (await buildBoot(s, admin, '2026-10-19'))!.boot;
    expect(b.locData.weekly.lw['All Locations'].total).toBeCloseTo(77077.74, 2);
    // loyalty, marketing, 3PD and catering were not in this upload: they carry over from the week before and say so
    expect(b.asOf.reviews).toBeUndefined(); // this upload had reviews
    expect(Object.keys(b.asOf).sort()).toEqual(['catering', 'loyalty', 'marketing', 'tpd']);
    expect(b.asOf.tpd).toBe('2026-10-12');
  });

  it('publishing needs an explicit replace, and unknown dining options must be mapped or accepted', async () => {
    const parsed = p();
    const body = { weekStart: '2026-10-12', toast: parsed.toast };
    await expect(publishWeek(s, body)).rejects.toThrow(/already published/);
    expect((await publishWeek(s, body, { replace: true })).replaced).toBe(true);
    const old = (await getWeek(s, '2026-10-12'))!;
    expect(old.reviews).toBeDefined(); // a re-upload without Reviews keeps the previous copy
    expect(old.tpd).toBeDefined(); // 3rd Party Delivery stays
    const withNew = JSON.parse(JSON.stringify(body));
    withNew.weekStart = '2026-10-26';
    withNew.toast.weekly.actual['All Locations'].push(['Brand New Option', null, 50]);
    await expect(publishWeek(s, withNew)).rejects.toMatchObject({ unmapped: [{ name: 'Brand New Option', netSales: 50 }] });
    expect((await publishWeek(s, withNew, { allowUnmapped: true })).unmapped).toHaveLength(1);
    const b = (await buildBoot(s, admin, '2026-10-26'))!;
    expect(b.unmapped).toEqual(['Brand New Option']);
    expect(b.boot.channels.at(-1)!.name).toBe('Unmapped');
    expect(b.boot.locData.weekly.actual['All Locations'].lines.Unmapped).toBe(50);
    expect(b.boot.locData.weekly.actual['All Locations'].total).toBeCloseTo(77077.74 + 50, 2);
  });

  it('renaming a location carries through stored weeks and Location people', async () => {
    const { addPerson } = await import('../src/lib/auth/people');
    await addPerson(s, { email: 'k@x.com', name: 'K', role: 'location', locations: ['Katy'], password: 'password1' }, ['Katy']);
    const locs = await loadLocations(s);
    await saveLocationsWithMigration(s, locs.map((l) => (l.name === 'Katy' ? { ...l, name: 'Katy West' } : l)), { Katy: 'Katy West' });
    const w = (await getWeek(s, '2026-10-12'))!;
    expect(Object.keys(w.toast.weekly!.actual!)).toContain('Katy West');
    expect(Object.keys(w.toast.weekly!.actual!)).not.toContain('Katy');
    expect(w.reviews!.so7_90.some((r) => r[1] === 'Katy West')).toBe(true);
    const kw = (await buildBoot(s, { ...katy, locations: ['Katy West'] }))!.boot;
    expect(kw.locations).toEqual(['Katy West']);
    await expect(saveLocationsWithMigration(s, locs.filter((l) => l.name !== 'Katy'))).rejects.toThrow(/no location/);
  });
});
