// @ts-nocheck
/* eslint-disable */
// Ported verbatim from reference/index.html (the source of truth for every number and layout).
// DOM-string rendering, so the types are loose; the public entry is mount() in ./main.ts and the data contract is Boot in src/lib/data/boot.ts.
import { Chart, DATA, css, grid } from './core';
import { kcard, noEm } from './tpd';

/* =========================================================================
   MARKETING  -> sub-tabs: Catering Marketing | Loyalty Marketing
   Loyalty Marketing = the AppFront campaign KPIs, chart and table (moved from Loyalty); see the LOYALTY block.
   Catering Marketing: "Email Campaigns - Last 30/90 Days (Apollo)" table in the RASA format.
   DATA.marketing.apollo[7|30] = [ { name, sent, delivered, bounced, spamBlocked, unsubscribed, opened, replied } ]
   Source: WBR Input 1.xlsx > Apollo tab: 7-day block C4:J9 (rows 6-8), 30-day block C12:J17 (rows 14-16); Total rows = sum of campaign rows (verified)
   Opened % = opened / delivered (reproduces RASA: 23/167 = 14%, total 52/418 = 12%).
   ========================================================================= */
export let mkView = 'catering', mkDays = '30';
document.getElementById('mkSeg').innerHTML = [['catering','Catering Marketing'],['loyalty','Loyalty Marketing']]
  .map(([k,l]) => `<button data-v="${k}" class="${k===mkView?'on':''}">${l}</button>`).join('');
document.getElementById('mkDaysSeg').innerHTML = [['7','7 Days'],['30','30 Days']]
  .map(([k,l]) => `<button data-d="${k}" class="${k===mkDays?'on':''}">${l}</button>`).join('');
document.getElementById('mkSeg').addEventListener('click', e => { const b=e.target.closest('button'); if(!b) return; mkView=b.dataset.v;
  document.querySelectorAll('#mkSeg button').forEach(x=>x.classList.toggle('on',x===b));
  ['catering','loyalty'].forEach(v => document.getElementById('mk-'+v).hidden = v!==mkView); });
document.getElementById('mkDaysSeg').addEventListener('click', e => { const b=e.target.closest('button'); if(!b) return; mkDays=b.dataset.d;
  document.querySelectorAll('#mkDaysSeg button').forEach(x=>x.classList.toggle('on',x===b)); renderMarketing(); });

