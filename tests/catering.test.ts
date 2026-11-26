import * as XLSX from 'xlsx';
import { describe, expect, it } from 'vitest';
import { DEFAULT_LOCATIONS } from '../src/lib/data/config';
import { checkCatering } from '../src/lib/data/weeks';
import { parseCateringWorkbook } from '../src/lib/workbook/catering';
import embedded from '../config/embedded.json';

const c = (embedded as unknown as { catering: { weeks: Record<string, number | string | null>[]; locationWeeks: { week: string; locations: Record<string, Record<string, number>>; total: Record<string, number> }[] } }).catering;
const K = ['calls', 'connected', 'over90', 'emails', 'opens', 'mqls', 'mqlFup'];
const LABEL = ['# Calls / Week', '# Calls Connected', '# Calls > 90 seconds', '# Emails / Week', '# Opens', 'MQLs', 'MQLs with a FUP date'];

function book() {
  const out: (string | number | null)[][] = [['Outbound Catering Team - Input & Output Metrics'], ['Metrics', ...c.weeks.map((w) => `Week of ${w.week}`)]];
  K.forEach((k, i) => { out.push([LABEL[i], ...c.weeks.map((w) => w[k] as number)]); if (k === 'connected') out.push(['% Calls Connected', ...c.weeks.map(() => '10%')]); });
  out.push(['Orders (Confirmed)', ...c.weeks.map((w) => w.ordersConfirmed as number | null)], ['Orders (Paid)', ...c.weeks.map((w) => w.ordersPaid as number | null)]);
  out.push(['Orders (Confirmed)', ...c.weeks.map((w) => w.valueConfirmed as number | null)], ['Orders (Paid)', ...c.weeks.map((w) => w.valuePaid as number | null)]);
  const loc: (string | number | null)[][] = [];
  for (const b of [...c.locationWeeks].reverse()) {                       // newest first in the sheet, the parser must sort
    const names = Object.keys(b.locations);
    // as in the sheet: location names over an "Actual | Mix%" row, value in the Actual column, Total at the end
    loc.push([`Week of ${b.week}`], ['Metric', ...names.flatMap((n) => [n, null]), null], ['Metric', ...names.flatMap(() => ['Actual', 'Mix%']), 'Total']);
    K.forEach((k, i) => loc.push([LABEL[i], ...names.flatMap((n) => [b.locations[n][k], '50%']), b.total[k]]));
    loc.push(['% Calls Connected', ...names.flatMap(() => ['5%', '-']), '5%'], []);
  }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(out), 'Outbound');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(loc), 'Location Wise');
  return wb;
}

describe('catering workbook parser', () => {
  const p = () => parseCateringWorkbook(book(), DEFAULT_LOCATIONS);
  it('reads the consolidated weeks tab', () => expect(p().data.weeks).toEqual(c.weeks));
  it('reads one location table per week, oldest first, with a Total', () => {
    expect(p().data.locationWeeks).toEqual(c.locationWeeks);
    expect(p().data.location?.week).toBe('Oct 12');
    expect(p().warnings).toEqual([]);
  });
  it('passes server validation', () => expect(() => checkCatering(p().data)).not.toThrow());
  it('rejects a malformed payload', () => expect(() => checkCatering({ weeks: [], locationWeeks: [] })).toThrow());
});
