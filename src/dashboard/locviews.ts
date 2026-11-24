// @ts-nocheck
/* eslint-disable */
/* =========================================================================
   LOCATION LOGINS: Reviews & Ratings, 3rd Party Delivery and Loyalty
   The shared tabs are built for comparing seven restaurants; with one restaurant they would be a table with a single row.
   For a location login these three tabs are drawn as one-restaurant pages instead: tiles, charts and "vs the Company" rows.
   Same figures as the shared tabs (same data, same sums); company totals come from BOOT.company (totals only).
   Admin and Client logins never reach this file's output.
   ========================================================================= */
import { BOOT, Chart, DATA, LOCATIONS, MONTHS, PERIODS, css, grid, money, pct, pill, varPct, view, weekLabels } from './core';
import { RW_COL, RW_INTEG, RW_ORDER, rwRows, rwStats } from './reviews';
import { T_m0, T_ms, T_n, T_p1, WAIT_BAD, WAIT_GOOD, div, noOther, tpTable, vp } from './tpd';
import { LY_C, nfmt, pf1, usd0 } from './loyalty';
import { CHANNELS, donutLabels, renderRevenue } from './revenue';
import { render as renderShared } from './overview';
import { locCalc, locSel } from './location';

const CO = BOOT.company || null;
const PUR = '#9f7cef', GREY = '#9ca3af';
const STAR_COL = ['#86efac', '#bbf7d0', '#fcd34d', '#fdba74', '#fca5a5'];        // 5 stars (green) ... 1 star (red)
const f2n = v => v == null ? 'NA' : v.toFixed(2);
const arrow = v => v == null ? '' : v >= 0 ? '▲' : '▼';
const chip = (t, tone) => `<span class="lc-chip ${tone}">${t}</span>`;
const varChip = (v, tail) => v == null ? chip('no LY', 'info') : chip(`${arrow(v)} ${pct(v)}${tail || ''}`, v >= 0 ? 'pos' : 'neg');
const delta2 = (d, tail) => d == null ? '' : chip(`${d >= 0 ? '▲ +' + d.toFixed(2) : '▼ (' + Math.abs(d).toFixed(2) + ')'}${tail || ''}`, d >= 0 ? 'pos' : 'neg');
const stars = r => `<span class="lc-stars" title="${r == null ? 'No rating' : r.toFixed(2) + ' out of 5 stars'}" style="--p:${r == null ? 0 : r / 5 * 100}%">★★★★★</span>`;
const tt = x => String(x).replace(/<.*?>/g, '').replace(/"/g, '&quot;');
const shortDate = iso => { const d = new Date(iso + 'T00:00:00Z'); return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`; };

const charts = {};
function chart(id, cfg) {
  const el = document.getElementById(id); if (!el) return;
  if (charts[id]) charts[id].destroy();
  charts[id] = new Chart(el, cfg);
}
function host(viewId) {
  const v = document.getElementById('view-' + viewId);
  v.classList.add('locmode');
  let h = v.querySelector(':scope > .lv');
  if (!h) { h = document.createElement('div'); h.className = 'lv'; v.appendChild(h); }
  return h;
}
const bar = (title, sub, right) => `<div class="lv-bar"><div><span class="eyebrow" style="margin:0">${title}</span><div class="muted-line" style="margin:2px 0 0">${sub}</div></div>${right || ''}</div>`;
const panel = (title, body, key) => `<section class="card panel"><div class="panel-h"><span class="t-title">${title}</span>${key ? `<span class="lc-key">${key}</span>` : ''}</div>${body}</section>`;
const tile = (k, v, extra) => `<div class="lc-tile"><div class="k">${k}</div><div class="v">${v}</div>${extra || ''}</div>`;
const wk = () => { const w = weekLabels(DATA.weekly?.meta?.weekStart); return `Week ${w.no} (${w.range})`; };

/** one row: this restaurant's bar against the company tick, value coloured by better / worse than the company */
function vsRow(label, v, c, fmt, best, opts = {}) {
  const nul = v == null || isNaN(v) || !isFinite(v), cn = c == null || isNaN(c) || !isFinite(c);
  const good = nul || cn ? null : (best === 'high' ? v >= c : v <= c), col = good == null ? '#9ca3af' : good ? '#86efac' : '#ef4444';
  const sc = opts.max || Math.max((c || 0) * 2, (v || 0) * 1.1, 0.001);
  const tip = tt(`${locSel}: ${nul ? '-' : fmt(v)}. All Locations: ${cn ? '-' : fmt(c)}`);
  return `<div class="lc-vr"><div class="lb">${label}${opts.hint ? `<small>${opts.hint}</small>` : ''}</div><div class="trk" title="${tip}"><div class="fill" style="left:0;width:${nul ? 0 : Math.min(100, Math.max(0, v) / sc * 100)}%;background:${PUR}"></div>${cn ? '' : `<b class="tick" style="left:${Math.min(100, Math.max(0, c) / sc * 100)}%"></b>`}</div><div class="val" style="color:${col}">${nul ? '-' : fmt(v)}</div><div class="co">All Locations ${cn ? '-' : fmt(c)}</div></div>`;
}
const vsKey = () => `<u class="a"></u>${locSel}<u class="co"></u>All Locations`;

/* =============================== REVIEWS & RATINGS =============================== */
// Same page structure as the shared Reviews tab: filter row, one KPI card per platform, table card, chart cards.
let rvDays = '7', rvMode = 'overall';
const RV_MODES = [['overall', 'Overall'], ['Google', 'Google'], ['Yelp', 'Yelp'], ['Uber Eats', 'Uber Eats'], ['DoorDash', 'DoorDash']];
const RV_WEEKS = { '7': 4, '30': 5, '90': 13 };
const LOC_COL = '#9f7cef', ALL_COL = 'rgba(209,213,219,0.7)';
const coRows = (days) => {
  const R = CO?.reviews || {};
  if (days === '30') return { cur: R.so30 || [], prev: null };
  const rows = R.so7_90 || [];
  if (days === '90') return { cur: rows, prev: null };
  const ws = [...new Set(rows.map(r => r[2]))].sort(), last = ws[ws.length - 1], pw = ws[ws.length - 2];
  return { cur: rows.filter(r => r[2] === last), prev: pw ? rows.filter(r => r[2] === pw) : null };
};
const starRating = rows => { const s = [0, 0, 0, 0, 0]; rows.forEach(r => { for (let i = 0; i < 5; i++) s[i] += r[3 + i]; }); const n = s.reduce((a, b) => a + b, 0); return n ? (5 * s[0] + 4 * s[1] + 3 * s[2] + 2 * s[3] + s[4]) / n : null; };
const kcard = (k, v, d) => `<div class="card kpi"><div class="k">${k}</div><div class="v">${v}</div><div class="d">${d}</div></div>`;
const dlBtn = (id, what) => `<button class="dl" title="Download ${what}"${id ? ` data-dl="${id}"` : ''}>⤓</button>`;
const chartCard = (title, id, right) => `<section class="card panel"><div class="panel-h"><h3>${title}</h3><span style="display:flex;gap:10px;align-items:center">${right || ''}${dlBtn(id, 'chart')}</span></div><div class="chartbox"><canvas id="${id}"></canvas></div></section>`;
const segHtml = (id, items, cur, attr) => `<div class="seg" id="${id}" style="margin:0">${items.map(([k, l]) => `<button ${attr}="${k}" class="${k === cur ? 'on' : ''}">${l}</button>`).join('')}</div>`;
function wireDownloads(h) {
  h.querySelectorAll('.dl[data-dl]').forEach(b => b.addEventListener('click', () => { const c = document.getElementById(b.dataset.dl), a = document.createElement('a'); a.href = c.toDataURL('image/png'); a.download = b.dataset.dl + '.png'; a.click(); }));
  h.querySelectorAll('.dl:not([data-dl])').forEach(b => b.addEventListener('click', () => {
    const t = b.closest('.panel').querySelector('table'); if (!t) return;
    const csv = [...t.querySelectorAll('tr')].map(r => [...r.children].map(c => '"' + c.textContent.replace(/"/g, '""').trim() + '"').join(',')).join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = 'reviews.csv'; a.click();
  }));
}

function renderReviews() {
  const loc = locSel, h = host('reviews'), lw = rvDays === '7', D = { '7': '7 Days', '30': '30 Days', '90': '90 Days' }[rvDays];
  const connected = RW_ORDER.filter(p => (RW_INTEG[p] || []).includes(loc));
  rvMode = 'overall';   // one page with everything: no platform filter
  const overall = rvMode === 'overall', plats = overall ? connected : [rvMode];
  const R = rwRows(rvDays), cur = R.cur.filter(r => r[1] === loc), prev = R.prev ? R.prev.filter(r => r[1] === loc) : null, C = coRows(rvDays);
  const delta = (a, b) => !lw ? '' : (a == null || b == null) ? '<span>- vs LW</span>' : `<span style="color:${a - b >= 0 ? '#16a34a' : '#dc2626'}">${a - b >= 0 ? '+' + (a - b).toFixed(2) : '(' + Math.abs(a - b).toFixed(2) + ')'} vs LW</span>`;
  const sub = (...p) => p.filter(Boolean).join('<br>');
  const platKpi = p => { const x = rwStats(cur, [p], loc), pv = prev ? rwStats(prev, [p], loc) : null, c = rwStats(C.cur, [p], null);
    return kcard(`${p} Avg Rating`, f2n(x.rating), sub(delta(x.rating, pv?.rating), `${x.n} review${x.n === 1 ? '' : 's'}`, `All Locations ${f2n(c.rating)}`)); };
  const all = rwStats(cur, plats, loc), co = rwStats(C.cur, plats, null);
  const share = (a, n) => n ? (a / n * 100).toFixed(1) + '%' : '-';
  const kpis = overall ? plats.map(platKpi).join('') :
    platKpi(rvMode) +
    kcard('5-Star Reviews', all.s[0].toLocaleString('en-US'), sub(`${share(all.s[0], all.n)} of ${loc}'s reviews`, `All Locations ${share(co.s[0], co.n)}`)) +
    kcard('1 and 2 Star Reviews', String(all.s[3] + all.s[4]), sub(`${share(all.s[3] + all.s[4], all.n)} of ${loc}'s reviews`, `All Locations ${share(co.s[3] + co.s[4], co.n)}`));

  // table: one row per platform (Overall) or one row per week (single platform)
  const mineAll = (DATA.reviews?.so7_90 || []).filter(r => r[1] === loc), coAll = (CO?.reviews?.so7_90 || []);
  const weeks = [...new Set(mineAll.map(r => r[2]))].sort().slice(-RV_WEEKS[rvDays]);
  const starCells = s => s.map(v => `<td>${v}</td>`).join('');
  let head, body, title;
  if (overall) {
    title = `Reviews & Ratings by Platform (${D})`;
    head = `<tr><th>Platform</th><th>Rating</th><th>All Locations Rating</th><th># Reviews</th>${lw ? '<th>vs LW</th>' : ''}<th>5★</th><th>4★</th><th>3★</th><th>2★</th><th>1★</th></tr>`;
    const row = (name, x, pv, c, cls) => { const d = lw && x.rating != null && pv?.rating != null ? x.rating - pv.rating : null;
      return `<tr class="${cls || ''}"><td>${name}</td><td>${f2n(x.rating)}</td><td>${f2n(c.rating)}</td><td>${x.n}</td>${lw ? `<td>${d == null ? '-' : d >= 0 ? '+' + d.toFixed(2) : '(' + Math.abs(d).toFixed(2) + ')'}</td>` : ''}${starCells(x.s)}</tr>`; };
    body = connected.map(p => row(p, rwStats(cur, [p], loc), prev ? rwStats(prev, [p], loc) : null, rwStats(C.cur, [p], null))).join('') + row('All Platforms', rwStats(cur, connected, loc), prev ? rwStats(prev, connected, loc) : null, rwStats(C.cur, connected, null), 'tot');
  } else {
    title = `${rvMode} Reviews by Week`;
    head = `<tr><th>Week</th><th>Rating</th><th>All Locations Rating</th><th># Reviews</th><th>5★</th><th>4★</th><th>3★</th><th>2★</th><th>1★</th></tr>`;
    body = [...weeks].reverse().map(w => { const x = rwStats(mineAll.filter(r => r[2] === w), [rvMode], loc), c = rwStats(coAll.filter(r => r[2] === w), [rvMode], null);
      return `<tr><td>${shortDate(w)}</td><td>${f2n(x.rating)}</td><td>${f2n(c.rating)}</td><td>${x.n}</td>${starCells(x.s)}</tr>`; }).join('');
  }

  const showTrend = overall && rvDays !== '7';   // a trend needs more than the current week
  const trendCard = showTrend ? `<section class="card panel"><div class="panel-h"><h3>Rating Trend by Week (last ${RV_WEEKS[rvDays]} weeks)</h3>${dlBtn('lvRvTrend', 'chart')}</div><div class="chartbox"><canvas id="lvRvTrend"></canvas></div></section>` : '';
  h.innerHTML = `<div class="filters" style="justify-content:space-between"><span class="eyebrow" style="margin:0">Reviews · ${loc}</span><div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;justify-content:flex-end">${segHtml('lvRvDays', [['7', '7 Days'], ['30', '30 Days'], ['90', '90 Days']], rvDays, 'data-d')}</div></div>` +
    `<section class="kpis" style="grid-template-columns:repeat(auto-fit,minmax(240px,1fr))">${kpis}</section>` +
    `<section class="card panel"><div class="panel-h"><span class="t-title">${title}</span>${dlBtn(null, 'table')}</div><div class="tablewrap"><table class="ctr"><thead>${head}</thead><tbody>${body}</tbody></table></div></section>` +
    `<div class="ov-two">${chartCard(overall ? `Avg Rating by Platform (${D})` : `${rvMode} Avg Rating by Week`, 'lvRvAvg')}${chartCard(overall ? `Star Distribution by Platform (${D})` : `Star Distribution - ${rvMode} (${D})`, 'lvRvStars')}</div>` + trendCard;
  h.querySelector('#lvRvDays').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; rvDays = b.dataset.d; renderReviews(); });
  wireDownloads(h);

  const axes = (extra) => ({ y: { beginAtZero: true, grid: grid(), ticks: { color: css('--muted'), ...extra } }, x: { grid: grid(), ticks: { color: css('--muted') } } });
  const legend = { position: 'bottom', labels: { boxWidth: 36, boxHeight: 12, color: css('--muted') } };
  // average rating: this restaurant against all locations
  const avgLabels = overall ? plats : weeks.map(shortDate);
  const avgMine = overall ? plats.map(p => rwStats(cur, [p], loc).rating) : weeks.map(w => rwStats(mineAll.filter(r => r[2] === w), [rvMode], loc).rating);
  const avgAll = overall ? plats.map(p => rwStats(C.cur, [p], null).rating) : weeks.map(w => rwStats(coAll.filter(r => r[2] === w), [rvMode], null).rating);
  chart('lvRvAvg', { type: 'bar', data: { labels: avgLabels, datasets: [{ label: loc, data: avgMine, backgroundColor: LOC_COL, borderRadius: 4 }, { label: 'All Locations', data: avgAll, backgroundColor: ALL_COL, borderRadius: 4 }] },
    options: { maintainAspectRatio: false, plugins: { legend, tooltip: { callbacks: { label: c => `${c.dataset.label}: ${c.parsed.y == null ? '-' : c.parsed.y.toFixed(2)}` } } }, scales: { x: axes().x, y: { min: 1, max: 5, grid: grid(), ticks: { color: css('--muted'), stepSize: 1 } } } } });
  // star distribution (counts)
  chart('lvRvStars', { type: 'bar', data: { labels: ['5 Star', '4 Star', '3 Star', '2 Star', '1 Star'], datasets: overall
      ? plats.map((p, i) => ({ label: p, backgroundColor: ['#9f7cef', 'rgba(209,213,219,0.7)', '#93c5fd', '#f9a8d4'][i % 4], borderRadius: 4, data: rwStats(cur, [p], loc).s }))
      : [{ label: loc, backgroundColor: LOC_COL, borderRadius: 4, data: rwStats(cur, plats, loc).s }] },
    options: { maintainAspectRatio: false, plugins: { legend }, scales: axes({ precision: 0 }) } });
  if (showTrend) {
    const mineW = weeks.map(w => starRating(mineAll.filter(r => r[2] === w && plats.includes(r[0])))), coW = weeks.map(w => starRating(coAll.filter(r => r[2] === w && plats.includes(r[0]))));
    const vals = [...mineW, ...coW].filter(v => v != null), lo = vals.length ? Math.max(1, Math.floor((Math.min(...vals) - 0.2) * 2) / 2) : 1;
    chart('lvRvTrend', { type: 'line', data: { labels: weeks.map(shortDate), datasets: [
      { label: loc, data: mineW, borderColor: LOC_COL, backgroundColor: LOC_COL, tension: .3, pointRadius: 4, borderWidth: 2.5, spanGaps: true },
      { label: 'All Locations', data: coW, borderColor: '#9ca3af', backgroundColor: '#9ca3af', tension: .3, pointRadius: 3, borderWidth: 2, spanGaps: true }] },
      options: { maintainAspectRatio: false, plugins: { legend, tooltip: { callbacks: { label: c => `${c.dataset.label}: ${c.parsed.y == null ? '-' : c.parsed.y.toFixed(2)}` } } },
        scales: { y: { min: lo, max: 5, grid: grid(), ticks: { color: css('--muted'), stepSize: .5 } }, x: { grid: grid(), ticks: { color: css('--muted') } } } } });
  }
}

