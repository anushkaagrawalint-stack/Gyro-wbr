// @ts-nocheck
/* eslint-disable */
// Ported verbatim from reference/index.html (the source of truth for every number and layout).
// DOM-string rendering, so the types are loose; the public entry is mount() in ./main.ts and the data contract is Boot in src/lib/data/boot.ts.
import { DASH, div, noEm, note, tpTable, vp } from './tpd';
import { Chart, DATA, DONUT_COLS, LOCATIONS, css, grid, pill, usdTip } from './core';
import { donutLabels } from './revenue';

/* =========================================================================
   LOYALTY  (AppFront)
   Sub-tabs: Members & Sales | App vs Web   (Campaigns moved to Marketing > Loyalty Marketing; renderLoyalty still fills the lyKpis3 / lyCampChart / lyTables3 containers there)
   DATA.loyalty = { locations:{loc:{sales, salesVar, activeUsers, activeMembers, totalUsers, totalMembers, loyaltyPct, newMembers, newApp, newWeb}},
                    campaigns:[{name, generated, redeemed, discount, sales}] }
   AppFront Location : A Location, B Total Sales text "$5,389.29 (+4.6%)" -> sales + salesVar (% change vs prior period; basis to confirm),
                       C Active Users, D Active Members, E Total Users, F Total Members, G Loyalty %, H New Members, I New App, J New Web
   AppFront Campagin : A Campaign, B Generated, C Redeemed, D Discount Amount, E Total Sales Generated (rows above the 'Total' row; Total is recomputed)
   Derived: Other (unattributed) = New Members - New App - New Web; Redemption % = Redeemed / Generated; Sales per $1 discount = Sales / Discount
   ========================================================================= */
export let lyView = 'members';
document.getElementById('lySeg').innerHTML = [['members','Members & Sales'],['channel','App vs Web']]
  .map(([k,l]) => `<button data-v="${k}" class="${k===lyView?'on':''}">${l}</button>`).join('');
document.getElementById('lySeg').addEventListener('click', e => { const b=e.target.closest('button'); if(!b) return; lyView=b.dataset.v;
  document.querySelectorAll('#lySeg button').forEach(x=>x.classList.toggle('on',x===b));
  ['members','channel'].forEach(v => document.getElementById('ly-'+v).hidden = v!==lyView); });

export const usd2 = v => (v==null||isNaN(v)) ? DASH : '$'+v.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
export const usd0 = v => (v==null||isNaN(v)) ? '-' : '$'+Math.round(v).toLocaleString('en-US');
export const nfmt = v => (v==null||isNaN(v)) ? '-' : Math.round(v).toLocaleString('en-US');
export const pf1  = v => (v==null||!isFinite(v)) ? '-' : v < 0 ? `(${Math.abs(v).toFixed(1)}%)` : v.toFixed(1)+'%';   // negative variances in brackets
export const lyCard = (k,v,sub) => `<div class="card kpi"><div class="k">${k}</div><div class="v">${v}</div><div class="d">${sub||'&nbsp;'}</div></div>`;
export const redPill = v => (v==null||!isFinite(v)) ? DASH : vp(v.toFixed(1)+'%', v>=20?'pos':v>=5?'flat':'neg');
export const rtnPill = v => (v==null||!isFinite(v)) ? DASH : vp(v.toFixed(2)+'×', v>=3?'pos':v>=1?'flat':'neg');
export const LY_C = { app:'#9f7cef', web:'#93c5fd', other:'#d1d5db' };

