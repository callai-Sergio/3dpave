// Ponte para o núcleo de compactação em C (native/mdsim.c).
// A serialização e a montagem do resultado são as do worker (src/worker/26_nativo.js, compactarNativo), as mesmas que o
// app usa no mini app Python (F10); aqui o envio é por arquivos e processo.
// Uso no harness: MD_NATIVE=<caminho do mdsim> [MD_THREADS=8] node stress/...
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { workerSource } from '../build.mjs';

let W = null;
const worker = () => W || (W = new Function('self', '__probe', workerSource() + '\n;return {compactarNativo};')({ postMessage() {} }, null));

// mesma assinatura e mesmo retorno do compactar(cfg,P,lib,NA,comp) do worker
export function makeNativeCompactar({ bin, threads, probe, verbose }) {
  const send = buf => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mdsim-')), fin = path.join(dir, 'in.bin'), fout = path.join(dir, 'out.bin');
    try {
      fs.writeFileSync(fin, Buffer.from(buf));
      const r = spawnSync(bin, [fin, fout, String(threads || os.cpus().length)], { stdio: ['ignore', 'ignore', verbose ? 'inherit' : 'pipe'], maxBuffer: 1 << 28 });
      if (r.status !== 0) throw new Error(`mdsim falhou (código ${r.status}): ${r.stderr ? r.stderr.toString().slice(-2000) : ''}`);
      const b = fs.readFileSync(fout);
      return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  };
  return (cfg, P, lib, NA, comp) => worker().compactarNativo(cfg, P, lib, NA, comp, send, probe);
}
