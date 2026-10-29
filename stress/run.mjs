// Grid runner: node stress/run.mjs <grid.json> [--out results.jsonl] [--jobs N] [--timeout s] [--mem MB] [--resume]
//
// grid.json:
//   { "name": "...", "base": { ...spec },            spec fields: see README.md
//     "factors": { "avc": [2,4,12], "seed": [1,2,3] },   full factorial over these (optional)
//     "cases":   [ { "id": "x", ...overrides } ] }       explicit cases, crossed with "factors" if both are given
// One JSON line per case: { id, spec, status, category, breaks, warns, kpi, grades, flags, detail, comp, ... }
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { APP_HTML } from './engine.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const gridPath = args.find(a => a.endsWith('.json'));
if (!gridPath) { console.error('usage: node stress/run.mjs <grid.json> [--out f.jsonl] [--jobs N] [--timeout s] [--mem MB] [--resume]'); process.exit(2); }
const grid = JSON.parse(fs.readFileSync(gridPath, 'utf8'));
const outPath = opt('--out', path.join(HERE, 'results', path.basename(gridPath, '.json') + '.jsonl'));
const jobs = +opt('--jobs', Math.max(1, Math.floor(os.cpus().length / 2)));
const timeout = +opt('--timeout', 1800) * 1000;
const mem = +opt('--mem', 4096);

function expand(grid) {
  const base = grid.base || {};
  const cases = grid.cases?.length ? grid.cases : [{}];
  const f = Object.entries(grid.factors || {});
  const out = [];
  const rec = (k, acc) => {
    if (k === f.length) {
      for (const c of cases) {
        const spec = { ...base, ...c, ...acc };
        const tag = f.map(([n]) => `${n}=${JSON.stringify(acc[n])}`).join(',');
        spec.id = [c.id, tag].filter(Boolean).join('|') || 'case';
        delete spec.idx;
        out.push(spec);
      }
      return;
    }
    const [name, levels] = f[k];
    for (const v of levels) rec(k + 1, { ...acc, [name]: v });
  };
  rec(0, {});
  return out;
}

// platform of the run (P7: results differ slightly between Node versions and OSes), written on every line
const ENV = {
  node: process.version, os: `${process.platform}-${process.arch}`, host: os.hostname(),
  app: crypto.createHash('sha256').update(fs.readFileSync(APP_HTML)).digest('hex').slice(0, 12),
  native: process.env.MD_NATIVE ? `${path.basename(process.env.MD_NATIVE)} x${process.env.MD_THREADS || 1}` : null,
};

const all = expand(grid);
fs.mkdirSync(path.dirname(outPath), { recursive: true });
const done = new Set();
if (args.includes('--resume') && fs.existsSync(outPath)) {
  for (const l of fs.readFileSync(outPath, 'utf8').split('\n')) if (l.trim()) done.add(JSON.parse(l).id);
} else if (fs.existsSync(outPath)) fs.truncateSync(outPath, 0);
const todo = all.filter(s => !done.has(s.id));
console.log(`${grid.name || gridPath}: ${all.length} cases, ${todo.length} to run, ${jobs} jobs, timeout ${timeout / 1000}s → ${outPath}`);

const tally = {};
let next = 0, running = 0, finished = 0;
const t0 = Date.now();
function write(rec) {
  fs.appendFileSync(outPath, JSON.stringify(rec) + '\n');
  finished++;
  const c = rec.category || rec.status;
  tally[c] = (tally[c] || 0) + 1;
  const el = (Date.now() - t0) / 1000;
  console.log(`[${finished}/${todo.length} ${el.toFixed(0)}s] ${c.padEnd(7)} ${rec.id}${rec.breaks?.length ? '  ← ' + rec.breaks.join(',') : ''}${rec.error ? '  ← ' + rec.error : ''}`);
}
function launch() {
  while (running < jobs && next < todo.length) {
    const spec = todo[next++];
    running++;
    const t1 = Date.now();
    const ch = fork(path.join(HERE, 'child.mjs'), [], { execArgv: [`--max-old-space-size=${mem}`], stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
    let err = '', settled = false;
    ch.stderr.on('data', d => { err += d; });
    const fin = rec => {
      if (settled) return; settled = true; clearTimeout(timer); running--;
      write({ id: spec.id, spec, wall: (Date.now() - t1) / 1000, env: ENV, ...rec });
      if (finished === todo.length) summary(); else launch();
    };
    const timer = setTimeout(() => { ch.kill('SIGKILL'); fin({ status: 'hang', category: 'B', error: `timeout after ${timeout / 1000}s` }); }, timeout);
    ch.on('message', m => fin(m.out));
    ch.on('exit', code => { if (code) fin({ status: 'crash', category: 'A', error: (/heap out of memory/i.test(err) ? 'OOM: ' : '') + `exit ${code}: ` + err.trim().split('\n').slice(-3).join(' | ') }); });
    ch.send({ id: spec.id, spec });
  }
}
function summary() {
  console.log(`\ndone in ${((Date.now() - t0) / 60000).toFixed(1)} min:`, JSON.stringify(tally));
  console.log(`summarise with: node stress/report.mjs ${outPath}`);
}
if (!todo.length) summary(); else launch();
