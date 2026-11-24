import { handle, json, requireAdmin } from '@/lib/auth/request';
import { saveLocationsWithMigration } from '@/lib/data/admin';
import { loadLocations, PLATFORMS } from '@/lib/data/config';
import { storage } from '@/lib/storage';
import type { LocationConfig } from '@/lib/types';

export const dynamic = 'force-dynamic';

export const GET = handle(async (req: Request) => {
  await requireAdmin(req);
  return json({ locations: await loadLocations(storage()), platforms: PLATFORMS });
});

/** PUT { locations, renames? }: the whole list in display order; renames = { oldName: newName }. */
export const PUT = handle(async (req: Request) => {
  await requireAdmin(req);
  const body = (await req.json().catch(() => null)) as { locations?: LocationConfig[]; renames?: Record<string, string> } | null;
  if (!body?.locations) return json({ error: 'No locations received.' }, 400);
  return json({ locations: await saveLocationsWithMigration(storage(), body.locations, body.renames ?? {}) });
});
