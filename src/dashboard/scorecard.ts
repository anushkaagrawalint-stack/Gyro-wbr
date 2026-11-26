// @ts-nocheck
/* eslint-disable */
/* =========================================================================
   SCORECARD: ranks the locations on the week's 7-day performance.
   Every figure is the one the other tabs show for that location (locCalc in ./location.ts), so the scorecard never disagrees with them.
   Each metric is turned into 0-100 points by where the location sits between the worst and the best location
   (inverted for "lower is better"), then multiplied by the metric's weight. Score = points earned / points available, out of 100.
   A metric a location has no figure for is left out for that location, and the score is scaled over the metrics it does have.
   ========================================================================= */
import { Chart, DATA, LOCATIONS, css, grid, pct, weekLabels } from './core';
import { T_ms, T_p1, kcard, tpTable } from './tpd';
import { locCalc } from './location';

const ok = v => v != null && !isNaN(v) && isFinite(v);
const blend = (a, b, wa, wb) => { const x = ok(a) && wa ? [a, wa] : null, y = ok(b) && wb ? [b, wb] : null; if (x && y) return (x[0] * x[1] + y[0] * y[1]) / (x[1] + y[1]); return x ? x[0] : y ? y[0] : null; };   // two delivery apps, weighted by their orders
const avg = (a, b) => ok(a) && ok(b) ? (a + b) / 2 : ok(a) ? a : ok(b) ? b : null;

// metric, weight (points out of 100), better direction, how the value reads, where it comes from
export const SC_METRICS = [
  { key: 'growth',  label: 'Sales Growth vs LY', w: 25, best: 'high', fmt: v => pct(v), get: c => c.sales.v,
    why: 'Sales are the result everything else is aimed at, and growth against the same week last year is fair to a small and a big store alike.' },
  { key: 'rating',  label: 'Guest Rating',       w: 20, best: 'high', fmt: v => v.toFixed(2), get: c => c.rAll.rating,
    why: 'What guests say, across Google, Yelp, Uber Eats and DoorDash (7 days). The best early sign of repeat business.' },
  { key: 'err',     label: 'Order Errors',       w: 15, best: 'low',  fmt: v => T_p1(v), get: c => blend(c.ue.err, c.dd.err, c.ue.orders, c.dd.orders),
    why: 'Wrong or missing items cost refunds and reviews. Uber Eats and DoorDash error rates, weighted by their orders.' },
  { key: 'avoid',   label: 'Avoidable Wait',     w: 15, best: 'low',  fmt: v => T_ms(v).replace(/<.*?>/g, ''), get: c => blend(c.ue.avoid, c.dd.avoid, c.ue.orders, c.dd.orders),
    why: 'Time a courier waits because the kitchen was late. The part of delivery speed the restaurant controls. Weighted by orders.' },
  { key: 'up',      label: 'Store Uptime',       w: 10, best: 'high', fmt: v => T_p1(v), get: c => avg(c.ue.up, c.dd.up),
    why: 'A store that is offline on an app cannot sell. Average of Uber Eats and DoorDash uptime.' },
  { key: 'loyalty', label: 'Loyalty %',          w: 10, best: 'high', fmt: v => T_p1(v), get: c => c.ly.loyaltyPct,
    why: 'Share of app users who are loyalty members: guests the store keeps. A slower-moving signal, so a lower weight.' },
  { key: 'kept',    label: 'Delivery Payout Kept', w: 5, best: 'high', fmt: v => T_p1(v), get: c => { const s = (c.ue.sales || 0) + (c.dd.sales || 0); return s ? ((c.ue.payout || 0) + (c.dd.payout || 0)) / s * 100 : null; },
    why: 'Share of delivery sales that reaches the restaurant after app fees and promotions. Smallest weight: it is mostly set by the apps and promotions chosen.' },
];

export function scoreLocations(locs, calc = locCalc) {
  const rows = locs.map(l => { const c = calc(l); return { loc: l, v: Object.fromEntries(SC_METRICS.map(m => { const x = m.get(c); return [m.key, ok(x) ? x : null]; })) }; });
  SC_METRICS.forEach(m => {
    const xs = rows.map(r => r.v[m.key]).filter(ok), lo = Math.min(...xs), hi = Math.max(...xs);
    rows.forEach(r => { const x = r.v[m.key]; r['p_' + m.key] = x == null ? null : hi === lo ? 100 : (m.best === 'high' ? (x - lo) / (hi - lo) : (hi - x) / (hi - lo)) * 100; });
  });
  rows.forEach(r => {
    const have = SC_METRICS.filter(m => r['p_' + m.key] != null), avail = have.reduce((t, m) => t + m.w, 0);
    r.earned = Object.fromEntries(have.map(m => [m.key, m.w * r['p_' + m.key] / 100]));
    r.n = have.length; r.score = avail ? have.reduce((t, m) => t + r.earned[m.key], 0) / avail * 100 : null;
  });
  return rows.sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
}

