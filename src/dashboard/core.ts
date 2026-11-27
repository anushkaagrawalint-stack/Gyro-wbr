// @ts-nocheck
/* eslint-disable */
// Ported verbatim from reference/index.html (the source of truth for every number and layout).
// DOM-string rendering, so the types are loose; the public entry is mount() in ./main.ts and the data contract is Boot in src/lib/data/boot.ts.
import { Chart, registerables } from 'chart.js';
Chart.register(...registerables);
export { Chart };
(window as any).Chart = Chart;          // lets the parity check read chart data, like the reference page's global Chart

/* =========================================================================
   CONFIG - everything the UI needs to know about WHERE data comes from lives
   here (and mirrored in metric-registry.json). The upload/admin step fills
   DATA; the UI never reads the xlsx directly.
   ========================================================================= */
export const BOOT = (window as any).__BOOT__;                  // set by the server (per person, per week)
export const LOCATIONS = BOOT.locations;

export const PERIODS = {            // filter pill -> source sheets in "WBR Input.xlsx"
  weekly:    { label:'Weekly',          title:'Total Sales (Weekly)',   actual:'Toast Weekly-Actual',    ly:'Toast Weekly-LY'    },
  ptd:       { label:'Period to Date',  title:'Total Sales (Period)',   actual:'Toast PTD-Actual',       ly:'Toast PTD-LY'       },
  mtd:       { label:'Month to Date',   title:'Total Sales (Month)',    actual:'Toast MTD-Actual',       ly:'Toast MTD-LY'       },
  quarterly: { label:'Quarter to Date', title:'Total Sales (Quarter)',  actual:'Toast Quarterly-Actual', ly:'Toast Quarterly-LY' },
  ytd:       { label:'Year to Date',    title:'Total Sales (YTD)',      actual:'Toast YTD-Actual',       ly:'Toast YTD-LY'       },
};
export const SALES_COLUMN = 'D';    // "Net Sales" in every Toast sheet

export const TABS = BOOT.tabs;

export const LIVE_TABS = { 'Overview':'overview', 'Revenue Channels':'revenue', 'Reviews & Ratings':'reviews', '3rd Party Delivery':'tpd', 'Loyalty':'loyalty', 'Marketing':'marketing', 'Catering':'catering', 'Location':'location', 'Scorecard':'scorecard', 'Admin':'admin' };   // tab label -> view id

export const DATA = { weekly: { meta: BOOT.week } };
Object.assign(DATA, BOOT.sections || {});          // reviews, tpd, loyalty, marketing, catering (already cut to what this person may see)
export const view = { period: 'weekly' };                       // the period filter (shared by Overview and Revenue)

/* ---------- formatting ---------- */
/* header: week number (ISO week of the year) + date range, derived from the week's Monday, e.g. 2026-10-12 -> "Week 42" and "12–18 Oct" */
export const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
export const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
export function monthLabel(startISO){                                   // "October (1–18 Oct)": month of the week's last day, from the 1st up to that day
  if(!startISO) return '- (-)';
  const e = new Date(new Date(startISO+'T00:00:00Z').getTime() + 6*864e5), d = e.getUTCDate();
  return `${MONTH_NAMES[e.getUTCMonth()]} (${d === 1 ? '1' : '1–' + d} ${MONTHS[e.getUTCMonth()]})`;
}
/* ---- fiscal calendar (client file FY2026_Calendar.xlsx): per fiscal year the 12 periods as [start, end, quarter]; weeks run Monday to Sunday ---- */
export const FISCAL = { 2025:[['2024-12-30','2025-01-26',1],['2025-01-27','2025-02-23',1],['2025-02-24','2025-03-30',1],['2025-03-31','2025-04-27',2],['2025-04-28','2025-05-25',2],['2025-05-26','2025-06-29',2],['2025-06-30','2025-07-27',3],['2025-07-28','2025-08-24',3],['2025-08-25','2025-09-28',3],['2025-09-29','2025-10-26',4],['2025-10-27','2025-11-23',4],['2025-11-24','2025-12-28',4]],
                 2026:[['2025-12-29','2026-01-25',1],['2026-01-26','2026-02-22',1],['2026-02-23','2026-03-29',1],['2026-03-30','2026-04-26',2],['2026-04-27','2026-05-24',2],['2026-05-25','2026-06-28',2],['2026-06-29','2026-07-26',3],['2026-07-27','2026-08-23',3],['2026-08-24','2026-09-27',3],['2026-09-28','2026-10-25',4],['2026-10-26','2026-11-22',4],['2026-11-23','2026-12-27',4]] };