/* =============================== 3RD PARTY DELIVERY =============================== */
// Uber Eats is purple and DoorDash is blue on this whole page. Layout like the shared tabs: KPI cards, chart cards, table cards.
const UE_COL = '#9f7cef', DD_COL = '#93c5fd';
function renderTpdLoc() {
  const loc = locSel, h = host('tpd'), c = locCalc(loc), co = locCalc('All Locations'), ue = c.ue, dd = c.dd;
  const sales = (ue.sales || 0) + (dd.sales || 0), orders = (ue.orders || 0) + (dd.orders || 0), payout = (ue.payout || 0) + (dd.payout || 0);
  const coSales = (co.ue.sales || 0) + (co.dd.sales || 0), coPay = (co.ue.payout || 0) + (co.dd.payout || 0);
  const keep = sales ? payout / sales * 100 : null, coKeep = coSales ? coPay / coSales * 100 : null, aov = orders ? sales / orders : null;
  const coOrders = (co.ue.orders || 0) + (co.dd.orders || 0), coAov = coOrders ? coSales / coOrders : null;
  const dot = col => `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${col};margin-right:6px"></span>`;
  const tot = sales || 1;
  // a purple / blue split line for any pair of Uber Eats / DoorDash values, with the values listed under it
  const split = (a, b, fmt) => { const t = (a || 0) + (b || 0) || 1; return `<div class="lc-split" style="margin:2px 0 8px"><i title="Uber Eats: ${fmt(a)}" style="width:${(a || 0) / t * 100}%;background:${UE_COL}"></i><i title="DoorDash: ${fmt(b)}" style="width:${(b || 0) / t * 100}%;background:${DD_COL}"></i></div>${dot(UE_COL)}Uber Eats ${fmt(a)}<br>${dot(DD_COL)}DoorDash ${fmt(b)}`; };
  const kpis = `<section class="kpis" style="grid-template-columns:repeat(auto-fit,minmax(240px,1fr))">
    ${kcard('Delivery App Sales', money(sales), split(ue.sales, dd.sales, money))}
    ${kcard('Orders', nfmt(orders), split(ue.orders, dd.orders, nfmt))}
    ${kcard('Average Order', money(aov), `${split(ue.aov, dd.aov, money)}<br>All Locations ${money(coAov)}`)}
    ${kcard(`${loc} Keeps`, `${money(payout)}${keep == null ? '' : ` (${keep.toFixed(1)}%)`}`, `${split(ue.payout, dd.payout, money)}<br>All Locations ${coKeep == null ? '-' : coKeep.toFixed(1) + '%'}`)}
  </section>`;

  // table: this restaurant against all locations, side by side for each app; the restaurant's figure is green when better, red when worse
  const t = v => String(v).replace(/<.*?>/g, '');
  const wait = v => (v == null || isNaN(v)) ? '-' : t(T_ms(v)), pc = v => t(T_p1(v)), mon = v => v == null || isNaN(v) ? '-' : money(v), cnt = v => v == null || isNaN(v) ? '-' : nfmt(v), x2 = v => v == null || !isFinite(v) ? '-' : v.toFixed(2) + '×';
  const ok = v => v != null && !isNaN(v) && isFinite(v);
  const cell = (a, b, fmt, best) => ok(a) && ok(b) && best ? vp(fmt(a), (best === 'high' ? a >= b : a <= b) ? 'pos' : 'neg') : fmt(a);
  // one small table per app (3 columns each) instead of one wide 5-column table
  const rowsFor = (a, A, withRoas) => {
    const r = (label, key, fmt, best) => [label, cell(a[key], A[key], fmt, best), fmt(A[key])];
    return [r('Sales', 'sales', mon), r('Orders', 'orders', cnt), r('Average Order', 'aov', mon), r('Net Payout', 'payout', mon),
      r('Avoidable Wait', 'avoid', wait, 'low'), r('Courier Wait', 'wait', wait, 'low'), r('Order Errors', 'err', pc, 'low'), r('Store Uptime', 'up', pc, 'high'),
      ...(withRoas ? [r('Promo ROAS', 'promo', x2, 'high'), r('Sponsor ROAS', 'spons', x2, 'high')] : [])];
  };
  const table = `<div class="ov-two">${tpTable(`${dot(UE_COL)}Uber Eats: ${loc} vs All Locations`, ['Metric', loc, 'All Locations'], rowsFor(ue, co.ue, false), null)}${tpTable(`${dot(DD_COL)}DoorDash: ${loc} vs All Locations`, ['Metric', loc, 'All Locations'], rowsFor(dd, co.dd, true), null)}</div>`;

  const tags = d => { const l = (d.top || '').split(',').map(x => x.trim()).filter(Boolean); return l.length ? `<div class="lc-tags" style="margin-top:0">${l.map(x => `<span class="lc-tag">${x}</span>`).join('')}</div>` : '<span class="mut" style="font-size:12px">No complaint themes this week</span>'; };
  const complaints = `<section class="card panel"><div class="panel-h"><span class="t-title">Top Complaints</span></div><div class="ov-two" style="margin:0">
    <div><div class="lv-h4" style="margin-top:0">${dot(UE_COL)}Uber Eats</div>${tags(ue)}</div><div><div class="lv-h4" style="margin-top:0">${dot(DD_COL)}DoorDash</div>${tags(dd)}</div></div></section>`;

  h.innerHTML = `<div class="filters" style="justify-content:space-between"><span class="eyebrow" style="margin:0">3rd Party Delivery · ${loc}</span></div>` + kpis +
    `<div class="ov-two">${chartCard('Sales and Payout by App', 'lvTpSales')}${chartCard('Orders by App', 'lvTpOrders')}</div>` + table + complaints;
  wireDownloads(h);

  const legend = { position: 'bottom', labels: { boxWidth: 36, boxHeight: 12, color: css('--muted') } };
  chart('lvTpSales', { type: 'bar', data: { labels: ['Sales', 'Net payout'], datasets: [
    { label: 'Uber Eats', data: [ue.sales || 0, ue.payout || 0], backgroundColor: UE_COL, borderRadius: 4 }, { label: 'DoorDash', data: [dd.sales || 0, dd.payout || 0], backgroundColor: DD_COL, borderRadius: 4 }] },
    options: { maintainAspectRatio: false, plugins: { legend, tooltip: { callbacks: { label: c => `${c.dataset.label}: ${money(c.parsed.y)}` } } },
      scales: { y: { beginAtZero: true, grid: grid(), ticks: { color: css('--muted'), callback: v => '$' + v.toLocaleString('en-US') } }, x: { grid: grid(), ticks: { color: css('--muted') } } } } });
  chart('lvTpOrders', { type: 'doughnut', plugins: [donutLabels], data: { labels: ['Uber Eats', 'DoorDash'], datasets: [{ data: [ue.orders || 0, dd.orders || 0], backgroundColor: [UE_COL, DD_COL], borderWidth: 2, borderColor: '#fff' }] },
    options: { maintainAspectRatio: false, cutout: '55%', plugins: { legend, tooltip: { callbacks: { label: c => `${c.label}: ${c.parsed} orders` } } } } });
}

