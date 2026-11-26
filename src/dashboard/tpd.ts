// @ts-nocheck
/* eslint-disable */
// Ported verbatim from reference/index.html (the source of truth for every number and layout).
// DOM-string rendering, so the types are loose; the public entry is mount() in ./main.ts and the data contract is Boot in src/lib/data/boot.ts.
import { BOOT, DATA, LOCATIONS, money, sum } from './core';
import { rwRows, rwStats } from './reviews';

/* =========================================================================
   3RD PARTY DELIVERY  (Uber Eats / DoorDash)
   DATA.tpd = { ue:{loc:{...}}, dd:{loc:{...}} }  -- weekly aggregates per location, built from
   Uber Eats : UE Payment Details (sales = SUM "Sales (excl. tax)" of Completed orders; orders = count Completed;
               payout = SUM "Total payout" of ALL rows incl. refunds + ad spend; adSpend = rows "Other payments description"='Ad spend'),
               UE Order Accuracy (inaccurate orders / completed orders), UE Items with errors (missing / customisation / wrong),
               UE Order History (courier wait AE, avoidable wait AF, orders with AF>0, cancellations by merchant),
               UE Customer Delivery & Ratings (rating value), SO 7 & 90 latest week (Negative Reviews Tags -> top complaint),
               UE Downtime (uptime % = 100 - downtime %; downtime % = SUM Restaurant offline / SUM(Restaurant online + offline) per store, Oct 12-18;
               stored as ue[loc].uptime; source: WBR Input 2.xlsx > UE Downtime, 'Southwest Freeway' = Fondren)
   DoorDash  : DD Sales (gross sales and orders minus fully-cancelled rows), DD Payout (SUM Net total, all rows),
               DD Operations (error orders I / total orders G, waits Q,R, uptime T, cancellations N, ratings X,AA,AB),
               DD Promo (spend = customer discounts funded by you + marketing fees; ROAS = sales / spend),
               DD Sponsor (spend = marketing fees + DoorDash marketing credit; ROAS = sales / spend)
   Store names -> locations: UE 'Southwest Freeway' = Fondren; DD 'Waterview Town Center Dr' = Richmond.
   ========================================================================= */
export let tpMode = 'ue';
document.getElementById('tpSeg').innerHTML = `<button data-m="ue" class="on">Uber Eats</button><button data-m="dd">DoorDash</button>`;
document.getElementById('tpSeg').addEventListener('click', e => { const b=e.target.closest('button'); if(!b) return; tpMode=b.dataset.m;
  document.querySelectorAll('#tpSeg button').forEach(x=>x.classList.toggle('on',x===b)); renderTpd(); });

export const noEm = s => String(s ?? '').replace(/\u2014/g, '-');      // names coming from the data never show an em dash
export const DASH = '<span class="empty">-</span>';
export const div  = (a,b) => (b ? a/b : null);
export const T_m0 = v => (v==null||isNaN(v)) ? DASH : money(v);
export const T_p1 = v => (v==null||!isFinite(v)) ? DASH : v.toFixed(1)+'%';
export const T_x2 = v => (v==null||!isFinite(v)) ? DASH : v.toFixed(2)+'×';
export const T_r2 = v => (v==null||!isFinite(v)) ? DASH : v.toFixed(2);
export const T_n  = v => (v==null||isNaN(v)) ? DASH : Math.round(v).toLocaleString('en-US');
export const T_ms = v => { if(v==null||isNaN(v)) return DASH; const t=Math.round(v*60); return `${Math.floor(t/60)} min ${t%60} sec`; };
export const vp   = (txt,cls) => `<span class="vp ${cls}">${txt}</span>`;
export const errPill  = v => (v==null||!isFinite(v)) ? DASH : vp(v.toFixed(1)+'%', v>=2?'neg':v>=.5?'flat':'pos');
export const WAIT_GOOD = 0.5, WAIT_BAD = 1;                                                    // avoidable wait (minutes): under 30 sec green, 30 to 60 sec amber, over 60 sec red
export const waitPill = v => (v==null||isNaN(v)) ? DASH : vp(T_ms(v).replace(/<.*?>/g,''), v>=WAIT_BAD?'neg':v>=WAIT_GOOD?'flat':'pos');
export const roasPill = v => (v==null||!isFinite(v)) ? DASH : vp(v.toFixed(2)+'×', v>=4?'pos':'flat');
export const noOther = s => (s || '').split(',').map(x => x.trim()).filter(x => x && x.toLowerCase() !== 'other').join(', ');   // Top Complaint never lists the generic "Other" tag
export const note = t => `<span style="display:block;text-align:inherit;font:500 9.7px var(--sans);white-space:normal;min-width:170px">${t||DASH}</span>`;
export const kcard = (k,v,sub) => `<div class="card kpi"><div class="k">${k}</div><div class="v">${v}</div><div class="d">${sub}</div></div>`;
export const VLW = '<span>Var $: -<br>Var%: - vs LW</span>', VLW1 = '<span>Var: -<br>Var%: - vs LW</span>', VLW2 = '<span>Var%: - vs LW</span>';