export const toDate = iso => new Date(iso + 'T00:00:00Z');
export function fiscalOf(iso){                                                // fiscal year, period, quarter and week of the fiscal year for a date
  const d = toDate(iso);
  for (const [fy, ps] of Object.entries(FISCAL)) for (let i = 0; i < ps.length; i++) if (d >= toDate(ps[i][0]) && d <= toDate(ps[i][1]))
    return { fy: +fy, period: i + 1, quarter: ps[i][2], pStart: ps[i][0], pEnd: ps[i][1], week: Math.floor((d - toDate(ps[0][0])) / 6048e5) + 1 };
  return null;
}
export const fmtD = iso => { const d = toDate(iso); return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`; };
export function periodRanges(weekStartISO){                                   // the date range behind each period toggle, for the week being reported
  if(!weekStartISO) return {};
  const end = new Date(toDate(weekStartISO).getTime() + 6*864e5).toISOString().slice(0,10), f = fiscalOf(end), e = toDate(end);
  const m1 = `${e.getUTCFullYear()}-${String(e.getUTCMonth()+1).padStart(2,'0')}-01`, y1 = `${e.getUTCFullYear()}-01-01`;
  return { weekly:`${fmtD(weekStartISO)} - ${fmtD(end)}`, ptd: f ? `Period ${f.period}: ${fmtD(f.pStart)} - ${fmtD(end)}` : '', mtd:`${fmtD(m1)} - ${fmtD(end)}`, ytd:`${fmtD(y1)} - ${fmtD(end)}` };
}
export function weekLabels(startISO){
  if(!startISO) return { no:'-', range:'-' };
  const s = new Date(startISO+'T00:00:00Z'), e = new Date(s.getTime() + 6*864e5);
  const t = new Date(Date.UTC(s.getUTCFullYear(), s.getUTCMonth(), s.getUTCDate())); t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));   // Thursday of that week decides the ISO week
  const fo = fiscalOf(startISO), no = fo ? fo.week : Math.ceil(((t - Date.UTC(t.getUTCFullYear(),0,1)) / 864e5 + 1) / 7);     // fiscal week number
  const range = s.getUTCMonth() === e.getUTCMonth() ? `${s.getUTCDate()}–${e.getUTCDate()} ${MONTHS[e.getUTCMonth()]}` : `${s.getUTCDate()} ${MONTHS[s.getUTCMonth()]} – ${e.getUTCDate()} ${MONTHS[e.getUTCMonth()]}`;
  return { no, range };
}
export const money = n => n==null ? '-' : (n<0 ? `(${'$'+Math.abs(Math.round(n)).toLocaleString('en-US')})` : '$'+Math.round(n).toLocaleString('en-US'));
export const pct   = n => n==null ? '-' : (n<0 ? `(${Math.abs(n).toFixed(1)}%)` : n.toFixed(1)+'%');
export const varPct = (a,b) => (a==null||b==null||b===0) ? null : (a-b)/b*100;
export const pill = v => v==null ? '<span class="empty">-</span>' : `<span class="vp ${v>=5?'pos':v>=0?'flat':'neg'}">${pct(v)}</span>`;
export const sum = o => o ? Object.values(o).reduce((s,x)=>s+(x||0),0) : null;

/* ---------- charts (empty datasets, final styling) ---------- */
export const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
Chart.defaults.font.family = "'Montserrat',sans-serif"; Chart.defaults.font.size = 12; Chart.defaults.color = '#6b7280';      // chart text slightly smaller (default 12)
export const usdTip = c => { const s = String(c.formattedValue), neg = s.startsWith('-'), lab = c.dataset.label ? c.dataset.label + ': ' : (c.label ? c.label + ': ' : '');   // hover label for sales charts: keep the number format, add the $
  return `${lab}${neg ? '-' : ''}$${neg ? s.slice(1) : s}`; };
export const grid = () => ({ color: 'rgba(0,0,0,0.1)' });
export const DONUT_COLS = ['#9f7cef', 'rgba(209,213,219,0.7)', '#93c5fd', '#f9a8d4', '#86efac', '#fde68a', '#fdba74', '#c4b5fd'];   // every donut chart: slice colours in this order (purple, grey, blue, pink, green, then more)
