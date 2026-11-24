/**
 * Browser parity check: opens reference/index.html and the running app (signed in as the dev admin) in headless Chrome,
 * walks every tab and every toggle/dropdown, and compares the visible text and the chart data of each state.
 *   1. npm run dev            (port 3100)
 *   2. npm run sample -- --map   (publishes the sample workbook with the reference mapping)
 *   3. npm run e2e:parity
 * The sample workbook has no PTD tabs, so the "Period to Date" filter is skipped.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const root = path.resolve(import.meta.dirname, '..');
const env = Object.fromEntries(readFileSync(path.join(root, '.env.local'), 'utf8').split('\n').map((l) => /^([A-Z_]+)=(.*)$/.exec(l.trim())).filter(Boolean).map((m) => [m[1], m[2]]));
const BASE = process.env.BASE_URL || 'http://localhost:3100';
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find((p) => { try { readFileSync(p); return true; } catch { return false; } });
const chartJs = readFileSync(path.join(root, 'node_modules/chart.js/dist/chart.umd.js'), 'utf8');

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });

async function open(url, cookie) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1500, height: 1000 });
  await page.setRequestInterception(true);
  page.on('request', (r) => {
    const u = r.url();
    if (u.includes('Chart.js') || u.includes('chart.umd')) r.respond({ status: 200, contentType: 'application/javascript', body: chartJs });
    else if (u.startsWith('https://fonts.')) r.respond({ status: 200, contentType: 'text/css', body: '' });
    else r.continue();
  });
  page.on('pageerror', (e) => console.error(`[page error ${url.slice(0, 30)}]`, e.message));
  if (cookie) await page.setCookie({ name: cookie.name, value: cookie.value, url: BASE });
  await page.goto(url, { waitUntil: 'networkidle0' });
  return page;
}

// sign in to the app
const login = await fetch(`${BASE}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'gwbr' }, body: JSON.stringify({ email: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD }) });
if (!login.ok) throw new Error('login failed');
const [cn, ...cv] = (login.headers.get('set-cookie') || '').split(';')[0].split('=');

const ref = await open('file:///' + path.join(root, 'reference/index.html').replace(/\\/g, '/'));
const app = await open(BASE + '/', { name: cn, value: cv.join('=') });
await new Promise((r) => setTimeout(r, 1500));

/** Text of one tab plus the data of its charts (numbers rounded to cents). */
const snapshot = (viewId) => `(() => {
  const v = document.getElementById('view-${viewId}'); if (!v) return null;
  const norm = (s) => s.replace(/\\s+/g, ' ').trim();
  const charts = Object.values(window.Chart.instances || {}).filter((c) => v.contains(c.canvas)).map((c) => ({ id: c.canvas.id, labels: c.data.labels, sets: c.data.datasets.map((d) => ({ label: d.label, data: (d.data || []).map((x) => typeof x === 'number' ? Math.round(x * 100) / 100 : x) })) }));
  const leaves = []; const tw = document.createTreeWalker(v, NodeFilter.SHOW_TEXT); for (let n = tw.nextNode(); n; n = tw.nextNode()) { const t = norm(n.textContent); if (t) leaves.push(t); }
  return { text: norm(v.textContent), charts, leaves };
})()`;

const showView = (id) => `document.querySelectorAll('main > div[id^="view-"]').forEach(v => v.hidden = v.id !== 'view-${id}'); true`;
const VIEWS = ['overview', 'revenue', 'reviews', 'tpd', 'loyalty', 'marketing', 'catering', 'location'];

