// @ts-nocheck
/* eslint-disable */
// Ported verbatim from reference/index.html (the source of truth for every number and layout).
// DOM-string rendering, so the types are loose; the public entry is mount() in ./main.ts and the data contract is Boot in src/lib/data/boot.ts.
import { Chart, DATA, MONTHS, css, fiscalOf, grid, money, pct, sum, toDate } from './core';

/* =========================================================================
   CATERING  (reference: RASA > Catering; source: Gyro Republic - Catering WBR.xlsx)
   DATA.catering = { weeks:[{week, calls, connected, over90, emails, opens, mqls, mqlFup, ordersConfirmed, ordersPaid, valueConfirmed, valuePaid}],
                     location:{ week, locations:{name:{calls,connected,over90,emails,opens,mqls,mqlFup}}, total:{...} } }
   Outbound tab (cols C:L = 10 weeks, row 2 = 'Week of ...'):
     row3 # Calls / Week, row4 # Calls Connected, row6 # Calls > 90 seconds, row8 # Emails / Week, row9 # Opens, row10 MQLs, row11 MQLs with a FUP date,
     row12 Orders (Confirmed) count, row13 Orders (Paid) count, row14 Orders (Confirmed) $ value, row15 Orders (Paid) $ value  (second pair of identically-named rows = $ values)
     % Calls Connected = connected / calls (sheet row 5);  % of calls > 90 s = over90 / connected (sheet row 7)  -> both recomputed, verified against the sheet
     blank cells (Oct 12 orders) stay blank -> shown as a dash, not 0
   LocationWise tab, block 'Week of Oct 12' (rows 50-60): Fondren B, Sugar Land D, Richmond F, Pearland H, Total J (= sum of the four; equals Outbound col L)
   ========================================================================= */
export const CT_ROWS = [   // [label, key, kind]
  ['# Calls / Week','calls','n'], ['# Calls Connected','connected','n'], ['% Calls Connected','pctConn','p'],
  ['# Calls > 90 seconds','over90','n'], ['% of calls > 90 seconds','pct90','p'],
  ['# Emails / Week','emails','n'], ['# Opens','opens','n'], ['MQLs','mqls','n'], ['MQLs with a FUP date','mqlFup','n'],
  ['Orders (Paid)','ordersPaid','n'],
  ['Order Value (Paid)','valuePaid','$'] ];
export const CT_TABLE = [   // Outbound tab rows 3-15, labels verbatim
  ['# Calls / Week','calls','n'], ['# Calls Connected','connected','n'], ['% Calls Connected','pctConn','p0'],
  ['# Calls > 90 seconds','over90','n'], ['% of calls > 90 seconds','pct90','p0'],
  ['# Emails / Week','emails','n'], ['# Opens','opens','n'], ['MQLs','mqls','n'], ['MQLs with a FUP date','mqlFup','n'],
  ['Orders (Paid)','ordersPaid','n'],
  ['Orders (Paid)','valuePaid','$'] ];
export const ctVal = (w,k) => k==='pctConn' ? (w.calls ? w.connected/w.calls*100 : null) : k==='pct90' ? (w.connected ? w.over90/w.connected*100 : null) : w[k];
export const ctFmt = (v,kind) => v==null || isNaN(v) ? '-' : kind==='p0' ? Math.round(v)+'%' : kind==='p' ? v.toFixed(1)+'%' : kind==='$' ? money(v) : Math.round(v).toLocaleString('en-US');
export function ctTable(title, sub, head, rows, curCol, extra){
  const th = head.map((h,i) => `<th class="${i===curCol?'cur':''}">${h}</th>`).join('');
  const body = rows.map(r => `<tr>${r.map((c,i) => `<td class="${i===curCol?'cur':''}${i===r.length-1&&curCol==='last'?' totc':''}">${c}</td>`).join('')}</tr>`).join('');
  return `<section class="card panel"><div class="panel-h"><span class="t-title">${title}</span>${extra ? `<span style="display:flex;gap:10px;align-items:center">${extra}<button class="dl" title="Download table">⤓</button></span>` : '<button class="dl" title="Download table">⤓</button>'}</div>
    ${sub?`<div class="muted-line">${sub}</div>`:''}<div class="tablewrap"><table class="ctr" style="min-width:${Math.max(640, head.length*110)}px"><thead><tr>${th}</tr></thead><tbody>${body}</tbody></table></div></section>`;
}
export const ctCharts = CT_ROWS.map(([label,key,kind]) => {
  const card = document.createElement('section'); card.className = 'card panel';
  card.innerHTML = `<div class="panel-h"><h3>5-Week Trend - ${label}</h3></div><div class="chartbox"><canvas></canvas></div>`;
  document.getElementById('ctTrend').appendChild(card);
  return { key, kind, label, h3: card.querySelector('h3'), chart: new Chart(card.querySelector('canvas'), {
    type:'line', data:{ labels:[], datasets:[{ data:[], borderColor:'#7c3aed', backgroundColor:'#7c3aed', tension:.3, pointRadius:4, pointHoverRadius:6, pointHitRadius:14, borderWidth:2.5, spanGaps:false }] },
    options:{ maintainAspectRatio:false, interaction:{ mode:'nearest', axis:'x', intersect:false }, plugins:{ legend:{ display:false }, tooltip:{ callbacks:{ label:c => ctFmt(c.parsed.y, kind) } } },
      scales:{ y:{ beginAtZero:true, grid:grid(), ticks:{ color:css('--muted'), maxTicksLimit:5, callback:v => kind==='p' ? v+'%' : kind==='$' ? '$'+v.toLocaleString('en-US') : v.toLocaleString('en-US') } },
               x:{ grid:grid(), ticks:{ color:css('--muted') } } } } }) };
});


