import { authenticate } from '@/lib/auth/people';
import { handle, HttpError } from '@/lib/auth/request';
import { COOKIE_NAME, cookieOptions, createSessionToken } from '@/lib/auth/session';
import { storage } from '@/lib/storage';

// slow down password guessing: 8 failures per email+address per 15 minutes (in memory, per server process)
const fails = new Map<string, { n: number; until: number }>();
const WINDOW = 15 * 60_000, MAX = 8;

export const POST = handle(async (req: Request) => {
  if (req.headers.get('x-requested-with') !== 'gwbr') throw new HttpError(403, 'Forbidden.');
  const body = (await req.json().catch(() => ({}))) as { email?: string; password?: string };
  const email = String(body.email ?? '').trim().toLowerCase(), password = String(body.password ?? '');
  const key = `${email}|${req.headers.get('x-forwarded-for') ?? 'local'}`;
  const f = fails.get(key);
  if (f && f.until > Date.now() && f.n >= MAX) throw new HttpError(429, 'Too many attempts. Try again in a few minutes.');
  const person = email && password ? await authenticate(storage(), email, password) : null;
  if (!person) {
    const cur = f && f.until > Date.now() ? f : { n: 0, until: Date.now() + WINDOW };
    fails.set(key, { n: cur.n + 1, until: cur.until });
    throw new HttpError(401, 'Wrong email or password.');
  }
  fails.delete(key);
  const res = Response.json({ ok: true });
  res.headers.append('Set-Cookie', serialize(COOKIE_NAME, createSessionToken(person.id)));
  return res;
});

function serialize(name: string, value: string): string {
  const o = cookieOptions();
  return `${name}=${value}; Path=${o.path}; Max-Age=${o.maxAge}; HttpOnly; SameSite=Lax${o.secure ? '; Secure' : ''}`;
}
