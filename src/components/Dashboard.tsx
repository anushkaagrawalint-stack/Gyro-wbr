'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { DASHBOARD_MARKUP } from '@/dashboard/markup';
import type { Boot } from '@/lib/data/boot';
import { AdminPanel } from './admin/AdminPanel';

type Labels = { weekLabels: (iso: string) => { no: number | string; range: string }; monthLabel: (iso: string) => string };

interface Props {
  boot: Boot;
  weeks: { weekStart: string; label: string }[];
  unmapped: number;
}

/**
 * Hosts the dashboard. The markup is the reference page's shell; the per-tab modules in src/dashboard
 * fill it in from window.__BOOT__ (built on the server for this person and week).
 */
export function Dashboard({ boot, weeks, unmapped }: Props) {
  const [slots, setSlots] = useState<{ month: Element | null; week: Element | null; admin: Element | null; labels: Labels | null }>({ month: null, week: null, admin: null, labels: null });

  useEffect(() => {
    const w = window as unknown as { __BOOT__: Boot; __wbrStarted?: boolean };
    // the dashboard script fills the page once per page load; if this component is redrawn (dev hot reload), start over with a clean load
    if (w.__wbrStarted) { window.location.reload(); return; }
    w.__wbrStarted = true;
    w.__BOOT__ = boot;
    let cancelled = false;
    // the dashboard modules read the DOM as soon as they load, so they are imported only after the markup exists
    import('@/dashboard/main').then(async () => {
      const core = (await import('@/dashboard/core')) as unknown as Labels; // already loaded: gives the same week/month labels the pills show
      if (!cancelled) setSlots({ month: document.getElementById('slotMonth'), week: document.getElementById('slotWeek'), admin: document.getElementById('view-admin'), labels: core });
    });
    return () => { cancelled = true; };
  }, [boot]);

  // month of the week's last day (Sunday), the same rule the pill text uses
  const monthKey = (ws: string) => new Date(new Date(ws + 'T00:00:00Z').getTime() + 6 * 864e5).toISOString().slice(0, 7);
  // what each choice is, spelled out: the month with its year, the week with the year it ends in
  const endDate = (ws: string) => new Date(new Date(ws + 'T00:00:00Z').getTime() + 6 * 864e5);
  const endYear = (ws: string) => endDate(ws).getUTCFullYear();
  const monthName = (ws: string) => endDate(ws).toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const go = (ws: string) => window.location.assign(`/?week=${ws}`);
  // one entry per month: its latest uploaded week (weeks arrive newest first)
  const months: { key: string; weekStart: string }[] = [];
  for (const w of weeks) if (!months.some((m) => m.key === monthKey(w.weekStart))) months.push({ key: monthKey(w.weekStart), weekStart: w.weekStart });

  return (
    <>
      <div dangerouslySetInnerHTML={{ __html: DASHBOARD_MARKUP }} suppressHydrationWarning />
      {slots.labels && slots.week && weeks.length > 0 &&
        createPortal(
          <select aria-label="Week" value={boot.week.weekStart} onChange={(e) => go(e.target.value)}>
            {weeks.map((w) => { const l = slots.labels!.weekLabels(w.weekStart); return <option key={w.weekStart} value={w.weekStart}>{w.weekStart === boot.week.weekStart ? '✓ ' : ''}Week {l.no} ({l.range} {endYear(w.weekStart)})</option>; })}
          </select>,
          slots.week,
        )}
      {slots.labels && slots.month && months.length > 0 &&
        createPortal(
          <select aria-label="Month" value={monthKey(boot.week.weekStart)} onChange={(e) => go(months.find((m) => m.key === e.target.value)!.weekStart)}>
            {months.map((m) => <option key={m.key} value={m.key}>{m.key === monthKey(boot.week.weekStart) ? '✓ ' : ''}{monthName(m.weekStart)}</option>)}
          </select>,
          slots.month,
        )}
      {slots.admin && boot.user.role === 'admin' && createPortal(<AdminPanel boot={boot} weeks={weeks} unmapped={unmapped} />, slots.admin)}
    </>
  );
}
