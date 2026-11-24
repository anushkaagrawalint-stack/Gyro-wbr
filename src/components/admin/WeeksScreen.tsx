'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type * as XLSX from 'xlsx';
import { unmappedIn } from '@/lib/data/revenue';
import type { LocationConfig, Mapping, WeekIndexEntry } from '@/lib/types';
import { parseWorkbook, readWorkbookBuffer, type ParsedWorkbook } from '@/lib/workbook/parse';
import { api, ApiError, errText, reloadDashboard } from './api';
import { fmtDate, money, Msg, Panel, type Status } from './ui';

interface WeekView {
  weekStart: string; uploadedAt: string; workbook: string | null;
  sections: Record<string, boolean>; toastLocations: string[];
  totals: { weeklyActual: number | null; weeklyLy: number | null; ytdActual: number | null };
  reviewRows: number; campaigns: number; unmapped: { name: string; netSales: number }[];
}
type Assign = { mode: string; name: string; cat: string };
const PALETTE = ['#8b5cf6', '#f9a8d4', '#86efac', '#fcd34d', '#93c5fd', '#fdba74', '#a5b4fc', '#6ee7b7'];
const SECTION_LABEL: Record<string, string> = { toast: 'Toast sales', reviews: 'Reviews', loyalty: 'Loyalty', marketing: 'Marketing', ueAds: 'Uber Eats Ads', tpd: '3rd Party Delivery', catering: 'Catering' };

