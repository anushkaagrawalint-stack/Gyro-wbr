/**
 * Copies the 3rd Party Delivery and Catering data that is embedded in reference/index.html into the data store
 * (config/embedded.json). Those two tabs keep using it until readers for their exports are built.
 *   npm run seed
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { extractEmbedded } from '../src/lib/reference/extract';
import { createStorage } from '../src/lib/storage';

async function main() {
const html = readFileSync(path.resolve(__dirname, '../reference/index.html'), 'utf8');
const e = extractEmbedded(html);
const s = createStorage();
await s.put('config/embedded.json', { weekStart: e.weekStart, tpd: e.tpd, catering: e.catering });
console.log(`Saved the embedded 3rd Party Delivery + Catering data (week of ${e.weekStart}).`);
}
main();
