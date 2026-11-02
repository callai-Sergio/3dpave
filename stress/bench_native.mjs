// Mede o tempo do núcleo em C por número de núcleos, num caso fixo, e confere que o resultado não muda.
//   MD_NATIVE=native/mdsim node stress/bench_native.mjs [threads,...] [spec json]
//   Com MD_PROF=1 MD_VERBOSE=1 o mdsim imprime no stderr o tempo por etapa (linhas "PROF ...", S2a).
// Padrão: Marshall em tamanho real (1200 g, Ø101,6 mm), 5 golpes simulados por face, AVC livre, C-12,5.
import { runCase } from './engine.mjs';

const threads = (process.argv[2] || '1,8,24').split(',').map(Number);
const spec = Object.assign({ seed: 2024, size: 'm', proto: 'marshall', avcMode: 'livre', marshall: { golpes: 75, sim: 5 } }, JSON.parse(process.argv[3] || '{}'));
let ref = null;
for (const t of threads) {
  const r = runCase(Object.assign({}, spec, { threads: t }));
  if (r.status !== 'ok') { console.log(`threads ${t}: ${r.status} ${r.error}`); continue; }
  const st = r.res.st, nat = r.probe.native, key = `${st.comp.AVCcp.toFixed(12)} ${st.Vagg.toFixed(9)}`;
  if (!ref) ref = key;
  console.log(`threads ${String(t).padStart(3)}: DEM ${nat.tDem.toFixed(1)} s · total ${r.wall.toFixed(1)} s · NA ${r.res.NA} · AVC ${st.comp.AVCcp.toFixed(3)}% · K33 ${(st.pen.max * 100).toFixed(2)}% · ${key === ref ? 'idêntico' : 'DIFERENTE'}`);
}