export function WeeksScreen({ currentWeek }: { currentWeek: string }) {
  const [weeks, setWeeks] = useState<WeekIndexEntry[]>([]);
  const [locs, setLocs] = useState<LocationConfig[] | null>(null);
  const [mapping, setMapping] = useState<Mapping | null>(null);
  const [status, setStatus] = useState<Status>(null);
  const [fileName, setFileName] = useState('');
  const [wb, setWb] = useState<XLSX.WorkBook | null>(null);
  const [parsed, setParsed] = useState<ParsedWorkbook | null>(null);
  const [weekStart, setWeekStart] = useState('');
  const [replaceTarget, setReplaceTarget] = useState<string | null>(null);
  const [unk, setUnk] = useState<Record<string, string>>({});
  const [ignored, setIgnored] = useState<Set<string>>(new Set());
  const [assign, setAssign] = useState<Record<string, Assign>>({});
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<WeekView | null>(null);

  const refresh = useCallback(async () => {
    const [w, l, m] = await Promise.all([
      api<{ weeks: WeekIndexEntry[] }>('/api/admin/weeks'),
      api<{ locations: LocationConfig[] }>('/api/admin/locations'),
      api<{ mapping: Mapping }>('/api/admin/mapping'),
    ]);
    setWeeks(w.weeks); setLocs(l.locations); setMapping(m.mapping);
  }, []);
  useEffect(() => { refresh().catch((e) => setStatus({ kind: 'err', text: errText(e) })); }, [refresh]);

  const reparse = useCallback((book: XLSX.WorkBook, l: LocationConfig[], keepWeek?: string) => {
    const p = parseWorkbook(book, l);
    setParsed(p);
    if (!keepWeek) setWeekStart(p.weekStart ?? '');
  }, []);

  async function onFile(f: File | undefined) {
    if (!f || !locs) return;
    setStatus(null); setView(null); setAssign({}); setUnk({}); setIgnored(new Set());
    try {
      const book = readWorkbookBuffer(new Uint8Array(await f.arrayBuffer()));
      setWb(book); setFileName(f.name);
      const p = parseWorkbook(book, locs);
      setParsed(p);
      setWeekStart(replaceTarget ?? p.weekStart ?? '');
    } catch (e) {
      setParsed(null);
      setStatus({ kind: 'err', text: `That file could not be read as an Excel workbook (${errText(e)}).` });
    }
  }

  const unknownLocs = (parsed?.unknownLocations ?? []).filter((u) => !ignored.has(u.name));
  async function applyLocations() {
    if (!locs || !wb) return;
    setBusy(true);
    try {
      const next = locs.map((l) => ({ ...l, aliases: [...l.aliases] }));
      const newIgnored = new Set(ignored);
      for (const u of unknownLocs) {
        const c = unk[u.name] ?? 'ignore';
        if (c === 'new') next.push({ name: u.name, hidden: false, platforms: ['Google', 'Uber Eats', 'DoorDash'], aliases: [] });
        else if (c.startsWith('alias:')) next.find((l) => l.name === c.slice(6))?.aliases.push(u.name);
        else newIgnored.add(u.name);
      }
      const r = await api<{ locations: LocationConfig[] }>('/api/admin/locations', 'PUT', { locations: next });
      setLocs(r.locations); setIgnored(newIgnored);
      reparse(wb, r.locations, weekStart || undefined);
      setStatus({ kind: 'ok', text: 'Locations updated and the workbook was read again.' });
    } catch (e) { setStatus({ kind: 'err', text: errText(e) }); }
    setBusy(false);
  }

  const unmapped = useMemo(() => (parsed && mapping ? unmappedIn(parsed.toast, mapping) : []), [parsed, mapping]);
  const lineChoices = useMemo(() => (mapping?.categories ?? []).flatMap((c) => c.lines.map((l) => ({ cat: c.name, line: l.name }))), [mapping]);
  const asg = (o: string): Assign => assign[o] ?? { mode: 'skip', name: o, cat: mapping?.categories[0]?.name ?? '' };
  const setAsg = (o: string, patch: Partial<Assign>) => setAssign((a) => ({ ...a, [o]: { ...asg(o), ...patch } }));

  async function applyMapping() {
    if (!mapping) return;
    setBusy(true);
    try {
      const m: Mapping = JSON.parse(JSON.stringify(mapping));
      for (const u of unmapped) {
        const a = asg(u.name);
        if (a.mode === 'skip') continue;
        if (a.mode.startsWith('line:')) {
          m.categories.flatMap((c) => c.lines).find((l) => l.name === a.mode.slice(5))?.options.push(u.name);
        } else {
          let cat = m.categories.find((c) => c.name === (a.mode === 'newcat' ? a.cat.trim() : a.cat));
          if (!cat) { cat = { name: a.cat.trim(), color: PALETTE[m.categories.length % PALETTE.length], lines: [] }; m.categories.push(cat); }
          const nm = a.name.trim() || u.name;
          const line = cat.lines.find((l) => l.name === nm);
          if (line) line.options.push(u.name); else cat.lines.push({ name: nm, options: [u.name] });
        }
      }
      const r = await api<{ mapping: Mapping }>('/api/admin/mapping', 'PUT', { mapping: m });
      setMapping(r.mapping); setAssign({});
      setStatus({ kind: 'ok', text: 'Mapping saved. It applies to every week.' });
    } catch (e) { setStatus({ kind: 'err', text: errText(e) }); }
    setBusy(false);
  }

  const toReplace = !!weeks.find((w) => w.weekStart === weekStart);
  const mondayWarn = weekStart && new Date(weekStart + 'T00:00:00Z').getUTCDay() !== 1;

  async function publish(replace: boolean, allowUnmapped: boolean) {
    if (!parsed) return;
    setBusy(true); setStatus(null);
    try {
      const week = { weekStart, workbook: fileName, toast: parsed.toast, reviews: parsed.reviews, loyalty: parsed.loyalty, marketing: parsed.marketing, ueAds: parsed.ueAds };
      await api('/api/admin/weeks', 'POST', { week, replace, allowUnmapped });
      reloadDashboard(weekStart);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) setStatus({ kind: 'warn', text: <>{e.message} <button className="btn sm" onClick={() => publish(true, allowUnmapped)}>Replace it</button></> });
      else setStatus({ kind: 'err', text: errText(e) });
      setBusy(false);
    }
  }

  async function openWeek(w: string) {
    try { setView(await api<WeekView>(`/api/admin/weeks?week=${w}`)); } catch (e) { setStatus({ kind: 'err', text: errText(e) }); }
  }
  async function del(w: string) {
    if (!window.confirm(`Delete the week of ${w}? This cannot be undone.`)) return;
    try {
      await api(`/api/admin/weeks?week=${w}`, 'DELETE');
      if (w === currentWeek) reloadDashboard(); else { setView(null); await refresh(); setStatus({ kind: 'ok', text: `Deleted the week of ${w}.` }); }
    } catch (e) { setStatus({ kind: 'err', text: errText(e) }); }
  }

  const ready = !!parsed && /^\d{4}-\d{2}-\d{2}$/.test(weekStart) && unknownLocs.length === 0;

  return (
    <>
      <Msg s={status} />
      <Panel title={replaceTarget ? `Replace the week of ${replaceTarget}` : 'Upload the weekly workbook'} right={replaceTarget ? <button className="btn ghost sm" onClick={() => { setReplaceTarget(null); setWeekStart(parsed?.weekStart ?? ''); }}>Cancel replace</button> : undefined}>
          <div className="stack">
            <p className="note">The workbook is read in your browser. Nothing is saved until you press Publish. Re-uploading a week that already exists replaces it.</p>
            <input type="file" accept=".xlsx,.xlsm" onChange={(e) => onFile(e.target.files?.[0])} disabled={!locs} />
            {parsed && (
              <>
                <div className="row">
                  <label className="row">Week starting (Monday) <input type="date" value={weekStart} onChange={(e) => setWeekStart(e.target.value)} /></label>
                  {toReplace && <span className="chip">will replace the existing week</span>}
                </div>
                {mondayWarn && <div className="msg warn">That date is not a Monday. Weeks run Monday to Sunday.</div>}
                {replaceTarget && weekStart !== replaceTarget && <div className="msg warn">You are replacing the week of {replaceTarget}, but the date above is different.</div>}
                <div className="note">
                  {parsed.summary.toastSheets} Toast sheets ({parsed.summary.toastRows.toLocaleString('en-US')} rows), {parsed.summary.reviewRows} review rows, {parsed.summary.loyaltyLocations} loyalty locations,
                  {' '}{parsed.summary.campaigns} campaigns, {parsed.summary.apolloRows} Apollo rows. 3rd Party Delivery and Catering are not read from the workbook yet.
                </div>
                {parsed.warnings.length > 0 && <div className="msg warn">{parsed.warnings.map((w) => <div key={w}>{w}</div>)}</div>}
              </>
            )}
          </div>
        </Panel>

      <Panel title="Weeks">
          {weeks.length === 0 ? <p className="note">No weeks yet. Upload the first workbook.</p> : (
            <div className="tablewrap">
              <table>
                <thead><tr><th>Week of</th><th>Published</th><th>Sections</th><th /></tr></thead>
                <tbody>
                  {weeks.map((w) => (
                    <tr key={w.weekStart}>
                      <td>{w.weekStart}{w.weekStart === currentWeek && <span className="chip">on screen</span>}</td>
                      <td>{fmtDate(w.uploadedAt)}</td>
                      <td>{w.sections.map((s) => SECTION_LABEL[s] ?? s).join(', ')}</td>
                      <td>
                        <div className="row end">
                          <button className="btn ghost sm" onClick={() => reloadDashboard(w.weekStart)}>Open</button>
                          <button className="btn ghost sm" onClick={() => openWeek(w.weekStart)}>View</button>
                          <button className="btn ghost sm" onClick={() => { setReplaceTarget(w.weekStart); setWeekStart(w.weekStart); window.scrollTo(0, 0); }}>Replace</button>
                          <button className="btn danger sm" onClick={() => del(w.weekStart)}>Delete</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </Panel>

      {view && (
        <Panel title={`Week of ${view.weekStart}`} right={<button className="btn ghost sm" onClick={() => setView(null)}>Close</button>}>
          <div className="grid2">
            <div className="stack note">
              <div>Published {fmtDate(view.uploadedAt)}{view.workbook ? ` from ${view.workbook}` : ''}</div>
              <div>Sections: {Object.entries(view.sections).filter(([, v]) => v).map(([k]) => SECTION_LABEL[k] ?? k).join(', ')}</div>
              <div>Locations with Toast sales: {view.toastLocations.join(', ') || 'none'}</div>
              <div>{view.reviewRows} review rows, {view.campaigns} campaigns</div>
            </div>
            <div className="stack note">
              <div>Weekly net sales: {view.totals.weeklyActual == null ? '-' : money(view.totals.weeklyActual)} (last year {view.totals.weeklyLy == null ? '-' : money(view.totals.weeklyLy)})</div>
              <div>Year to date: {view.totals.ytdActual == null ? '-' : money(view.totals.ytdActual)}</div>
              <div>{view.unmapped.length ? `${view.unmapped.length} unmapped dining option(s): ${view.unmapped.map((u) => u.name).join(', ')}` : 'Every dining option is mapped.'}</div>
            </div>
          </div>
        </Panel>
      )}

      {parsed && unknownLocs.length > 0 && (
        <Panel title="Locations in the workbook that are not set up">
          <p className="note">These names appear in the workbook but match no location. Say what each one is, then read the workbook again.</p>
          <div className="tablewrap">
            <table>
              <thead><tr><th>Name in workbook</th><th>Seen in</th><th>What is it?</th></tr></thead>
              <tbody>
                {unknownLocs.map((u) => (
                  <tr key={u.name}>
                    <td>{u.name}</td><td>{u.where}</td>
                    <td>
                      <select className="sel" value={unk[u.name] ?? 'ignore'} onChange={(e) => setUnk({ ...unk, [u.name]: e.target.value })}>
                        <option value="ignore">Ignore it</option>
                        <option value="new">A new location</option>
                        {(locs ?? []).map((l) => <option key={l.name} value={`alias:${l.name}`}>Another name for {l.name}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="row end" style={{ marginTop: 12 }}><button className="btn" disabled={busy} onClick={applyLocations}>Apply and read again</button></div>
        </Panel>
      )}

      {parsed && unmapped.length > 0 && (
        <Panel title={`${unmapped.length} dining option${unmapped.length === 1 ? '' : 's'} to map`}>
          <p className="note">Tell me where each one goes. Choosing an existing line merges it with the options already there. Anything left as "Leave unmapped" still counts in every total, on the Unmapped line.</p>
          <div className="tablewrap">
            <table>
              <thead><tr><th>Dining option</th><th>Net sales (weekly)</th><th>Goes to</th><th>Details</th></tr></thead>
              <tbody>
                {unmapped.map((u) => {
                  const a = asg(u.name);
                  return (
                    <tr key={u.name}>
                      <td>{u.name}</td>
                      <td>{money(u.netSales)}</td>
                      <td>
                        <select className="sel" value={a.mode} onChange={(e) => setAsg(u.name, { mode: e.target.value, cat: e.target.value.startsWith('new:') ? e.target.value.slice(4) : a.cat })}>
                          <option value="skip">Leave unmapped</option>
                          {lineChoices.map((c) => <option key={c.line} value={`line:${c.line}`}>{c.cat}: {c.line}</option>)}
                          {(mapping?.categories ?? []).map((c) => <option key={c.name} value={`new:${c.name}`}>New line in {c.name}</option>)}
                          <option value="newcat">New category</option>
                        </select>
                      </td>
                      <td>
                        {a.mode.startsWith('new:') && <input type="text" value={a.name} onChange={(e) => setAsg(u.name, { name: e.target.value })} aria-label="New line name" placeholder="Line name" />}
                        {a.mode === 'newcat' && (
                          <div className="row">
                            <input type="text" value={a.cat} onChange={(e) => setAsg(u.name, { cat: e.target.value })} aria-label="New category name" placeholder="Category name" />
                            <input type="text" value={a.name} onChange={(e) => setAsg(u.name, { name: e.target.value })} aria-label="New line name" placeholder="Line name" />
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="row end" style={{ marginTop: 12 }}><button className="btn" disabled={busy || Object.values(assign).every((a) => a.mode === 'skip')} onClick={applyMapping}>Save these assignments</button></div>
        </Panel>
      )}

      {parsed && (
        <Panel title="Publish">
          <div className="row">
            <button className="btn" disabled={!ready || busy} onClick={() => publish(toReplace, unmapped.length > 0)}>
              {toReplace ? 'Replace week' : 'Publish week'}{unmapped.length ? ` (${unmapped.length} left unmapped)` : ''}
            </button>
            {!ready && <span className="note">{unknownLocs.length ? 'Resolve the locations above first.' : 'Enter the week start date.'}</span>}
          </div>
        </Panel>
      )}
    </>
  );
}
