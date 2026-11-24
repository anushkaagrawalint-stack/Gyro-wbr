// @ts-nocheck
/* eslint-disable */
// Ported verbatim from reference/index.html (the source of truth for every number and layout).
// DOM-string rendering, so the types are loose; the public entry is mount() in ./main.ts and the data contract is Boot in src/lib/data/boot.ts.
import { DATA, LOCATIONS, money, pct, pill, sum, varPct, weekLabels } from './core';
import { CHANNELS } from './revenue';
import { RW_COL, RW_INTEG, RW_ORDER, rwRows, rwStats } from './reviews';
import { DASH, T_m0, T_ms, T_n, T_p1, WAIT_BAD, WAIT_GOOD, div, errPill, noOther, note, roasPill, tpExt, tpSum, tpTable, vp, waitPill } from './tpd';
import { nfmt, pf1, usd0 } from './loyalty';

/* =========================================================================
   LOCATION  (one-page scorecard for a location manager)
   Every figure is from the reported week's WBR only: weekly Toast sales and channels, the latest 7 days of reviews, the weekly 3rd party
   delivery figures, the AppFront row of the location and the latest week of the Catering Location Wise sheet.
   "All Locations" = the company totals; a location = that location's row in each of those sources (same numbers as the other tabs).
   ========================================================================= */
export let locSel = window.__BOOT__?.user?.role === 'location' ? LOCATIONS[0] : 'All Locations';   // a location login sees only their restaurant(s)
export const locSelEl = document.getElementById('locSel');
const CO = window.__BOOT__?.company || null;   // location logins: the company totals, sent as totals only
const LOC_CHOICES = window.__BOOT__?.user?.role === 'location' ? [...LOCATIONS] : ['All Locations', ...LOCATIONS];
locSelEl.innerHTML = LOC_CHOICES.map(l => `<option>${l}</option>`).join('');
if (LOC_CHOICES.length === 1) locSelEl.style.display = 'none';   // one restaurant: nothing to choose
locSelEl.value = locSel;
locSelEl.addEventListener('change', e => { locSel = e.target.value; renderLocation(); });

export function locCalc(loc){
  const all = loc === 'All Locations', k = all ? null : loc, W = DATA.weekly || {}, o = { loc, all };
  // ---- net sales and channels (Toast, weekly)
  const src = all && CO ? '__company' : loc;   // location logins: the company entry; everyone else: the all-locations total
  const a = all && !CO ? (W.totals?.actual ?? sum(W.actual)) : W.actual?.[src], l = all && !CO ? (W.totals?.ly ?? sum(W.ly)) : W.ly?.[src];
  o.sales = { a, l, v: varPct(a, l), d: (a == null || l == null) ? null : a - l };
  const rev = W.rev?.[src] || {};
  o.chan = CHANNELS.map(c => ({ name:c.name, a:c.lines.reduce((s,x) => s + (rev.actual?.[x] || 0), 0), l:c.lines.reduce((s,x) => s + (rev.ly?.[x] || 0), 0) }));
  const catAgg = m => { const r = {}; Object.values(m || {}).forEach(x => Object.entries(x).forEach(([c,v]) => r[c] = (r[c] || 0) + v)); return r; };
  const cats = W.cats?.[src] || {}, ca = catAgg(cats.actual), cl = catAgg(cats.ly);
  o.cats = Object.keys(ca).map(n => ({ name:n, a:ca[n], l:cl[n] ?? 0 })).filter(x => x.a > 0).sort((x,y) => y.a - x.a);
  // ---- guest reviews: latest 7 days, with the week before for the change
  const coRows = () => { const R = CO.reviews || {}, rows = R.so7_90 || [], ws = [...new Set(rows.map(x => x[2]))].sort(), last = ws[ws.length - 1], pw = ws[ws.length - 2]; return { cur: rows.filter(x => x[2] === last), prev: pw ? rows.filter(x => x[2] === pw) : null }; };
  const R0 = all && CO ? coRows() : rwRows('7'), okRow = r => (all && CO) || (RW_INTEG[r[0]] || []).includes(r[1]), cur = R0.cur.filter(okRow), prev = R0.prev ? R0.prev.filter(okRow) : null;
  o.rv = RW_ORDER.map(p => ({ p, on: all || RW_INTEG[p].includes(loc), ...rwStats(cur,[p],k), pv: prev ? rwStats(prev,[p],k) : null }));
  o.rAll = rwStats(cur, RW_ORDER, k); o.rAllPv = prev ? rwStats(prev, RW_ORDER, k) : null;
  // ---- 3rd party delivery (weekly)
  const U = all ? (CO?.tpd ? CO.tpd.ue : tpSum(DATA.tpd?.ue || {})) : tpExt(DATA.tpd?.ue?.[loc] || {}), Dd = all ? (CO?.tpd ? CO.tpd.dd : tpSum(DATA.tpd?.dd || {})) : tpExt(DATA.tpd?.dd?.[loc] || {});
  const ueRaw = all ? {} : (DATA.tpd?.ue?.[loc] || {}), ddRaw = all ? {} : (DATA.tpd?.dd?.[loc] || {});
  o.ue = { sales:U.sales, orders:U.orders, payout:U.payout, aov:div(U.sales,U.orders), err:div(U.inaccurate,U.accOrders)*100, wait:div(U.waitSum,U.waitN), avoid:div(U.avoidSum,U.avoidN), up:div(U.upSum,U.upN), top: all ? null : noOther(ueRaw.topComplaint) };
  o.dd = { sales:Dd.sales, orders:Dd.orders, payout:Dd.payout, aov:div(Dd.sales,Dd.orders), err:div(Dd.errOrders,Dd.opsOrders)*100, wait:div(Dd.waitW,Dd.delivered), avoid:div(Dd.avoidW,Dd.delivered), up:div(Dd.upSum,Dd.upN), promo:div(Dd.pSales,Dd.pSpend), spons:div(Dd.sSales,Dd.sSpend), top: all ? null : noOther(ddRaw.topComplaint) };
  o.deliv = (o.ue.sales || 0) + (o.dd.sales || 0);
  // ---- loyalty (AppFront)
  const LCs = DATA.loyalty?.locations || {}, prior = d => d.salesVar == null ? null : d.sales / (1 + d.salesVar / 100);
  const lt = {}; LOCATIONS.forEach(x => Object.entries(LCs[x] || {}).forEach(([kk,v]) => { if(typeof v === 'number') lt[kk] = (lt[kk] || 0) + v; }));
  const ld = all ? (CO?.loyalty || lt) : (LCs[loc] || {}), priorTot = LOCATIONS.reduce((s,x) => s + (LCs[x] ? (prior(LCs[x]) || 0) : 0), 0);
  o.ly = { sales:ld.sales, v: all ? (CO?.loyalty ? CO.loyalty.salesVar : (priorTot ? (lt.sales / priorTot - 1) * 100 : null)) : ld.salesVar, activeMembers:ld.activeMembers, totalMembers:ld.totalMembers, loyaltyPct:div(ld.totalMembers, ld.totalUsers)*100,
           newMembers:ld.newMembers, newApp:ld.newApp, newWeb:ld.newWeb, share: o.sales.a ? ld.sales / o.sales.a * 100 : null };
  // ---- catering outreach (Location Wise sheet, latest week; only some locations are tracked)
  const CL = DATA.catering?.location || {};
  const clTotal = CO?.catering ? CO.catering.total : CL.total;
  o.cat = all ? (clTotal || null) : (CL.locations?.[loc] || null); o.catTotal = clTotal || null; o.catWeek = CL.week;
  return o;
}

