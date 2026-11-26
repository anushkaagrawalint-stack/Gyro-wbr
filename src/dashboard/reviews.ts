// @ts-nocheck
/* eslint-disable */
// Ported verbatim from reference/index.html (the source of truth for every number and layout).
// DOM-string rendering, so the types are loose; the public entry is mount() in ./main.ts and the data contract is Boot in src/lib/data/boot.ts.
import { BOOT, Chart, DATA, LOCATIONS, css, grid } from './core';

/* =========================================================================
   REVIEWS & RATINGS
   Rows: [platform, location, weekStart, n5, n4, n3, n2, n1] parsed from
     SO 7 & 90  (13 weekly rows per platform/location; Yelp rows ignored)  -> 7 Days (latest week) and 90 Days (all)
     SO 30      (30-day window split by week)           -> 30 Days (all rows)
   "Klein" in the SO sheets = Spring. Ratings are recomputed from star counts
   (5*n5+4*n4+3*n3+2*n2+n1)/n, which matches the sheet's Average Rating.
   errors7d[loc] = { ue:[inaccurate, completed]  <- UE Order Accuracy cols G,F
                     dd:[missing/incorrect, delivered] <- DD Operations cols I,H }
   ========================================================================= */
export const RW_ORDER = ['Google','Yelp','Uber Eats','DoorDash'];
export const BAR_SEQ = ['#9f7cef','rgba(209,213,219,0.7)','#93c5fd','#f9a8d4','#86efac'];   // bar series, in order: purple, grey, blue, pink, green
export const RW_PLATS = { overall:RW_ORDER, google:['Google'], yelp:['Yelp'], ue:['Uber Eats'], dd:['DoorDash'] };
export const RW_NAME  = { google:'Google', yelp:'Yelp', ue:'Uber Eats', dd:'DoorDash' };
export const RW_COL   = { 'Google':'#9f7cef', 'Yelp':'#f9a8d4', 'Uber Eats':'#86efac', 'DoorDash':'#fde68a' };
// Platform integrations per location (from the platform-integrations screen):
// Google, Uber Eats and DoorDash are connected at all 7 locations; Yelp only at Fondren and Richmond (Grubhub is disconnected at Fondren and not used).
export const RW_INTEG = BOOT.integrations;
export const rwLocs = () => LOCATIONS.filter(l => RW_PLATS[rwMode].some(p => RW_INTEG[p].includes(l)));
export const RW_DAYS  = { '7':'7 Days', '30':'30 Days', '90':'90 Days' };
export let rwMode = 'overall', rwDays = '7', rwStarLoc = 'All Locations';

document.getElementById('rwModeSeg').innerHTML =
  `<button data-m="overall" class="on">Overall</button><button data-m="google">Google</button><button data-m="yelp">Yelp</button><button data-m="ue">Uber Eats</button><button data-m="dd">DoorDash</button>`;
document.getElementById('rwDaysSeg').innerHTML = Object.entries(RW_DAYS).map(([k,l]) => `<button data-d="${k}" class="${k===rwDays?'on':''}">${l}</button>`).join('');
document.getElementById('rwStarSel').innerHTML = ['All Locations', ...LOCATIONS].map(l => `<option>${l}</option>`).join('');
document.getElementById('rwModeSeg').addEventListener('click', e => { const b=e.target.closest('button'); if(!b) return; rwMode=b.dataset.m;
  document.querySelectorAll('#rwModeSeg button').forEach(x=>x.classList.toggle('on',x===b)); renderReviews(); });
document.getElementById('rwDaysSeg').addEventListener('click', e => { const b=e.target.closest('button'); if(!b) return; rwDays=b.dataset.d;
  document.querySelectorAll('#rwDaysSeg button').forEach(x=>x.classList.toggle('on',x===b)); renderReviews(); });
document.getElementById('rwStarSel').addEventListener('change', e => { rwStarLoc=e.target.value; renderReviews(); });

