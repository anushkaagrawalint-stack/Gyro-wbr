import { PeopleError, removePerson, updatePerson, type PersonInput } from '@/lib/auth/people';
import { handle, json, requireAdmin } from '@/lib/auth/request';
import { loadLocations } from '@/lib/data/config';
import { storage } from '@/lib/storage';

type Ctx = { params: Promise<{ id: string }> };

/** PUT: change name, email, access type, locations, and/or reset the password (send `password`). */
export const PUT = handle(async (req: Request, { params }: Ctx) => {
  const me = await requireAdmin(req);
  const { id } = await params;
  const s = storage();
  const body = (await req.json().catch(() => ({}))) as Partial<PersonInput>;
  const known = (await loadLocations(s)).map((l) => l.name);
  const person = await updatePerson(s, id, { email: body.email, name: body.name, role: body.role, locations: body.locations, password: body.password || undefined }, me.id, known);
  return json({ person });
});

export const DELETE = handle(async (req: Request, { params }: Ctx) => {
  const me = await requireAdmin(req);
  const { id } = await params;
  if (!id) throw new PeopleError('Person not found.');
  await removePerson(storage(), id, me.id);
  return json({ ok: true });
});
