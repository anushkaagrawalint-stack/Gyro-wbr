/**
 * Takes screenshots of the dashboard and each Admin screen into a folder, for a quick visual check.
 *   node scripts/e2e-shots.mjs <outDir>
 */
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const root = path.resolve(import.meta.dirname, '..');
const out = process.argv[2] || path.join(root, '.shots');
mkdirSync(out, { recursive: true });
const env = Object.fromEntries(readFileSync(path.join(root, '.env.local'), 'utf8').split('\n').map((l) => /^([A-Z_]+)=(.*)$/.exec(l.trim())).filter(Boolean).map((m) => [m[1], m[2]]));
const BASE = process.env.BASE_URL || 'http://localhost:3100';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 900 });
page.on('pageerror', (e) => console.error('[page error]', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.error('[console]', m.text()); });
await page.goto(BASE + '/login', { waitUntil: 'networkidle0' });
await page.screenshot({ path: path.join(out, '0-login.png') });
await page.type('input[type=email]', env.ADMIN_EMAIL);
await page.type('input[type=password]', env.ADMIN_PASSWORD);
await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle0' }), page.click('button[type=submit]')]);
await new Promise((r) => setTimeout(r, 1500));
await page.screenshot({ path: path.join(out, '1-overview.png') });

const tabs = await page.$$eval('#tabs .tab', (els) => els.map((e) => e.textContent));
console.log('tabs:', tabs.join(' | '));
await page.evaluate(() => [...document.querySelectorAll('#tabs .tab')].find((t) => t.textContent === 'Admin').click());
await new Promise((r) => setTimeout(r, 800));
const screens = ['Weeks & data', 'Mapping', 'Locations', 'People & access', 'Formatting'];
for (const [i, s] of screens.entries()) {
  await page.evaluate((s) => [...document.querySelectorAll('#view-admin .seg button')].find((b) => b.textContent === s).click(), s);
  await new Promise((r) => setTimeout(r, 900));
  await page.screenshot({ path: path.join(out, `${2 + i}-admin-${s.replace(/\W+/g, '-')}.png`), fullPage: true });
}
await browser.close();
console.log('screenshots in', out);
