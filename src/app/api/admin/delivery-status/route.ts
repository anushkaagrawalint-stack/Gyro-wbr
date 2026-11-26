import { handle, json, requireAdmin } from '@/lib/auth/request';
import { loadDeliveryStatus, saveDeliveryStatus } from '@/lib/data/config';
import { storage } from '@/lib/storage';
import { DD_STATUSES, UE_STATUSES, type DeliveryStatus } from '@/lib/types';

export const dynamic = 'force-dynamic';

export const GET = handle(async (req: Request) => {
  await requireAdmin(req);
  return json({ status: await loadDeliveryStatus(storage()), options: { ue: UE_STATUSES, dd: DD_STATUSES } });
});

/** PUT { status: { ue: {location: status}, dd: {location: status} } } */
export const PUT = handle(async (req: Request) => {
  await requireAdmin(req);
  const body = (await req.json().catch(() => null)) as { status?: DeliveryStatus } | null;
  if (!body?.status) return json({ error: 'No statuses received.' }, 400);
  return json({ status: await saveDeliveryStatus(storage(), body.status) });
});
