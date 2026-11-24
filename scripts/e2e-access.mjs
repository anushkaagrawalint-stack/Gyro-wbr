/**
 * Live-server check of access control, colour formatting and house style. Needs `npm run dev` and `npm run sample -- --map`.
 *   node scripts/e2e-access.mjs
 * It creates two temporary people and one colour rule, and removes them at the end.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const root = path.resolve(import.meta.dirname, '..');
const env = Object.fromEntries(readFileSync(path.join(root, '.env.local'), 'utf8').split('\n').map((l) => /^([A-Z_]+)=(.*)$/.exec(l.trim())).filter(Boolean).map((m) => [m[1], m[2]]));
const BASE = process.env.BASE_URL || 'http://localhost:3100';
const H = { 'Content-Type': 'application/json', 'X-Requested-With': 'gwbr' };
let failed = 0;
const check = (ok, msg) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`); if (!ok) failed++; };

async function login(email, password) {
  const r = await fetch(`${BASE}/api/login`, { method: 'POST', headers: H, body: JSON.stringify({ email, password }) });
  return r.ok ? (r.headers.get('set-cookie') || '').split(';')[0] : null;
}
const call = (cookie, p, method = 'GET', body, headers = H) => fetch(BASE + p, { method, headers: { ...headers, ...(cookie ? { Cookie: cookie } : {}) }, body: body ? JSON.stringify(body) : undefined, redirect: 'manual' });

// not signed in
check((await call(null, '/api/admin/people')).status === 401, 'admin API refuses a visitor who is not signed in (401)');
const home = await call(null, '/');
check([302, 307].includes(home.status) && (home.headers.get('location') || '').includes('/login'), 'the dashboard sends a visitor to the sign-in page');
check(!(await login(env.ADMIN_EMAIL, 'wrong-password')), 'a wrong password is refused');

const admin = await login(env.ADMIN_EMAIL, env.ADMIN_PASSWORD);
check(!!admin, 'the admin from ADMIN_EMAIL / ADMIN_PASSWORD can sign in');
check((await call(admin, '/api/admin/people', 'POST', { email: 'c@t.test', name: 'Cee', role: 'client', password: 'clientpass1' }, { 'Content-Type': 'application/json' })).status === 403, 'a request without the X-Requested-With header is refused (CSRF guard)');
const mk = async (b) => (await (await call(admin, '/api/admin/people', 'POST', b)).json()).person;
const client = await mk({ email: 'client@t.test', name: 'Cee', role: 'client', password: 'clientpass1' });
const loc = await mk({ email: 'katy@t.test', name: 'Kay', role: 'location', locations: ['Katy'], password: 'katypass123' });
try {
  const cc = await login('client@t.test', 'clientpass1'), lc = await login('katy@t.test', 'katypass123');
  check((await call(cc, '/api/admin/people')).status === 403, 'a Client cannot use the admin API (403)');
  check((await call(lc, '/api/admin/weeks')).status === 403, 'a Location person cannot use the admin API (403)');
  const html = async (c) => (await call(c, '/')).text();
  const [ah, ch, lh] = await Promise.all([html(admin), html(cc), html(lc)]);
  check(ah.includes('Admin') && ah.includes('Halloween'), 'Admin page carries the Admin tab and all data');
  check(!/"Admin"/.test(ch) && ch.includes('Halloween') && ch.includes('Sugar Land'), 'Client page has all locations and Marketing data but no Admin tab');
  const leaks = ['Sugar Land', 'Fondren', 'Richmond', 'Spring', 'Pearland', 'Missouri City', 'Halloween', 'Free Fries or Protein Cup'].filter((w) => lh.includes(w));
  check(leaks.length === 0, `Location page (Katy) contains no other location or marketing/catering data in the server response${leaks.length ? ' - leaked: ' + leaks.join(', ') : ''}`);
  check(lh.includes('Katy') && !/"Marketing"|"Admin"/.test(lh), 'Location page has Katy and no Marketing or Admin tab');

  // colour formatting, through the browser
  await call(admin, '/api/admin/formats', 'PUT', { formats: [{ table: 'Location Results', column: 'Var vs LY', axis: 'column', mode: 'pill', rules: [{ op: '<', v: 0, color: 'purple' }, { op: '>=', v: 0, color: 'amber' }] }] });
  const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setCookie({ name: admin.split('=')[0], value: admin.split('=').slice(1).join('='), url: BASE });
  await page.goto(BASE + '/', { waitUntil: 'networkidle0' });
  await new Promise((r) => setTimeout(r, 1200));
  const painted = await page.evaluate(() => [...document.querySelectorAll('#view-overview tbody tr:not(.tot) td:nth-child(6) .vp')].map((e) => ({ t: e.textContent, bg: getComputedStyle(e).backgroundColor })));
  const rgb = (h) => `rgb(${[1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)).join(', ')})`;
  check(painted.length === 7 && painted.filter((p) => p.t.startsWith('(')).every((p) => p.bg === rgb('#ede9fe')) && painted.filter((p) => !p.t.startsWith('(')).every((p) => p.bg === rgb('#fef3c7')), `colour rule paints the Var vs LY pills (negative purple, positive amber): ${painted.map((p) => p.t).join(' ')}`);

  // house style: no em dashes anywhere in what a person sees, brackets for negatives
  await page.evaluate(() => [...document.querySelectorAll('#tabs .tab')].find((t) => t.textContent === 'Admin').click());
  const text = await page.evaluate(() => document.body.innerText + [...document.querySelectorAll('main [title], main [aria-label]')].map((e) => e.title + e.getAttribute('aria-label')).join(' '));
  check(!text.includes('\u2014'), 'no em dash appears in the page text');
  const ovr = await page.evaluate(() => document.getElementById('view-overview').textContent);
  check(/\(11\.2%\)/.test(ovr) && !/-11\.2%/.test(ovr), 'negative variances are shown in brackets, e.g. (11.2%)');
  const align = await page.evaluate(() => { const t = document.querySelector('#view-overview table'); const a = getComputedStyle(t.querySelector('tbody td:first-child')).textAlign, b = getComputedStyle(t.querySelector('tbody td:nth-child(2)')).textAlign; return [a, b]; });
  check(align[0] === 'left' && align[1] === 'center', 'first table column is left aligned and the rest are centered');
  check(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme === 'light' && document.documentElement.dataset.theme === 'light'), 'light mode only');
  await browser.close();
} finally {
  await call(admin, '/api/admin/formats', 'PUT', { formats: [] });
  await call(admin, `/api/admin/people/${client.id}`, 'DELETE');
  await call(admin, `/api/admin/people/${loc.id}`, 'DELETE');
}
console.log(failed ? `\n${failed} check(s) FAILED` : '\nall checks passed');
process.exit(failed ? 1 : 0);
