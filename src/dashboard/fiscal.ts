// @ts-nocheck
/* eslint-disable */
/* =========================================================================
   FISCAL CALENDAR (owner's reference): periods, quarters and weeks, and how Toast dining options are mapped to channels.
   A small "i" after the heading of Overview, Revenue Channels and Catering (admin and client logins) opens it in a window. Press a period to see its weeks.
   Fiscal years come from FISCAL in ./core.ts (client file FY2026_Calendar.xlsx); the mapping is the admin Mapping screen, read only.
   ========================================================================= */
import { BOOT, FISCAL, MONTHS, fiscalOf, toDate } from './core';

const long = iso => { const d = toDate(iso); return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };
const addDays = (iso, n) => new Date(toDate(iso).getTime() + n * 864e5).toISOString().slice(0, 10);
const esc = t => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');

export function renderFiscal() {
  if (!BOOT || BOOT.user?.role === 'location' || document.getElementById('fiscalCal')) return;
  const cur = BOOT.week?.weekStart ? fiscalOf(BOOT.week.weekStart) : null, years = Object.keys(FISCAL).map(Number);
  let fy = cur?.fy ?? years[years.length - 1];

  const calendar = () => {
    const ps = FISCAL[fy], first = ps[0][0];
    let totalWeeks = 0;
    const rows = ps.map((p, i) => {
      const days = Math.round((toDate(p[1]) - toDate(p[0])) / 864e5) + 1, weeks = days / 7, startNo = Math.round((toDate(p[0]) - toDate(first)) / 6048e5) + 1;
      totalWeeks += weeks;
      const isCur = cur && cur.fy === fy && cur.period === i + 1;
      const weekRows = Array.from({ length: weeks }, (_, k) => { const s = addDays(p[0], k * 7), e = addDays(s, 6), here = BOOT.week?.weekStart === s;
        return `<tr class="fc-wk fc-p${i}" hidden><td>Week ${startNo + k}</td><td>${long(s)}</td><td>${long(e)}</td><td></td><td>7</td><td>${here ? '<span class="vp pos">Week on screen</span>' : ''}</td></tr>`; }).join('');
      return `<tr class="fc-per${isCur ? ' fc-cur' : ''}" data-p="${i}" tabindex="0" role="button" aria-expanded="false"><td><span class="fc-ar">▸</span> ${i + 1}${isCur ? ' <span class="vp pos">Current</span>' : ''}</td><td>${long(p[0])}</td><td>${long(p[1])}</td><td>${p[2]}</td><td>${days}</td><td>${weeks}</td></tr>${weekRows}`;
    }).join('');
    return `<div class="tablewrap"><table class="ctr" style="min-width:640px"><thead><tr><th>Period</th><th>Start</th><th>End</th><th>Qtr</th><th>Days</th><th>Weeks</th></tr></thead><tbody>${rows}<tr class="tot"><td>Total Weeks</td><td></td><td></td><td></td><td></td><td>${totalWeeks}</td></tr></tbody></table></div>`;
  };

  const mapping = () => {
    const cats = BOOT.mapping?.categories || [];
    if (!cats.length) return '<p class="note" style="margin:8px 0 0">No mapping to show.</p>';
    const rows = cats.flatMap(c => c.lines.map((l, i) => `<tr><td>${i === 0 ? `<span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${esc(c.color)};margin-right:7px"></span>${esc(c.name)}` : ''}</td><td>${esc(l.name)}</td><td style="text-align:left;white-space:normal;min-width:260px">${l.options.length ? l.options.map(esc).join(', ') : '<span class="muted-line">none yet</span>'}</td></tr>`)).join('');
    return `<div class="tablewrap"><table class="ctr" style="min-width:640px"><thead><tr><th>Channel</th><th>Line</th><th>Toast dining options in this line</th></tr></thead><tbody>${rows}</tbody></table></div>
      <p class="note" style="margin:10px 0 0">Every dining option Toast reports is assigned to a line, and every line belongs to a channel (the groups on Revenue Channels). Options not assigned yet are counted on the Unmapped line, so no sales go missing. Changes are made in Admin, Mapping.</p>`;
  };

  // a small "i" after the heading of a tab opens this window: Overview and Revenue Channels show the fiscal calendar and the mapping, Catering only the calendar. No other tab has the button.
  const sec = document.createElement('div');
  sec.id = 'fiscalCal'; sec.hidden = true;
  sec.innerHTML = `<div class="fc-box" role="dialog" aria-modal="true" aria-label="Fiscal calendar">
      <div class="fc-top"><span class="t-title" id="fcTitle" style="font-size:13px"></span><button class="fc-x" title="Close" aria-label="Close">×</button></div>
      <div class="seg" id="fcYears" style="margin:14px 0 12px">${years.map(y => `<button data-y="${y}" class="${y === fy ? 'on' : ''}">FY${y}</button>`).join('')}</div>
      <div id="fcCal">${calendar()}</div>
      <p class="note" style="margin:10px 0 18px">Weeks run Monday to Sunday. Press a period to see its weeks; the week number is the fiscal week of the year.</p>
      <div id="fcMap"><div class="lv-h4" style="margin:0 0 6px">Dining options to channels</div>
      ${mapping()}</div>
    </div>`;
  document.body.appendChild(sec);
  let opener = null;
  const open = (o, withMapping, btn) => {
    if (o) { opener = btn; sec.querySelector('#fcMap').hidden = !withMapping; sec.querySelector('#fcTitle').textContent = withMapping ? 'Fiscal Calendar & Revenue Mapping' : 'Fiscal Calendar'; }
    sec.hidden = !o; if (o) sec.querySelector('.fc-x').focus(); else opener?.focus();
  };
  [['overview', true], ['revenue', true], ['catering', false]].forEach(([view, withMapping]) => {
    const h = document.querySelector(`#view-${view} > .filters .eyebrow`); if (!h) return;
    const btn = document.createElement('button');
    btn.className = 'fc-i'; btn.type = 'button'; btn.textContent = 'i'; btn.title = withMapping ? 'Fiscal calendar and revenue mapping' : 'Fiscal calendar'; btn.setAttribute('aria-label', btn.title);
    btn.addEventListener('click', () => open(sec.hidden, withMapping, btn));
    h.appendChild(btn);
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !sec.hidden) open(false); });

  const toggle = tr => { const o = tr.getAttribute('aria-expanded') !== 'true'; tr.setAttribute('aria-expanded', o); tr.querySelector('.fc-ar').textContent = o ? '▾' : '▸'; sec.querySelectorAll('.fc-p' + tr.dataset.p).forEach(r => r.hidden = !o); };
  sec.addEventListener('click', e => {
    if (e.target === sec || e.target.closest('.fc-x')) return open(false);
    const tr = e.target.closest('.fc-per'); if (tr) return toggle(tr);
    const b = e.target.closest('#fcYears button'); if (!b) return;
    fy = +b.dataset.y; sec.querySelectorAll('#fcYears button').forEach(x => x.classList.toggle('on', x === b)); sec.querySelector('#fcCal').innerHTML = calendar();
  });
  sec.addEventListener('keydown', e => { const tr = e.target.closest?.('.fc-per'); if (tr && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); toggle(tr); } });
}
