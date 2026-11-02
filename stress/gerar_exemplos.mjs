// Gera os exemplos prontos do app (O2): roda cada mistura da lista no núcleo C e grava exemplos/<id>.mdres.gz (a saída do mdsim,
// com a metade dos quadros da animação, mais o formulário a restaurar) e exemplos/index.json (a lista do menu). Formato .mdres.gz: gzip de
// [u32 tamanho do cabeçalho][cabeçalho JSON][saída do mdsim]; o app grava e abre o mesmo formato (src/ui/27_exemplos.js).
// uso: MD_NATIVE=<mdsim> MD_THREADS=16 node stress/gerar_exemplos.mjs [id ...]      (sem ids: todos)
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { loadApp, runCase } from './engine.mjs';

const OUT = path.resolve(process.env.EXEMPLOS_DIR || path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'exemplos'));
fs.mkdirSync(OUT, { recursive: true });
const app = loadApp();
const D = app.DEFAULTS, f2s = x => String(x).replace('.', ',');

const LISTA = [
  { id: 'marshall-dnit-c125', nome: 'Marshall 1200 g · CA DNIT 031 faixa C', curve: 'BR_DNIT031-2024_C-12,5', proto: 'marshall', size: 'm', nota: 'Marshall, 75 golpes por face' },
  { id: 'giratorio-us-m323-125', nome: 'Giratório Ø150 · Superpave 12,5 mm (AASHTO M 323)', curve: 'US_M323_12.5', proto: 'giratorio', size: 'g', nota: 'Giratório, 100 giros (30 simulados)' },
  { id: 'giratorio-us-m323-190', nome: 'Giratório Ø150 · Superpave 19,0 mm (AASHTO M 323)', curve: 'US_M323_19.0', proto: 'giratorio', size: 'g', nota: 'Giratório, 100 giros (30 simulados)' },
  { id: 'giratorio-us-sma-125', nome: 'Giratório Ø150 · SMA 12,5 mm (AASHTO M 325)', curve: 'US_M325_SMA_12.5', proto: 'giratorio', size: 'g', nota: 'Giratório, 100 giros (30 simulados)' },
  { id: 'marshall-de-ac11ds', nome: 'Marshall 1200 g · AC 11 D S (TL Asphalt-StB 07/13)', curve: 'DE_TL0713_AC11DS', proto: 'marshall', size: 'm', nota: 'Marshall, 75 golpes por face' },
  { id: 'marshall-de-sma11s', nome: 'Marshall 1200 g · SMA 11 S (TL Asphalt-StB 07/13)', curve: 'DE_TL0713_SMA11S', proto: 'marshall', size: 'm', nota: 'Marshall, 75 golpes por face' },
  { id: 'marshall-de-pa11', nome: 'Marshall 1200 g · PA 11 drenante (TL Asphalt-StB 07/13)', curve: 'DE_TL0713_PA11', proto: 'marshall', size: 'm', nota: 'Marshall, 75 golpes por face' },
];

// metade dos quadros da animação (os pares e o último): o arquivo cai quase à metade e a animação segue fluida
function podarQuadros(b) {
  const jl = b.readUInt32LE(0), H = JSON.parse(b.subarray(4, 4 + jl).toString('utf8')), n = H.n, nf = H.nf;
  const keep = []; for (let k = 0; k < nf; k += 2) keep.push(k); if (keep[keep.length - 1] !== nf - 1) keep.push(nf - 1);
  let off = 4 + jl; const seg = (bytes) => { const s = b.subarray(off, off + bytes); off += bytes; return s; };
  const pos = seg(8 * 3 * n), q = seg(8 * 4 * n), P = seg(4 * 3 * n * nf), Q = seg(4 * 4 * n * nf), Z = seg(4 * 6 * nf), F = seg(2 * nf);
  const rest = b.subarray(off);
  const pick = (buf, w) => Buffer.concat(keep.map(k => buf.subarray(k * w, (k + 1) * w)));
  const H2 = { ...H, nf: keep.length, txt: keep.map(k => H.txt[k]) }, js = Buffer.from(JSON.stringify(H2), 'utf8'), hd = Buffer.alloc(4);
  hd.writeUInt32LE(js.length, 0);
  return Buffer.concat([hd, js, pos, q, pick(P, 4 * 3 * n), pick(Q, 4 * 4 * n), pick(Z, 4 * 6), pick(F, 2), rest]);
}

