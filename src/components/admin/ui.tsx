'use client';

import type { ReactNode } from 'react';

export type Status = { kind: 'err' | 'ok' | 'warn'; text: ReactNode } | null;

export function Msg({ s }: { s: Status }) {
  return s ? <div className={`msg ${s.kind}`} role={s.kind === 'err' ? 'alert' : 'status'}>{s.text}</div> : null;
}

export function Panel({ title, right, children }: { title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <section className="card panel">
      <div className="panel-h"><span className="t-title">{title}</span>{right}</div>
      {children}
    </section>
  );
}

export const money = (n: number) => (n < 0 ? `(${'$' + Math.abs(Math.round(n)).toLocaleString('en-US')})` : '$' + Math.round(n).toLocaleString('en-US'));

export function fmtDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}
