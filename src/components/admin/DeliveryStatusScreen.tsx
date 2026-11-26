'use client';

import { useCallback, useEffect, useState } from 'react';
import { DD_STATUSES, UE_STATUSES, type DeliveryStatus, type LocationConfig } from '@/lib/types';
import { api, errText, reloadDashboard } from './api';
import { Msg, Panel, type Status } from './ui';

type Side = 'dd' | 'ue';
const SIDES: { key: Side; title: string; options: readonly string[]; trophy: string; note: string }[] = [
  { key: 'dd', title: 'DoorDash', options: DD_STATUSES, trophy: 'Most Loved', note: 'A restaurant marked Most Loved gets a trophy before its name in the DoorDash sales table.' },
  { key: 'ue', title: 'Uber Eats', options: UE_STATUSES, trophy: 'Top Eats', note: 'A restaurant marked Top Eats gets a trophy before its name in the Uber Eats sales table.' },
];

export function DeliveryStatusScreen() {
  const [locs, setLocs] = useState<LocationConfig[]>([]);
  const [st, setSt] = useState<DeliveryStatus>({ ue: {}, dd: {} });
  const [status, setStatus] = useState<Status>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [l, s] = await Promise.all([api<{ locations: LocationConfig[] }>('/api/admin/locations'), api<{ status: DeliveryStatus }>('/api/admin/delivery-status')]);
    setLocs(l.locations); setSt(s.status);
  }, []);
  useEffect(() => { load().catch((e) => setStatus({ kind: 'err', text: errText(e) })); }, [load]);

  const set = (side: Side, loc: string, v: string) => { setStatus(null); setSt((p) => ({ ...p, [side]: { ...p[side], [loc]: v } })); };
  async function save() {
    setBusy(true); setStatus(null);
    try {
      const r = await api<{ status: DeliveryStatus }>('/api/admin/delivery-status', 'PUT', { status: st });
      setSt(r.status);
      setStatus({ kind: 'ok', text: <>Saved. <button className="btn sm" onClick={() => reloadDashboard()}>Refresh the dashboard to see the trophies</button></> });
    } catch (e) { setStatus({ kind: 'err', text: errText(e) }); }
    setBusy(false);
  }

  return (
    <>
      <Msg s={status} />
      {SIDES.map((p) => (
        <Panel key={p.key} title={p.title}>
          <p className="note">{p.note} Choose a status for each restaurant, or leave it blank.</p>
          <div className="tablewrap">
            <table>
              <thead><tr><th>Restaurant</th><th>{p.title} status</th></tr></thead>
              <tbody>
                {locs.map((l) => (
                  <tr key={l.name}>
                    <td>{l.name}</td>
                    <td>
                      <select className="sel" value={st[p.key][l.name] ?? ''} onChange={(e) => set(p.key, l.name, e.target.value)} aria-label={`${p.title} status for ${l.name}`}>
                        <option value="">None</option>
                        {p.options.map((o) => <option key={o} value={o}>{o}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      ))}
      <div className="row end"><button className="btn" disabled={busy || !locs.length} onClick={save}>Save</button></div>
    </>
  );
}