export function locTables(loc, c, co, comp){
  const all = c.all, ce = c.cat;
  const rk = fn => { const mine = fn(c); if(mine == null || isNaN(mine)) return null; return 1 + LOCATIONS.filter(l => { const v = fn(comp[l]); return v != null && !isNaN(v) && v > mine; }).length; };
  const nLoc = fn => LOCATIONS.filter(l => { const v = fn(comp[l]); return v != null && !isNaN(v); }).length;
  const rkTxt = (fn, label) => { const r = rk(fn); return all || r == null ? '' : `<br><span>Rank #${r} of ${nLoc(fn)} ${label}</span>`; };
  const ratingTxt = v => v == null ? 'NA' : v.toFixed(2);
  const dlt = (x, y) => (x == null || y == null) ? '-' : vp(x - y >= 0 ? '+' + (x - y).toFixed(2) : '(' + Math.abs(x - y).toFixed(2) + ')', x - y >= 0 ? 'pos' : 'neg');
  const waitTxt = v => (v == null || isNaN(v)) ? '-' : T_ms(v).replace(/<.*?>/g, '');

  const s = c.sales;
  /* ---------- sales by channel / what's selling ---------- */
  const csum = c.chan.reduce((t, x) => t + x.a, 0), mix = (v, base) => base ? `${(v / base * 100).toFixed(1)}%<span class="mixbar" style="width:${Math.max(2, Math.min(100, v / base * 100))}%"></span>` : '-';
  const chRows = c.chan.filter(x => x.a || x.l).map(x => [x.name, money(x.a), mix(x.a, csum), money(x.l), money(x.a - x.l), pill(varPct(x.a, x.l))]);
  const salesTbl = tpTable('Sales by Channel', ['Channel','Net Sales','Mix','Last Year','Var $ vs LY','Var % vs LY'], chRows, ['Total', money(csum), '100.0%', money(c.chan.reduce((t, x) => t + x.l, 0)), money(csum - c.chan.reduce((t, x) => t + x.l, 0)), pill(s.v)]);
  const sellTbl = tpTable("What's Selling", ['Category','Net Sales','Mix'], c.cats.slice(0, 8).map(x => [x.name, money(x.a), mix(x.a, csum)]), null);      // no last-year columns: last year's sales are mostly under 'No Sales Category', so a category comparison would mislead

  /* ---------- guest feedback ---------- */
  const COL = ['#4c1d95','#7c3aed','#9f7cef','#c4b5fd','#e5e7eb'];
  const bar = st => st.n ? `<div class="stackbar">${st.s.map((v, i) => `<span style="width:${v / st.n * 100}%;background:${COL[i]}"></span>`).join('')}</div>` : '-';
  const fb = x => x.on ? [ratingTxt(x.rating), x.pv && x.n && x.pv.n ? dlt(x.rating, x.pv.rating) : '-', x.n, ...x.s, bar(x)] : ['NA','NA','NA','NA','NA','NA','NA','NA','NA'];
  const fbTbl = tpTable('Guest Feedback by Platform (7 Days)', ['Platform','Rating','vs LW','# Reviews','5★','4★','3★','2★','1★','Star Mix'],
    c.rv.filter(x => x.on).map(x => [x.p, ...fb(x)]), ['All Platforms', ratingTxt(c.rAll.rating), c.rAllPv && c.rAll.n && c.rAllPv.n ? dlt(c.rAll.rating, c.rAllPv.rating) : '-', c.rAll.n, ...c.rAll.s, bar(c.rAll)]);

  /* ---------- delivery apps ---------- */
  const dv = (d, key) => ({ sales:T_m0(d.sales), orders:T_n(d.orders), aov:T_m0(d.aov), payout:T_m0(d.payout), err:errPill(d.err), avoid:waitPill(d.avoid), wait:T_ms(d.wait), up:T_p1(d.up), promo:key === 'dd' ? roasPill(d.promo) : DASH, spons:key === 'dd' ? roasPill(d.spons) : DASH, top:d.top ? note(d.top) : DASH });
  const mrows = (a, b) => [['Sales', a.sales, b.sales], ['Orders', a.orders, b.orders], ['Average Order Value', a.aov, b.aov], ['Net Payout', a.payout, b.payout], ['Order Error Rate', a.err, b.err],
    ['Avoidable Wait Time', a.avoid, b.avoid], ['Average Courier Wait', a.wait, b.wait], ['Uptime', a.up, b.up], ['Promo ROAS', a.promo, b.promo], ['Sponsor ROAS', a.spons, b.spons], ['Top Complaint', a.top, b.top]];
  let dTbl;
  if (all) dTbl = tpTable('Delivery Apps (All Stores)', ['Metric','Uber Eats','DoorDash'], mrows(dv(c.ue,'ue'), dv(c.dd,'dd')).map(r => [r[0], r[1], r[2]]), null);
  else { const u1 = dv(c.ue,'ue'), d1 = dv(c.dd,'dd'), u2 = dv(co.ue,'ue'), d2 = dv(co.dd,'dd'), m1 = mrows(u1, d1), m2 = mrows(u2, d2);
    dTbl = tpTable(`Delivery Apps - ${loc} vs All Stores`, ['Metric', loc, 'All Stores', loc, 'All Stores'], m1.map((r, i) => [r[0], r[1], i === 10 ? DASH : m2[i][1], r[2], i === 10 ? DASH : m2[i][2]]), null, [['',1],['Uber Eats',2],['DoorDash',2]]); }

  /* ---------- loyalty and catering ---------- */
  const L1 = c.ly, L2 = co.ly;
  const lyRows = [['AppFront Sales', usd0(L1.sales), usd0(L2.sales)], ['Var % vs prior period', pill(L1.v), pill(L2.v)], ['AppFront Sales % of Net Sales', L1.share == null ? '-' : L1.share.toFixed(1) + '%', L2.share == null ? '-' : L2.share.toFixed(1) + '%'],
    ['Total Members', nfmt(L1.totalMembers), nfmt(L2.totalMembers)], ['Active Members', nfmt(L1.activeMembers), nfmt(L2.activeMembers)], ['Loyalty % (Members / Users)', pf1(L1.loyaltyPct), pf1(L2.loyaltyPct)],
    ['New Members', nfmt(L1.newMembers), nfmt(L2.newMembers)], ['New via App', `${nfmt(L1.newApp)} (${pf1(div(L1.newApp, L1.newMembers) * 100)})`, `${nfmt(L2.newApp)} (${pf1(div(L2.newApp, L2.newMembers) * 100)})`],
    ['New via Web', `${nfmt(L1.newWeb)} (${pf1(div(L1.newWeb, L1.newMembers) * 100)})`, `${nfmt(L2.newWeb)} (${pf1(div(L2.newWeb, L2.newMembers) * 100)})`]];
  const lyTbl = all ? tpTable('Loyalty (AppFront)', ['Metric','All Locations'], lyRows.map(r => [r[0], r[1]]), null) : tpTable('Loyalty (AppFront)', ['Metric', loc, 'All Locations'], lyRows, null);
  const T = c.catTotal || {}, pc = (x, y) => x && y ? (x / y * 100).toFixed(1) + '%' : '-';
  const catRows = ce ? [['Calls', 'calls'], ['Calls Connected', 'connected'], ['% Calls Connected', 'pctC'], ['Calls ≥ 90 sec', 'over90'], ['% of Calls ≥ 90 sec', 'pct90'], ['Emails', 'emails'], ['Opens', 'opens'], ['Open Rate', 'pctO'], ['MQLs', 'mqls'], ['MQLs with a FUP Date', 'mqlFup'], ['% MQLs with a FUP Date', 'pctF']].map(([lab, key]) => {
      const val = d => key === 'pctC' ? pc(d.connected, d.calls) : key === 'pct90' ? pc(d.over90, d.connected) : key === 'pctO' ? pc(d.opens, d.emails) : key === 'pctF' ? pc(d.mqlFup, d.mqls) : nfmt(d[key]);
      return all ? [lab, val(ce)] : [lab, val(ce), (key === 'pctC' || key === 'pct90' || key === 'pctO' || key === 'pctF') ? '-' : pc(ce[key], T[key]), val(T)]; }) : null;
  const catTbl = ce ? (all ? tpTable(`Catering Outreach (Week of ${c.catWeek})`, ['Metric','Catering Team'], catRows, null) : tpTable(`Catering Outreach (Week of ${c.catWeek})`, ['Metric', loc, 'Share of Team', 'Catering Team'], catRows, null))
    : `<section class="card panel"><div class="panel-h"><span class="t-title">Catering Outreach (Week of ${c.catWeek || '-'})</span></div><div class="muted-line">The catering outreach sheet tracks ${Object.keys(DATA.catering?.location?.locations || {}).join(', ') || 'no locations'}. ${loc} has no outreach figures this week.</div></section>`;

  /* ---------- how the locations compare (selected one highlighted) ---------- */
  const cmp = l => { const x = comp[l]; return [l, money(x.sales.a), pill(x.sales.v), ratingTxt(x.rAll.rating), x.rAll.n, T_m0(x.deliv), waitPill(x.ue.avoid), waitPill(x.dd.avoid), nfmt(x.ly.newMembers), x.cat ? nfmt(x.cat.mqls) : 'NA']; };
  let cmpTbl = tpTable('How the Locations Compare', ['Location','Net Sales','Var % vs LY','Guest Rating','# Reviews','Delivery App Sales','UE Avoidable Wait','DD Avoidable Wait','New Loyalty Members','Catering MQLs'],
    LOCATIONS.map(cmp), ['All Locations', money(co.sales.a), pill(co.sales.v), ratingTxt(co.rAll.rating), co.rAll.n, T_m0(co.deliv), waitPill(co.ue.avoid), waitPill(co.dd.avoid), nfmt(co.ly.newMembers), co.cat ? nfmt(co.cat.mqls) : 'NA']);
  if (!all) cmpTbl = cmpTbl.replace(`<tr><td>${loc}</td>`, `<tr class="selrow"><td>${loc}</td>`);

  return `<div class="ov-two">${salesTbl}${sellTbl}</div>` + fbTbl + dTbl + `<div class="ov-two">${lyTbl}${catTbl}</div>` + cmpTbl;
}

