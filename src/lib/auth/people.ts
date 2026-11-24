import { randomUUID } from 'node:crypto';
import type { Storage } from '../storage';
import type { Person, PublicPerson, Role } from '../types';
import { hashPassword, passwordProblem, verifyPassword } from './password';

const KEY = 'config/people.json';

export class PeopleError extends Error {}

export const toPublic = (p: Person): PublicPerson => ({ id: p.id, email: p.email, name: p.name, role: p.role, locations: p.locations });
const norm = (e: string) => e.trim().toLowerCase();

export async function listPeople(s: Storage): Promise<Person[]> {
  return (await s.get<Person[]>(KEY)) ?? [];
}

/** Creates the first admin from ADMIN_EMAIL / ADMIN_PASSWORD when nobody exists yet. */
export async function ensureFirstAdmin(s: Storage, env: Record<string, string | undefined> = process.env): Promise<void> {
  const people = await listPeople(s);
  if (people.length > 0) return;
  const email = env.ADMIN_EMAIL, password = env.ADMIN_PASSWORD;
  if (!email || !password) return;
  if (passwordProblem(password)) throw new PeopleError('ADMIN_PASSWORD must be at least 8 characters.');
  await s.put(KEY, [{ id: randomUUID(), email: norm(email), name: 'Admin', role: 'admin', locations: [], ...hashPassword(password) } satisfies Person]);
}

export async function authenticate(s: Storage, email: string, password: string): Promise<Person | null> {
  await ensureFirstAdmin(s);
  const p = (await listPeople(s)).find((x) => x.email === norm(email));
  // verify against a dummy hash when the email is unknown so timing does not reveal which emails exist
  if (!p) { verifyPassword(password, '00', hashPassword('x', '00').hash); return null; }
  return verifyPassword(password, p.salt, p.hash) ? p : null;
}

export async function getPerson(s: Storage, id: string): Promise<Person | null> {
  return (await listPeople(s)).find((x) => x.id === id) ?? null;
}

export interface PersonInput { email: string; name: string; role: Role; locations?: string[]; password?: string }

function validate(i: PersonInput, knownLocations: string[]): void {
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(i.email || '')) throw new PeopleError('Enter a valid email address.');
  if (!i.name?.trim()) throw new PeopleError('Enter a name.');
  if (!['admin', 'client', 'location'].includes(i.role)) throw new PeopleError('Choose an access type.');
  if (i.role === 'location') {
    if (!i.locations?.length) throw new PeopleError('Choose at least one location for a Location person.');
    const bad = i.locations.filter((l) => !knownLocations.includes(l));
    if (bad.length) throw new PeopleError(`Unknown location: ${bad.join(', ')}`);
  }
}

export async function addPerson(s: Storage, i: PersonInput, knownLocations: string[]): Promise<PublicPerson> {
  validate(i, knownLocations);
  const bad = passwordProblem(i.password ?? '');
  if (bad) throw new PeopleError(bad);
  const people = await listPeople(s);
  if (people.some((p) => p.email === norm(i.email))) throw new PeopleError('Someone with that email already exists.');
  const p: Person = { id: randomUUID(), email: norm(i.email), name: i.name.trim(), role: i.role, locations: i.role === 'location' ? i.locations! : [], ...hashPassword(i.password!) };
  await s.put(KEY, [...people, p]);
  return toPublic(p);
}

export async function updatePerson(s: Storage, id: string, i: Partial<PersonInput>, actorId: string, knownLocations: string[]): Promise<PublicPerson> {
  const people = await listPeople(s);
  const cur = people.find((p) => p.id === id);
  if (!cur) throw new PeopleError('Person not found.');
  const next = { email: i.email ?? cur.email, name: i.name ?? cur.name, role: (i.role ?? cur.role) as Role, locations: i.locations ?? cur.locations };
  validate(next, knownLocations);
  if (people.some((p) => p.id !== id && p.email === norm(next.email))) throw new PeopleError('Someone with that email already exists.');
  if (cur.role === 'admin' && next.role !== 'admin') {
    if (id === actorId) throw new PeopleError('You cannot remove your own admin access.');
    if (people.filter((p) => p.role === 'admin').length <= 1) throw new PeopleError('There must always be at least one admin.');
  }
  const upd: Person = { ...cur, email: norm(next.email), name: next.name.trim(), role: next.role, locations: next.role === 'location' ? next.locations : [] };
  if (i.password) {
    const bad = passwordProblem(i.password);
    if (bad) throw new PeopleError(bad);
    Object.assign(upd, hashPassword(i.password));
  }
  await s.put(KEY, people.map((p) => (p.id === id ? upd : p)));
  return toPublic(upd);
}

export async function removePerson(s: Storage, id: string, actorId: string): Promise<void> {
  const people = await listPeople(s);
  const cur = people.find((p) => p.id === id);
  if (!cur) throw new PeopleError('Person not found.');
  if (id === actorId) throw new PeopleError('You cannot remove yourself.');
  if (cur.role === 'admin' && people.filter((p) => p.role === 'admin').length <= 1) throw new PeopleError('You cannot remove the last admin.');
  await s.put(KEY, people.filter((p) => p.id !== id));
}

/** When a location is removed, strip it from every Location person; a Location person left with none is rejected by the caller. */
export async function peopleUsingLocation(s: Storage, name: string): Promise<Person[]> {
  return (await listPeople(s)).filter((p) => p.role === 'location' && p.locations.includes(name));
}