export const lySales = new Chart(document.getElementById('lySalesChart'), {
  type:'bar', data:{ labels:LOCATIONS, datasets:[{ label:'AppFront Sales', data:[], backgroundColor:'#9f7cef', borderRadius:4 }] },
  options:{ maintainAspectRatio:false, plugins:{ legend:{ display:false }, tooltip:{ callbacks:{ label:usdTip } } },
    scales:{ y:{ beginAtZero:true, grid:grid(), ticks:{ color:css('--muted'), callback:v=>'$'+v.toLocaleString('en-US') } }, x:{ grid:grid(), ticks:{ color:css('--muted'), maxRotation:25 } } } }
});
export const lyChan = new Chart(document.getElementById('lyChannelChart'), {
  type:'bar', data:{ labels:LOCATIONS, datasets:[
    { label:'App',   data:[], backgroundColor:LY_C.app,   borderRadius:4 },
    { label:'Web',   data:[], backgroundColor:LY_C.web,   borderRadius:4 },
    { label:'Other / unattributed', data:[], backgroundColor:LY_C.other, borderRadius:4 } ]},
  options:{ maintainAspectRatio:false, plugins:{ legend:{ position:'bottom', labels:{ boxWidth:30, boxHeight:12, color:css('--muted') } } },
    scales:{ x:{ stacked:true, grid:grid(), ticks:{ color:css('--muted'), maxRotation:25 } }, y:{ stacked:true, beginAtZero:true, grid:grid(), ticks:{ color:css('--muted'), precision:0 } } } }
});
export const lyMix = new Chart(document.getElementById('lyMixChart'), {
  type:'doughnut', data:{ labels:['App','Web','Other / unattributed'], datasets:[{ data:[], backgroundColor:DONUT_COLS.slice(0,3), borderWidth:2, borderColor:'#fff' }] },
  options:{ maintainAspectRatio:false, cutout:'55%', plugins:{ legend:{ position:'bottom', labels:{ color:css('--muted'), boxWidth:30, boxHeight:12 } } } },
  plugins:[donutLabels]
});
export const lyCamp = new Chart(document.getElementById('lyCampChart'), {
  type:'bar', data:{ labels:[], datasets:[
    { label:'Sales generated', data:[], backgroundColor:'#9f7cef', borderRadius:4 },
    { label:'Discount given',  data:[], backgroundColor:'#93c5fd', borderRadius:4 } ]},
  options:{ indexAxis:'y', maintainAspectRatio:false, plugins:{ legend:{ position:'bottom', labels:{ boxWidth:30, boxHeight:12, color:css('--muted') } }, tooltip:{ callbacks:{ label:usdTip } } },
    scales:{ x:{ beginAtZero:true, grid:grid(), ticks:{ color:css('--muted'), callback:v=>'$'+v.toLocaleString('en-US') } }, y:{ grid:{ display:false }, ticks:{ color:css('--muted'), font:{ size:12 } } } } }
});