export function rwRows(days){
  const R = DATA.reviews || {};
  if(days==='30') return { cur:R.so30||[], prev:null };
  const all = R.so7_90 || [];
  if(days==='90') return { cur:all, prev:null };
  const weeks = [...new Set(all.map(r=>r[2]))].sort();
  const last = weeks[weeks.length-1], pw = weeks[weeks.length-2];
  return { cur:all.filter(r=>r[2]===last), prev:pw?all.filter(r=>r[2]===pw):null };
}
export function rwStats(rows, plats, loc){
  const s=[0,0,0,0,0];
  rows.forEach(r => { if(plats.includes(r[0]) && (!loc || r[1]===loc)) for(let i=0;i<5;i++) s[i]+=r[3+i]; });
  const n = s.reduce((a,b)=>a+b,0);
  return { n, s, rating: n ? (5*s[0]+4*s[1]+3*s[2]+2*s[3]+s[4])/n : null };
}
export const f2 = v => v==null ? 'NA' : v.toFixed(2);

export const rwBar = new Chart(document.getElementById('rwBar'), {
  type:'bar', data:{ labels:LOCATIONS, datasets:[{ label:'Avg Rating', data:[], backgroundColor:'#9f7cef', borderRadius:4 }] },
  options:{ maintainAspectRatio:false, plugins:{ legend:{ display:false } },
    scales:{ y:{ min:1, max:5, grid:grid(), ticks:{ color:css('--muted'), stepSize:1 } }, x:{ grid:grid(), ticks:{ color:css('--muted'), maxRotation:25 } } } }
});
export const rwStar = new Chart(document.getElementById('rwStar'), {
  type:'bar', data:{ labels:['5 Star','4 Star','3 Star','2 Star','1 Star'], datasets:[{ label:'All Locations', data:[], backgroundColor:'#9f7cef', borderRadius:4 }] },
  options:{ maintainAspectRatio:false, plugins:{ legend:{ position:'bottom', labels:{ boxWidth:36, boxHeight:12, color:css('--muted') } } },
    scales:{ y:{ beginAtZero:true, grid:grid(), ticks:{ color:css('--muted'), precision:0 } }, x:{ grid:grid(), ticks:{ color:css('--muted') } } } }
});

