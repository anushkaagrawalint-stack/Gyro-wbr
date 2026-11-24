import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const COOKIE_NAME = 'gwbr_session';
const MAX_AGE_S = 60 * 60 * 12; // 12 hours

let devSecret: string | null = null;
function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (s && s.length >= 16) return s;
  if (process.env.NODE_ENV === 'production') throw new Error('SESSION_SECRET must be set (16+ characters).');
  // development only: a random per-process secret (sessions reset when the server restarts)
  return (devSecret ??= randomBytes(32).toString('hex'));
}

const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64url');
const sign = (body: string) => createHmac('sha256', secret()).update(body).digest('base64url');

export interface SessionPayload {
  uid: string;
  exp: number; // unix seconds
}

/** "<base64url json>.<hmac>" - tamper-evident, not encrypted (it only holds the person id and expiry). */
export function createSessionToken(uid: string, now = Date.now()): string {
  const body = b64(JSON.stringify({ uid, exp: Math.floor(now / 1000) + MAX_AGE_S } satisfies SessionPayload));
  return `${body}.${sign(body)}`;
}

export function readSessionToken(token: string | undefined | null, now = Date.now()): SessionPayload | null {
  if (!token) return null;
  const dot = token.indexOf('.');
  if (dot < 1) return null;
  const body = token.slice(0, dot);
  const given = Buffer.from(token.slice(dot + 1));
  const want = Buffer.from(sign(body));
  if (given.length !== want.length || !timingSafeEqual(given, want)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as SessionPayload;
    if (typeof p.uid !== 'string' || typeof p.exp !== 'number' || p.exp * 1000 < now) return null;
    return p;
  } catch {
    return null;
  }
}

export function cookieOptions(): { httpOnly: true; sameSite: 'lax'; secure: boolean; path: '/'; maxAge: number } {
  return { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: MAX_AGE_S };
}
