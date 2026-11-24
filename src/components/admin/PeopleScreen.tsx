'use client';

import { useCallback, useEffect, useState } from 'react';
import type { LocationConfig, PublicPerson, Role } from '@/lib/types';
import { api, errText } from './api';
import { Msg, Panel, type Status } from './ui';

const ROLE_LABEL: Record<Role, string> = { admin: 'Admin', client: 'Client', location: 'Location' };
const ROLE_HELP: Record<Role, string> = {
  admin: 'Everything, plus the Admin tab.',
  client: 'All locations. No Admin tab.',
  location: 'Only the chosen locations. No Marketing tab.',
};

interface Form { email: string; name: string; role: Role; locations: string[]; password: string }
const blank: Form = { email: '', name: '', role: 'client', locations: [], password: '' };

export function PeopleScreen({ meEmail }: { meEmail: string }) {
  const [people, setPeople] = useState<PublicPerson[]>([]);
  const [locations, setLocations] = useState<string[]>([]);
  const [status, setStatus] = useState<Status>(null);
  const [form, setForm] = useState<Form>(blank);
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [p, l] = await Promise.all([api<{ people: PublicPerson[] }>('/api/admin/people'), api<{ locations: LocationConfig[] }>('/api/admin/locations')]);
    setPeople(p.people); setLocations(l.locations.map((x) => x.name));
  }, []);
  useEffect(() => { load().catch((e) => setStatus({ kind: 'err', text: errText(e) })); }, [load]);

  async function submit() {
    setBusy(true);
    try {
      if (editing) await api(`/api/admin/people/${editing}`, 'PUT', form);
      else await api('/api/admin/people', 'POST', form);
      setStatus({ kind: 'ok', text: editing ? 'Saved.' : `Added ${form.email}.` });
      setForm(blank); setEditing(null); await load();
    } catch (e) { setStatus({ kind: 'err', text: errText(e) }); }
    setBusy(false);
  }
  async function remove(p: PublicPerson) {
    if (!window.confirm(`Remove ${p.name} (${p.email})? They will be signed out and lose access.`)) return;
    try { await api(`/api/admin/people/${p.id}`, 'DELETE'); setStatus({ kind: 'ok', text: `Removed ${p.email}.` }); await load(); } catch (e) { setStatus({ kind: 'err', text: errText(e) }); }
  }
  const startEdit = (p: PublicPerson) => { setEditing(p.id); setForm({ email: p.email, name: p.name, role: p.role, locations: p.locations, password: '' }); window.scrollTo(0, 0); };
  const toggleLoc = (l: string) => setForm((f) => ({ ...f, locations: f.locations.includes(l) ? f.locations.filter((x) => x !== l) : [...f.locations, l] }));

  return (
    <>
      <Msg s={status} />
      <div className="grid2">
        <Panel title={editing ? 'Edit person' : 'Add a person'} right={editing ? <button className="btn ghost sm" onClick={() => { setEditing(null); setForm(blank); }}>Cancel</button> : undefined}>
          <div className="stack">
            <input type="text" placeholder="Name" aria-label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <input type="email" placeholder="Email" aria-label="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} autoComplete="off" />
            <input type="password" placeholder={editing ? 'New password (leave blank to keep)' : 'Password (8+ characters)'} aria-label="Password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} autoComplete="new-password" />
            <select className="sel" aria-label="Access type" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
              {(Object.keys(ROLE_LABEL) as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
            </select>
            <div className="note">{ROLE_HELP[form.role]}</div>
            {form.role === 'location' && (
              <div className="row">
                {locations.map((l) => <label key={l} className="chk"><input type="checkbox" checked={form.locations.includes(l)} onChange={() => toggleLoc(l)} />{l}</label>)}
              </div>
            )}
            <div className="row end"><button className="btn" disabled={busy} onClick={submit}>{editing ? 'Save changes' : 'Add person'}</button></div>
          </div>
        </Panel>

        <Panel title={`People (${people.length})`}>
          <div className="tablewrap">
            <table>
              <thead><tr><th>Name</th><th>Access</th><th>Locations</th><th /></tr></thead>
              <tbody>
                {people.map((p) => (
                  <tr key={p.id}>
                    <td>{p.name}<div className="note">{p.email}</div></td>
                    <td>{ROLE_LABEL[p.role]}</td>
                    <td>{p.role === 'location' ? p.locations.join(', ') : 'All'}</td>
                    <td>
                      <div className="row end">
                        <button className="btn ghost sm" onClick={() => startEdit(p)}>Edit / reset password</button>
                        <button className="btn danger sm" disabled={p.email === meEmail} title={p.email === meEmail ? 'You cannot remove yourself' : ''} onClick={() => remove(p)}>Remove</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
    </>
  );
}