/* ---------- Location tab: the visual scorecard (rules in plain JavaScript, no external service) ---------- */
export function renderLocation(){
  const loc = locSel, c = locCalc(loc), comp = {}; LOCATIONS.forEach(l => comp[l] = locCalc(l)); const co = locCalc('All Locations'), all = c.all, s = c.sales, ce = c.cat;
  const wl = weekLabels(DATA.weekly?.meta?.weekStart);
  document.getElementById('locMeta').textContent = `Week ${wl.no} (${wl.range})`;
  const rk = fn => { const mine = fn(c); if(mine == null || isNaN(mine)) return null; return 1 + LOCATIONS.filter(l => { const v = fn(comp[l]); return v != null && !isNaN(v) && v > mine; }).length; };
  const nLoc = fn => LOCATIONS.filter(l => { const v = fn(comp[l]); return v != null && !isNaN(v); }).length;
  const CH_RAMP = CHANNELS.map((c, i) => c.color || ['#9f7cef', '#f9a8d4', '#86efac', '#fcd34d', '#93c5fd'][i % 5]);            // channels: the same colours as the Revenue Channels donut
  const PL_COL = RW_COL;   // platforms: the dashboard's own platform colours (Reviews tab)
  const f2n = v => v == null ? 'NA' : v.toFixed(2), arrow = v => v == null ? '' : v >= 0 ? '▲' : '▼';
  const tt = x => String(x).replace(/<.*?>/g, '').replace(/"/g, '&quot;');   // text for hover tips
  const chip = (t, tone) => `<span class="lc-chip ${tone}">${t}</span>`;
  const varChip = (v, tail) => v == null ? chip('no LY', 'info') : chip(`${arrow(v)} ${pct(v)}${tail || ''}`, v >= 0 ? 'pos' : 'neg');
  const waitTxt = v => (v == null || isNaN(v)) ? '-' : T_ms(v).replace(/<.*?>/g, '');
  const waitTone = v => v == null || isNaN(v) ? 'info' : v >= WAIT_BAD ? 'neg' : v >= WAIT_GOOD ? 'flat' : 'pos';
  const errTone = v => v == null || !isFinite(v) ? 'info' : v >= 2 ? 'neg' : v >= .5 ? 'flat' : 'pos';
  const spark = (vals, w = 112, h = 34) => { const v = vals.map(x => x || 0), mx = Math.max(...v, 1), pts = v.map((y, i) => [(i / (v.length - 1 || 1)) * (w - 10) + 5, h - 5 - (y / mx) * (h - 11)]);
    return `<svg class="lc-spark" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}"><polyline fill="none" stroke="#8b5cf6" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" points="${pts.map(p => p.map(n => n.toFixed(1)).join(',')).join(' ')}"/>${pts.map((p, i) => `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="${i === pts.length - 1 ? 3.4 : 2}" fill="#8b5cf6"/><circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="7" fill="transparent"><title>${i === pts.length - 1 ? 'This week' : (pts.length - 1 - i) + ' week' + (pts.length - 1 - i > 1 ? 's' : '') + ' ago'}: ${nfmt(v[i])}</title></circle>`).join('')}</svg>`; };
  const ring = (parts, centre, size, tip) => { let acc = 0; const stops = parts.filter(p => p.v > 0).map(p => { const from = acc; acc += p.v; return `${p.col} ${from}% ${acc}%`; }); if (acc < 100) stops.push(`#e5e7eb ${acc}% 100%`);
    return `<div class="lc-ring"${tip ? ` title="${tt(tip)}"` : ''} style="--d:${size || 88}px;background:conic-gradient(${stops.join(',') || '#e5e7eb 0 100%'})"><span>${centre}</span></div>`; };
  const stars = r => `<span class="lc-stars" title="${r == null ? 'No rating' : r.toFixed(2) + ' out of 5 stars'}" style="--p:${r == null ? 0 : r / 5 * 100}%">★★★★★</span>`;
  const COLS5 = ['#4c1d95','#7c3aed','#9f7cef','#d4c8f5','#e5e7eb'];   // 5 stars dark purple ... 1 star light grey
  const stack = st => st.n ? `<div class="stackbar wide">${st.s.map((v, i) => `<span title="${5 - i} star: ${v}" style="width:${v / st.n * 100}%;background:${COLS5[i]}"></span>`).join('')}</div>` : '<div class="stackbar wide"></div>';

  /* ---------- hero: who, which week, where they rank ---------- */
  const medalCls = r => r === 1 ? 'g' : r === 2 ? 's' : r === 3 ? 'b' : '';
  const medal = (r, n, label) => r == null ? '' : `<div class="lc-medal ${medalCls(r)}"><b>#${r}</b><span>of ${n}<br>${label}</span></div>`;
  let badges;
  if (all && CO) badges = '';   // a location login sees the company total here, not a league of other restaurants
  else if (all) {
    const lv = LOCATIONS.map(l => [l, comp[l].sales.v]).filter(x => x[1] != null).sort((x, y) => y[1] - x[1]), rt = LOCATIONS.filter(l => comp[l].rAll.rating != null).sort((x, y) => comp[y].rAll.rating - comp[x].rAll.rating), nm = [...LOCATIONS].sort((x, y) => (comp[y].ly.newMembers || 0) - (comp[x].ly.newMembers || 0));
    badges = (lv.length ? `<div class="lc-medal g"><b>▲</b><span>Best growth<br>${lv[0][0]} ${pct(lv[0][1])}</span></div><div class="lc-medal w"><b>▼</b><span>Weakest<br>${lv[lv.length - 1][0]} ${pct(lv[lv.length - 1][1])}</span></div>` : '') +
             (rt.length ? `<div class="lc-medal s"><b>★</b><span>Top rated<br>${rt[0]} ${f2n(comp[rt[0]].rAll.rating)}</span></div>` : '') + `<div class="lc-medal b"><b>+</b><span>Most new members<br>${nm[0]} ${nfmt(comp[nm[0]].ly.newMembers)}</span></div>`;
  } else badges = LOCATIONS.length < 2 ? '' : medal(rk(x => x.sales.a), LOCATIONS.length, 'Net sales') + medal(rk(x => x.sales.v), LOCATIONS.length, 'Growth vs LY') + medal(rk(x => x.rAll.rating), nLoc(x => x.rAll.rating), 'Guest rating') + medal(rk(x => x.ly.newMembers), LOCATIONS.length, 'New members') + (ce ? medal(rk(x => x.cat ? x.cat.mqls : null), nLoc(x => x.cat ? x.cat.mqls : null), 'Catering MQLs') : '');
  const hero = `<section class="lc-hero"><div><h2>${loc}</h2><div class="sub">Week ${wl.no} · ${wl.range}</div></div><div class="lc-badges">${badges}</div></section>`;

  /* ---------- at a glance: plain sentences, green = going well, amber = keep an eye, red = needs attention ---------- */
  let glance = '';
  if (!all) {
    const G1 = [], add = (tone, t) => G1.push(`<li class="${tone}"><i></i><span>${t}</span></li>`);
    if (s.v != null) add(s.v >= 0 ? 'pos' : 'neg', `Net sales are <b>${money(s.a)}</b>, ${s.v >= 0 ? 'up' : 'down'} <b>${pct(Math.abs(s.v))}</b> on the same week last year.`);
    const rt = c.rAll.rating;
    if (rt != null) add(rt >= 4.5 ? 'pos' : rt >= 4 ? 'flat' : 'neg', `Guests rate ${loc} <b>${rt.toFixed(2)}</b> from ${c.rAll.n} reviews this week.`);
    const low = (c.rAll.s || []).slice(3).reduce((t, v) => t + v, 0);
    add(low ? 'neg' : 'pos', low ? `<b>${low}</b> review${low > 1 ? 's' : ''} with 1 or 2 stars to read and answer.` : 'No 1 or 2 star reviews this week.');
    [['Uber Eats', c.ue], ['DoorDash', c.dd]].forEach(([n, d]) => {
      if (d.avoid != null && isFinite(d.avoid)) add(waitTone(d.avoid) === 'neg' ? 'neg' : waitTone(d.avoid) === 'flat' ? 'flat' : 'pos', `${n}: guests wait <b>${waitTxt(d.avoid)}</b> longer than they should for pick-up${waitTone(d.avoid) === 'pos' ? ', which is good' : ''}.`);
      if (d.err != null && isFinite(d.err) && errTone(d.err) !== 'pos') add(errTone(d.err), `${n}: <b>${T_p1(d.err).replace(/<.*?>/g, '')}</b> of orders had a problem.`);
    });
    glance = `<section class="card panel lc-glance"><div class="panel-h"><span class="t-title">This week at a glance</span><span class="lc-key"><u class="gd"></u>Going well<u class="am"></u>Keep an eye<u class="rd"></u>Needs attention</span></div><ul>${G1.join('')}</ul></section>`;
  }

  /* ---------- five tiles ---------- */
  const mx = Math.max(s.a || 0, s.l || 0) || 1;
  const t1 = `<div class="lc-tile"><div class="k">Net Sales</div><div class="v">${money(s.a)}</div>${varChip(s.v, ' vs LY')}
    <div class="lc-twin"><div><i class="a" title="This year: ${money(s.a)}" style="width:${(s.a || 0) / mx * 100}%"></i><span>This year</span></div><div><i class="l" title="Last year: ${money(s.l)}" style="width:${(s.l || 0) / mx * 100}%"></i><span>Last year ${money(s.l)}</span></div></div></div>`;
  const rr = c.rAll.rating, dvr = c.rAllPv && rr != null && c.rAllPv.rating != null ? rr - c.rAllPv.rating : null;
  const t2 = `<div class="lc-tile"><div class="k">Guest Rating</div><div class="v">${f2n(rr)}</div>${stars(rr)}<div class="lc-row2"><span class="mut">${c.rAll.n} reviews</span>${dvr == null ? '' : chip(`${dvr >= 0 ? '▲ +' + dvr.toFixed(2) : '▼ (' + Math.abs(dvr).toFixed(2) + ')'} vs LW`, dvr >= 0 ? 'pos' : 'neg')}</div></div>`;
  const ueS = c.ue.sales || 0, ddS = c.dd.sales || 0, dtot = (ueS + ddS) || 1;
  const t3 = `<div class="lc-tile"><div class="k">Delivery App Sales</div><div class="v">${money(c.deliv)}</div><div class="lc-split"><i title="Uber Eats: ${T_m0(ueS)}" style="width:${ueS / dtot * 100}%;background:${PL_COL['Uber Eats']}"></i><i title="DoorDash: ${T_m0(ddS)}" style="width:${ddS / dtot * 100}%;background:${PL_COL['DoorDash']}"></i></div>
    <div class="lc-legend"><span><u style="background:${PL_COL['Uber Eats']}"></u>Uber Eats ${T_m0(ueS)}</span><span><u style="background:${PL_COL['DoorDash']}"></u>DoorDash ${T_m0(ddS)}</span></div></div>`;
  const nm = c.ly.newMembers || 0, app = c.ly.newApp || 0, web = c.ly.newWeb || 0, oth = Math.max(0, nm - app - web), pa = nm ? app / nm * 100 : 0, pw = nm ? web / nm * 100 : 0;
  const t4 = `<div class="lc-tile"><div class="k">New Loyalty Members</div><div class="lc-tilerow"><div><div class="v">${nfmt(nm)}</div>${chip(`${pa.toFixed(0)}% app`, 'info')}</div>${ring([{ v:pa, col:'#9f7cef' }, { v:pw, col:'#93c5fd' }, { v:100 - pa - pw, col:'#d1d5db' }], '', 64, `New members: App ${nfmt(app)} (${pa.toFixed(0)}%), Web ${nfmt(web)} (${pw.toFixed(0)}%)`)}</div>
    <div class="lc-legend"><span><u style="background:#8b5cf6"></u>App ${nfmt(app)}</span><span><u style="background:#93c5fd"></u>Web ${nfmt(web)}</span></div></div>`;
  const cw = (DATA.catering?.locationWeeks || []), cwT = CO?.catering ? CO.catering.weekTotals : cw.map(b => b.total), serie = cw.map((b, i) => all ? cwT[i]?.mqls : b.locations?.[loc]?.mqls);
  const t5 = ce ? `<div class="lc-tile"><div class="k">Catering MQLs</div><div class="lc-tilerow"><div><div class="v">${nfmt(ce.mqls)}</div>${chip(`${nfmt(ce.calls)} calls`, 'info')}</div>${spark(serie)}</div><div class="lc-legend"><span>Last ${serie.length} weeks</span></div></div>`
    : `<div class="lc-tile off"><div class="k">Catering MQLs</div><div class="lc-empty">Not tracked<br>in the outreach sheet</div></div>`;
  const tiles = `<section class="lc-grid5">${t1}${t2}${t3}${t4}${t5}</section>`;

  /* ---------- how this location compares with the company (or, for All Locations, the league of locations) ---------- */
  let vsPanel;
  if (all) {
    const lm = Math.max(...LOCATIONS.map(l => Math.max(comp[l].sales.a || 0, comp[l].sales.l || 0)), 1);
    vsPanel = `<section class="card panel"><div class="panel-h"><span class="t-title">Net Sales by Location</span><span class="lc-key"><u class="a"></u>This week<u class="l"></u>Last year</span></div><div class="lc-bls">${LOCATIONS.map(l => { const x = comp[l].sales;
      return `<div class="lc-bl"><div class="nm">${l}</div><div class="trk" title="${l}: this week ${money(x.a)}, last year ${money(x.l)}"><div class="fill" style="width:${(x.a || 0) / lm * 100}%"></div><b class="tick" style="left:${(x.l || 0) / lm * 100}%"></b></div><div class="amt">${money(x.a)}</div>${varChip(x.v)}</div>`; }).join('')}</div></section>`;
  } else {
    const rows = [
      { lb:'Sales growth<small>vs the same week last year. Bar to the right of the centre line = sales went up, to the left = down</small>', v:s.v, c:co.sales.v, fmt:v => v == null ? '-' : arrow(v) + ' ' + pct(v), best:'high', mode:'div' },
      { lb:'Guest rating', v:rr, c:co.rAll.rating, fmt:f2n, best:'high', mode:'pos', max:5 },
      { lb:'Uber Eats avoidable wait', v:c.ue.avoid, c:co.ue.avoid, fmt:waitTxt, best:'low', mode:'pos' },
      { lb:'DoorDash avoidable wait', v:c.dd.avoid, c:co.dd.avoid, fmt:waitTxt, best:'low', mode:'pos' },
      { lb:'Uber Eats order errors', v:c.ue.err, c:co.ue.err, fmt:T_p1, best:'low', mode:'pos' },
      { lb:'DoorDash order errors', v:c.dd.err, c:co.dd.err, fmt:T_p1, best:'low', mode:'pos' },
      { lb:'New loyalty members', v:nm, c:co.ly.newMembers / 7, fmt:nfmt, best:'high', mode:'pos' }];
    vsPanel = `<section class="card panel"><div class="panel-h"><span class="t-title">${loc} vs All Locations</span><span class="lc-key"><u class="a"></u>${loc}<u class="co"></u>All Locations</span></div><div class="lc-vs">${rows.map(r => {
      const nul = r.v == null || r.c == null || isNaN(r.v) || isNaN(r.c), good = nul ? null : (r.best === 'high' ? r.v >= r.c : r.v <= r.c), col = good == null ? '#9ca3af' : good ? '#86efac' : '#ef4444';
      const tip = tt(`${loc}: ${nul && r.v == null ? '-' : r.fmt(r.v)}. All Locations: ${r.c == null ? '-' : r.fmt(r.c)}`);
      let bar;
      if (r.mode === 'div') { const sc = Math.max(Math.abs(r.v || 0), Math.abs(r.c || 0), 5) * 1.15, z = 50, bv = z + (r.v || 0) / sc * 50, mc = z + (r.c || 0) / sc * 50;
        bar = `<div class="trk div" title="${tip}"><i class="zero" title="0% means the same sales as the same week last year"></i><span class="zlab">0%</span><div class="fill" style="left:${Math.min(z, bv)}%;width:${Math.abs(bv - z)}%;background:#8b5cf6"></div><b class="tick" style="left:${mc}%"></b></div>`; }
      else { const sc = r.max || Math.max((r.c || 0) * 2, (r.v || 0) * 1.1, 0.001); bar = `<div class="trk" title="${tip}"><div class="fill" style="left:0;width:${Math.min(100, Math.max(0, r.v || 0) / sc * 100)}%;background:#8b5cf6"></div><b class="tick" style="left:${Math.min(100, (r.c || 0) / sc * 100)}%"></b></div>`; }
      return `<div class="lc-vr"><div class="lb">${r.lb}</div>${bar}<div class="val" style="color:${col}">${nul && r.v == null ? '-' : r.fmt(r.v)}</div><div class="co">All Locations ${r.c == null ? '-' : r.fmt(r.c)}</div></div>`; }).join('')}</div></section>`;
  }

  /* ---------- sales by channel (ring + bars with a last-year marker) and what is selling ---------- */
  const csum = c.chan.reduce((t, x) => t + x.a, 0), cl = c.chan.reduce((t, x) => t + x.l, 0), cmax = Math.max(...c.chan.map(x => Math.max(x.a, x.l)), 1);
  const chRing = ring(CHANNELS.map((ch, i) => ({ v: csum ? c.chan[i].a / csum * 100 : 0, col: CH_RAMP[i % CH_RAMP.length] })), `<small>Total</small><strong>${money(csum)}</strong>`, 124, c.chan.filter(x => x.a).map(x => `${x.name} ${money(x.a)} (${csum ? (x.a / csum * 100).toFixed(1) : 0}%)`).join(', '));
  const chBars = c.chan.filter(x => x.a || x.l).map(x => { const col = CH_RAMP[CHANNELS.findIndex(k => k.name === x.name) % CH_RAMP.length];
    return `<div class="lc-bl"><div class="nm"><i style="background:${col}"></i>${x.name}</div><div class="trk" title="${x.name}: this week ${money(x.a)}, last year ${money(x.l)}"><div class="fill" style="width:${x.a / cmax * 100}%;background:${col}"></div><b class="tick" style="left:${x.l / cmax * 100}%"></b></div><div class="amt">${money(x.a)}</div>${varChip(varPct(x.a, x.l))}</div>`; }).join('');
  const chPanel = `<section class="card panel"><div class="panel-h"><span class="t-title">Sales by Channel</span><span class="lc-key"><u class="a"></u>This week<u class="l"></u>Last year</span></div><div class="lc-chwrap">${chRing}<div class="lc-bls">${chBars}</div></div></section>`;
  const top8 = c.cats.slice(0, 8), tmax = top8.length ? top8[0].a : 1;
  const sellPanel = `<section class="card panel"><div class="panel-h"><span class="t-title">What's Selling</span><span class="lc-key">share of net sales</span></div><div class="lc-bls">${top8.map((x, i) => `<div class="lc-bl sell"><div class="rk">${i + 1}</div><div class="nm">${x.name}</div><div class="trk" title="${tt(x.name)}: ${money(x.a)} (${csum ? (x.a / csum * 100).toFixed(1) : '0.0'}% of net sales)"><div class="fill" style="width:${x.a / tmax * 100}%"></div></div><div class="amt">${money(x.a)}</div><span class="lc-pct">${csum ? (x.a / csum * 100).toFixed(1) : '0.0'}%</span></div>`).join('')}</div></section>`;

  /* ---------- guest feedback: one tile per platform ---------- */
  const fbTiles = c.rv.filter(x => x.on).map(x => { if (!x.on) return `<div class="lc-plat off"><div class="hd">${x.p}</div><div class="lc-empty">Not connected<br>at this location</div></div>`;
    const dv = x.pv && x.n && x.pv.n ? x.rating - x.pv.rating : null, low = x.s[3] + x.s[4];
    return `<div class="lc-plat"><div class="hd">${x.p}</div><div class="rt">${x.n ? x.rating.toFixed(2) : 'NA'}</div>${stars(x.n ? x.rating : null)}<div class="lc-row2"><span class="mut">${x.n} reviews</span>${dv == null ? '' : chip(`${dv >= 0 ? '▲ +' + dv.toFixed(2) : '▼ (' + Math.abs(dv).toFixed(2) + ')'}`, dv >= 0 ? 'pos' : 'neg')}</div>${stack(x)}${low ? `<div class="lc-low">${low} low-star review${low > 1 ? 's' : ''}</div>` : '<div class="lc-low ok">No low-star reviews</div>'}</div>`; }).join('');
  const allPl = `<div class="lc-plat all"><div class="hd">All Platforms</div><div class="rt">${f2n(rr)}</div>${stars(rr)}<div class="lc-row2"><span class="mut">${c.rAll.n} reviews</span></div>${stack(c.rAll)}<div class="lc-legend mini">${c.rAll.s.map((v, i) => `<span><u style="background:${COLS5[i]}"></u>${5 - i}★ ${v}</span>`).join('')}</div></div>`;
  const fbPanel = `<section class="card panel"><div class="panel-h"><span class="t-title">Guest Feedback (7 Days)</span><span class="lc-key">vs last week</span></div><div class="lc-plats">${fbTiles}${allPl}</div></section>`;

  /* ---------- delivery apps: meters with green / amber / red zones; the dot is this location, the tick is all stores ---------- */
  const G = '#86efac', A = '#fcd34d', R = '#fecaca';
  const meter = (label, v, cv, scale, zones, fmt, tone) => { const pos = x => Math.max(0, Math.min(100, (x - scale[0]) / (scale[1] - scale[0]) * 100)), ok = x => x != null && !isNaN(x) && isFinite(x);
    return `<div class="lc-m"><div class="top"><span>${label}</span><strong class="${tone(v)}">${ok(v) ? fmt(v) : '-'}</strong></div><div class="trk" title="${tt(label + ': ' + (ok(v) ? fmt(v) : '-') + (all ? '' : '. All stores: ' + (ok(cv) ? fmt(cv) : '-')))}"><span class="zn">${zones.map(z => `<i style="left:${pos(z[0])}%;width:${pos(z[1]) - pos(z[0])}%;background:${z[2]}"></i>`).join('')}</span>${!all && ok(cv) ? `<b class="mk co" style="left:${pos(cv)}%"></b>` : ''}${ok(v) ? `<b class="mk loc" style="left:${pos(v)}%"></b>` : ''}</div>${all ? '' : `<div class="cmp">All stores ${ok(cv) ? fmt(cv) : '-'}</div>`}</div>`; };
  const dpanel = (name, d, dco, key) => { const roas = v => (v == null || !isFinite(v)) ? chip('-', 'info') : chip(v.toFixed(2) + '×', key === 'dd' && v >= 4 ? 'pos' : 'flat');
    const tags = d.top ? `<div class="lc-tags">${d.top.split(',').map(t => `<span class="lc-tag">${t.trim()}</span>`).join('')}</div>` : '';
    return `<section class="card panel"><div class="panel-h"><span class="t-title">${name}</span></div>
      <div class="lc-stats"><div><small>Sales</small><b>${T_m0(d.sales)}</b></div><div><small>Orders</small><b>${T_n(d.orders)}</b></div><div><small>Avg order</small><b>${T_m0(d.aov)}</b></div><div><small>Net payout</small><b>${T_m0(d.payout)}</b></div></div>
      ${meter('Avoidable wait', d.avoid, dco.avoid, [0, 2], [[0, .5, G], [.5, 1, A], [1, 2, R]], waitTxt, waitTone)}
      ${meter('Order error rate', d.err, dco.err, [0, 4], [[0, .5, G], [.5, 2, A], [2, 4, R]], T_p1, errTone)}
      ${meter('Store uptime', d.up, dco.up, [95, 100], [[95, 98, R], [98, 99.5, A], [99.5, 100, G]], T_p1, v => v == null || isNaN(v) ? 'info' : v >= 99.5 ? 'pos' : v >= 98 ? 'flat' : 'neg')}
      ${key === 'dd' ? `<div class="lc-roas"><span>Promo ROAS</span>${roas(d.promo)}<span>Sponsor ROAS</span>${roas(d.spons)}</div>` : ''}${tags}</section>`; };
  const deliv = `<div class="ov-two">${dpanel('Uber Eats', c.ue, co.ue, 'ue')}${dpanel('DoorDash', c.dd, co.dd, 'dd')}</div>`;

  /* ---------- loyalty and catering ---------- */
  const L1 = c.ly, L2 = co.ly, lp = L1.loyaltyPct, lpc = L2.loyaltyPct;
  const lyPanel = `<section class="card panel"><div class="panel-h"><span class="t-title">Loyalty (AppFront)</span></div><div class="lc-lyrow">${ring([{ v:pa, col:'#9f7cef' }, { v:pw, col:'#93c5fd' }, { v:100 - pa - pw, col:'#d1d5db' }], `<small>New members</small><strong>${nfmt(nm)}</strong>`, 132, `New members: App ${nfmt(app)} (${pa.toFixed(0)}%), Web ${nfmt(web)} (${pw.toFixed(0)}%)${oth ? ', Other ' + nfmt(oth) : ''}`)}
    <div class="lc-lyside"><div class="lc-legend col"><span><u style="background:#8b5cf6"></u>App ${nfmt(app)} (${pa.toFixed(0)}%)</span><span><u style="background:#93c5fd"></u>Web ${nfmt(web)} (${pw.toFixed(0)}%)</span>${oth ? `<span><u style="background:#d1d5db"></u>Other ${nfmt(oth)}</span>` : ''}</div>
    <div class="lc-prog"><div class="top"><span>Members of all app users</span><strong>${pf1(lp)}</strong></div><div class="trk" title="${loc}: ${pf1(lp)}${all || lpc == null ? '' : '. All stores: ' + pf1(lpc)}"><div class="fill" style="width:${Math.min(100, lp || 0)}%"></div>${all || lpc == null ? '' : `<b class="tick" style="left:${Math.min(100, lpc)}%"></b>`}</div></div>
    <div class="lc-prog"><div class="top"><span>AppFront sales ${usd0(L1.sales)}</span><strong>${L1.share == null ? '-' : L1.share.toFixed(1) + '% of net sales'}</strong></div><div class="trk" title="AppFront sales ${usd0(L1.sales)}: ${L1.share == null ? '-' : L1.share.toFixed(1) + '% of net sales'}"><div class="fill" style="width:${Math.min(100, L1.share || 0)}%"></div></div></div>
    <div class="lc-row2">${varChip(L1.v, ' vs prior period')}</div></div></div></section>`;
  let catPanel;
  if (ce) { const T = c.catTotal || {}, bars = (arr) => { const base = arr[0][1] || 1; return arr.map(([lb, v, prev], i) => `<div class="lc-fn"><div class="lb">${lb}</div><div class="trk" title="${lb}: ${nfmt(v)}${i && prev ? ' (' + (v / prev * 100).toFixed(1) + '% of ' + arr[i - 1][0].toLowerCase() + ')' : ''}"><div class="fill" style="width:${Math.max(1.5, v / base * 100)}%"></div></div><div class="n">${nfmt(v)}</div><span class="lc-pct">${i ? (prev ? (v / prev * 100).toFixed(1) + '%' : '-') : ''}</span></div>`).join(''); };
    const share = !all && T.calls ? ce.calls / T.calls * 100 : null;
    catPanel = `<section class="card panel"><div class="panel-h"><span class="t-title">Catering Outreach (Week of ${c.catWeek})</span>${share == null ? '' : chip(`${share.toFixed(0)}% of team calls`, 'info')}</div>
      <div class="lc-fns"><div><h4>Calls</h4>${bars([['Calls', ce.calls], ['Connected', ce.connected, ce.calls], ['Over 90 sec', ce.over90, ce.connected]])}</div>
      <div><h4>Emails</h4>${bars([['Sent', ce.emails], ['Opened', ce.opens, ce.emails]])}</div>
      <div><h4>Leads</h4>${bars([['MQLs', ce.mqls], ['With FUP date', ce.mqlFup, ce.mqls]])}</div></div>
      <div class="lc-trend"><span class="mut">Calls, last ${cw.length} weeks</span>${spark(cw.map((b, i) => all ? cwT[i]?.calls : b.locations?.[loc]?.calls), 150, 38)}<span class="mut">MQLs</span>${spark(serie, 150, 38)}</div></section>`;
  } else catPanel = `<section class="card panel"><div class="panel-h"><span class="t-title">Catering Outreach (Week of ${c.catWeek || '-'})</span></div><div class="lc-empty big">Outreach is tracked for ${Object.keys(DATA.catering?.location?.locations || {}).join(', ') || 'no locations'}.<br>${loc} has no outreach figures this week.</div></section>`;

  /* ---------- league table: the best figure in each column is bold ---------- */
  const heat = (fn, high) => { const vals = LOCATIONS.map(l => fn(comp[l])).filter(v => v != null && !isNaN(v)), best = vals.length > 1 ? (high ? Math.max(...vals) : Math.min(...vals)) : null; return v => v != null && v === best ? 'font-weight:700;color:#5b21b6' : ''; };
  const defs = [['Net Sales', x => x.sales.a, true, v => money(v)], ['Growth vs LY', x => x.sales.v, true, v => pill(v)], ['Guest Rating', x => x.rAll.rating, true, v => f2n(v)], ['Delivery App Sales', x => x.deliv, true, v => T_m0(v)],
    ['UE Avoidable Wait', x => x.ue.avoid, false, v => waitPill(v)], ['DD Avoidable Wait', x => x.dd.avoid, false, v => waitPill(v)], ['New Loyalty Members', x => x.ly.newMembers, true, v => nfmt(v)], ['Catering MQLs', x => x.cat ? x.cat.mqls : null, true, v => nfmt(v)]];
  const hs = defs.map(d => heat(d[1], d[2]));
  const cmpRows = LOCATIONS.map(l => [l, ...defs.map((d, i) => { const v = d[1](comp[l]); return `<span class="hm" style="${hs[i](v)}">${v == null ? 'NA' : d[3](v)}</span>`; })]);
  const cmpTot = ['All Locations', ...defs.map(d => { const v = d[1](co); return v == null ? 'NA' : d[3](v); })];
  let cmp = tpTable('How the Locations Compare', ['Location', ...defs.map(d => d[0])], cmpRows, cmpTot);
  if (!all) cmp = cmp.replace(`<tr><td>${loc}</td>`, `<tr class="selrow"><td>${loc}</td>`);

  document.getElementById('locBody').innerHTML = hero + glance + tiles + vsPanel + `<div class="ov-two">${chPanel}${sellPanel}</div>` + fbPanel + deliv + `<div class="ov-two">${lyPanel}${catPanel}</div>` + cmp +
    `<details class="lc-details"><summary>Detailed numbers</summary>${locTables(loc, c, co, comp)}</details>`;
}