let mkCharts = [];
export function renderMarketing(){
  const rows = (DATA.marketing?.apollo?.[mkDays] || []).map(r => ({ ...r, name: noEm(r.name) })), has = rows.length>0;
  const K = ['sent','delivered','bounced','spamBlocked','unsubscribed','opened','replied'];
  const tot = {}; K.forEach(k => tot[k] = rows.reduce((s,r)=>s+(r[k]||0),0));
  const n  = v => has ? Math.round(v).toLocaleString('en-US') : '-';
  const op = r => has ? `${Math.round(r.opened).toLocaleString('en-US')}<span class="pc" style="display:inline;margin-left:6px">(${r.delivered ? Math.round(r.opened/r.delivered*100) : 0}%)</span>` : '-';
  const rt = (a, b) => has && b ? (a/b*100).toFixed(1)+'%' : '-';                  // open / reply rate = share of delivered emails
  document.getElementById('mkKpis').innerHTML =
    kcard('Sent & Delivered', n(tot.sent), `<span>Delivered: ${n(tot.delivered)}</span>`) +
    kcard('Opened & Open Rate', n(tot.opened), `<span>Open rate: ${rt(tot.opened, tot.delivered)}</span>`) +
    kcard('Replied & Reply Rate', n(tot.replied), `<span>Reply rate: ${rt(tot.replied, tot.delivered)}</span>`);
  const cells = r => `<td>${n(r.sent)}</td><td>${n(r.delivered)}</td><td>${n(r.bounced)}</td><td>${n(r.spamBlocked)}</td><td>${n(r.unsubscribed)}</td><td>${op(r)}</td><td>${n(r.replied)}</td>`;
  const card = (title, id) => `<section class="card panel"><div class="panel-h"><h3>${title}</h3></div><div class="chartbox"><canvas id="${id}"></canvas></div></section>`;
  const chartRow = has ? `<div class="ov-two">${card(`Sent, Delivered & Opened by Campaign - Last ${mkDays} Days`, 'mkFunnel')}${card(`Rates by Campaign - Last ${mkDays} Days`, 'mkCampaigns')}</div>` : '';
  document.getElementById('mkTables').innerHTML = chartRow + `<section class="card panel">
    <div class="panel-h"><span class="t-title">Email Campaigns - Last ${mkDays} Days (Apollo)</span><button class="dl" title="Download table">⤓</button></div>
    <div class="tablewrap"><table class="ctr" style="min-width:820px"><thead><tr><th>Campaigns</th><th>Sent</th><th>Delivered</th><th>Bounced</th><th>Spam Blocked</th><th>Unsubscribed</th><th>Opened</th><th>Replied</th></tr></thead>
    <tbody>${has ? rows.map(r => `<tr><td>${r.name}</td>${cells(r)}</tr>`).join('') : `<tr class="nodata"><td colspan="8">No Apollo campaign data uploaded yet</td></tr>`}
    <tr class="tot"><td>Total</td>${cells(tot)}</tr></tbody></table></div></section>`;

  mkCharts.forEach(c => c.destroy()); mkCharts = [];
  if (!has) return;
  const SEQ = ['#9f7cef', 'rgba(209,213,219,0.7)', '#93c5fd', '#f9a8d4', '#86efac'];   // bar colours in order: purple, grey, blue, pink, green
  const legend = { position: 'bottom', labels: { boxWidth: 36, boxHeight: 12, color: css('--muted') } };
  const pc = (a, b) => b ? a / b * 100 : 0;                                              // a share of b, in percent
  const scales = { x: { beginAtZero: true, grid: grid(), ticks: { color: css('--muted'), callback: v => v + '%' } }, y: { grid: grid(), ticks: { color: css('--muted') } } };
  const tip = { callbacks: { label: c => `${c.dataset.label ? c.dataset.label + ': ' : ''}${c.parsed.x.toFixed(2)}%` } };
  // left chart: one group per campaign. Sent = 100%, delivered as a share of sent, opened as a share of delivered (the open rate on the cards)
  const groups = rows;
  mkCharts.push(new Chart(document.getElementById('mkFunnel'), { type: 'bar',
    data: { labels: groups.map(r => r.name), datasets: [['Sent (100%)', r => r.sent ? 100 : 0], ['Delivered (% of sent)', r => pc(r.delivered, r.sent)], ['Opened (% of delivered)', r => pc(r.opened, r.delivered)]].map(([label, f], i) => ({ label, data: groups.map(f), backgroundColor: SEQ[i], borderRadius: 4 })) },
    options: { indexAxis: 'y', maintainAspectRatio: false, plugins: { legend, tooltip: tip }, scales: { ...scales, x: { ...scales.x, max: 100 } } } }));
  // horizontal bars of rates by campaign (right): bounced, spam blocked and unsubscribed, each as a share of the emails sent
  mkCharts.push(new Chart(document.getElementById('mkCampaigns'), { type: 'bar',
    data: { labels: rows.map(r => r.name), datasets: [['Bounce rate', r => pc(r.bounced, r.sent)], ['Spam blocked rate', r => pc(r.spamBlocked, r.sent)], ['Unsubscribe rate', r => pc(r.unsubscribed, r.sent)]].map(([label, f], i) => ({ label, data: rows.map(f), backgroundColor: SEQ[i], borderRadius: 4 })) },
    options: { indexAxis: 'y', maintainAspectRatio: false, plugins: { legend, tooltip: tip }, scales } }));
}