let scChart = null;
export function renderScorecard() {
  const host = document.getElementById('view-scorecard');
  if (!host) return;
  const wl = weekLabels(DATA.weekly?.meta?.weekStart), rows = scoreLocations(LOCATIONS), ranked = rows.filter(r => r.score != null);
  const f1 = v => v == null ? '-' : v.toFixed(1);
  const head = ['Rank', 'Location', 'Score (out of 100)', ...SC_METRICS.map(m => `${m.label} (${m.w} pts)`)];
  const body = rows.map((r, i) => [r.score == null ? '-' : String(i + 1), r.loc, `<b>${f1(r.score)}</b>`,
    ...SC_METRICS.map(m => r.v[m.key] == null ? '-' : `${m.fmt(r.v[m.key])}<br><span class="pc">${f1(r.earned[m.key])} pts</span>`)]);
  const weights = tpTable('How the Score Works', ['Metric', 'Weight', 'Better when', 'Why it counts'],
    SC_METRICS.map(m => [m.label, `${m.w} pts`, m.best === 'high' ? 'Higher' : 'Lower', `<span style="display:block;white-space:normal;min-width:280px;text-align:left">${m.why}</span>`]),
    ['Total', `${SC_METRICS.reduce((t, m) => t + m.w, 0)} pts`, '', `<span style="display:block;white-space:normal;min-width:280px;text-align:left">Each metric earns 0 to 100% of its weight: the best location gets all of it, the worst gets none, the rest in between by where they sit. The points earned are shown under each value. A metric with no figure for a location is left out and the score is scaled over the rest.</span>`]);
  const top = ranked[0], low = ranked[ranked.length - 1], mean = ranked.length ? ranked.reduce((t, r) => t + r.score, 0) / ranked.length : null;
  host.innerHTML = `<div class="filters" style="justify-content:space-between"><div><span class="eyebrow" style="margin:0">Scorecard</span><div class="muted-line" style="margin:2px 0 0">Week ${wl.no} (${wl.range}) · 7-day performance</div></div></div>
    <section class="kpis" style="grid-template-columns:repeat(auto-fit,minmax(240px,1fr))">
      ${kcard('Top Location', top ? '🏆 ' + top.loc : '-', top ? `<span>Score ${f1(top.score)} out of 100</span>` : '<span>-</span>')}
      ${kcard('Lowest Score', low && low !== top ? low.loc : '-', low && low !== top ? `<span>Score ${f1(low.score)} out of 100</span>` : '<span>-</span>')}
      ${kcard('Average Score', f1(mean), `<span>${ranked.length} location${ranked.length === 1 ? '' : 's'} ranked</span>`)}
    </section>
    <section class="card panel"><div class="panel-h"><h3>Score by Location</h3></div><div class="chartbox"><canvas id="scBar"></canvas></div></section>
    ${tpTable('Location Ranking', head, body, null)}
    ${weights}`;
  // "How the Score Works" starts closed: only its heading shows, and pressing the heading opens or closes the table
  const how = [...host.querySelectorAll('.panel')].find(x => x.querySelector('.t-title')?.textContent.trim() === 'How the Score Works');
  if (how) {
    const hd = how.querySelector('.panel-h'), tw = how.querySelector('.tablewrap'), t = how.querySelector('.t-title'), set = open => { tw.hidden = !open; t.textContent = 'How the Score Works ' + (open ? '▴' : '▾'); hd.setAttribute('aria-expanded', open); };
    hd.style.cursor = 'pointer'; hd.setAttribute('role', 'button'); hd.tabIndex = 0; set(false);
    const toggle = () => set(tw.hidden);
    hd.addEventListener('click', e => { if (!e.target.closest('.dl')) toggle(); });
    hd.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && !e.target.closest('.dl')) { e.preventDefault(); toggle(); } });
  }
  if (scChart) scChart.destroy();
  scChart = new Chart(document.getElementById('scBar'), { type: 'bar',
    data: { labels: ranked.map(r => r.loc), datasets: [{ label: 'Score', data: ranked.map(r => +r.score.toFixed(1)), backgroundColor: '#9f7cef', borderRadius: 4 }] },
    options: { indexAxis: 'y', animation: false, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => `Score: ${c.parsed.x.toFixed(1)}` } } },
      scales: { x: { min: 0, max: 100, grid: grid(), ticks: { color: css('--muted') } }, y: { grid: grid(), ticks: { color: css('--muted') } } } } });
}
// the chart is drawn while its tab is hidden (zero size): redraw it at its real size when the tab opens
document.addEventListener('click', e => { if (e.target.closest?.('.tab[data-view="scorecard"]')) setTimeout(() => { if (scChart) { scChart.resize(); scChart.update('none'); } }, 0); });
