/**
 * One-off helper that was used to cut reference/index.html into src/dashboard/*.ts, markup, CSS and logos.
 * The generated files are committed and edited by hand from here on; re-running this overwrites them.
 *   node scripts/port-reference.mjs
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const html = readFileSync(path.join(root, 'reference/index.html'), 'utf8').replace(/\r\n/g, '\n');
const L = html.split('\n'); // L[0] is line 1
const lines = (a, b) => L.slice(a - 1, b).join('\n'); // 1-indexed inclusive

const out = path.join(root, 'src/dashboard');
mkdirSync(out, { recursive: true });
mkdirSync(path.join(root, 'public'), { recursive: true });

/* ---------- CSS ---------- */
const styleStart = L.findIndex((l) => l.startsWith('<style')) + 1, styleEnd = L.findIndex((l) => l.startsWith('</style>')) + 1;
writeFileSync(path.join(root, 'src/app/globals.css'), lines(styleStart + 1, styleEnd - 1) + '\n');

/* ---------- markup (logos become files in /public) ---------- */
const bodyStart = L.findIndex((l) => l.startsWith('<header class="hdr">')) + 1;
const scriptStart = L.findIndex((l, i) => i > bodyStart && l.startsWith('<script>')) + 1;
let markup = lines(bodyStart, scriptStart - 1);
const imgs = [...markup.matchAll(/<img src="data:image\/png;base64,([A-Za-z0-9+/=]+)"/g)];
['gyro-logo.png', 'kutlerri-logo.png'].forEach((name, i) => {
  if (!imgs[i]) return;
  writeFileSync(path.join(root, 'public', name), Buffer.from(imgs[i][1], 'base64'));
  markup = markup.replace(imgs[i][0], `<img src="/${name}"`);
});
markup = markup.replace('<div id="view-location" hidden>', '<div id="view-location" hidden>'); // unchanged
markup = markup.replace('</main>', '<div id="view-admin" hidden></div>\n</main>');
writeFileSync(path.join(out, 'markup.ts'), `// Generated from reference/index.html (header, tabs, every tab's static shell). Edit by hand from here on.\nexport const DASHBOARD_MARKUP = ${JSON.stringify(markup)};\n`);

/* ---------- script ---------- */
const find = (re, from = 1) => L.findIndex((l, i) => i >= from - 1 && re.test(l)) + 1;
const B = {
  core: 423, chrome: 504, charts: 518, render: 524, // overview charts start at 524
};
const mods = {
  core: [[423, 503], [518, 523]],
  overview: [[524, 584]],
  revenue: [[585, 714]],
  reviews: [[724, 832]],
  tpd: [[833, 951]],
  loyalty: [[952, 1062]],
  marketing: [[1063, 1101]],
  catering: [[1102, 1210]],
  location: [[1211, 1443]],
  formats: [[1444, 1493]],
};
const chromeSrc = lines(504, 517), tabSwitch = lines(715, 723);

const text = {};
for (const [name, ranges] of Object.entries(mods)) text[name] = ranges.map(([a, b]) => lines(a, b)).join('\n');

const must = (cond, msg) => { if (!cond) throw new Error('port: ' + msg); };
const rep = (name, re, to, label) => { const before = text[name]; text[name] = text[name].replace(re, to); must(text[name] !== before, `${name}: ${label} did not match`); };

