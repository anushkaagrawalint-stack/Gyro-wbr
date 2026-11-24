import { handle, json, requireAdmin } from '@/lib/auth/request';
import { loadFormats, saveFormats } from '@/lib/data/config';
import { storage } from '@/lib/storage';
import type { FormatConfig } from '@/lib/types';

export const dynamic = 'force-dynamic';

export const GET = handle(async (req: Request) => {
  await requireAdmin(req);
  return json({ formats: await loadFormats(storage()) });
});

export const PUT = handle(async (req: Request) => {
  await requireAdmin(req);
  const body = (await req.json().catch(() => null)) as { formats?: FormatConfig[] } | null;
  if (!body?.formats) return json({ error: 'No formats received.' }, 400);
  return json({ formats: await saveFormats(storage(), body.formats) });
});
