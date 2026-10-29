// Gera src/worker/12_formas_reais.js a partir das bibliotecas de formas reais do pipeline de "Aggregate types"
// (Aggregate types/03_modelo/<conjunto>/biblioteca_formas_reais.json e forma_agregados.json).
// Uso: node tools/gen_formas_reais.mjs   (depois, node build.mjs)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MOD = path.join(ROOT, 'Aggregate types', '03_modelo');
// código no app → conjunto do pipeline, nome curto das classes
const SETS = { RS: ['sma_diabasio', 'D'], RT: ['todos', 'T'] };
const r4 = x => Math.round(x * 1e4) / 1e4;

let out = `/* ---------- formas reais medidas (gerado por tools/gen_formas_reais.mjs; não editar) ---------- */
// Formas convexas (≤ 48 vértices) da tomografia F001 (SMA 11 S de diabásio) e dos STL do F004, normalizadas com Min Feret = 1
// (eixos x = L, y = I, z = S), e as Weibull do Min Feret ajustadas por classe (Aggregate types/scripts/e4_ajuste.py, e5_biblioteca.py).
// vr = volume real ÷ volume da casca: a casca é reduzida até ter o volume real, para a massa e o balanço de volume ficarem certos.
const REAL_SHAPES={`;
for (const [code, [dir, pre]] of Object.entries(SETS)) {
  const lib = JSON.parse(fs.readFileSync(path.join(MOD, dir, 'biblioteca_formas_reais.json'), 'utf8'));
  const fit = JSON.parse(fs.readFileSync(path.join(MOD, dir, 'forma_agregados.json'), 'utf8'));
  const classes = lib.classes.map((c, k) => {
    const f = fit.classes.find(x => x.ate_mm === c.ate_mm) || fit.classes[k];
    return { ate: c.ate_mm >= 999 ? 1e9 : c.ate_mm, mfL: f.MF_escala, mfK: f.MF_forma, nome: pre + (k + 1),
      formas: c.formas.map(s => ({ v: s.verts.flat().map(r4), f: s.faces.flat(), vr: r4(s.volume_real_sobre_fecho), id: s.id })) };
  });
  out += `\n${code}:${JSON.stringify(classes)},`;
  console.log(code, dir, classes.map(c => `${c.nome}: ${c.formas.length} formas, MF Weibull ${c.mfL}/${c.mfK}`).join(' · '));
}
out += '\n};\n';
fs.writeFileSync(path.join(ROOT, 'src', 'worker', '12_formas_reais.js'), out);
console.log('src/worker/12_formas_reais.js', (out.length / 1024).toFixed(0), 'kB');
