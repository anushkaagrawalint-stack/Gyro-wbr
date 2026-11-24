import { handle, json, requireAdmin } from '@/lib/auth/request';
import { loadDiningOptions } from '@/lib/data/admin';
import { loadMapping, saveMapping } from '@/lib/data/config';
import { storage } from '@/lib/storage';
import type { Mapping } from '@/lib/types';

export const dynamic = 'force-dynamic';

export const GET = handle(async (req: Request) => {
  await requireAdmin(req);
  const s = storage();
  const [mapping, seen] = await Promise.all([loadMapping(s), loadDiningOptions(s)]);
  return json({ mapping, options: Object.entries(seen).map(([name, v]) => ({ name, ...v })).sort((a, b) => a.name.localeCompare(b.name)) });
});

export const PUT = handle(async (req: Request) => {
  await requireAdmin(req);
  const body = (await req.json().catch(() => null)) as { mapping?: Mapping } | null;
  if (!body?.mapping) return json({ error: 'No mapping received.' }, 400);
  return json({ mapping: await saveMapping(storage(), body.mapping) });
});
