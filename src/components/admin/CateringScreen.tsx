'use client';

import { useEffect, useState } from 'react';
import type { LocationConfig, WeekIndexEntry } from '@/lib/types';
import { readWorkbookBuffer } from '@/lib/workbook/parse';
import { parseCateringWorkbook, type CateringData, type CateringCounts } from '@/lib/workbook/catering';
import { api, errText, reloadDashboard } from './api';
import { Msg, Panel, type Status } from './ui';

const n = (v: number | null | undefined) => (v == null ? '-' : Math.round(v).toLocaleString('en-US'));
const usd = (v: number | null | undefined) => (v == null ? '-' : '$' + Math.round(v).toLocaleString('en-US'));
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) + '%' : '-');
const MON = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
/** "Oct 12" + a year -> 2026-10-12 (the sheet's week labels carry no year). */
const isoOf = (label: string, year: string) => {
  const m = /^([A-Za-z]{3})[a-z]*.?s+(d{1,2})/.exec(label.trim());
  const mo = m ? MON.indexOf(m[1].toLowerCase()) + 1 : 0;
  return m && mo ? `${year}-${String(mo).padStart(2, '0')}-${String(+m[2]).padStart(2, '0')}` : '';
};
const ROWS: [string, keyof CateringCounts][] = [['# Calls / Week', 'calls'], ['# Calls Connected', 'connected'], ['# Calls > 90 seconds', 'over90'], ['# Emails / Week', 'emails'], ['# Opens', 'opens'], ['MQLs', 'mqls'], ['MQLs with a FUP date', 'mqlFup']];

