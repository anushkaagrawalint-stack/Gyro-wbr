import { redirect } from 'next/navigation';
import { Dashboard } from '@/components/Dashboard';
import { currentPerson } from '@/lib/auth/request';
import { buildBoot } from '@/lib/data/boot';
import { storage } from '@/lib/storage';

export const dynamic = 'force-dynamic';

export default async function Page({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const person = await currentPerson();
  if (!person) redirect('/login');
  const { week } = await searchParams;
  // everything the browser receives is cut down to this person's access here, on the server
  const result = await buildBoot(storage(), person, week);
  return <Dashboard boot={result!.boot} weeks={result!.weeks} unmapped={result!.unmapped.length} />;
}