export function tpTable(title, head, rows, tot, groups){
  const starts = new Set(); let cum = 0; (groups || []).forEach(([t, s], gi) => { if (gi > 0) starts.add(cum); cum += s; });      // first column of every group after the first
  const gs = i => starts.has(i) ? ' class="gstart"' : '';
  let top = '', sub = '';
  if (groups) {                                                       // labelled group -> label on top, column names underneath; unlabelled group -> its header cells span both rows
    let at = 0;
    groups.forEach(([t, s], gi) => {
      if (t) { top += `<th colspan="${s}" class="grp${gi > 0 ? ' gstart' : ''}">${t}</th>`; for (let k = 0; k < s; k++) sub += `<th${gs(at + k)}>${head[at + k]}</th>`; }
      else for (let k = 0; k < s; k++) top += `<th rowspan="2"${gs(at + k)}>${head[at + k]}</th>`;
      at += s;
    });
    top = `<tr>${top}</tr>`; sub = `<tr>${sub}</tr>`;
  } else sub = `<tr>${head.map((h, i) => `<th${gs(i)}>${h}</th>`).join('')}</tr>`;
  return `<section class="card panel"><div class="panel-h"><span class="t-title">${title}</span><button class="dl" title="Download table">⤓</button></div>
    <div class="tablewrap"><table style="min-width:${Math.max(760, head.length*105)}px"><thead>${top}${sub}</thead>
    <tbody>${rows.map(r => `<tr>${r.map((c, i) => `<td${gs(i)}>${c}</td>`).join('')}</tr>`).join('')}${tot ? `<tr class="tot">${tot.map((c, i) => `<td${gs(i)}>${c}</td>`).join('')}</tr>` : ''}</tbody></table></div></section>`;
}
export function tpExt(d){   // add weighted fields so totals can be derived by plain summation
  const x = { ...d };
  x.waitW = (d.waitMin||0)*(d.delivered||0); x.avoidW = (d.avoidWaitMin||0)*(d.delivered||0);
  x.upSum = d.uptime ?? 0; x.upN = d.uptime==null ? 0 : 1;
  return x;
}
export function tpSum(o){ const t={}; LOCATIONS.forEach(l => Object.entries(tpExt(o[l]||{})).forEach(([k,v]) => { if(typeof v==='number') t[k]=(t[k]||0)+v; })); return t; }