export function CateringScreen({ currentWeek }: { currentWeek: string }) {
  const [weeks, setWeeks] = useState<WeekIndexEntry[]>([]);
  const [locs, setLocs] = useState<LocationConfig[] | null>(null);
  const [status, setStatus] = useState<Status>(null);
  const [fileName, setFileName] = useState('');
  const [data, setData] = useState<CateringData | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [target, setTarget] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    Promise.all([api<{ weeks: WeekIndexEntry[] }>('/api/admin/weeks'), api<{ locations: LocationConfig[] }>('/api/admin/locations')])
      .then(([w, l]) => { setWeeks(w.weeks); setLocs(l.locations); setTarget((t) => t || currentWeek); })
      .catch((e) => setStatus({ kind: 'err', text: errText(e) }));
  }, [currentWeek]);

  async function onFile(f: File | undefined) {
    if (!f || !locs) return;
    setStatus(null); setData(null); setWarnings([]);
    try {
      const p = parseCateringWorkbook(readWorkbookBuffer(new Uint8Array(await f.arrayBuffer())), locs);
      setFileName(f.name); setData(p.data); setWarnings(p.warnings);
      const last = p.data.weeks[p.data.weeks.length - 1]?.week;
      const guess = last ? isoOf(last, (target || currentWeek).slice(0, 4)) : '';
      if (guess) setTarget(guess);
      if (!p.data.weeks.length) setStatus({ kind: 'err', text: 'No weekly columns were found in the first tab. Check that it is the Outbound Catering Team tab with "Week of ..." headings.' });
    } catch (e) {
      setStatus({ kind: 'err', text: `That file could not be read as an Excel workbook (${errText(e)}).` });
    }
  }

  async function publish() {
    if (!data) return;
    setBusy(true); setStatus(null);
    try {
      await api('/api/admin/catering', 'POST', { weekStart: target, catering: data });
      reloadDashboard(target);
    } catch (e) { setStatus({ kind: 'err', text: errText(e) }); setBusy(false); }
  }

  const W = data?.weeks ?? [];
  const published = weeks.some((w) => w.weekStart === target);
  const validDate = /^d{4}-d{2}-d{2}$/.test(target);
  const lastLabel = W[W.length - 1]?.week ?? '';
  const mismatch = validDate && lastLabel && isoOf(lastLabel, target.slice(0, 4)) !== target;
  const metric = (w: (typeof W)[number], k: string) => {
    if (k === 'pctConn') return pct(w.connected, w.calls);
    if (k === 'pct90') return pct(w.over90, w.connected);
    if (k === 'ordersPaid') return n(w.ordersPaid);
    if (k === 'valuePaid') return usd(w.valuePaid);
    return n(w[k as keyof typeof w] as number);
  };
  const OUT: [string, string][] = [['# Calls / Week', 'calls'], ['# Calls Connected', 'connected'], ['% Calls Connected', 'pctConn'], ['# Calls > 90 seconds', 'over90'], ['% of calls > 90 seconds', 'pct90'], ['# Emails / Week', 'emails'], ['# Opens', 'opens'], ['MQLs', 'mqls'], ['MQLs with a FUP date', 'mqlFup'], ['Orders (Paid)', 'ordersPaid'], ['Order Value (Paid)', 'valuePaid']];

  return (
    <>
      <Msg s={status} />
      <Panel title="Upload the catering workbook">
        <div className="stack">
          <p className="note">
            Upload the WBR catering sheet on its own. Its first tab holds every week in one table (Outbound Catering Team - Input & Output Metrics) and its second tab holds
            the location wise split, with the week as the heading above each table. The file is read in your browser; nothing is saved until you press Publish.
          </p>
          <input type="file" accept=".xlsx,.xlsm" onChange={(e) => onFile(e.target.files?.[0])} disabled={!locs} />
          {warnings.length > 0 && <div className="msg warn">{warnings.map((w) => <div key={w}>{w}</div>)}</div>}
        </div>
      </Panel>

      {data && W.length > 0 && (
        <>
          <Panel title="Tab 1: Outbound Catering Team - Input & Output Metrics">
            <div className="tablewrap">
              <table className="ctr">
                <thead><tr><th>Metrics</th>{W.map((w) => <th key={w.week}>Week of {w.week}</th>)}</tr></thead>
                <tbody>{OUT.map(([label, k]) => <tr key={label}><td>{label}</td>{W.map((w) => <td key={w.week}>{metric(w, k)}</td>)}</tr>)}</tbody>
              </table>
            </div>
          </Panel>

          <Panel title="Tab 2: Location wise split">
            {data.locationWeeks.length === 0 && <p className="note">No location wise tables were found.</p>}
            <div className="stack">
              {data.locationWeeks.map((b) => {
                const names = Object.keys(b.locations);
                return (
                  <div key={b.week}>
                    <div className="t-title" style={{ marginBottom: 6 }}>Week of {b.week}</div>
                    <div className="tablewrap">
                      <table className="ctr">
                        <thead><tr><th>Metrics</th>{names.map((x) => <th key={x}>{x}</th>)}<th>Total</th></tr></thead>
                        <tbody>{ROWS.map(([label, k]) => <tr key={k}><td>{label}</td>{names.map((x) => <td key={x}>{n(b.locations[x][k])}</td>)}<td>{n(b.total[k])}</td></tr>)}</tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
            </div>
          </Panel>

          <Panel title="Publish">
            <div className="row">
              <label className="row">Week starting (Monday)
                <input type="date" value={target} onChange={(e) => setTarget(e.target.value)} />
              </label>
              {validDate && <span className="chip">{published ? 'week is published' : 'week not published yet'}</span>}
              <button className="btn" disabled={busy || !validDate || !published} onClick={publish}>Publish catering{fileName ? ` (${fileName})` : ''}</button>
            </div>
            {validDate && !published && <div className="msg warn">No weekly workbook is published for {target}. Publish that week in Weeks &amp; data first, then upload the catering sheet here.</div>}
            {mismatch && <div className="msg warn">The latest week in the catering sheet is "Week of {lastLabel}", which does not match {target}. Check the date.</div>}
            <p className="note">Replaces the catering data saved with that week. Weeks after it show this data until a newer catering upload is published.</p>
          </Panel>
        </>
      )}
    </>
  );
}
