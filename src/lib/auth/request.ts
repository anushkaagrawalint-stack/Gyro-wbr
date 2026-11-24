import { cookies } from 'next/headers';
import { storage } from '../storage';
import type { PublicPerson } from '../types';
import { ensureFirstAdmin, getPerson, toPublic } from './people';
import { COOKIE_NAME, readSessionToken } from './session';

/** The signed-in person, re-read from storage on every request (so a removed person loses access at once). */
export async function currentPerson(): Promise<PublicPerson | null> {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  const sess = readSessionToken(token);
  if (!sess) return null;
  const s = storage();
  await ensureFirstAdmin(s);
  const p = await getPerson(s, sess.uid);
  return p ? toPublic(p) : null;
}

export class HttpError extends Error {
  constructor(public status: number, message: string, public extra?: Record<string, unknown>) { super(message); }
}

/** Mutating requests must come from our own pages: a custom header a cross-site form cannot send. */
function checkCsrf(req: Request): void {
  if (req.method !== 'GET' && req.method !== 'HEAD' && req.headers.get('x-requested-with') !== 'gwbr') throw new HttpError(403, 'Forbidden.');
}

export async function requirePerson(req: Request): Promise<PublicPerson> {
  checkCsrf(req);
  const p = await currentPerson();
  if (!p) throw new HttpError(401, 'Please sign in.');
  return p;
}

export async function requireAdmin(req: Request): Promise<PublicPerson> {
  const p = await requirePerson(req);
  if (p.role !== 'admin') throw new HttpError(403, 'Admins only.');
  return p;
}

/** Wraps a route handler: HttpError and expected domain errors become JSON with the right status. */
export function handle<A extends unknown[]>(fn: (...a: A) => Promise<Response>) {
  return async (...a: A): Promise<Response> => {
    try {
      return await fn(...a);
    } catch (e) {
      if (e instanceof HttpError) return Response.json({ error: e.message, ...e.extra }, { status: e.status });
      const name = (e as Error)?.constructor?.name;
      if (name === 'WeekConflict') return Response.json({ error: (e as Error).message, conflict: true }, { status: 409 });
      if (name === 'UnmappedError') return Response.json({ error: (e as Error).message, unmapped: (e as unknown as { unmapped: unknown }).unmapped }, { status: 422 });
      if (name === 'PeopleError' || name === 'ConfigError' || name === 'WeekError') return Response.json({ error: (e as Error).message }, { status: 400 });
      console.error(e);
      return Response.json({ error: 'Something went wrong on the server.' }, { status: 500 });
    }
  };
}

export const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
