import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import * as XLSX from 'xlsx';
import { extractEmbedded, type Embedded } from '../../src/lib/reference/extract';

export const REF_HTML = path.resolve(__dirname, '../../reference/index.html');
export const REF_XLSX = path.resolve(__dirname, '../../reference/Gyro_Republic-WBR_Input_2.xlsx');
export const hasReference = existsSync(REF_HTML) && existsSync(REF_XLSX);

let emb: Embedded | null = null;
let wb: XLSX.WorkBook | null = null;
export const embedded = (): Embedded => (emb ??= extractEmbedded(readFileSync(REF_HTML, 'utf8')));
export const workbook = (): XLSX.WorkBook => (wb ??= XLSX.read(readFileSync(REF_XLSX)));