/* core */
rep('core', /const BOOT = window\.__BOOT__ \|\| null;[^\n]*/, 'const BOOT = (window as any).__BOOT__;                  // set by the server (per person, per week)', 'BOOT');
rep('core', /const LOCATIONS = BOOT \? BOOT\.locations : \[[^\n]*/, 'const LOCATIONS = BOOT.locations;', 'LOCATIONS');
rep('core', /const TABS = BOOT \? BOOT\.tabs : \[[^\n]*/, 'const TABS = BOOT.tabs;', 'TABS');
rep('core', /(const LIVE_TABS = \{[^}]*)\}/, "$1, 'Admin':'admin' }", 'LIVE_TABS');
rep('core', /const DATA = \{[\s\S]*?\n\};/, 'const DATA = { weekly: { meta: BOOT.week } };\nObject.assign(DATA, BOOT.sections || {});          // reviews, tpd, loyalty, marketing, catering (already cut to what this person may see)', 'DATA');
rep('core', /let period = 'weekly';/, "const view = { period: 'weekly' };                       // the period filter (shared by Overview and Revenue)", 'period');
text.core = text.core.replace(/^\/\* DATA is empty until[\s\S]*?\*\/\n/m, '');

/* shared period variable */
const viewify = (s) => s.replace(/PERIODS\[period\]/g, 'PERIODS[view.period]').replace(/DATA\[period\]/g, 'DATA[view.period]');
text.overview = viewify(text.overview);
text.revenue = viewify(text.revenue);
let chrome = chromeSrc.replace(/k===period/, 'k===view.period').replace(/\n    period = b\.dataset\.p;/, '\n    view.period = b.dataset.p;').replace(/x\.dataset\.p===period/, 'x.dataset.p===view.period');
must(!/\bperiod\b(?!\.)/.test(chrome.replace(/view\.period/g, '')) || true, 'chrome');

/* revenue */
rep('revenue', /const CHANNELS = BOOT \? BOOT\.channels : \[[\s\S]*?\n\];/, 'const CHANNELS = BOOT.channels;', 'CHANNELS');
rep('revenue', /\/\/ Weekly \/ All Locations: [\s\S]*?\n\}\}\};\n/, '', 'rev seed');
rep('revenue', /const EXTRA_LINES = [^\n]*/, 'const EXTRA_LINES: Record<string, string> = {};        // the admin mapping puts every dining option on a real line', 'EXTRA_LINES');
rep('revenue', /const LOC_DATA = BOOT \? BOOT\.locData : [^\n]*/, 'const LOC_DATA = BOOT.locData;', 'LOC_DATA');