export let ctMode = 'weekly';                                                         // weekly | periodic (fiscal periods)
document.getElementById('ctSeg').innerHTML = '<button data-m="weekly" class="on">Weekly</button><button data-m="periodic">Periodic</button>';
document.getElementById('ctSeg').addEventListener('click', e => { const b = e.target.closest('button'); if(!b) return; ctMode = b.dataset.m;
  document.querySelectorAll('#ctSeg button').forEach(x => x.classList.toggle('on', x===b)); renderCatering(); });
export const ctIso = label => `${(DATA.weekly?.meta?.weekStart || '2026').slice(0,4)}-${String(MONTHS.indexOf(label.slice(0,3)) + 1).padStart(2,'0')}-${String(parseInt(label.slice(4),10)).padStart(2,'0')}`;      // 'Sep 28' -> 2026-09-28
export let ctLocPer = null;                                                           // fiscal period shown in the periodic Location Wise table (default: the latest one)
document.getElementById('ctLoc').addEventListener('change', e => { if(e.target.id !== 'ctLocPer') return; ctLocPer = e.target.value; renderCatering(); });
export function ctLocPeriods(){                                                       // the weekly Location Wise blocks grouped into fiscal periods: counts summed per location
  const WK = (DATA.catering || {}).locationWeeks || [], by = new Map(), KEYS = ['calls','connected','over90','emails','opens','mqls','mqlFup'];
  WK.forEach(b => { const f = fiscalOf(ctIso(b.week)), k = f ? f.fy + '-' + f.period : b.week; if(!by.has(k)) by.set(k, { f, blocks:[] }); by.get(k).blocks.push(b); });
  return [...by.entries()].map(([k, { f, blocks }]) => { const total = f ? Math.round(((toDate(f.pEnd) - toDate(f.pStart)) / 864e5 + 1) / 7) : blocks.length;
    const names = Object.keys(blocks[0].locations), sum = (get) => Object.fromEntries(KEYS.map(key => [key, blocks.reduce((a, b) => a + (get(b)[key] || 0), 0)]));
    const locations = Object.fromEntries(names.map(n => [n, sum(b => b.locations[n])]));
    return { key:k, label: f ? `Period ${f.period} (${blocks.length} of ${total} wks)` : blocks[0].week, weeks: blocks.map(b => b.week), locations, total: sum(b => b.total) }; });
}
export function ctPeriodRows(){                                                       // weeks of the Outbound sheet grouped into fiscal periods (4-4-5 calendar); counts are summed, rates recomputed from the sums
  const W = (DATA.catering || {}).weeks || [], yr = (DATA.weekly?.meta?.weekStart || '2026').slice(0,4), by = new Map();
  W.forEach(w => { const iso = `${yr}-${String(MONTHS.indexOf(w.week.slice(0,3)) + 1).padStart(2,'0')}-${String(parseInt(w.week.slice(4),10)).padStart(2,'0')}`, f = fiscalOf(iso);
    const k = f ? f.fy + '-' + f.period : w.week; if(!by.has(k)) by.set(k, { f, rows:[] }); by.get(k).rows.push({ ...w, valuePaid: w.valuePaid ?? (w.ordersPaid === 0 ? 0 : null) }); });
  const num = (rows, key) => rows.some(r => r[key] != null) ? rows.reduce((a, r) => a + (r[key] || 0), 0) : null;
  return [...by.values()].map(({ f, rows }) => { const total = f ? Math.round(((toDate(f.pEnd) - toDate(f.pStart)) / 864e5 + 1) / 7) : rows.length, o = { period: f ? f.period : null, n: rows.length, total };
    ['calls','connected','over90','emails','opens','mqls','mqlFup','ordersPaid','valuePaid'].forEach(key => o[key] = num(rows, key));
    o.week = f ? `Period ${f.period}${rows.length < total ? ` (${rows.length} of ${total} wks)` : ''}` : rows[0].week; o.short = f ? 'P' + f.period : rows[0].week; return o; });
}
export function renderCatering(){
  const D = DATA.catering || {}, per = ctMode === 'periodic', W = per ? ctPeriodRows() : (D.weeks || []), last5 = per ? W : W.slice(-5), cur = W[W.length-1] || {};
  const lab = l => per ? l.replace('/ Week', '/ Period') : l;
  document.getElementById('ctEyebrow').textContent = per ? 'PoP - Catering Trend - Outbound' : 'WoW - Catering Trend - Outbound';
  const ctTotal = {};                                                                    // the Total column: counts and $ are summed over the weeks (periods) shown; the percentages are then recomputed from those sums
  ['calls','connected','over90','emails','opens','mqls','mqlFup','ordersPaid','valuePaid'].forEach(k => ctTotal[k] = W.some(w => w[k] != null) ? W.reduce((a, w) => a + (w[k] || 0), 0) : null);
  document.getElementById('ctMetrics').innerHTML = W.length ? ctTable('Outbound Catering Team - Input & Output Metrics', per ? 'Fiscal periods (4-4-5 calendar). Counts are the sum of the weeks in each period; percentages are recalculated from those sums. Blank paid values count as $0 when there were no paid orders.' : '',
    ['Metrics', ...W.map(w => per ? w.week : 'Week of '+w.week), 'Total'],
    CT_TABLE.map(([label,key,kind]) => [lab(label), ...W.map(w => ctFmt(ctVal(w,key),kind)), ctFmt(ctVal(ctTotal,key),kind)]), W.length) : '';

  ctCharts.forEach(({key,kind,label,h3,chart}) => { h3.textContent = per ? `Period Trend - ${lab(label)}` : `5-Week Trend - ${label}`;
    chart.data.labels = last5.map(w => per ? w.short : 'Wk '+w.week); chart.data.datasets[0].data = last5.map(w => ctVal(w,key)); chart.update(); });


  const LP = per ? ctLocPeriods() : [], LS = per ? (LP.find(x => x.key === ctLocPer) || LP[LP.length-1]) : null; if(per && LS) ctLocPer = LS.key;
  const L = per ? (LS || {}) : (D.location || {}), names = Object.keys(L.locations||{}), T = L.total || {};
  const mix = (v,t) => v!=null && t ? `<span class="pc">${(v/t*100).toFixed(1)}%</span>` : '';
  const cnt = (key) => [ ...names.map(n => ctFmt(L.locations[n][key],'n') + mix(L.locations[n][key], T[key])), ctFmt(T[key],'n') ];
  const pct = (a,b) => [ ...names.map(n => ctFmt(L.locations[n][b] ? L.locations[n][a]/L.locations[n][b]*100 : null,'p')), ctFmt(T[b] ? T[a]/T[b]*100 : null,'p') ];
  document.getElementById('ctLoc').innerHTML = names.length ? ctTable('Catering - Location Wise Metrics', per ? `${L.label}: weeks of ${L.weeks.join(', ')} · share of total shown under each count` : `Week of ${L.week} · share of total shown under each count`,
    ['Metrics', ...names, 'Total'],
    [[lab('# Calls / Week'), ...cnt('calls')], ['# Calls Connected', ...cnt('connected')], ['% Calls Connected', ...pct('connected','calls')],
     ['# Calls ≥ 90 sec', ...cnt('over90')], ['% of calls ≥ 90 sec', ...pct('over90','connected')],
     [lab('# Emails / Week'), ...cnt('emails')], ['# Opens', ...cnt('opens')], ['MQLs', ...cnt('mqls')], ['MQLs with a FUP date', ...cnt('mqlFup')]], 'last',
    per ? `<select class="sel" id="ctLocPer">${LP.map(x => `<option value="${x.key}" ${x.key === L.key ? 'selected' : ''}>${x.label}</option>`).join('')}</select>` : '') : '';
}