export function renderReviews(){
  const plats = RW_PLATS[rwMode], D = RW_DAYS[rwDays], overall = rwMode === 'overall', pn = RW_NAME[rwMode];
  const locs = rwLocs(), okRow = r => (RW_INTEG[r[0]]||[]).includes(r[1]);
  const R0 = rwRows(rwDays), cur = R0.cur.filter(okRow), prev = R0.prev ? R0.prev.filter(okRow) : null;
  const all = rwStats(cur, plats), allPrev = prev ? rwStats(prev, plats) : null;
  const lw = rwDays === '7';                                                   // "vs LW" is only shown for the 7 Days view
  const delta = (a,b) => !lw ? '' : (a==null||b==null) ? '<span>- vs LW</span>' :
    `<span class="${a-b>=0?'pos':'neg'}" style="color:${a-b>=0?'#1c9a4c':'#d33'}">${a-b>=0 ? '+'+(a-b).toFixed(2) : '('+Math.abs(a-b).toFixed(2)+')'} vs LW</span>`;   // negative change in brackets
  const sub = (...p) => p.filter(Boolean).join('<br>');
  const card = (k,v,sub) => `<div class="card kpi"><div class="k">${k}</div><div class="v">${v}</div><div class="d">${sub}</div></div>`;
  const platCard = p => { const c = rwStats(cur,[p]), pv = prev ? rwStats(prev,[p]) : null; return card(`${p} Avg Rating`, f2(c.rating), sub(delta(c.rating, pv?.rating), `${c.n} reviews`)); };
  document.getElementById('rwKpis').innerHTML = overall
    ? RW_ORDER.map(platCard).join('')                                           // Overall: one card per platform
    : card(`${pn} Avg Rating`, f2(all.rating), sub(delta(all.rating, allPrev?.rating), `${all.n} reviews`)) +
      card('5-Star Reviews', all.s[0].toLocaleString('en-US'), (() => { const p5 = allPrev ? allPrev.s[0] : null, d5 = p5 == null ? null : all.s[0] - p5;     // 5-star count, change vs last week (7 Days only) and share of all reviews
        const dl = !lw ? '' : d5 == null ? '<span>- vs LW</span>' : `<span style="color:${d5>=0?'#1c9a4c':'#d33'}">${d5>=0 ? '+'+d5 : '('+Math.abs(d5)+')'} vs LW</span>`;
        return sub(dl, all.n ? (all.s[0]/all.n*100).toFixed(1)+'% of reviews' : '-'); })());

  const head = document.getElementById('rwHead'), body = document.getElementById('rwBody');
  document.getElementById('rwTableTitle').textContent = overall ? `Reviews & Ratings by Platform (${D})` : (rwMode==='google'||rwMode==='yelp') ? `In-Store Reviews - ${pn} (${D})` : `${pn} Reviews (${D})`;
  if (overall) {                                                               // location x platform: rating and number of reviews, with a divider between platforms
    head.innerHTML = `<tr><th rowspan="2">Location</th>${[...RW_ORDER, 'All Platforms'].map(p => `<th colspan="2" class="grp gstart">${p}</th>`).join('')}</tr>` +
                     `<tr>${[...RW_ORDER, 'All'].map(() => '<th class="gstart">Rating</th><th># Reviews</th>').join('')}</tr>`;
    const prow = (name, loc, cls) => `<tr class="${cls||''}"><td>${name}</td>${RW_ORDER.map(p => { const t = rwStats(cur,[p],loc);
        return (!loc || RW_INTEG[p].includes(loc)) ? `<td class="gstart">${f2(t.rating)}</td><td>${t.n}</td>` : '<td class="gstart">NA</td><td>NA</td>'; }).join('')}${(t => `<td class="gstart">${f2(t.rating)}</td><td>${t.n}</td>`)(rwStats(cur, plats, loc))}</tr>`;
    body.innerHTML = LOCATIONS.map(l => prow(l,l)).join('') + prow('Total',null,'tot');
  } else {
    head.innerHTML = '<tr><th>Location</th><th># Reviews</th><th>Rating</th><th>5★</th><th>4★</th><th>3★</th><th>2★</th><th>1★</th></tr>';
    const row = (name, loc, cls) => { const t = rwStats(cur, plats, loc), s = t.s;
      return `<tr class="${cls||''}"><td>${name}</td><td>${t.n}</td><td>${f2(t.rating)}</td>${s.map(v=>`<td>${v}</td>`).join('')}</tr>`; };
    body.innerHTML = locs.map(l => row(l,l)).join('') + row('Total',null,'tot');
  }

  document.getElementById('rwBarTitle').textContent  = overall ? `Avg Rating by Platform (${D})` : rwMode==='google' ? `Avg Rating by Location (${D})` : `Avg Rating by Location - ${pn} (${D})`;
  document.getElementById('rwStarTitle').textContent = overall ? `Star Distribution by Platform (${D})` : rwMode==='google' ? `Star Distribution - In-Store (${D})` : `Star Distribution - ${pn} (${D})`;
  rwBar.data.labels = overall ? RW_ORDER : locs;
  rwBar.data.datasets[0].data = overall ? RW_ORDER.map(p => rwStats(cur,[p]).rating) : locs.map(l => rwStats(cur, plats, l).rating);
  rwBar.data.datasets[0].backgroundColor = overall ? RW_ORDER.map((p,i) => BAR_SEQ[i % 5]) : locs.map(() => '#9f7cef');   // one purple per bar (a single colour string would leave the per-platform colours on the first bars)
  const sel = document.getElementById('rwStarSel'), opts = ['All Locations', ...locs];
  if(sel.options.length!==opts.length || opts.some((o,i)=>sel.options[i].text!==o)) sel.innerHTML = opts.map(l => `<option>${l}</option>`).join('');
  if(!opts.includes(rwStarLoc)) rwStarLoc = 'All Locations'; sel.value = rwStarLoc;
  const sl = rwStarLoc==='All Locations' ? null : rwStarLoc;
  rwStar.data.datasets = overall
    ? RW_ORDER.map((p,i) => ({ label:p, data:rwStats(cur,[p],sl).s, backgroundColor:BAR_SEQ[i % 5], borderRadius:4 }))      // one series per platform
    : [{ label:rwStarLoc, data:rwStats(cur, plats, sl).s, backgroundColor:'#9f7cef', borderRadius:4 }];
  rwBar.update(); rwStar.update();
}


