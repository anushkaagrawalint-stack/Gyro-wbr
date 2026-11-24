import { addPerson, listPeople, toPublic, type PersonInput } from '@/lib/auth/people';
import { handle, json, requireAdmin } from '@/lib/auth/request';
import { loadLocations } from '@/lib/data/config';
import { storage } from '@/lib/storage';

export const dynamic = 'force-dynamic';

export const GET = handle(async (req: Request) => {
  await requireAdmin(req);
  return json({ people: (await listPeople(storage())).map(toPublic) });
});

export const POST = handle(async (req: Request) => {
  await requireAdmin(req);
  const s = storage();
  const body = (await req.json().catch(() => ({}))) as PersonInput;
  const known = (await loadLocations(s)).map((l) => l.name);
  const person = await addPerson(s, { email: body.email, name: body.name, role: body.role, locations: body.locations, password: body.password }, known);
  return json({ person }, 201);
});
