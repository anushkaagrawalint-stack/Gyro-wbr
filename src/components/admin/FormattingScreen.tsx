'use client';

import { useCallback, useEffect, useState } from 'react';
import type { FormatConfig, FormatOp, FormatRule } from '@/lib/types';
import { api, errText, reloadDashboard } from './api';
import { Msg, Panel, type Status } from './ui';

interface TableInfo { title: string; columns: string[]; rows: string[] }

const OPS: { op: FormatOp; label: string }[] = [
  { op: '>', label: 'above' }, { op: '>=', label: 'at least' }, { op: '<', label: 'below' },
  { op: '<=', label: 'at most' }, { op: '=', label: 'equal to' }, { op: 'between', label: 'between' },
];
const COLORS: { id: string; label: string; swatch: string }[] = [
  { id: 'green', label: 'Green', swatch: '#dcfce7' }, { id: 'amber', label: 'Amber', swatch: '#fef3c7' }, { id: 'red', label: 'Red', swatch: '#fee2e2' },
  { id: 'purple', label: 'Purple', swatch: '#ede9fe' }, { id: 'grey', label: 'Grey', swatch: '#f3f4f6' },
];

/** Every table currently on the page (all tabs are drawn at load), with its column labels and first-column row labels. */
async function scanTables(): Promise<TableInfo[]> {
  const { fmtColumns } = await import('@/dashboard/formats'); // loaded by now: the dashboard modules already ran
  const out = new Map<string, TableInfo>();
  document.querySelectorAll<HTMLTableElement>('main table').forEach((t) => {
    if (t.closest('#view-admin') || !t.tHead) return;
    const panel = t.closest('.panel');
    const title = (panel?.querySelector('.t-title, .panel-h h3')?.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (!title) return;
    const cols = fmtColumns(t) as string[];
    const rows = [...t.tBodies].flatMap((b) => [...b.rows]).map((r) => (r.cells[0]?.textContent ?? '').replace(/\s+/g, ' ').trim()).filter(Boolean);
    const cur = out.get(title);
    if (cur) { cur.columns = [...new Set([...cur.columns, ...cols])]; cur.rows = [...new Set([...cur.rows, ...rows])]; }
    else out.set(title, { title, columns: [...new Set(cols)], rows: [...new Set(rows)] });
  });
  return [...out.values()].sort((a, b) => a.title.localeCompare(b.title));
}

export function FormattingScreen() {
  const [formats, setFormats] = useState<FormatConfig[] | null>(null);
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [status, setStatus] = useState<Status>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await api<{ formats: FormatConfig[] }>('/api/admin/formats');
    setFormats(r.formats); setDirty(false);
    setTables(await scanTables());
  }, []);
  useEffect(() => { load().catch((e) => setStatus({ kind: 'err', text: errText(e) })); }, [load]);

  const upd = (i: number, patch: Partial<FormatConfig>) => { setFormats((f) => f!.map((x, j) => (j === i ? { ...x, ...patch } : x))); setDirty(true); };
  const updRule = (i: number, k: number, patch: Partial<FormatRule>) => upd(i, { rules: formats![i].rules.map((r, j) => (j === k ? { ...r, ...patch } : r)) });
  const moveRule = (i: number, k: number, d: number) => {
    const rules = [...formats![i].rules]; const j = k + d;
    if (j < 0 || j >= rules.length) return;
    [rules[k], rules[j]] = [rules[j], rules[k]]; upd(i, { rules });
  };

  async function save() {
    setBusy(true);
    try {
      await api('/api/admin/formats', 'PUT', { formats });
      setDirty(false);
      setStatus({ kind: 'ok', text: <>Saved. <button className="btn sm" onClick={() => reloadDashboard()}>Refresh the dashboard to see the colours</button></> });
    } catch (e) { setStatus({ kind: 'err', text: errText(e) }); }
    setBusy(false);
  }

  if (!formats) return <Msg s={status} />;
  return (
    <>
      <Msg s={status} />
      <Panel title="Colour rules" right={<button className="btn ghost sm" disabled={!tables.length} onClick={() => { setFormats([...formats, { table: tables[0].title, column: tables[0].columns[1] ?? tables[0].columns[0] ?? '', axis: 'column', mode: 'pill', rules: [{ op: '>', v: 0, color: 'green' }] }]); setDirty(true); }}>Add a colour rule</button>}>
        <p className="note" style={{ marginBottom: 12 }}>
          Pick a table and a column, then say which colour each range gets, for example "above 60 then red, 30 to 60 amber, below 30 green". The first rule that matches wins, so list the most specific first.
          Durations such as "1 min 4 sec" are compared in seconds; "(11.2%)" counts as -11.2; "$1,234" as 1234. Rules apply on the dashboard for everyone.
        </p>
        {formats.length === 0 && <p className="note">No colour rules yet.</p>}
        {formats.map((f, i) => {
          const t = tables.find((x) => x.title === f.table);
          const targets = f.axis === 'row' ? (t?.rows ?? []) : (t?.columns ?? []);
          return (
            <div key={i} className="card" style={{ padding: 16, marginBottom: 14, boxShadow: 'none' }}>
              <div className="row" style={{ marginBottom: 10 }}>
                <select className="sel" aria-label="Table" value={f.table} onChange={(e) => { const nt = tables.find((x) => x.title === e.target.value); upd(i, { table: e.target.value, column: (f.axis === 'row' ? nt?.rows[0] : nt?.columns[1] ?? nt?.columns[0]) ?? '' }); }}>
                  {!t && <option value={f.table}>{f.table} (not on screen)</option>}
                  {tables.map((x) => <option key={x.title} value={x.title}>{x.title}</option>)}
                </select>
                <select className="sel" aria-label="Apply to" value={f.axis} onChange={(e) => upd(i, { axis: e.target.value as 'column' | 'row', column: (e.target.value === 'row' ? t?.rows[0] : t?.columns[1] ?? t?.columns[0]) ?? '' })}>
                  <option value="column">A column</option><option value="row">A row</option>
                </select>
                <select className="sel" aria-label={f.axis === 'row' ? 'Row' : 'Column'} value={f.column} onChange={(e) => upd(i, { column: e.target.value })}>
                  {!targets.includes(f.column) && <option value={f.column}>{f.column}</option>}
                  {targets.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <select className="sel" aria-label="Paint" value={f.mode} onChange={(e) => upd(i, { mode: e.target.value as FormatConfig['mode'] })}>
                  <option value="pill">Colour the pill</option><option value="cell">Colour the cell</option><option value="text">Colour the text</option>
                </select>
                <button className="btn danger sm" onClick={() => { setFormats(formats.filter((_, j) => j !== i)); setDirty(true); }}>Remove</button>
              </div>
              {f.rules.map((r, k) => (
                <div className="row" key={k} style={{ marginBottom: 8 }}>
                  <span className="note">If the value is</span>
                  <select className="sel" aria-label="Comparison" value={r.op} onChange={(e) => updRule(i, k, { op: e.target.value as FormatOp })}>{OPS.map((o) => <option key={o.op} value={o.op}>{o.label}</option>)}</select>
                  <input type="number" className="narrow" aria-label="Value" value={r.v} onChange={(e) => updRule(i, k, { v: +e.target.value })} />
                  {r.op === 'between' && <><span className="note">and</span><input type="number" className="narrow" aria-label="Second value" value={r.v2 ?? 0} onChange={(e) => updRule(i, k, { v2: +e.target.value })} /></>}
                  <span className="note">then</span>
                  <select className="sel" aria-label="Colour" value={COLORS.some((c) => c.id === r.color) ? r.color : 'custom'} onChange={(e) => updRule(i, k, { color: e.target.value === 'custom' ? '#7c3aed' : e.target.value })}>
                    {COLORS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}<option value="custom">Custom...</option>
                  </select>
                  {!COLORS.some((c) => c.id === r.color) && <input type="color" className="swatch" aria-label="Custom colour" value={r.color} onChange={(e) => updRule(i, k, { color: e.target.value })} />}
                  <span className="chip" style={{ background: (COLORS.find((c) => c.id === r.color)?.swatch) ?? r.color + '2e' }}>sample</span>
                  <button className="btn ghost sm" aria-label="Move rule up" onClick={() => moveRule(i, k, -1)}>↑</button>
                  <button className="btn ghost sm" aria-label="Move rule down" onClick={() => moveRule(i, k, 1)}>↓</button>
                  <button className="btn ghost sm" aria-label="Remove rule" onClick={() => upd(i, { rules: f.rules.filter((_, j) => j !== k) })}>×</button>
                </div>
              ))}
              <button className="btn ghost sm" onClick={() => upd(i, { rules: [...f.rules, { op: '<', v: 0, color: 'red' }] })}>Add a range</button>
            </div>
          );
        })}
      </Panel>
      <div className="row end">
        <button className="btn ghost" disabled={!dirty || busy} onClick={() => load()}>Discard changes</button>
        <button className="btn" disabled={!dirty || busy} onClick={save}>Save colour rules</button>
      </div>
    </>
  );
}
