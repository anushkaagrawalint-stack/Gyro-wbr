// @ts-nocheck
/* eslint-disable */
// Ported verbatim from reference/index.html (the source of truth for every number and layout).
// DOM-string rendering, so the types are loose; the public entry is mount() in ./main.ts and the data contract is Boot in src/lib/data/boot.ts.
import { DATA, LIVE_TABS, PERIODS, TABS, periodRanges, view } from './core';
import { render } from './overview';
import { renderRevenue } from './revenue';
import { renderReviews } from './reviews';
import { renderTpd } from './tpd';
import { renderLoyalty } from './loyalty';
import { renderMarketing } from './marketing';
import { renderCatering } from './catering';
import { renderLocation } from './location';
import { applyFormats } from './formats';
import { renderLocationViews } from './locviews';

/* ---------- static chrome ---------- */
document.getElementById('tabs').innerHTML = TABS.map(t =>
  `<button class="tab ${t===TABS[0]?'on':LIVE_TABS[t]?'':'soon'}" ${LIVE_TABS[t]?`data-view="${LIVE_TABS[t]}" style="cursor:pointer"`:''}>${t}</button>`).join('');
document.querySelectorAll('.periodSeg').forEach(seg => {
  seg.innerHTML = Object.entries(PERIODS).map(([k,p]) =>
    `<button data-p="${k}" class="${k===view.period?'on':''}" title="${(periodRanges(DATA.weekly?.meta?.weekStart)[k]||'').replace(/"/g,'')}">${p.label}</button>`).join('');
  seg.addEventListener('click', e => {
    const b = e.target.closest('button'); if(!b) return;
    view.period = b.dataset.p;
    document.querySelectorAll('.periodSeg button').forEach(x => x.classList.toggle('on', x.dataset.p===view.period));
    render(); renderRevenue();
  });
});


/* tab switching */
document.getElementById('tabs').addEventListener('click', e => {
  const b = e.target.closest('.tab[data-view]'); if(!b) return;
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('on', t===b));
  document.querySelectorAll('main > div[id^="view-"]').forEach(v => v.hidden = v.id !== 'view-'+b.dataset.view);
  window.scrollTo(0,0);
});



// first paint
render(); renderRevenue(); renderReviews(); renderTpd(); renderLoyalty(); renderMarketing(); renderCatering(); renderLocation(); renderLocationViews();
if (TABS[0] !== 'Overview') document.querySelectorAll('main > div[id^="view-"]').forEach(v => v.hidden = v.id !== 'view-' + LIVE_TABS[TABS[0]]);
applyFormats();
