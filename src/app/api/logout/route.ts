import { handle, HttpError } from '@/lib/auth/request';
import { COOKIE_NAME } from '@/lib/auth/session';

export const POST = handle(async (req: Request) => {
  if (req.headers.get('x-requested-with') !== 'gwbr') throw new HttpError(403, 'Forbidden.');
  const res = Response.json({ ok: true });
  res.headers.append('Set-Cookie', `${COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`);
  return res;
});
