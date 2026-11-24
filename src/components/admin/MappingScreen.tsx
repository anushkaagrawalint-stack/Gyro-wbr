'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { UNMAPPED, validateMapping } from '@/lib/data/config';
import type { Mapping } from '@/lib/types';
import { api, errText, reloadDashboard } from './api';
import { money, Msg, Panel, type Status } from './ui';

interface Seen { name: string; netSales: number; lastWeek: string }

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

export function MappingScreen() {
  const [saved, setSaved] = useState<Mapping | null>(null);
  const [draft, setDraft] = useState<Mapping | null>(null);
  const [seen, setSeen] = useState<Seen[]>([]);
  const [status, setStatus] = useState<Status>(null);
  const [busy, setBusy] = useState(false);
  const [newCat, setNewCat] = useState('');
  const [newLine, setNewLine] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const r = await api<{ mapping: Mapping; options: Seen[] }>('/api/admin/mapping');
    setSaved(r.mapping); setDraft(clone(r.mapping)); setSeen(r.options);
  }, []);
  useEffect(() => { load().catch((e) => setStatus({ kind: 'err', text: errText(e) })); }, [load]);

  const dirty = useMemo(() => JSON.stringify(saved) !== JSON.stringify(draft), [saved, draft]);
  const assigned = useMemo(() => new Set((draft?.categories ?? []).flatMap((c) => c.lines.flatMap((l) => l.options))), [draft]);
  const unassigned = seen.filter((o) => !assigned.has(o.name));
  const lineChoices = (draft?.categories ?? []).flatMap((c) => c.lines.map((l) => ({ cat: c.name, line: l.name })));

  const edit = (fn: (m: Mapping) => void) => setDraft((d) => { if (!d) return d; const m = clone(d); fn(m); return m; });
  const lineOf = (m: Mapping, name: string) => m.categories.flatMap((c) => c.lines).find((l) => l.name === name);

  async function save() {
    if (!draft) return;
    setBusy(true);
    try {
      validateMapping(draft);
      const r = await api<{ mapping: Mapping }>('/api/admin/mapping', 'PUT', { mapping: draft });
      setSaved(r.mapping); setDraft(clone(r.mapping));
      setStatus({ kind: 'ok', text: <>Saved. It applies to every week. <button className="btn sm" onClick={() => reloadDashboard()}>Refresh the dashboard</button></> });
    } catch (e) { setStatus({ kind: 'err', text: errText(e) }); }
    setBusy(false);
  }

  if (!draft) return <Msg s={status} />;
  return (
    <>
      <Msg s={status} />
      <p className="note" style={{ marginBottom: 14 }}>
        Every dining option from Toast is assigned to a line. Assigning several options to one line merges them. A line belongs to one category
        (the groups shown on the Revenue Channels tab). Options with no line are counted on the "{UNMAPPED}" line, so no sales go missing.
      </p>

      <Panel title={`Dining options without a line (${unassigned.length})`}>
        {unassigned.length === 0 ? <p className="note">{seen.length ? 'Every dining option seen so far is assigned.' : 'No dining options yet. Upload a weekly workbook first.'}</p> : (
          <div className="tablewrap">
            <table>
              <thead><tr><th>Dining option</th><th>Last weekly net sales</th><th>Last seen</th><th>Assign to</th></tr></thead>
              <tbody>
                {unassigned.map((o) => (
                  <tr key={o.name} className="unm">
                    <td>{o.name}</td><td>{money(o.netSales)}</td><td>{o.lastWeek}</td>
                    <td>
                      <select className="sel" value="" onChange={(e) => e.target.value && edit((m) => lineOf(m, e.target.value)?.options.push(o.name))}>
                        <option value="">Choose a line...</option>
                        {lineChoices.map((c) => <option key={c.line} value={c.line}>{c.cat}: {c.line}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {draft.categories.map((c, ci) => (
        <Panel
          key={ci}
          title={c.name}
          right={
            <div className="row">
              <input type="color" className="swatch" aria-label={`Colour for ${c.name}`} value={c.color} onChange={(e) => edit((m) => { m.categories[ci].color = e.target.value; })} />
              <input type="text" aria-label="Category name" value={c.name} onChange={(e) => edit((m) => { m.categories[ci].name = e.target.value; })} style={{ width: 140 }} />
              <button className="btn danger sm" disabled={c.lines.length > 0} title={c.lines.length ? 'Remove its lines first' : ''} onClick={() => edit((m) => { m.categories.splice(ci, 1); })}>Remove</button>
            </div>
          }
        >
          {c.lines.length === 0 && <p className="note">No lines yet.</p>}
          <div className="tablewrap">
            <table>
              <tbody>
                {c.lines.map((l, li) => (
                  <tr key={li}>
                    <td style={{ width: 240 }}><input type="text" aria-label="Line name" value={l.name} onChange={(e) => edit((m) => { m.categories[ci].lines[li].name = e.target.value; })} /></td>
                    <td className="left">
                      {l.options.length === 0 && <span className="dim">no dining options</span>}
                      {l.options.map((o) => (
                        <span className="chip" key={o}>{o}<button aria-label={`Remove ${o}`} onClick={() => edit((m) => { const ln = m.categories[ci].lines[li]; ln.options = ln.options.filter((x) => x !== o); })}>×</button></span>
                      ))}
                      <select className="sel" aria-label={`Add a dining option to ${l.name}`} value="" style={{ marginLeft: 6, padding: '4px 28px 4px 10px', fontSize: 11 }}
                        onChange={(e) => { const o = e.target.value; if (!o) return; edit((m) => { m.categories.forEach((cc) => cc.lines.forEach((ln) => { ln.options = ln.options.filter((x) => x !== o); })); m.categories[ci].lines[li].options.push(o); }); }}>
                        <option value="">+ Add option...</option>
                        {seen.filter((o) => !l.options.includes(o.name)).map((o) => <option key={o.name} value={o.name}>{o.name}{assigned.has(o.name) ? ' (move here)' : ''}</option>)}
                      </select>
                    </td>
                    <td style={{ width: 90 }}><button className="btn ghost sm" onClick={() => edit((m) => { m.categories[ci].lines.splice(li, 1); })}>Delete line</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="row" style={{ marginTop: 10 }}>
            <input type="text" placeholder="New line name" value={newLine[c.name] ?? ''} onChange={(e) => setNewLine({ ...newLine, [c.name]: e.target.value })} />
            <button className="btn ghost sm" disabled={!(newLine[c.name] ?? '').trim()} onClick={() => { edit((m) => { m.categories[ci].lines.push({ name: newLine[c.name].trim(), options: [] }); }); setNewLine({ ...newLine, [c.name]: '' }); }}>Add line</button>
          </div>
        </Panel>
      ))}

      <Panel title="Add a category">
        <div className="row">
          <input type="text" placeholder="Category name" value={newCat} onChange={(e) => setNewCat(e.target.value)} />
          <button className="btn ghost sm" disabled={!newCat.trim()} onClick={() => { edit((m) => { m.categories.push({ name: newCat.trim(), color: ['#9f7cef', '#f9a8d4', '#86efac', '#fcd34d', '#93c5fd', '#fdba74'][m.categories.length % 6], lines: [] }); }); setNewCat(''); }}>Add category</button>
        </div>
      </Panel>

      <div className="row end">
        {dirty && <span className="note">You have unsaved changes.</span>}
        <button className="btn ghost" disabled={!dirty || busy} onClick={() => setDraft(clone(saved!))}>Discard changes</button>
        <button className="btn" disabled={!dirty || busy} onClick={save}>Save mapping</button>
      </div>
    </>
  );
}