/* =============================== LOYALTY =============================== */
// App is purple and Web is blue, as on the shared Loyalty tab. Layout like the shared tabs: KPI cards, chart cards, table card.
function renderLoyaltyLoc() {
  const loc = locSel, h = host('loyalty'), c = locCalc(loc), co = locCalc('All Locations'), L = c.ly, K = co.ly;
  const raw = DATA.loyalty?.locations?.[loc] || {}, craw = CO?.loyalty || {};
  const app = L.newApp || 0, web = L.newWeb || 0, nm = L.newMembers || 0, oth = Math.max(0, nm - app - web);
  const pa = nm ? app / nm * 100 : null, pw = nm ? web / nm * 100 : null, cApp = craw.newMembers ? (craw.newApp || 0) / craw.newMembers * 100 : null, cWeb = craw.newMembers ? (craw.newWeb || 0) / craw.newMembers * 100 : null;
  const act = raw.totalMembers ? raw.activeMembers / raw.totalMembers * 100 : null, cAct = craw.totalMembers ? craw.activeMembers / craw.totalMembers * 100 : null;
  const per1k = raw.totalMembers ? nm / raw.totalMembers * 1000 : null, cPer1k = craw.totalMembers ? craw.newMembers / craw.totalMembers * 1000 : null;
  const dot = col => `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${col};margin-right:6px"></span>`;
  const vTxt = L.v == null ? '- vs prior period' : `<span style="color:${L.v >= 0 ? '#16a34a' : '#dc2626'}">${pf1(L.v)} vs prior period</span>`;

  const kpis = `<section class="kpis" style="grid-template-columns:repeat(auto-fit,minmax(240px,1fr))">
    ${kcard('AppFront Sales', usd0(L.sales), `${vTxt}<br>${L.share == null ? '-' : L.share.toFixed(1) + '% of net sales'}`)}
    ${kcard('New Members', nfmt(nm), `${dot(LY_C.app)}App ${nfmt(app)}<br>${dot(LY_C.web)}Web ${nfmt(web)}`)}
    ${kcard('Total Members', nfmt(raw.totalMembers), `${raw.totalUsers ? nfmt(raw.totalUsers) + ' app users<br>' : ''}${pf1(L.loyaltyPct)} of users are members`)}
    ${kcard('Active Members', nfmt(raw.activeMembers), `${act == null ? '-' : act.toFixed(1) + '% of members'}<br>All Locations ${cAct == null ? '-' : cAct.toFixed(1) + '%'}`)}
  </section>`;

  const ok = v => v != null && !isNaN(v) && isFinite(v);
  const good = (a, b, fmt) => ok(a) && ok(b) ? vp(fmt(a), a >= b ? 'pos' : 'neg') : fmt(a);
  const one = v => ok(v) ? v.toFixed(1) : '-';
  const rows = [
    ['AppFront Sales', usd0(L.sales), usd0(K.sales)],
    ['Var % vs Prior Period', L.v == null ? '-' : vp(pf1(L.v), L.v >= 0 ? 'pos' : 'neg'), K.v == null ? '-' : vp(pf1(K.v), K.v >= 0 ? 'pos' : 'neg')],
    ['AppFront % of Net Sales', good(L.share, K.share, pf1), pf1(K.share)],
    ['Total Members', nfmt(raw.totalMembers), nfmt(craw.totalMembers)],
    ['Active Members', nfmt(raw.activeMembers), nfmt(craw.activeMembers)],
    ['Active % of Members', good(act, cAct, pf1), pf1(cAct)],
    ['Loyalty % (Members / Users)', good(L.loyaltyPct, K.loyaltyPct, pf1), pf1(K.loyaltyPct)],
    ['New Members', nfmt(nm), nfmt(craw.newMembers)],
    ['New via App', `${nfmt(app)} (${pf1(pa)})`, `${nfmt(craw.newApp)} (${pf1(cApp)})`],
    ['New via Web', `${nfmt(web)} (${pf1(pw)})`, `${nfmt(craw.newWeb)} (${pf1(cWeb)})`],
    ['New Members per 1,000 Members', good(per1k, cPer1k, one), one(cPer1k)]];
  const table = tpTable(`${loc} vs All Locations`, ['Metric', loc, 'All Locations'], rows, null);

  h.innerHTML = `<div class="filters" style="justify-content:space-between"><span class="eyebrow" style="margin:0">Loyalty · ${loc}</span></div>` + kpis +
    `<div class="ov-two">${chartCard('How New Members Joined', 'lvLyMix')}${chartCard('Rates vs All Locations', 'lvLyBase')}</div>` + table;
  wireDownloads(h);

  const legend = { position: 'bottom', labels: { boxWidth: 36, boxHeight: 12, color: css('--muted') } };
  chart('lvLyMix', { type: 'doughnut', plugins: [donutLabels], data: { labels: ['App', 'Web', 'Other / unattributed'], datasets: [{ data: [app, web, oth], backgroundColor: [LY_C.app, LY_C.web, LY_C.other], borderWidth: 2, borderColor: '#fff' }] },
    options: { maintainAspectRatio: false, cutout: '55%', plugins: { legend, tooltip: { callbacks: { label: c => `${c.label}: ${c.parsed} new members` } } } } });
  const rl = ['Loyalty % (members / users)', 'Active % of members', 'New members via app %', 'AppFront % of net sales'];
  chart('lvLyBase', { type: 'bar', data: { labels: rl, datasets: [
    { label: loc, data: [L.loyaltyPct, act, pa, L.share], backgroundColor: LY_C.app, borderRadius: 4 }, { label: 'All Locations', data: [K.loyaltyPct, cAct, cApp, K.share], backgroundColor: 'rgba(209,213,219,0.7)', borderRadius: 4 }] },
    options: { maintainAspectRatio: false, plugins: { legend, tooltip: { callbacks: { label: c => c.dataset.label + ': ' + (c.parsed.y == null ? '-' : c.parsed.y.toFixed(1) + '%') } } },
      scales: { y: { beginAtZero: true, grid: grid(), ticks: { color: css('--muted'), callback: v => v + '%' } }, x: { grid: grid(), ticks: { color: css('--muted') } } } } });
}

