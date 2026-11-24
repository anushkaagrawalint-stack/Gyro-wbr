/**
 * Pulls the data blocks that are embedded in reference/index.html (the "source of truth" dashboard).
 * Used by the parity tests and by `npm run seed` (3rd Party Delivery and Catering stay embedded for now).
 */
const slice = (html: string, startMark: string, endMark: string): string => {
  const i = html.indexOf(startMark);
  if (i < 0) throw new Error(`Marker not found: ${startMark}`);
  const j = html.indexOf(endMark, i + startMark.length);
  if (j < 0) throw new Error(`Marker not found: ${endMark}`);
  return html.slice(i + startMark.length, j);
};

// the embedded blocks are JS object literals (some use single-quoted keys), so evaluate them as literals
const lit = <T,>(src: string): T => new Function(`"use strict"; return (${src});`)() as T;

export type EmbeddedLocData = Record<string, Record<'actual' | 'ly', Record<string, { total: number; lines: Record<string, number>; tab: string; cats?: Record<string, Record<string, number>> }>>>;

export interface Embedded {
  locData: EmbeddedLocData;
  extraLines: Record<string, string>;
  reviews: { so7_90: unknown[][]; so30: unknown[][] };
  tpd: unknown;
  loyalty: { locations: Record<string, Record<string, number>>; campaigns: Record<string, unknown>[] };
  marketing: { apollo: Record<string, Record<string, unknown>[]> };
  catering: unknown;
  weekStart: string;
  channels: { name: string; color: string; lines: string[] }[];
}

export function extractEmbedded(html: string): Embedded {
  const sec = (n: string) => lit<any>(slice(html, `/*SEC_${n}_START*/`, `/*SEC_${n}_END*/`));
  const chStart = html.indexOf('const CHANNELS = BOOT ? BOOT.channels : [');
  const chSrc = html.slice(html.indexOf('[', chStart + 'const CHANNELS = BOOT ? BOOT.channels : '.length - 1), html.indexOf('];', chStart) + 1);
  return {
    locData: lit(slice(html, '/*LOC_DATA_START*/', '/*LOC_DATA_END*/')),
    extraLines: lit(slice(html, '/*EXTRA_LINES_START*/', '/*EXTRA_LINES_END*/')),
    reviews: sec('reviews'),
    tpd: sec('tpd'),
    loyalty: sec('loyalty'),
    marketing: sec('marketing'),
    catering: sec('catering'),
    weekStart: /weekStart:'(\d{4}-\d{2}-\d{2})'/.exec(html)?.[1] ?? '',
    channels: lit(chSrc),
  };
}
