// @ts-nocheck
/* eslint-disable */
// Ported verbatim from reference/index.html (the source of truth for every number and layout).
// DOM-string rendering, so the types are loose; the public entry is mount() in ./main.ts and the data contract is Boot in src/lib/data/boot.ts.
import { Chart, DATA, LOCATIONS, PERIODS, css, grid, money, monthLabel, pct, pill, sum, usdTip, varPct, view, weekLabels } from './core';

export const salesChart = new Chart(document.getElementById('salesChart'), {
  type:'bar',
  data:{ labels:LOCATIONS, datasets:[
    { label:'Actual', data:[], backgroundColor:'#9f7cef', borderRadius:4 },
    { label:'LY',     data:[], backgroundColor:'rgba(209,213,219,0.7)', borderRadius:4 },
    { label:'Budget', data:[], backgroundColor:'#93c5fd', borderRadius:4 } ]},
  options:{ maintainAspectRatio:false,
    plugins:{ legend:{ position:'bottom', labels:{ boxWidth:36, boxHeight:12, color:css('--muted') } }, tooltip:{ callbacks:{ label:usdTip } } },
    scales:{ y:{ beginAtZero:true, grid:grid(), ticks:{ color:css('--muted'), callback:v=>v.toLocaleString('en-US') } },
             x:{ grid:grid(), ticks:{ color:css('--muted'), maxRotation:25 } } } }
});
export const varChart = new Chart(document.getElementById('varChart'), {
  type:'bar',
  data:{ labels:LOCATIONS, datasets:[{ label:'Var % vs LY', data:[], borderRadius:4,
    backgroundColor:ctx => (ctx.raw??0) < 0 ? 'rgba(220,38,38,0.75)' : '#b99af3' }]},
  options:{ maintainAspectRatio:false, plugins:{ legend:{ display:false }, tooltip:{ callbacks:{ label:c => { const v = c.parsed.y; return `${c.dataset.label}: ${v < 0 ? '('+Math.abs(v).toFixed(1)+'%)' : v.toFixed(1)+'%'}`; } } } },   // negative variances in brackets
    scales:{ y:{ grid:grid(), ticks:{ color:css('--muted'), callback:v => v < 0 ? '('+Math.abs(v)+'%)' : v+'%' } },
             x:{ grid:grid(), ticks:{ color:css('--muted') } } } }
});

/* ---------- render (works for blank and populated DATA) ---------- */
export function render(){
  const P = PERIODS[view.period], d = DATA[view.period] || {};
  const A = d.actual, L = d.ly, B = d.bud, W = d.lw;
  const T = d.totals || {};
  const tA = T.actual ?? sum(A), tL = T.ly ?? sum(L), tB = T.bud ?? sum(B), tW = T.lw ?? sum(W);

  document.getElementById('kTotalLabel').textContent = P.title;
  document.getElementById('kTotal').textContent = money(tA);
  document.getElementById('kTotalD').textContent = `Var%: ${pct(varPct(tA,tW))} vs LW`;
  document.getElementById('kLy').textContent  = money(tL);
  document.getElementById('kLyD').innerHTML  = `Var $: ${tA==null||tL==null?'-':money(tA-tL)}<br>Var%: ${pct(varPct(tA,tL))}`;
  document.getElementById('kBud').textContent = money(tB);
  document.getElementById('kBudD').innerHTML = `Var $: ${tA==null||tB==null?'-':money(tA-tB)}<br>Var%: ${pct(varPct(tA,tB))}`;

  const m = DATA.weekly?.meta || {};   // header is the same for every period filter
  document.getElementById('weekOf').textContent    = `Week of ${m.weekOf || '-'}`;
  const wl = weekLabels(m.weekStart);
  document.getElementById('pillMonth').textContent  = monthLabel(m.weekStart);
  document.getElementById('pillWeekNo').textContent = `Week ${wl.no} (${wl.range})`;

  const row = (loc) => {
    const a=A?.[loc], l=L?.[loc], b=B?.[loc], w=W?.[loc];
    return `<tr><td>${loc}</td><td>${money(a)}</td><td>${pill(varPct(a,w))}</td><td>${money(l)}</td><td>${money(b)}</td><td>${pill(varPct(a,l))}</td><td>${pill(varPct(a,b))}</td></tr>`;
  };
  document.getElementById('tbody').innerHTML = LOCATIONS.map(row).join('') +
    `<tr class="tot"><td>Totals</td><td>${money(tA)}</td><td>${pill(varPct(tA,tW))}</td><td>${money(tL)}</td><td>${money(tB)}</td><td>${pill(varPct(tA,tL))}</td><td>${pill(varPct(tA,tB))}</td></tr>`;

  salesChart.data.datasets[0].data = LOCATIONS.map(l => A?.[l] ?? null);
  salesChart.data.datasets[1].data = LOCATIONS.map(l => L?.[l] ?? null);
  salesChart.data.datasets[2].data = LOCATIONS.map(l => B?.[l] ?? null);
  varChart.data.datasets[0].data   = LOCATIONS.map(l => varPct(A?.[l], L?.[l]));
  salesChart.update(); varChart.update();
}

/* chart PNG download */
document.querySelectorAll('[data-dl]').forEach(b => b.addEventListener('click', () => {
  const c = document.getElementById(b.dataset.dl), a = document.createElement('a');
  a.href = c.toDataURL('image/png'); a.download = b.dataset.dl + '.png'; a.click();
}));

