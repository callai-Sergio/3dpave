// Golden run: C-12,5 mid-band, limestone, Pb 5,5 %, AVC 4 %, 250 g, seed 2024.
// Checks the harness against the reference values. Protocol [W] (pistons). Reference updated on 2026-10-28 for the
// convex-hull contact core (plano_app_unificado_compactacao.md, F1): overlap 0,61 → 0,006 cm³; spec §7.4 had the sphere-cluster values.
// Usage: node stress/golden.mjs [--determinism] [--record]
// Besides the tolerances below (valid on any platform), golden_ref.json keeps the exact values per platform (M10):
// on a platform with a reference the run must reproduce it bit for bit, and K32 reports the drift against the other platforms.
// --record writes this platform's reference (only when a change of the values is intended; say why in the commit).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runCase } from './engine.mjs';
import { computeKPIs } from './kpi.mjs';

const REF_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), 'golden_ref.json');
const PLATFORM = `node ${process.version} ${process.platform}-${process.arch}`;
const EXACT = ['Vagg', 'Vmast', 'Vesq', 'Vbol', 'over'];

const EXPECT = [ // [label, getter, expected, tolerance]
  ['NA (250 g)', r => r.detail.NA, 578, 0],
  ['V aggregates cm3', r => r.detail.st.Vagg, 52.32, 0.3],
  ['overlap cm3', r => r.detail.st.over, 0.006, 0.05],
  ['V mastic cm3', r => r.detail.st.Vmast, 48.83, 0.3],
  ['V skeleton voids cm3', r => r.detail.st.Vesq, 2.19, 0.05],
  ['V bubbles cm3', r => r.detail.st.Vbol, 2.03, 0.1],
  ['AVC %', r => r.detail.st.AVC, 4.00, 0.1],
  ['B real %', r => r.detail.st.Breal, 48.0, 1.0],
  ['bubble median mm', r => r.detail.st.bubMed, 0.67, 0.1],
  ['radial profile wall %', r => (r.detail.st.profile[0] + r.detail.st.profile[19]) / 2, 6.0, 2.0],
  ['K33 max penetration', r => r.kpi.K33_penMax, 0, 0.02],
  ['K27 face voids ratio', r => r.kpi.K27_faceVoids, 2.57, 1.0],
];

const t0 = Date.now();
const run = runCase({ seed: 2024 });
const k = computeKPIs(run);
if (k.status !== 'ok') { console.error('golden run failed:', k.error || k.validation); process.exit(1); }
let bad = 0;
console.log(`golden run ${((Date.now() - t0) / 1000).toFixed(0)} s  (stages: ${Object.entries(k.detail.stageT).map(([s, t]) => `${s} ${t.toFixed(1)}s`).join(', ')})`);
for (const [label, get, exp, tol] of EXPECT) {
  const v = get(k), ok = Math.abs(v - exp) <= tol + 1e-9;
  if (!ok) bad++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(24)} ${v.toFixed(3).padStart(9)}   expected ${exp} ± ${tol}`);
}
console.log('\nverdict:', k.category, k.breaks.length ? `breaks: ${k.breaks.join(', ')}` : '', k.warns.length ? `warns: ${k.warns.join(', ')}` : '');
console.log('flags:', JSON.stringify(k.flags));
console.log('kpi:', JSON.stringify(k.kpi, (key, v) => typeof v === 'number' ? +v.toPrecision(4) : v));

// M10/K32: exact per-platform reference, and drift of Vagg against the other platforms
const refs = fs.existsSync(REF_PATH) ? JSON.parse(fs.readFileSync(REF_PATH, 'utf8')) : {};
const now = Object.fromEntries([['NA', k.detail.NA], ...EXACT.map(f => [f, k.detail.st[f]])]);
if (process.argv.includes('--record')) {
  refs[PLATFORM] = { ...now, host: os.hostname(), date: new Date().toISOString().slice(0, 10) };
  fs.writeFileSync(REF_PATH, JSON.stringify(refs, null, 2) + '\n');
  console.log(`platform reference recorded for ${PLATFORM}`);
} else if (refs[PLATFORM]) {
  const diff = ['NA', ...EXACT].filter(f => refs[PLATFORM][f] !== now[f]);
  console.log(`platform reference (${PLATFORM}): ${diff.length ? 'DIFFERENT in ' + diff.join(', ') : 'identical'}`);
  if (diff.length) bad++;
} else console.log(`platform reference: none for ${PLATFORM} (record one with --record)`);
for (const [p, r] of Object.entries(refs)) if (p !== PLATFORM) {
  const d = Math.abs(now.Vagg - r.Vagg) / r.Vagg;
  console.log(`K32 vs ${p} (${r.host}): Vagg ${r.Vagg.toFixed(3)} → ${(100 * d).toFixed(3)} % ${d <= 5e-4 ? 'pass' : d <= 5e-3 ? 'warn' : 'break'}`);
}

if (process.argv.includes('--determinism')) {
  const k2 = computeKPIs(runCase({ seed: 2024 }));
  const same = k2.detail.NA === k.detail.NA && ['Vagg', 'Vmast', 'Vesq', 'Vbol', 'over'].every(f => k2.detail.st[f] === k.detail.st[f]);
  console.log(`K26 determinism: ${same ? 'identical' : 'DIFFERENT'}`);
  if (!same) bad++;
}
process.exit(bad ? 1 : 0);
