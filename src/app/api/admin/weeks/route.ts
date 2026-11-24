import { handle, json, requireAdmin } from '@/lib/auth/request';
import { publishWeek, removeWeek } from '@/lib/data/admin';
import { loadMapping } from '@/lib/data/config';
import { unmappedIn } from '@/lib/data/revenue';
import { getWeek, isIsoDate, listWeeks, WeekError } from '@/lib/data/weeks';
import { storage } from '@/lib/storage';
import { ALL } from '@/lib/types';

export const dynamic = 'force-dynamic';

/** GET: all weeks, or one week's summary with ?week=YYYY-MM-DD. */
export const GET = handle(async (req: Request) => {
  await requireAdmin(req);
  const s = storage();
  const week = new URL(req.url).searchParams.get('week');
  if (!week) return json({ weeks: await listWeeks(s) });
  if (!isIsoDate(week)) throw new WeekError('Bad week.');
  const w = await getWeek(s, week);
  if (!w) throw new WeekError('That week is not published.');
  const net = (period: 'weekly' | 'mtd' | 'quarterly' | 'ytd' | 'ptd', kind: 'actual' | 'ly') => {
    const rows = w.toast[period]?.[kind]?.[ALL];
    return rows ? Math.round(rows.filter((r) => r[1] == null).reduce((t, r) => t + r[2], 0) * 100) / 100 : null;
  };
  return json({
    weekStart: w.weekStart,
    uploadedAt: w.uploadedAt,
    workbook: w.workbook ?? null,
    sections: { toast: true, reviews: !!w.reviews, loyalty: !!w.loyalty, marketing: !!w.marketing, ueAds: !!w.ueAds, tpd: !!w.tpd, catering: !!w.catering },
    toastLocations: Object.keys(w.toast.weekly?.actual ?? {}).filter((l) => l !== ALL),
    totals: { weeklyActual: net('weekly', 'actual'), weeklyLy: net('weekly', 'ly'), ytdActual: net('ytd', 'actual') },
    reviewRows: (w.reviews?.so7_90.length ?? 0) + (w.reviews?.so30.length ?? 0),
    campaigns: w.loyalty?.campaigns.length ?? 0,
    unmapped: unmappedIn(w.toast, await loadMapping(s)),
  });
});

/** POST { week, replace?, allowUnmapped? }: publish (or replace) a week that the browser read from the workbook. */
export const POST = handle(async (req: Request) => {
  await requireAdmin(req);
  const body = (await req.json().catch(() => null)) as { week?: unknown; replace?: boolean; allowUnmapped?: boolean } | null;
  if (!body?.week) throw new WeekError('No week received.');
  return json(await publishWeek(storage(), body.week, { replace: !!body.replace, allowUnmapped: !!body.allowUnmapped }));
});

export const DELETE = handle(async (req: Request) => {
  await requireAdmin(req);
  const week = new URL(req.url).searchParams.get('week') ?? '';
  if (!isIsoDate(week)) throw new WeekError('Bad week.');
  await removeWeek(storage(), week);
  return json({ ok: true });
});
