/**
 * The ported dashboard modules carry `// @ts-nocheck` (verbatim DOM-string code). This script re-checks them WITHOUT it,
 * non-strict, and fails on the mistakes that matter at runtime: undefined names, missing exports, bad imports.
 *   npm run check:dashboard
 */
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const tmp = path.join(root, '.check-dashboard');
rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });
for (const f of readdirSync(path.join(root, 'src/dashboard')).filter((f) => f.endsWith('.ts'))) {
  writeFileSync(path.join(tmp, f), readFileSync(path.join(root, 'src/dashboard', f), 'utf8').replace(/^\/\/ @ts-nocheck\n/, ''));
}
writeFileSync(path.join(tmp, 'tsconfig.json'), JSON.stringify({
  compilerOptions: { target: 'ES2022', lib: ['dom', 'dom.iterable', 'esnext'], module: 'esnext', moduleResolution: 'bundler', strict: false, noImplicitAny: false, noEmit: true, skipLibCheck: true, types: [] },
  include: ['*.ts'],
}));
let out = '';
try {
  out = execFileSync(process.execPath, [path.join(root, 'node_modules/typescript/bin/tsc'), '-p', tmp], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
} catch (e) {
  out = (e.stdout || '') + (e.stderr || '');
}
rmSync(tmp, { recursive: true, force: true });
// 2304/2552 cannot find name, 2305/2614 missing export, 2307 cannot find module, 2451 redeclared, 2448/2454 used before defined
const bad = out.split('\n').filter((l) => /error TS(2304|2552|2305|2614|2307|2451|2448|2454|2300|1005|1109|1128|1003|1002|1161)/.test(l));
if (bad.length) { console.error(bad.join('\n')); process.exit(1); }
console.log('dashboard modules: no undefined names or broken imports');
