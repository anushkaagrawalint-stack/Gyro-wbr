/**
 * Developer helper: signs in to a running dev server and publishes reference/Gyro_Republic-WBR_Input_2.xlsx as a week.
 *   npm run sample                    -> upload only (leaves dining options unmapped, as a fresh install would)
 *   npm run sample -- --map           -> also save the mapping that reference/index.html applies today (for comparing numbers)
 * Needs the server on BASE_URL (default http://localhost:3100) and ADMIN_EMAIL / ADMIN_PASSWORD in .env.local.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import * as XLSX from 'xlsx';
import { DEFAULT_LOCATIONS } from '../src/lib/data/config';
import { diningOptionsIn, parseWorkbook } from '../src/lib/workbook/parse';
import { referenceMapping } from '../tests/helpers/fixtureMapping';

function loadEnv() {
  try {
    for (const l of readFileSync(path.resolve(__dirname, '../.env.local'), 'utf8').split('\n')) {
      const m = /^([A-Z_]+)=(.*)$/.exec(l.trim());
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  } catch { /* no env file */ }
}

async function main() {
  loadEnv();
  const base = process.env.BASE_URL || 'http://localhost:3100';
  const H = { 'Content-Type': 'application/json', 'X-Requested-With': 'gwbr' };
  const login = await fetch(`${base}/api/login`, { method: 'POST', headers: H, body: JSON.stringify({ email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD }) });
  if (!login.ok) throw new Error(`login failed: ${login.status} ${await login.text()}`);
  const cookie = (login.headers.get('set-cookie') || '').split(';')[0];
  const call = async (p: string, method: string, body?: unknown) => {
    const r = await fetch(base + p, { method, headers: { ...H, Cookie: cookie }, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, data: (await r.json().catch(() => ({}))) as Record<string, unknown> };
  };

  const wb = XLSX.read(readFileSync(path.resolve(__dirname, '../reference/Gyro_Republic-WBR_Input_2.xlsx')));
  const p = parseWorkbook(wb, DEFAULT_LOCATIONS);
  if (process.argv.includes('--map')) {
    const r = await call('/api/admin/mapping', 'PUT', { mapping: referenceMapping(diningOptionsIn(p.toast).map((o) => o.name)) });
    console.log('mapping saved:', r.status);
  }
  const week = { weekStart: p.weekStart, workbook: 'Gyro_Republic-WBR_Input_2.xlsx', toast: p.toast, reviews: p.reviews, loyalty: p.loyalty, marketing: p.marketing };
  const r = await call('/api/admin/weeks', 'POST', { week, replace: true, allowUnmapped: true });
  console.log('publish:', r.status, JSON.stringify(r.data).slice(0, 300));
}
main().catch((e) => { console.error(e); process.exit(1); });