let checked = 0;
const diffs = [];
const sizes = new Map();
async function compare(label, viewId) {
  const [a, b] = await Promise.all([ref.evaluate(snapshot(viewId)), app.evaluate(snapshot(viewId))]);
  checked++;
  if (!a || a.text.length < 150) { diffs.push(`${label}: the reference snapshot is nearly empty (${a?.text.length ?? 'missing'} characters), so this comparison proves nothing`); return; }
  sizes.set(viewId, Math.max(sizes.get(viewId) ?? 0, a.text.length));
  if (viewId === 'location') {
    // the Location tab was redesigned (plain tables instead of gauges and rings): its layout differs on purpose,
    // so the check is that every figure of the original view is still shown
    // numbers are read per element, because the page text runs neighbouring elements together
    const nums = (leaves) => new Set(leaves.flatMap((t) => t.match(/\(?\$?\d[\d,]*(?:\.\d+)?%?\)?/g) ?? [])
      .map((x) => { const v = parseFloat(x.replace(/[()$,%]/g, '')); return x.includes('%') ? Math.round(v) + '%' : x.includes('$') ? '$' + Math.round(v) : String(v); })   // brackets and rounding are presentation
      .filter((x) => !/^\d{1,2}$/.test(x)));                                                                                                  // lone small integers are axis ticks and ranks
    const have = nums(b.leaves), pcts = [...have].filter((x) => x.endsWith('%')).map((x) => parseInt(x, 10));
    const missing = [...nums(a.leaves)].filter((n) => !have.has(n) && !(n.endsWith('%') && pcts.some((q) => Math.abs(q - parseInt(n, 10)) <= 1)));   // percentages may differ by 1 from rounding
    if (missing.length) diffs.push(`${label}: figures missing from the redesigned Location tab: ${missing.slice(0, 12).join(' ')}`);
    return;
  }
  if (JSON.stringify(a) === JSON.stringify(b)) return;
  const at = a.text.split(/(?<=\S) (?=\S)/), bt = b.text.split(/(?<=\S) (?=\S)/);
  let i = 0; while (i < at.length && at[i] === bt[i]) i++;
  diffs.push(`${label}: ${a.text === b.text ? 'chart data differs' : `text differs near "${at.slice(Math.max(0, i - 3), i + 4).join(' ')}" vs "${bt.slice(Math.max(0, i - 3), i + 4).join(' ')}"`}`);
}

// controls inside a view: segmented buttons (except PTD) and selects
const controls = (viewId) => `(() => {
  const v = document.getElementById('view-${viewId}');
  const segs = [...v.querySelectorAll('.seg')].map((s, si) => ({ si, buttons: [...s.querySelectorAll('button')].map((b) => b.textContent.trim()) }));
  const sels = [...v.querySelectorAll('select')].map((s, i) => ({ i, id: s.id, options: [...s.options].map((o) => o.value || o.text) }));
  return { segs, sels };
})()`;
const clickBtn = (viewId, si, label) => `(() => { const b = [...document.getElementById('view-${viewId}').querySelectorAll('.seg')][${si}] ; const t = [...b.querySelectorAll('button')].find((x) => x.textContent.trim() === ${JSON.stringify(label)}); t.click(); return true; })()`;
const setSel = (viewId, i, val) => `(() => { const s = [...document.getElementById('view-${viewId}').querySelectorAll('select')][${i}]; s.value = ${JSON.stringify(val)}; s.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`;

for (const id of VIEWS) {
  await Promise.all([ref.evaluate(showView(id)), app.evaluate(showView(id))]);
  await compare(`${id} (default)`, id);
  const c = await ref.evaluate(controls(id));
  for (const s of c.segs) for (const label of s.buttons) {
    if (label === 'Period to Date') continue;
    await Promise.all([ref.evaluate(clickBtn(id, s.si, label)), app.evaluate(clickBtn(id, s.si, label))]);
    await compare(`${id} > ${label}`, id);
  }
  for (const s of c.sels) for (const o of s.options) {
    await Promise.all([ref.evaluate(setSel(id, s.i, o)), app.evaluate(setSel(id, s.i, o))]);
    await compare(`${id} > ${s.id || 'select' + s.i} = ${o}`, id);
  }
}
await browser.close();
console.log(`compared ${checked} states across ${VIEWS.length} tabs (largest text per tab: ${[...sizes].map(([k, v]) => `${k} ${v}`).join(', ')})`);
if (diffs.length) { console.error(`${diffs.length} difference(s):\n` + diffs.join('\n')); process.exit(1); }
console.log('every tab matches the reference page');