/* =============================== CATERING =============================== */
// Catering outreach for this restaurant (calls, emails, MQLs) against all locations. Same structure as the other pages.
function renderCateringLoc() {
  const loc = locSel, h = host('catering'), CL = DATA.catering?.location || {}, mine = CL.locations?.[loc] || null, all = CO?.catering?.total || null;
  const head = `<div class="filters" style="justify-content:space-between"><span class="eyebrow" style="margin:0">Catering · ${loc}</span><span class="muted-line" style="margin:0">Outreach week of ${CL.week || '-'}</span></div>`;
  if (!mine) { h.innerHTML = head + `<section class="card panel"><div class="lc-empty big">Catering outreach is not tracked at ${loc} in the outreach sheet.</div></section>`; return; }
  const pc = (x, y) => y ? x / y * 100 : null, ok = v => v != null && !isNaN(v) && isFinite(v);
  const share = (x, y) => ok(pc(x, y)) ? pc(x, y).toFixed(1) + '%' : '-';
  const rates = d => d ? { conn: pc(d.connected, d.calls), o90: pc(d.over90, d.connected), open: pc(d.opens, d.emails), fup: pc(d.mqlFup, d.mqls) } : {};
  const m = rates(mine), a = rates(all);
  const kpis = `<section class="kpis" style="grid-template-columns:repeat(auto-fit,minmax(240px,1fr))">
    ${kcard('Calls', nfmt(mine.calls), `${share(mine.calls, all?.calls)} of all locations' calls<br>All Locations ${nfmt(all?.calls)}`)}
    ${kcard('Calls Connected', nfmt(mine.connected), `${share(mine.connected, mine.calls)} connected<br>All Locations ${share(all?.connected, all?.calls)}`)}
    ${kcard('Emails Sent', nfmt(mine.emails), `${share(mine.opens, mine.emails)} opened<br>All Locations ${share(all?.opens, all?.emails)}`)}
    ${kcard('MQLs', nfmt(mine.mqls), `${share(mine.mqlFup, mine.mqls)} with a follow-up date<br>All Locations ${share(all?.mqlFup, all?.mqls)}`)}
  </section>`;

  const good = (x, y, fmt) => ok(x) && ok(y) ? vp(fmt(x), x >= y ? 'pos' : 'neg') : fmt(x);
  const p1 = v => ok(v) ? v.toFixed(1) + '%' : '-';
  const rows = [
    ['Calls', nfmt(mine.calls), nfmt(all?.calls)], ['Calls Connected', nfmt(mine.connected), nfmt(all?.connected)], ['% Calls Connected', good(m.conn, a.conn, p1), p1(a.conn)],
    ['Calls ≥ 90 sec', nfmt(mine.over90), nfmt(all?.over90)], ['% of Connected Calls ≥ 90 sec', good(m.o90, a.o90, p1), p1(a.o90)],
    ['Emails', nfmt(mine.emails), nfmt(all?.emails)], ['Opens', nfmt(mine.opens), nfmt(all?.opens)], ['Open Rate', good(m.open, a.open, p1), p1(a.open)],
    ['MQLs', nfmt(mine.mqls), nfmt(all?.mqls)], ['MQLs with a FUP Date', nfmt(mine.mqlFup), nfmt(all?.mqlFup)], ['% MQLs with a FUP Date', good(m.fup, a.fup, p1), p1(a.fup)]];
  const table = tpTable(`${loc} vs All Locations`, ['Metric', loc, 'All Locations'], rows, null);

  const wks = DATA.catering?.locationWeeks || [];
  h.innerHTML = head + kpis + `<div class="ov-two">${chartCard('Calls by Week', 'lvCtCalls')}${chartCard('MQLs by Week', 'lvCtMqls')}</div>` + table;
  wireDownloads(h);
  const line = (id, key, label) => chart(id, { type: 'line', data: { labels: wks.map(b => b.week), datasets: [{ label, data: wks.map(b => b.locations?.[loc]?.[key] ?? null), borderColor: LOC_COL, backgroundColor: 'rgba(159,124,239,0.12)', fill: true, tension: .3, pointRadius: 4, borderWidth: 2.5, spanGaps: true }] },
    options: { maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => `${label}: ${nfmt(c.parsed.y)}` } } },
      scales: { y: { beginAtZero: true, grid: grid(), ticks: { color: css('--muted'), precision: 0 } }, x: { grid: grid(), ticks: { color: css('--muted') } } } } });
  line('lvCtCalls', 'calls', 'Calls'); line('lvCtMqls', 'mqls', 'MQLs');
}

/* =============================== OVERVIEW =============================== */
// Overview for a location login: the restaurant's own scorecard. Sales follow the period filter; the other figures are this week's.
function renderOverviewLoc() {
  const loc = locSel, h = host('overview'), P = PERIODS.weekly, d = DATA.weekly || {}, c = locCalc(loc), co = locCalc('All Locations');
  const a = d.actual?.[loc], l = d.ly?.[loc], w = d.lw?.[loc], ca = d.actual?.['__company'], cl = d.ly?.['__company'];
  const vLY = varPct(a, l), vLW = varPct(a, w), cV = varPct(ca, cl);
  const wl = weekLabels(DATA.weekly?.meta?.weekStart);
  const dot = col => `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${col};margin-right:6px"></span>`;
  const rr = c.rAll.rating, dvr = rr != null && c.rAllPv?.rating != null ? rr - c.rAllPv.rating : null;
  const dRate = dvr == null ? '' : `<span style="color:${dvr >= 0 ? '#16a34a' : '#dc2626'}">${dvr >= 0 ? '+' + dvr.toFixed(2) : '(' + Math.abs(dvr).toFixed(2) + ')'} vs LW</span><br>`;
  const L = c.ly, ce = c.cat;
  const ok = v => v != null && !isNaN(v) && isFinite(v);
  const wait = v => ok(v) ? T_ms(v).replace(/<.*?>/g, '') : '-', p1 = v => ok(v) ? v.toFixed(1) + '%' : '-';

  const kpis = `<section class="kpis" style="grid-template-columns:repeat(3,minmax(0,1fr))">
    ${kcard(P.title, money(a), `Var%: ${pct(vLW)} vs LW`)}
    ${kcard('Growth vs Last Year', pct(vLY), `Last year ${money(l)}<br><span style="color:var(--muted)">All Locations ${pct(cV)}</span>`)}
    ${kcard('Guest Rating (7 Days)', f2n(rr), `<span class="lc-stars" title="${rr == null ? 'No rating' : rr.toFixed(2) + ' out of 5 stars'}" style="--p:${rr == null ? 0 : rr / 5 * 100}%">★★★★★</span><br>${dRate}${c.rAll.n} reviews<br>All Locations ${f2n(co.rAll.rating)}`)}
    ${kcard('Delivery App Sales (Week)', money(c.deliv), `${dot(UE_COL)}Uber Eats ${money(c.ue.sales)}<br>${dot(DD_COL)}DoorDash ${money(c.dd.sales)}`)}
    ${kcard('New Loyalty Members (Week)', nfmt(L.newMembers), `${dot(LY_C.app)}App ${nfmt(L.newApp)}<br>${dot(LY_C.web)}Web ${nfmt(L.newWeb)}`)}
    ${ce ? kcard('Catering MQLs (Week)', nfmt(ce.mqls), `${nfmt(ce.calls)} calls<br>${nfmt(ce.emails)} emails`) : ''}
  </section>`;

  // this restaurant against all locations (plain figures, no colour)
  const rows = [
    [`Sales Growth vs LY (${P.label})`, pct(vLY), pct(cV)],
    ['Guest Rating (7 Days)', f2n(rr), f2n(co.rAll.rating)],
    ['Uber Eats Avoidable Wait', wait(c.ue.avoid), wait(co.ue.avoid)], ['DoorDash Avoidable Wait', wait(c.dd.avoid), wait(co.dd.avoid)],
    ['Uber Eats Order Errors', p1(c.ue.err), p1(co.ue.err)], ['DoorDash Order Errors', p1(c.dd.err), p1(co.dd.err)],
    ['Loyalty % (Members / Users)', pf1(L.loyaltyPct), pf1(co.ly.loyaltyPct)]];
  const table = tpTable(`${loc} vs All Locations`, ['Metric', loc, 'All Locations'], rows, null);

  // sales by channel, for the chosen period
  const rev = d.rev?.[loc] || {}, chan = CHANNELS.map(ch => ({ name: ch.name, color: ch.color, a: ch.lines.reduce((s, x) => s + (rev.actual?.[x] || 0), 0), l: ch.lines.reduce((s, x) => s + (rev.ly?.[x] || 0), 0) })).filter(x => x.a || x.l);

  h.innerHTML = `<div class="filters" style="justify-content:space-between"><div><span class="eyebrow" style="margin:0">Overview · ${loc}</span><div class="muted-line" style="margin:2px 0 0">Week ${wl.no} (${wl.range})</div></div></div>` +
    kpis +
    `<div class="ov-two">${chartCard(`Revenue by Channel - ${P.label} vs LY`, 'lvOvChan')}${chartCard(`Actual Revenue Mix - ${P.label}`, 'lvOvMix')}</div>` +
    table;
  wireDownloads(h);

  const legend = { position: 'bottom', labels: { boxWidth: 36, boxHeight: 12, color: css('--muted') } };
  chart('lvOvChan', { type: 'bar', data: { labels: chan.map(x => x.name), datasets: [{ label: 'Actual', data: chan.map(x => x.a), backgroundColor: LOC_COL, borderRadius: 4 }, { label: 'LY', data: chan.map(x => x.l), backgroundColor: ALL_COL, borderRadius: 4 }] },
    options: { maintainAspectRatio: false, plugins: { legend, tooltip: { callbacks: { label: c => `${c.dataset.label}: ${money(c.parsed.y)}` } } },
      scales: { y: { beginAtZero: true, grid: grid(), ticks: { color: css('--muted'), callback: v => v.toLocaleString('en-US') } }, x: { grid: grid(), ticks: { color: css('--muted') } } } } });
  chart('lvOvMix', { type: 'doughnut', plugins: [donutLabels], data: { labels: chan.map(x => x.name), datasets: [{ data: chan.map(x => x.a), backgroundColor: chan.map(x => x.color), borderWidth: 2, borderColor: '#fff' }] },
    options: { maintainAspectRatio: false, cutout: '55%', plugins: { legend, tooltip: { callbacks: { label: c => `${c.label}: ${money(c.parsed)}` } } } } });
}

export function renderLocationViews() {
  if (BOOT.user?.role !== 'location') return;
  renderOverviewLoc(); renderReviews(); renderTpdLoc(); renderLoyaltyLoc(); renderCateringLoc();
}
if (BOOT.user?.role === 'location') document.getElementById('locSel')?.addEventListener('change', () => setTimeout(renderLocationViews, 0));
