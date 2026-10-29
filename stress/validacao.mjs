// Validação V1 (plano_app_unificado_compactacao.md §8.2): AVC Marshall com 75 golpes × teor de betume,
// contra Albayati (2024), Data in Brief 53, 110224, Fig. 2 (valores lidos do gráfico, ±0,2 pp).
// Roda no modo AVC livre: o AVC sai dos golpes. Uso:
//   node stress/validacao.mjs [--size p|m] [--seeds 1] [--pb 4,4.5,5,5.5] [--binder 60/70|40/50] [--set '{"mastic":{"lam":0.6}}']
// Escreve stress/results/validacao_V1.jsonl e imprime MAE, inclinação e a dispersão entre sementes (V2b).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runCase } from './engine.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };

// Albayati (2024): quartzo britado (Gsb graúdo 2,631, miúdo 2,661, fíler 2,787), compactação a 140 °C
export const ALBAYATI = {
  grad: [[19, 100], [12.5, 95], [9.5, 83], [4.75, 54], [2.36, 36], [0.3, 13], [0.075, 7]],
  ra: 2.65, temp: 140,
  binders: {
    '40/50': { grade: '35/50', rb: 1.042, avc: { 4.0: 6.0, 4.5: 4.6, 5.0: 3.6, 5.5: 2.4 } },
    '60/70': { grade: '50/70', rb: 1.027, avc: { 4.0: 6.1, 4.5: 4.8, 5.0: 3.3, 5.5: 2.7 } },
  },
};

export function v1Specs({ size = 'p', seeds = [2024], pbs = [4.0, 4.5, 5.0, 5.5], binder = '60/70', extra = {} } = {}) {
  const b = ALBAYATI.binders[binder], out = [];
  for (const pb of pbs) for (const seed of seeds)
    out.push(Object.assign({ grad: ALBAYATI.grad, ra: ALBAYATI.ra, rb: b.rb, pb, avc: b.avc[pb] ?? 4, grade: b.grade, temp: ALBAYATI.temp,
      size, seed, proto: 'marshall', avcMode: 'livre', marshall: { golpes: 75 }, lib: 'WG', bub: { mode: 'auto' } }, extra, { _lab: b.avc[pb], _binder: binder }));
  return out;
}

function deepMerge(a, b) { for (const k in b) { if (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k])) a[k] = deepMerge(a[k] || {}, b[k]); else a[k] = b[k]; } return a; }

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const size = arg('size', 'p'), nseeds = +arg('seeds', '1'), binder = arg('binder', '60/70');
  const pbs = arg('pb', '4,4.5,5,5.5').split(',').map(Number), extra = JSON.parse(arg('set', '{}'));
  const seeds = Array.from({ length: nseeds }, (_, k) => 2024 + k);
  const specs = v1Specs({ size, seeds, pbs, binder }).map(s => deepMerge(s, extra));
  const outF = path.join(HERE, 'results', 'validacao_V1.jsonl');
  const rows = [];
  for (const s of specs) {
    const t0 = Date.now(), r = runCase(s);
    if (r.status !== 'ok') { console.log('falhou', s.pb, r.status, r.error); continue; }
    const C = r.res.st.comp, row = { binder: s._binder, pb: s.pb, seed: s.seed, size, lab: s._lab, pred: C.AVCcp, AVCcomp: C.AVCcomp, AVCsolto: C.info.AVCsolto,
      pen: r.res.st.pen.max, film: C.info.film, set: extra, wall: (Date.now() - t0) / 1000, hist: C.hist };
    rows.push(row); fs.appendFileSync(outF, JSON.stringify(row) + '\n');
    console.log(`Pb ${s.pb} semente ${s.seed}: AVC previsto ${row.pred.toFixed(2)}% · lab ${s._lab}% · solto ${row.AVCsolto.toFixed(1)}% · K33 ${(row.pen * 100).toFixed(2)}% · ${row.wall.toFixed(0)} s`);
  }
  // V1: erro médio absoluto por teor (média das sementes) e a inclinação AVC × Pb (mínimos quadrados)
  const byPb = new Map();
  rows.forEach(r => { if (!byPb.has(r.pb)) byPb.set(r.pb, []); byPb.get(r.pb).push(r); });
  const pts = [...byPb.entries()].map(([pb, rs]) => ({ pb, lab: rs[0].lab, pred: rs.reduce((a, r) => a + r.pred, 0) / rs.length,
    sd: rs.length > 1 ? Math.sqrt(rs.reduce((a, r) => a + (r.pred - rs.reduce((x, y) => x + y.pred, 0) / rs.length) ** 2, 0) / (rs.length - 1)) : null }));
  const slope = (xs, ys) => { const mx = xs.reduce((a, b) => a + b) / xs.length, my = ys.reduce((a, b) => a + b) / ys.length;
    return xs.reduce((a, x, i) => a + (x - mx) * (ys[i] - my), 0) / xs.reduce((a, x) => a + (x - mx) ** 2, 0); };
  const mae = pts.reduce((a, p) => a + Math.abs(p.pred - p.lab), 0) / pts.length;
  const sP = pts.length > 1 ? slope(pts.map(p => p.pb), pts.map(p => p.pred)) : NaN, sL = pts.length > 1 ? slope(pts.map(p => p.pb), pts.map(p => p.lab)) : NaN;
  const sameSlope = Math.sign(sP) === Math.sign(sL) && Math.abs(sP - sL) <= 0.3 * Math.abs(sL);
  console.log(`\nV1 (${binder}, ${size}): MAE ${mae.toFixed(2)} pp · inclinação ${sP.toFixed(2)} (lab ${sL.toFixed(2)}) pp/%Pb · ` +
    `${mae <= 0.5 && sameSlope ? 'pass' : mae <= 1.0 ? 'warn' : 'quebra'}`);
  const sds = pts.map(p => p.sd).filter(x => x != null);
  if (sds.length) { const sd = Math.max(...sds); console.log(`V2b dispersão entre sementes: ${sd.toFixed(2)} pp (CPs reais ~0,8 pp) · ${sd <= 1.6 ? 'pass' : sd <= 2.4 ? 'warn' : 'quebra'}`); }
}
