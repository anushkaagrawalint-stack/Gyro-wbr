import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { allowedLocations, tabsFor } from '../src/lib/auth/access';
import { addPerson, authenticate, ensureFirstAdmin, listPeople, PeopleError, removePerson, updatePerson } from '../src/lib/auth/people';
import { hashPassword, verifyPassword } from '../src/lib/auth/password';
import { createSessionToken, readSessionToken } from '../src/lib/auth/session';
import { LocalStorage } from '../src/lib/storage/local';

const dir = mkdtempSync(path.join(tmpdir(), 'wbr-auth-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
beforeAll(() => { process.env.SESSION_SECRET = 'test-secret-test-secret-test'; });

const LOCS = ['Fondren', 'Katy', 'Spring'];

describe('passwords', () => {
  it('hashes with a salt and verifies', () => {
    const a = hashPassword('correct horse'), b = hashPassword('correct horse');
    expect(a.hash).not.toBe(b.hash); // different salts
    expect(a.hash).not.toContain('correct');
    expect(verifyPassword('correct horse', a.salt, a.hash)).toBe(true);
    expect(verifyPassword('wrong', a.salt, a.hash)).toBe(false);
  });
});

describe('session cookie', () => {
  it('round-trips, rejects tampering and expiry', () => {
    const t = createSessionToken('u1', 1_000_000);
    expect(readSessionToken(t, 1_000_000)?.uid).toBe('u1');
    const [body, sig] = t.split('.');
    const forged = Buffer.from(JSON.stringify({ uid: 'admin', exp: 9_999_999_999 })).toString('base64url');
    expect(readSessionToken(`${forged}.${sig}`, 1_000_000)).toBeNull();
    expect(readSessionToken(`${body}.${sig.slice(0, -2)}xx`, 1_000_000)).toBeNull();
    expect(readSessionToken(t, 1_000_000 + 13 * 3600 * 1000)).toBeNull(); // 13 h later
    expect(readSessionToken('garbage')).toBeNull();
    expect(readSessionToken(undefined)).toBeNull();
  });
});

describe('people', () => {
  const s = new LocalStorage(path.join(dir, 'p'));
  it('creates the first admin from env, stores only a hash, and signs in', async () => {
    await ensureFirstAdmin(s, { ADMIN_EMAIL: 'Boss@Example.com', ADMIN_PASSWORD: 'longenough1' });
    const people = await listPeople(s);
    expect(people).toHaveLength(1);
    expect(people[0].email).toBe('boss@example.com');
    expect(readFileSync(path.join(dir, 'p', 'config', 'people.json'), 'utf8')).not.toContain('longenough1');
    expect((await authenticate(s, 'BOSS@example.com', 'longenough1'))?.role).toBe('admin');
    expect(await authenticate(s, 'boss@example.com', 'nope')).toBeNull();
    expect(await authenticate(s, 'who@example.com', 'longenough1')).toBeNull();
  });

  it('adds, edits and validates people', async () => {
    const c = await addPerson(s, { email: 'c@x.com', name: 'Cee', role: 'client', password: 'password1' }, LOCS);
    expect(c.role).toBe('client');
    await expect(addPerson(s, { email: 'c@x.com', name: 'Dup', role: 'client', password: 'password1' }, LOCS)).rejects.toThrow(/already exists/);
    await expect(addPerson(s, { email: 'l@x.com', name: 'L', role: 'location', locations: [], password: 'password1' }, LOCS)).rejects.toThrow(/at least one location/);
    await expect(addPerson(s, { email: 'l@x.com', name: 'L', role: 'location', locations: ['Nowhere'], password: 'password1' }, LOCS)).rejects.toThrow(/Unknown location/);
    await expect(addPerson(s, { email: 'l@x.com', name: 'L', role: 'client', password: 'short' }, LOCS)).rejects.toThrow(/8 characters/);
    const l = await addPerson(s, { email: 'l@x.com', name: 'Ell', role: 'location', locations: ['Katy'], password: 'password1' }, LOCS);
    const upd = await updatePerson(s, l.id, { locations: ['Katy', 'Spring'], password: 'newpassword9' }, 'someone', LOCS);
    expect(upd.locations).toEqual(['Katy', 'Spring']);
    expect(await authenticate(s, 'l@x.com', 'password1')).toBeNull(); // reset password took effect
    expect((await authenticate(s, 'l@x.com', 'newpassword9'))?.id).toBe(l.id);
  });

  it('cannot remove yourself or the last admin', async () => {
    const admin = (await listPeople(s)).find((p) => p.role === 'admin')!;
    await expect(removePerson(s, admin.id, admin.id)).rejects.toBeInstanceOf(PeopleError);
    const other = (await listPeople(s)).find((p) => p.role === 'client')!;
    await expect(removePerson(s, admin.id, other.id)).rejects.toThrow(/last admin/);
    await expect(updatePerson(s, admin.id, { role: 'client' }, admin.id, LOCS)).rejects.toThrow(/own admin/);
    await expect(updatePerson(s, admin.id, { role: 'client' }, other.id, LOCS)).rejects.toThrow(/at least one admin/);
    await removePerson(s, other.id, admin.id);
    expect((await listPeople(s)).some((p) => p.id === other.id)).toBe(false);
  });
});

describe('access levels', () => {
  it('shows the Admin tab only to admins and hides Marketing from Location people', () => {
    expect(tabsFor('admin')).toContain('Admin');
    expect(tabsFor('client')).not.toContain('Admin');
    expect(tabsFor('client')).toContain('Marketing');
    expect(tabsFor('location')).not.toContain('Marketing');
    expect(tabsFor('location')).toContain('Catering');
    expect(tabsFor('location')).not.toContain('Admin');
    expect(tabsFor('location')).toContain('Location');
  });
  it('limits Location people to their locations (and keeps configured order)', () => {
    expect(allowedLocations({ role: 'admin', locations: [] }, LOCS)).toEqual(LOCS);
    expect(allowedLocations({ role: 'client', locations: [] }, LOCS)).toEqual(LOCS);
    expect(allowedLocations({ role: 'location', locations: ['Spring', 'Fondren'] }, LOCS)).toEqual(['Fondren', 'Spring']);
    expect(allowedLocations({ role: 'location', locations: ['Hidden one'] }, LOCS)).toEqual([]);
  });
});