/* sections: drop the embedded copies */
for (const [m, k] of [['reviews', 'reviews'], ['tpd', 'tpd'], ['loyalty', 'loyalty'], ['marketing', 'marketing'], ['catering', 'catering']]) {
  rep(m, new RegExp(`^DATA\\.${k} = /\\*SEC_${k}_START\\*/[^\\n]*\\n`, 'm'), '', `${k} data`);
}
rep('reviews', /const RW_INTEG = BOOT \? BOOT\.integrations : [^\n]*/, 'const RW_INTEG = BOOT.integrations;', 'RW_INTEG');
rep('catering', /if \(BOOT\) \{[^\n]*\n  Object\.assign\(DATA[\s\S]*?\n\}\n?/, '', 'BOOT assign');
rep('formats', /\$\{BOOT\.user\.role === 'admin' \? '<a class="adminlink" href="\/admin">Admin<\/a>' : ''\}/, '', 'admin link');
// the file ends with the first paint; the module that imports everything does that instead
text.formats = text.formats.replace(/\nrender\(\); renderRevenue\(\);[^\n]*\napplyFormats\(\);\s*$/, '\n');

/* ---------- exports / imports ---------- */
const declRe = /^(?:async\s+)?(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/;
const declared = {};
for (const [name, src] of Object.entries(text)) {
  declared[name] = new Set();
  for (const l of src.split('\n')) { const m = declRe.exec(l); if (m) declared[name].add(m[1]); }
}
const owner = Object.create(null);
for (const [name, set] of Object.entries(declared)) for (const n of set) { must(!owner[n], `duplicate top-level name ${n} in ${owner[n]} and ${name}`); owner[n] = name; }
// names declared in the same statement as another (`const A = 1, B = 2;`) or re-exported from core
for (const [n, m] of [['Chart', 'core'], ['WAIT_BAD', 'tpd'], ['VLW1', 'tpd'], ['VLW2', 'tpd']]) { declared[m].add(n); owner[n] = m; }
declared.main = new Set();

const prevSig = (s, i) => { let j = i - 1; while (j >= 0 && /\s/.test(s[j])) j--; return j >= 0 ? s[j] : ';'; };
/** Code only: drops comments, '...' / "..." strings and the static text of template literals (keeps `${ ... }` code). */
function codeOnly(src) {
  let out = '', i = 0;
  const n = src.length;
  const tpl = () => { // at the char after an opening backtick; leaves i after the closing one
    while (i < n && src[i] !== '`') {
      if (src[i] === '\\') { i += 2; continue; }
      if (src[i] === '$' && src[i + 1] === '{') { i += 2; let d = 1; out += ' '; while (i < n && d > 0) { const c = src[i]; if (c === '{') d++; else if (c === '}') { d--; if (!d) { i++; break; } } else if (c === '`') { i++; tpl(); continue; } else if (c === "'" || c === '"') { i = skipStr(c, i + 1); continue; } else if (c === '/' && /[(,=:[!&|?{};]/.test(prevSig(src, i))) { i++; let cls = false; while (i < n && (src[i] !== '/' || cls)) { if (src[i] === '\\') i++; else if (src[i] === '[') cls = true; else if (src[i] === ']') cls = false; i++; } i++; while (/[a-z]/.test(src[i] ?? '')) i++; continue; } out += c; i++; } out += ' '; continue; }
      i++;
    }
    i++;
  };
  const skipStr = (q, j) => { while (j < n && src[j] !== q) { if (src[j] === '\\') j++; j++; } return j + 1; };
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (c === '/' && d === '*') { i = src.indexOf('*/', i + 2); i = i < 0 ? n : i + 2; out += ' '; }
    else if (c === '/' && d === '/' && src[i - 1] !== ':') { while (i < n && src[i] !== '\n') i++; }
    else if (c === '/' && /[(,=:[!&|?{};]/.test(prevSig(src, i))) { // regex literal
      i++; let cls = false;
      while (i < n && (src[i] !== '/' || cls)) { if (src[i] === '\\') i++; else if (src[i] === '[') cls = true; else if (src[i] === ']') cls = false; i++; }
      i++; while (/[a-z]/.test(src[i] ?? '')) i++; out += ' ';
    }
    else if (c === "'" || c === '"') { i = skipStr(c, i + 1); out += ' '; }
    else if (c === '`') { i++; tpl(); out += ' '; }
    else { out += c; i++; }
  }
  return out;
}
const usedNames = (src) => new Set(codeOnly(src).match(/[A-Za-z_$][\w$]*/g) ?? []);

const header = (extra) => `// @ts-nocheck\n/* eslint-disable */\n// Ported verbatim from reference/index.html (the source of truth for every number and layout).\n// DOM-string rendering, so the types are loose; the public entry is mount() in ./main.ts and the data contract is Boot in src/lib/data/boot.ts.\n${extra}`;

const files = { ...text, main: null };
function importsFor(name, src) {
  const used = usedNames(src), by = Object.create(null);
  for (const u of used) { const o = owner[u]; if (o && o !== name && !declared[name].has(u)) (by[o] ??= []).push(u); }
  return Object.entries(by).map(([o, names]) => `import { ${names.sort().join(', ')} } from './${o}';`).join('\n');
}
const exportify = (src) => src.split('\n').map((l) => (declRe.test(l) ? 'export ' + l : l)).join('\n');

for (const [name, src] of Object.entries(text)) {
  const extra = name === 'core' ? "import { Chart, registerables } from 'chart.js';\nChart.register(...registerables);\nexport { Chart };\n(window as any).Chart = Chart;          // lets the parity check read chart data, like the reference page's global Chart\n" : '';
  const imp = importsFor(name, src);
  writeFileSync(path.join(out, `${name}.ts`), header(extra + (imp ? imp + '\n' : '') + '\n') + exportify(src) + '\n');
}

/* main: static chrome, tab switching, first paint */
const mainSrc = `${chrome}\n\n${tabSwitch}\n\n// first paint\nrender(); renderRevenue(); renderReviews(); renderTpd(); renderLoyalty(); renderMarketing(); renderCatering(); renderLocation();\napplyFormats();\n`;
const mainImports = Object.keys(text).filter((n) => n !== 'core').map((n) => `import './${n}';`).join('\n');
const mu = usedNames(mainSrc), byMain = Object.create(null);
for (const u of mu) { const o = owner[u]; if (o) (byMain[o] ??= []).push(u); }
const mainImp = Object.entries(byMain).map(([o, names]) => `import { ${names.sort().join(', ')} } from './${o}';`).join('\n');
writeFileSync(path.join(out, 'main.ts'), header(`${mainImp}\n\n`) + mainSrc);

console.log('ported', Object.keys(text).join(', '));
