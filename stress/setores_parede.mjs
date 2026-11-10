// Diagnóstico da 3.1 (PLANO_REALISMO_E_PC): vazios junto à parede lateral por setor de ângulo.
// Reabre um exemplo gravado (exemplos/<id>.mdres.gz) sem refazer a física, refaz voxels, mastique e bolhas, e mede:
//  (a) % de vazios na casca junto à parede (distância exata ao eixo), em 36 setores de 10° centrados em 0°, 10°, ...;
//  (b) o harmônico 4 desse histograma (picos a cada 90°) contra os harmônicos vizinhos;
//  (c) % de vazios por distância à parede, nos setores dos eixos, das diagonais e nos demais;
//  (d) até onde a malha de vazios (meshE) passa do raio R e da pele lisa (R + 0,05 mm).
// --rot <graus> gira as partículas em torno do eixo antes de voxelizar: um defeito da grade fica em 0°/90°,
// uma causa física gira junto.
// uso: node stress/setores_parede.mjs <id do exemplo> [--rot graus] [--casca mm] [--tabela]
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { runCase } from './engine.mjs';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? +args[i + 1] : d; };
const id = args[0], rot = opt('--rot', 0), casca = opt('--casca', 1), tabela = args.includes('--tabela');
const DIR = path.resolve(process.env.EXEMPLOS_DIR || path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'exemplos'));
const { expandirQuadros } = new Function(fs.readFileSync(new URL('../src/ui/26_quadros.js', import.meta.url), 'utf8') + ';return {expandirQuadros};')();

const buf = zlib.gunzipSync(fs.readFileSync(path.join(DIR, id + '.mdres.gz')));
const jl = buf.readUInt32LE(0), cab = JSON.parse(buf.subarray(4, 4 + jl).toString('utf8'));
let raw = new Uint8Array(buf.subarray(4 + jl));
if (cab.formato === 2) raw = expandirQuadros(raw);
raw = new Uint8Array(raw);   // cópia alinhada, com buffer próprio
if (rot) {   // gira posição e orientação finais em torno do eixo z (os quadros da animação não entram na conta)
  const dv = new DataView(raw.buffer), hl = dv.getUint32(0, true), n = JSON.parse(Buffer.from(raw.subarray(4, 4 + hl)).toString('utf8')).n;
  const a = rot * Math.PI / 180, c = Math.cos(a), s = Math.sin(a), ch = Math.cos(a / 2), sh = Math.sin(a / 2);
  let o = 4 + hl;
  for (let i = 0; i < n; i++, o += 24) { const x = dv.getFloat64(o, true), y = dv.getFloat64(o + 8, true); dv.setFloat64(o, c * x - s * y, true); dv.setFloat64(o + 8, s * x + c * y, true); }
  for (let i = 0; i < n; i++, o += 32) {   // q' = qz ⊗ q, com q = (w, x, y, z)
    const w = dv.getFloat64(o, true), x = dv.getFloat64(o + 8, true), y = dv.getFloat64(o + 16, true), z = dv.getFloat64(o + 24, true);
    dv.setFloat64(o, ch * w - sh * z, true); dv.setFloat64(o + 8, ch * x - sh * y, true); dv.setFloat64(o + 16, ch * y + sh * x, true); dv.setFloat64(o + 24, ch * z + sh * w, true);
  }
}
const v = cab.form.vals, num = k => parseFloat(String(v[k]).replace(',', '.'));
const spec = { id, curve: cab.form.curve, pb: num('f-pb'), avc: num('f-avc'), proto: v['f-proto'], size: v['f-size'], avcMode: v['f-avcmode'], seed: +v['f-seed'],
  temp: num('f-temp'), faceW: num('f-facew'), bub: { mode: 'auto', B: 40, BScmm: 1.0, BSh: 1.5 }, native: '', replay: raw.buffer, replayNA: cab.na };
const r = runCase(spec);
if (r.status !== 'ok') { console.log(`ERRO ${id}: ${r.status} ${(r.validation || r.error || '').toString().slice(0, 300)}`); process.exit(1); }
const { phase, nx, ny, nz, h, R, meshE, st } = r.res, sxy = nx * ny;

