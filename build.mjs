// Monta o app num HTML único a partir de src/ (o artefato exige um arquivo só, com o worker num <script type="text/x-worker">).
// Uso: node build.mjs  →  marshall_digital_app.html
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const dir = d => fs.readdirSync(path.join(ROOT, 'src', d)).filter(f => /\.(js|html)$/.test(f)).sort().map(f => path.join('src', d, f));
const ORDER = ['src/app/head.html', ...dir('worker'), 'src/app/mid.html', ...dir('ui'), 'src/app/foot.html'];

export function build() {
  return ORDER.map(f => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('');
}
// só o código do worker, para o harness de estresse rodar em Node sem extrair do HTML
export function workerSource() {
  return dir('worker').map(f => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const out = path.join(ROOT, 'marshall_digital_app.html');
  fs.writeFileSync(out, build());
  console.log(`marshall_digital_app.html: ${(fs.statSync(out).size / 1024).toFixed(0)} kB de ${ORDER.length} partes`);
}
