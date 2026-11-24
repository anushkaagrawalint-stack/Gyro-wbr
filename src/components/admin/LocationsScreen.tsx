'use client';

import { useCallback, useEffect, useState } from 'react';
import type { LocationConfig } from '@/lib/types';
import { api, errText, reloadDashboard } from './api';
import { Msg, Panel, type Status } from './ui';

/** A row remembers the name it had when loaded, so a rename can be carried through to stored weeks. */
interface Row extends LocationConfig { was: string | null }

export function LocationsScreen() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [platforms, setPlatforms] = useState<string[]>([]);
  const [status, setStatus] = useState<Status>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await api<{ locations: LocationConfig[]; platforms: string[] }>('/api/admin/locations');
    setRows(r.locations.map((l) => ({ ...l, was: l.name }))); setPlatforms(r.platforms); setDirty(false);
  }, []);
  useEffect(() => { load().catch((e) => setStatus({ kind: 'err', text: errText(e) })); }, [load]);

  const set = (i: number, patch: Partial<Row>) => { setRows((r) => r!.map((x, j) => (j === i ? { ...x, ...patch } : x))); setDirty(true); };
  const move = (i: number, d: number) => { setRows((r) => { const a = [...r!]; const j = i + d; if (j < 0 || j >= a.length) return a; [a[i], a[j]] = [a[j], a[i]]; return a; }); setDirty(true); };

  async function save() {
    if (!rows) return;
    setBusy(true);
    try {
      const renames: Record<string, string> = {};
      for (const r of rows) if (r.was && r.was !== r.name.trim()) renames[r.was] = r.name.trim();
      const body = rows.map(({ was: _w, ...l }) => ({ ...l, name: l.name.trim() }));
      await api('/api/admin/locations', 'PUT', { locations: body, renames });
      await load();
      setStatus({ kind: 'ok', text: <>Saved. <button className="btn sm" onClick={() => reloadDashboard()}>Refresh the dashboard</button></> });
    } catch (e) { setStatus({ kind: 'err', text: errText(e) }); }
    setBusy(false);
  }

  if (!rows) return <Msg s={status} />;
  return (
    <>
      <Msg s={status} />
      <Panel title="Locations" right={<button className="btn ghost sm" onClick={() => { setRows([...rows, { name: '', hidden: false, platforms: ['Google', 'Uber Eats', 'DoorDash'], aliases: [], was: null }]); setDirty(true); }}>Add a location</button>}>
        <p className="note" style={{ marginBottom: 12 }}>
          Rename a location here and its past weeks follow. A hidden location disappears from every dashboard (its data is kept).
          Removing one only takes it off this list; its stored data stays in the weeks. Platforms say where a location has reviews and delivery (for example Yelp is only at Fondren and Richmond).
          "Other names" are spellings used in the workbook (Spring appears as Klein in the review sheets).
        </p>
        <div className="tablewrap">
          <table>
            <thead><tr><th>Name</th><th>Hidden</th>{platforms.map((p) => <th key={p}>{p}</th>)}<th>Other names (comma separated)</th><th>Order</th><th /></tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.was ?? `new-${i}`}>
                  <td><input type="text" aria-label="Location name" value={r.name} onChange={(e) => set(i, { name: e.target.value })} /></td>
                  <td><input type="checkbox" aria-label={`Hide ${r.name}`} checked={r.hidden} onChange={(e) => set(i, { hidden: e.target.checked })} /></td>
                  {platforms.map((p) => (
                    <td key={p}><input type="checkbox" aria-label={`${r.name} has ${p}`} checked={r.platforms.includes(p)} onChange={(e) => set(i, { platforms: e.target.checked ? [...r.platforms, p] : r.platforms.filter((x) => x !== p) })} /></td>
                  ))}
                  <td><input type="text" aria-label="Other names" value={r.aliases.join(', ')} onChange={(e) => set(i, { aliases: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) })} /></td>
                  <td><div className="row" style={{ justifyContent: 'center' }}><button className="btn ghost sm" aria-label="Move up" onClick={() => move(i, -1)}>↑</button><button className="btn ghost sm" aria-label="Move down" onClick={() => move(i, 1)}>↓</button></div></td>
                  <td><button className="btn danger sm" onClick={() => { if (!r.was || window.confirm(`Remove ${r.name} from the list? Its stored data is kept.`)) { setRows(rows.filter((_, j) => j !== i)); setDirty(true); } }}>Remove</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
      <div className="row end">
        <button className="btn ghost" disabled={!dirty || busy} onClick={() => load()}>Discard changes</button>
        <button className="btn" disabled={!dirty || busy} onClick={save}>Save locations</button>
      </div>
    </>
  );
}