// (a) casca junto à parede, por setor
const NS = 36, tot = new Float64Array(NS), vz = new Float64Array(NS), setor = (X, Y) => ((Math.round(Math.atan2(Y, X) * 180 / Math.PI / 10) % NS) + NS) % NS;
// (c) perfil por distância à parede, em três classes de ângulo: 0 = eixos (±5°), 1 = diagonais (±5°), 2 = o resto
const NB = 10, db = h, pT = [0, 1, 2].map(() => new Float64Array(NB)), pV = [0, 1, 2].map(() => new Float64Array(NB));
for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
  const X = (x + 0.5) * h - R, Y = (y + 0.5) * h - R, d = R - Math.hypot(X, Y);
  if (d < 0 || d >= NB * db) continue;
  const k = setor(X, Y), cl = k % 9 === 0 ? 0 : ((k % 9 === 4 || k % 9 === 5) ? 1 : 2), b = Math.floor(d / db);
  for (let z = 0; z < nz; z++) { const p = phase[z * sxy + y * nx + x]; if (!p) continue; const e = (p === 2 || p === 3) ? 1 : 0;
    pT[cl][b]++; pV[cl][b] += e; if (d < casca) { tot[k]++; vz[k] += e; } }
}
const f = Array.from(tot, (t, k) => t ? 100 * vz[k] / t : 0), media = f.reduce((a, b) => a + b, 0) / NS;
const eixos = [0, 9, 18, 27].map(k => f[k]), mE = eixos.reduce((a, b) => a + b, 0) / 4, mR = (media * NS - mE * 4) / (NS - 4);
const harm = m => { let re = 0, im = 0; for (let k = 0; k < NS; k++) { const t = 2 * Math.PI * m * k / NS; re += f[k] * Math.cos(t); im -= f[k] * Math.sin(t); } return [2 * Math.hypot(re, im) / NS, Math.atan2(im, re) * 180 / Math.PI]; };
const sd = Math.sqrt(f.reduce((a, b) => a + (b - media) ** 2, 0) / NS), fx = (x, n = 2) => x.toFixed(n);
console.log(`caso ${id} rot=${rot}° h=${h} mm R=${R} nx=${nx} nz=${nz} AVC=${fx(st.AVC, 3)}% casca=${casca} mm`);
console.log(`setores: média ${fx(media)}% desvio ${fx(sd)} pp | eixos (0/90/180/270) ${eixos.map(x => fx(x)).join(' ')} média ${fx(mE)}% | demais ${fx(mR)}% | razão eixos/demais ${fx(mE / mR)}`);
console.log('harmônicos (amplitude em pp, fase): ' + [1, 2, 3, 4, 5, 6, 8, 12].map(m => { const [a, p] = harm(m); return `h${m}=${fx(a)}${m === 4 ? `@${fx(p, 0)}°` : ''}`; }).join(' '));
if (tabela) console.log('setor(°):%vazios  ' + f.map((x, k) => `${k * 10}:${fx(x, 1)}`).join(' '));
console.log(`perfil por distância à parede (faixas de ${fx(db)} mm, da parede para dentro), % de vazios:`);
['eixos    ', 'diagonais', 'demais   '].forEach((nm, c) => console.log(`  ${nm} ` + Array.from(pT[c], (t, b) => fx(t ? 100 * pV[c][b] / t : 0, 1).padStart(5)).join(' ')));
// (d) malha de vazios além do raio
const mx = new Float64Array(NS).fill(-1e9), fora = new Float64Array(NS), P = meshE.pos; let nFora = 0, nPele = 0;
for (let i = 0; i < P.length; i += 3) { const e = Math.hypot(P[i], P[i + 1]) - R, k = setor(P[i], P[i + 1]); if (e > mx[k]) mx[k] = e; if (e > 0) nFora++; if (e > 0.05) { nPele++; fora[k]++; } }
const mxE = Math.max(...[0, 9, 18, 27].map(k => mx[k])), mxR = Math.max(...Array.from(mx).filter((_, k) => k % 9 !== 0));
const fE = [0, 9, 18, 27].reduce((a, k) => a + fora[k], 0);
console.log(`malha de vazios: ${P.length / 3} vértices; além de R: ${nFora}; além da pele (R+0,05): ${nPele}, dos quais ${fE} nos 4 setores dos eixos; avanço máximo: eixos ${fx(mxE)} mm, demais ${fx(mxR)} mm`);
if (tabela) console.log('setor(°):vértices além da pele  ' + Array.from(fora, (x, k) => `${k * 10}:${x}`).join(' '));
