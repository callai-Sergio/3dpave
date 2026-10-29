// One case per process, so a hang or OOM kills only that case. Driven by run.mjs over IPC.
import { runCase } from './engine.mjs';
import { computeKPIs } from './kpi.mjs';

process.on('message', ({ id, spec }) => {
  let out;
  try { out = computeKPIs(runCase(spec), spec); } catch (err) { out = { status: 'crash', error: String(err && err.message || err), stack: err && err.stack }; }
  process.send({ id, out }, () => process.exit(0));
});