export function renderLoyalty(){
  const D = DATA.loyalty || {}, LC = D.locations || {}, camps = (D.campaigns || []).map(c => ({ ...c, name: noEm(c.name) }));
  const rows = LOCATIONS.map(l => [l, LC[l] || {}]);
  const tot = {}; rows.forEach(([,d]) => Object.entries(d).forEach(([k,v]) => { if(typeof v==='number') tot[k]=(tot[k]||0)+v; }));
  const prior = d => d.salesVar==null ? null : d.sales/(1+d.salesVar/100);
  const priorTot = rows.reduce((s,[,d]) => s + (prior(d)||0), 0);
  const salesVarTot = priorTot ? (tot.sales/priorTot-1)*100 : null;
  const other = d => (d.newMembers||0)-(d.newApp||0)-(d.newWeb||0);
  const hasLoc = Object.keys(LC).length>0;

  /* ---- Members & Sales ---- */
  document.getElementById('lyKpis1').innerHTML =
    lyCard('AppFront Sales', hasLoc?usd0(tot.sales):'-', `<span>Var%: ${pf1(salesVarTot)} vs prior period</span>`) +
    lyCard('Total Members', nfmt(tot.totalMembers), `<span>${pf1(div(tot.totalMembers,tot.totalUsers)*100)} of ${nfmt(tot.totalUsers)} users</span>`) +
    lyCard('Active Members', nfmt(tot.activeMembers), `<span>${pf1(div(tot.activeMembers,tot.totalMembers)*100)} of members active</span>`) +
    lyCard('New Members', nfmt(tot.newMembers), `<span>${nfmt(tot.newApp)} app · ${nfmt(tot.newWeb)} web</span>`);
  lySales.data.datasets[0].data = LOCATIONS.map(l => LC[l]?.sales ?? null); lySales.update();
  const t1 = (d,isTot) => { const v = isTot ? salesVarTot : d.salesVar;
    return [usd2(d.sales), pill(v), nfmt(d.activeUsers), nfmt(d.activeMembers), pf1(div(d.activeMembers,d.activeUsers)*100), pf1(div(d.activeMembers,d.totalMembers)*100)]; };
  const t2 = (d) => [nfmt(d.totalUsers), nfmt(d.totalMembers), vp(pf1(div(d.totalMembers,d.totalUsers)*100), div(d.totalMembers,d.totalUsers)>=.8?'pos':div(d.totalMembers,d.totalUsers)>=.7?'flat':'neg'),
                     nfmt((d.totalUsers||0)-(d.totalMembers||0)), pf1(div(d.totalMembers,tot.totalMembers)*100)];
  document.getElementById('lyTables1').innerHTML =
    tpTable('Sales & Activity by Location', ['Location','Sales','Var % (vs prior week)','Active Users','Active Members','Members % of Active Users','Active Members % of Total Members'],
      rows.map(([l,d]) => [l, ...t1(d,false)]), ['All Locations', ...t1(tot,true)]) +
    tpTable('Membership by Location', ['Location','Total Users','Total Members','Loyalty % (Members / Users)','Non-Members','Share of All Members'],
      rows.map(([l,d]) => [l, ...t2(d)]), ['All Locations', ...t2(tot)]);

  /* ---- App vs Web ---- */
  document.getElementById('lyKpis2').innerHTML =
    lyCard('New Members', nfmt(tot.newMembers), '&nbsp;') + lyCard('New via App', nfmt(tot.newApp), `<span>${pf1(div(tot.newApp,tot.newMembers)*100)} of new members</span>`) +
    lyCard('New via Web', nfmt(tot.newWeb), `<span>${pf1(div(tot.newWeb,tot.newMembers)*100)} of new members</span>`) +
    lyCard('Unattributed', hasLoc?nfmt(other(tot)):'-', '<span>Members not tagged App or Web</span>');
  lyChan.data.datasets[0].data = LOCATIONS.map(l => LC[l]?.newApp ?? null);
  lyChan.data.datasets[1].data = LOCATIONS.map(l => LC[l]?.newWeb ?? null);
  lyChan.data.datasets[2].data = LOCATIONS.map(l => LC[l] ? other(LC[l]) : null);
  lyMix.data.datasets[0].data = hasLoc ? [tot.newApp, tot.newWeb, other(tot)] : [];
  lyChan.update(); lyMix.update();
  const t3 = d => [nfmt(d.newMembers), nfmt(d.newApp), pf1(div(d.newApp,d.newMembers)*100), nfmt(d.newWeb), pf1(div(d.newWeb,d.newMembers)*100), nfmt(other(d))];
  document.getElementById('lyTables2').innerHTML =
    tpTable('New Member Acquisition - App vs Web', ['Location','New Members','App','App %','Web','Web %','Other / Unattributed'],
      rows.map(([l,d]) => [l, ...t3(d)]), ['All Locations', ...t3(tot)], [['',2],['App',2],['Web',2],['',1]].map(x=>x));

  /* ---- Campaigns ---- */
  const ct = camps.reduce((a,c) => { ['generated','redeemed','discount','sales'].forEach(k => a[k]=(a[k]||0)+c[k]); return a; }, {});
  const hasC = camps.length>0;
  document.getElementById('lyKpis3').innerHTML =
    lyCard('Offers Generated', nfmt(ct.generated), '&nbsp;') + lyCard('Redeemed', nfmt(ct.redeemed), `<span>${pf1(div(ct.redeemed,ct.generated)*100)} redemption</span>`) +
    lyCard('Discount Given', hasC?usd0(ct.discount):'-', '&nbsp;') + lyCard('Sales Generated', hasC?usd0(ct.sales):'-', '&nbsp;') +
    lyCard('Sales per $1 Discount', hasC? (ct.sales/ct.discount).toFixed(2)+'×' : '-', '&nbsp;');
  const sorted = [...camps].sort((a,b) => b.sales-a.sales), top = sorted.slice(0,8);
  lyCamp.data.labels = top.map(c => c.name.length>38 ? c.name.slice(0,36)+'…' : c.name);
  lyCamp.data.datasets[0].data = top.map(c => c.sales); lyCamp.data.datasets[1].data = top.map(c => c.discount); lyCamp.update();
  const cr = c => [nfmt(c.generated), nfmt(c.redeemed), usd2(c.discount), c.redeemed ? usd2(c.discount/c.redeemed) : DASH, usd2(c.sales), rtnPill(c.discount? c.sales/c.discount : null)];
  document.getElementById('lyTables3').innerHTML =
    tpTable('Campaign Performance', ['Campaign','Generated','Redeemed','Discount Amount','Discount per Redemption','Total Sales Generated','Sales per $1 Discount'],
      sorted.map(c => [note(c.name), ...cr(c)]), hasC ? ['Total', ...cr(ct)] : null);
}