export const trophy = (side, l) => BOOT.deliveryStatus?.[side]?.[l] === (side === 'ue' ? 'Top Eats' : 'Most Loved') ? '🏆 ' + l : l;   // admin-chosen Top Eats (Uber Eats) / Most Loved (DoorDash) restaurants get a trophy in the sales table
export function renderTpd(){
  const S = DATA.tpd?.[tpMode] || {}, tot = tpSum(S), L = LOCATIONS.map(l => [l, tpExt(S[l]||{}), S[l]||{}]);
  let kp = '', html = '';
  if(tpMode==='ue'){
    const err = d => div(d.inaccurate, d.accOrders)*100;
    kp = kcard('Total Sales', T_m0(tot.sales), VLW) + kcard('Number of Orders', T_n(tot.orders), VLW1) +
         kcard('Total Net Payout', T_m0(tot.payout), VLW) + kcard('Overall Error Rate', T_p1(err(tot)), VLW2);
    html += tpTable('UE Performance by Location',
      ['Location','Total Sales','Net Payout','Order Volume','AOV','Avg Rating - Weekly','Top Complaint'],
      L.map(([l,d,raw]) => [trophy('ue',l), T_m0(d.sales), T_m0(d.payout), T_n(d.orders), T_m0(div(d.sales,d.orders)), T_r2(div(d.ratSum,d.ratN)), note(noOther(raw.topComplaint))]),
      ['All Stores', T_m0(tot.sales), T_m0(tot.payout), T_n(tot.orders), T_m0(div(tot.sales,tot.orders)), T_r2(div(tot.ratSum,tot.ratN)), DASH]);
    const ops = d => [errPill(err(d)), T_n(d.missing||0), T_n(d.wrong||0), T_ms(div(d.waitSum,d.waitN)), waitPill(div(d.avoidSum,d.avoidN)),
                      T_n(d.avoidOrders||0), T_p1(div(d.avoidCancels||0,d.orders)*100), T_p1(div(d.upSum,d.upN))];
    html += tpTable('UE Operations by Location',
      ['Location','Order Error Rate (%)','Missing Items','Wrong Order/Item','Average Courier Wait','Avoidable Wait Time','Orders With Avoidable Wait','Avoidable Cancellation Rate','Uptime (%)'],
      L.map(([l,d]) => [l, ...ops(d)]), ['All Stores', ...ops(tot)]);
    // Uber Eats ads: one row per campaign (the "UE ADS" tab); only shown when the week has it
    const ads = (DATA.ueAds || []).slice().sort((x,y) => y.sales - x.sales);
    if (ads.length) {
      const esc = t => String(t).replace(/&/g,'&amp;').replace(/</g,'&lt;');
      const usd2 = v => v==null || isNaN(v) ? DASH : '$' + v.toFixed(2), pc1 = v => v==null || isNaN(v) ? DASH : v.toFixed(1) + '%', nn = v => v==null ? DASH : T_n(v);
      const sum = k => ads.reduce((t,r) => t + (r[k]||0), 0), hasNew = ads.some(r => r.newCustomers != null);
      const T = { sales:sum('sales'), spend:sum('spend'), imp:sum('impressions'), clk:sum('clicks'), ord:sum('orders'), nc:sum('newCustomers') };
      const r = a => [usd2(a.sales), usd2(a.spend), a.spend ? T_x2(a.sales/a.spend) : DASH, T_n(a.impressions), T_n(a.clicks), pc1(a.ctr), T_n(a.orders), pc1(a.conv), usd2(a.cpo), nn(a.newCustomers)];
      html += tpTable('Uber Eats Ads',
        ['Campaign Name','Location','Sales ($)','Ad Spend ($)','ROAS','Impressions','Clicks','CTR (%)','Orders','Conversion Rate (Orders/Clicks)','Cost Per Order','New Customers'],
        ads.map(a => [esc(a.campaign), esc(a.location), ...r(a)]),
        ['Total', '', usd2(T.sales), usd2(T.spend), T.spend ? T_x2(T.sales/T.spend) : DASH, T_n(T.imp), T_n(T.clk), T.imp ? pc1(T.clk/T.imp*100) : DASH, T_n(T.ord), T.clk ? pc1(T.ord/T.clk*100) : DASH, T.ord ? usd2(T.spend/T.ord) : DASH, hasNew ? T_n(T.nc) : DASH]);
    }
  } else {
    const err = d => div(d.errOrders, d.opsOrders)*100, pR = d => div(d.pSales,d.pSpend), sR = d => div(d.sSales,d.sSpend);
    kp = kcard('Total Sales', T_m0(tot.sales), VLW) + kcard('Number of Orders', T_n(tot.orders), VLW1) +
         kcard('Total Net Payout', T_m0(tot.payout), VLW) + kcard('Overall Error Rate', T_p1(err(tot)), VLW2) +
         kcard('Promo ROAS', T_x2(pR(tot)), '<span>Var: -<br>Var%: - vs LW</span>') + kcard('Sponsor ROAS', T_x2(sR(tot)), '<span>Var: -<br>Var%: - vs LW</span>');
    html += tpTable('DD Performance by Location',
      ['Location','Total Sales ($)','Net Payout ($)','Order Volume','AOV','Top Complaints'],
      L.map(([l,d,raw]) => [trophy('dd',l), T_m0(d.sales), T_m0(d.payout), T_n(d.orders), T_m0(div(d.sales,d.orders)), note(noOther(raw.topComplaint))]),
      ['All Stores', T_m0(tot.sales), T_m0(tot.payout), T_n(tot.orders), T_m0(div(tot.sales,tot.orders)), DASH]);
    // Love / Like / Dislike calculated from Superorder (SO 7 & 90) DoorDash star counts of the latest week.
    // Mapping (index 0 = 5 star ... 4 = 1 star): Love = 5 star, Like = 4 star, Dislike = 3, 2 and 1 star.
    const dd7 = rwRows('7').cur.filter(r => r[0]==='DoorDash');
    const DD_MAP = { love:[0], like:[1], dislike:[2,3,4] };
    const soRate = loc => { const s = rwStats(dd7, ['DoorDash'], loc), sum = ix => ix.reduce((a,i) => a + s.s[i], 0);
      return { ratN:s.n, loved:sum(DD_MAP.love), like:sum(DD_MAP.like), dislike:sum(DD_MAP.dislike) }; };
    const rate = d => { const n=d.ratN;
      return [n? vp(T_p1(d.loved/n*100), d.loved/n>=.5?'pos':'neg') : DASH, n? vp(T_p1(d.like/n*100),'pos') : DASH, n? vp(T_p1(d.dislike/n*100), d.dislike? 'neg':'pos') : DASH, T_n(n)]; };
    html += tpTable('DD Rating Distribution by Location', ['Location','Love (%)','Like (%)','Dislike (%)','Total Reviews'],
      LOCATIONS.map(l => [l, ...rate(soRate(l))]), ['All Stores', ...rate(soRate(null))]);
    const ops = d => [errPill(err(d)), T_n(d.errOrders), T_m0(d.errCharges), T_ms(div(d.waitW,d.delivered)), waitPill(div(d.avoidW,d.delivered)),
                      T_n(d.cancels), T_n(d.avoidCancels), T_p1(div(d.avoidCancels||0,d.opsOrders)*100), T_p1(div(d.upSum,d.upN))];
    html += tpTable('DD Operations by Location',
      ['Location','Order Error Rate (%)','Missing/Incorrect Orders','Error Charges ($)','Avg Dasher Wait Time','Avoidable Wait Time','Cancelled Orders','Avoidable Cancellations','Avoidable Cancellation Rate (%)','Store Uptime (%)'],
      L.map(([l,d]) => [l, ...ops(d)]), ['All Stores', ...ops(tot)]);
    const pr = d => [T_m0(d.pSales), T_m0(d.pSpend), T_n(d.pOrders), roasPill(pR(d)),
                     T_n(d.sImpr), T_n(d.sClicks), T_p1(div(d.sClicks,d.sImpr)*100), T_m0(d.sSales), T_m0(d.sSpend), T_n(d.sOrders), roasPill(sR(d)),
                     T_n((d.pOrders||0)+(d.sOrders||0))];
    html += tpTable('DD Promotions & Sponsored Ads',
      ['Location','Sales ($)','Promo Spend ($)','Orders from Promo','ROAS','Impressions','Clicks','CTR (%)','Sales ($)','Ad Spend ($)','Orders from Sponsor','ROAS','Overall Orders (Ads + Promos)'],
      L.map(([l,d]) => [l, ...pr(d)]), ['All Stores', ...pr(tot)],
      [['',1],['Promotions',4],['Sponsored',7],['',1]]);
  }
  document.getElementById('tpKpis').innerHTML = kp;
  document.getElementById('tpTables').innerHTML = html;
}

