// @ts-nocheck
/* eslint-disable */
// Ported verbatim from reference/index.html (the source of truth for every number and layout).
// DOM-string rendering, so the types are loose; the public entry is mount() in ./main.ts and the data contract is Boot in src/lib/data/boot.ts.
import { BOOT, fmtD, grid } from './core';

/* =========================================================================
   ADMIN-DEFINED COLOUR FORMATTING (BOOT.formats) + sign-out + "data as of" notes. Only active when the page is served by the backend.
   A rule = { table, column, axis:'column'|'row', mode:'pill'|'cell'|'text', rules:[{ op:'<'|'<='|'>'|'>='|'='|'between', v, v2, color }] }  (first matching rule wins)
   Durations such as "1 min 4 sec" are compared in seconds; "(11.2%)" is -11.2; "$1,234" is 1234.
   ========================================================================= */
export const FMT_COL = { green:['#dcfce7','#15803d'], amber:['#fef3c7','#b45309'], red:['#fee2e2','#b91c1c'], purple:['#ede9fe','#5b21b6'], grey:['#f3f4f6','#374151'] };
export const fmtColors = c => FMT_COL[c] || (/^#[0-9a-f]{6}$/i.test(c) ? [c + '2e', c] : FMT_COL.grey);
export const fmtNorm = s => String(s || '').toUpperCase().replace(/\([^)]*\)/g, '').replace(/\/\s*(WEEK|PERIOD)\b/g, '').replace(/\s+/g, ' ').trim();
export function fmtValue(text){
  const t = String(text).replace(/\u00a0/g, ' ').trim(); if (!t || /^(-|NA|N\/A)$/i.test(t)) return null;
  const mn = /(\d+)\s*min/i.exec(t), sc = /(\d+)\s*sec/i.exec(t); if (mn || sc) return (mn ? +mn[1] * 60 : 0) + (sc ? +sc[1] : 0);
  const m = /\d[\d,]*\.?\d*|\.\d+/.exec(t); if (!m) return null; const v = parseFloat(m[0].replace(/,/g, '')); return (/^\s*\(/.test(t) || /(^|\s)-\s*[$\d]/.test(t)) ? -v : v;
}
export function fmtMatch(r, v){ const a = +r.v, b = +r.v2; return r.op === '<' ? v < a : r.op === '<=' ? v <= a : r.op === '>' ? v > a : r.op === '>=' ? v >= a : r.op === '=' ? v === a : r.op === 'between' ? v >= Math.min(a, b) && v <= Math.max(a, b) : false; }
export function fmtColumns(t){                                              // one label per column; grouped headers read "Group / Column"
  const grid = []; [...t.tHead.rows].forEach((r, ri) => { grid[ri] = grid[ri] || []; let ci = 0;
    [...r.cells].forEach(c => { while (grid[ri][ci]) ci++; for (let dy = 0; dy < c.rowSpan; dy++) for (let dx = 0; dx < c.colSpan; dx++) (grid[ri + dy] = grid[ri + dy] || [])[ci + dx] = c; ci += c.colSpan; }); });
  const n = Math.max(0, ...grid.map(r => r.length)), labels = [];
  for (let ci = 0; ci < n; ci++) { const parts = []; grid.forEach(r => { const c = r[ci]; if (!c) return; const tx = c.textContent.replace(/\s+/g, ' ').trim(); if (tx && parts[parts.length - 1] !== tx) parts.push(tx); }); labels.push(parts.join(' / ')); }
  return labels;
}
export function fmtPaint(el, f, mode){
  const [bg, fg] = fmtColors(f.color), target = (mode === 'pill' && el.querySelector('.vp')) || el;
  if (!('fmt' in target.dataset)) target.dataset.fmt = target.getAttribute('style') || '';
  if (mode === 'text') { target.style.color = fg; target.style.fontWeight = '700'; } else { target.style.background = bg; target.style.color = fg; }
}
export function applyFormats(){
  if (!BOOT || !(BOOT.formats || []).length) return;
  document.querySelectorAll('main [data-fmt]').forEach(e => { const o = e.dataset.fmt; e.removeAttribute('data-fmt'); o ? e.setAttribute('style', o) : e.removeAttribute('style'); });
  const by = {}; BOOT.formats.forEach(f => (by[fmtNorm(f.table)] = by[fmtNorm(f.table)] || []).push(f));
  document.querySelectorAll('main table').forEach(t => {
    const sec = t.closest('.panel'), ti = sec && sec.querySelector('.t-title, .panel-h h3'), key = fmtNorm(ti ? ti.textContent : ''), rules = by[key] || by[key.split(' - ')[0]]; if (!rules || !t.tHead) return;
    const labels = fmtColumns(t).map(fmtNorm), rows = [...t.tBodies].flatMap(b => [...b.rows]);
    rules.forEach(f => {
      const mode = f.mode || 'pill', want = fmtNorm(f.column), apply = cell => { const v = fmtValue(cell.textContent); if (v == null) return; const hit = (f.rules || []).find(r => fmtMatch(r, v)); if (hit) fmtPaint(cell, hit, mode); };
      if (f.axis === 'row') rows.forEach(r => { if (r.cells.length && fmtNorm(r.cells[0].textContent) === want) [...r.cells].slice(1).forEach(apply); });
      else { const ci = labels.indexOf(want); if (ci >= 0) rows.forEach(r => { if (r.cells[ci] && r.cells[ci].colSpan === 1) apply(r.cells[ci]); }); }
    });
  });
}
if (BOOT) {
  let ft; new MutationObserver(() => { clearTimeout(ft); ft = setTimeout(applyFormats, 30); }).observe(document.querySelector('main'), { childList: true, subtree: true });
  const so = document.querySelector('.signout');
  if (so) {
    so.addEventListener('click', async () => { try { await fetch('/api/logout', { method:'POST', headers:{ 'X-Requested-With':'gwbr' } }); } catch (e) {} location.href = '/login'; }); }
  const SEC_VIEW = { reviews:'view-reviews', tpd:'view-tpd', loyalty:'view-loyalty', marketing:'view-marketing', catering:'view-catering' };
  Object.entries(BOOT.asOf || {}).forEach(([k, ws]) => { const v = document.getElementById(SEC_VIEW[k]); if (v) v.insertAdjacentHTML('afterbegin', `<div class="asof">Showing data from the week of ${fmtD(ws)}: this week's upload did not include this section.</div>`); });
}

