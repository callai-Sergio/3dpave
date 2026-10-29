// Phase 1 screening (design §4): 2^(9-4) resolution IV, 32 cells + centre point, × seeds.
// Generators F = BCDE, G = ACDE, H = ABDE, J = ABCE (Montgomery, Table 8.14). Writes screening.json next to this file.
// Usage: node stress/grids/make_screening.mjs [--seeds 3]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const nSeeds = +(process.argv[process.argv.indexOf('--seeds') + 1] || 3) || 3;

// factor: [low, high] mapped onto a spec
const F = {
  A_avc: [2, 12],
  B_pb: [3.5, 7.5],
  C_p2: [20, 58],
  D_dmax: [12.5, 25],          // 4·TNM/Ø65 from ~0,6 to ~1,2
  E_shape: ['dense', 'gap'],
  F_size: ['p', 'w'],
  G_lib: ['WL', 'WG'],
  H_segk: [0, 2],
  J_bub: [{ mode: 'off' }, { mode: 'manual', B: 100, BScmm: 3, BSh: 0.8 }],
};
const toSpec = lv => ({
  avc: lv.A_avc, pb: lv.B_pb, synth: { dmax: lv.D_dmax, p2: lv.C_p2, shape: lv.E_shape }, size: lv.F_size, lib: lv.G_lib,
  seg: { on: lv.H_segk > 0, k: lv.H_segk }, bub: lv.J_bub,
});

const cases = [];
for (let r = 0; r < 32; r++) {
  const [A, B, C, D, E] = [0, 1, 2, 3, 4].map(b => (r >> b & 1) ? 1 : -1);
  const s = { A, B, C, D, E, F: B * C * D * E, G: A * C * D * E, H: A * B * D * E, J: A * B * C * E };
  const lv = {}, code = {};
  for (const [name, [lo, hi]] of Object.entries(F)) { const k = name[0]; lv[name] = s[k] > 0 ? hi : lo; code[k] = s[k]; }
  cases.push({ id: `S${String(r + 1).padStart(2, '0')}`, coded: code, ...toSpec(lv) });
}
// centre point (categorical factors at the app defaults)
cases.push({ id: 'C0', coded: {}, ...toSpec({ A_avc: 4, B_pb: 5.5, C_p2: 40, D_dmax: 19, E_shape: 'dense', F_size: 'p', G_lib: 'WL', H_segk: 1, J_bub: { mode: 'auto' } }) });

const seeds = [11, 23, 37, 41, 53].slice(0, nSeeds);
const grid = { name: `Phase 1 screening 2^(9-4) IV, ${cases.length} cells x ${seeds.length} seeds`, base: {}, factors: { seed: seeds }, cases };
fs.writeFileSync(path.join(HERE, 'screening.json'), JSON.stringify(grid, null, 1));
console.log(`screening.json: ${cases.length} cells × ${seeds.length} seeds = ${cases.length * seeds.length} runs (${cases.filter(c => c.size === 'w').length * seeds.length} at 1000 g)`);