const idx = path.join(OUT, 'index.json');
const lerIdx = () => fs.existsSync(idx) ? JSON.parse(fs.readFileSync(idx, 'utf8')) : [];
const want = process.argv.slice(2);
for (const e of LISTA) {
  if (want.length && !want.includes(e.id)) continue;
  const c = app.GRADLIB.find(c => c.id === e.curve), [pb, avc] = c.sug || [D.pb, D.avc];
  let raw = null;
  const spec = { id: e.id, curve: e.curve, pb, avc, proto: e.proto, size: e.size, avcMode: 'livre', seed: D.seed, temp: 150, faceW: 2.5,
    bub: { mode: 'auto', B: 40, BScmm: 1.0, BSh: 1.5 }, onRaw: b => { raw = b; } };
  const t0 = Date.now();
  const r = runCase(spec);
  if (r.status !== 'ok' || !raw) { console.log(`ERRO ${e.id}: ${r.status} ${(r.validation || r.error || '').toString().slice(0, 200)}`); continue; }
  const pod = podarQuadros(raw);
  const st = r.res.st, form = { curve: e.curve, vals: {
      'f-seed': String(D.seed), 'f-lib': D.lib, 'f-pb': f2s(pb), 'f-avc': f2s(avc), 'f-ra': f2s(D.ra), 'f-rb': f2s(D.rb), 'f-proto': e.proto, 'f-size': e.size, 'f-avcmode': 'livre',
      'f-golpes': '75', 'f-gsim': '0', 'f-ngir': '100', 'f-gsimg': '30', 'f-press': '600', 'f-ang': '1,16', 'f-grade': '50/70', 'f-temp': '150', 'f-bub': 'auto',
      'f-bB': '40', 'f-bSc': '1,0', 'f-bSh': '1,5', 'f-lam': '0,55', 'f-etak': '1', 'f-escE': '0,002', 'f-escP': '0,001', 'f-facew': '2,5', 'f-segk': '1' }, checks: { 'f-seg': true } };
  const cab = Buffer.from(JSON.stringify({ formato: 1, nome: e.nome, nota: e.nota, form, tDem: st.tDem, threads: st.comp.motor.threads, avc: st.AVC, na: r.res.NA, criado: new Date().toISOString() }), 'utf8');
  const n4 = Buffer.alloc(4); n4.writeUInt32LE(cab.length, 0);
  const gz = zlib.gzipSync(Buffer.concat([n4, cab, pod]), { level: 9 });
  fs.writeFileSync(path.join(OUT, e.id + '.mdres.gz'), gz);
  const I = { id: e.id, nome: e.nome, nota: e.nota, arquivo: e.id + '.mdres.gz', tDem: st.tDem, threads: st.comp.motor.threads, avc: st.AVC, na: r.res.NA, bytes: gz.length };
  const indice = lerIdx(), k = indice.findIndex(x => x.id === e.id); if (k >= 0) indice[k] = I; else indice.push(I);
  fs.writeFileSync(idx, JSON.stringify(indice, null, 1));
  console.log(`OK ${e.id}: DEM ${st.tDem.toFixed(0)} s · total ${((Date.now() - t0) / 1000).toFixed(0)} s · AVC ${st.AVC.toFixed(3)}% · NA ${r.res.NA} · ${(gz.length / 1e6).toFixed(1)} MB`);
}
