import { handle, json, requireAdmin } from '@/lib/auth/request';
import { publishCatering } from '@/lib/data/admin';
import { WeekError } from '@/lib/data/weeks';
import { storage } from '@/lib/storage';

export const dynamic = 'force-dynamic';

/** POST { weekStart, catering }: saves the catering workbook (read in the browser) onto a published week. */
export const POST = handle(async (req: Request) => {
  await requireAdmin(req);
  const body = (await req.json().catch(() => null)) as { weekStart?: unknown; catering?: unknown } | null;
  if (!body || typeof body.weekStart !== 'string' || body.catering == null) throw new WeekError('No catering data received.');
  return json(await publishCatering(storage(), body.weekStart, body.catering));
});
