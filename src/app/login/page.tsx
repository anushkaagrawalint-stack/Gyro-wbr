'use client';

import { useState } from 'react';

const input: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', height: 50, padding: '0 16px', fontSize: 16, color: '#1f1537',
  background: '#fff', border: '1px solid #e6e1f2', borderRadius: 14, outline: 'none', fontFamily: 'inherit',
};

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [focus, setFocus] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const r = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'gwbr' }, body: JSON.stringify({ email, password }) });
      if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { error?: string }).error || 'Could not sign in.');
      window.location.assign('/'); // full load: the dashboard script starts fresh for this person
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  const ring = (name: string): React.CSSProperties => (focus === name ? { borderColor: '#7c3aed', boxShadow: '0 0 0 3px rgba(124,58,237,.18)' } : {});

  return (
    <>
      <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700&display=swap" rel="stylesheet" />
      <div
        style={{
          minHeight: '100vh', width: '100%', display: 'grid', placeItems: 'center', padding: 16, fontFamily: "'Montserrat', 'Inter', system-ui, sans-serif",
          background: 'radial-gradient(120% 120% at 100% 100%, #6322bb 0%, #4a1f9a 28%, #321a6b 55%, #25104f 100%)',
        }}
      >
        <div style={{ display: 'grid', gap: 36, justifyItems: 'center', width: 'min(552px, 100%)' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/kutlerri-logo.png" alt="Kutlerri" style={{ width: 230, height: 'auto' }} />
          <form onSubmit={submit} style={{ width: '100%', boxSizing: 'border-box', background: '#fff', borderRadius: 24, padding: '48px 48px 40px', boxShadow: '0 24px 60px rgba(20,8,50,.35)' }}>
            <h1 style={{ margin: 0 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/gyro-logo-black.png" alt="Gyro Republic" style={{ height: 96, width: 'auto', display: 'block', margin: '0 auto' }} />
            </h1>
            <p style={{ margin: '10px 0 36px', fontSize: 16, color: '#6b6580' }}>Weekly Business Review Dashboard</p>
            <label style={{ display: 'block', fontSize: 15, fontWeight: 700, color: '#1f1537', marginBottom: 8 }} htmlFor="email">Email</label>
            <input id="email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} onFocus={() => setFocus('email')} onBlur={() => setFocus('')} style={{ ...input, ...ring('email'), marginBottom: 22 }} />
            <label style={{ display: 'block', fontSize: 15, fontWeight: 700, color: '#1f1537', marginBottom: 8 }} htmlFor="password">Password</label>
            <input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} onFocus={() => setFocus('password')} onBlur={() => setFocus('')} style={{ ...input, ...ring('password'), marginBottom: 28 }} />
            {error && <div role="alert" style={{ color: '#991b1b', fontSize: 13, marginBottom: 14 }}>{error}</div>}
            <button type="submit" disabled={busy} style={{ width: '100%', height: 52, border: 0, borderRadius: 14, background: '#7c3aed', color: '#fff', fontSize: 16, fontWeight: 700, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.7 : 1, fontFamily: 'inherit' }}>
              {busy ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
        </div>
      </div>
    </>
  );
}
