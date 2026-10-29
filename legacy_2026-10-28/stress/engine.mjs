// Loads the Marshall Digital engine straight from marshall_digital_app.html and runs it in Node.
// The app file is never modified: instrumentation is spliced into the worker source at load time,
// and every splice must match exactly once, so a change in the app breaks loudly here instead of silently.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const APP_HTML = path.resolve(HERE, '..', 'marshall_digital_app.html');

// ---------- source extraction ----------
function extractWorker(html) {
  const tag = '<script type="text/x-worker" id="worker-src">';
  const a = html.indexOf(tag);
  if (a < 0) throw new Error('worker script not found');
  const b = html.indexOf('</script>', a);
  return html.slice(a + tag.length, b);
}

// Returns the source of a top-level `const NAME=...;` or `function NAME(...){...}` from the main script,
// by bracket matching (strings, template literals and comments skipped).
function extractDecl(src, name) {
  let i = src.indexOf(`\nconst ${name}=`);
  let isFn = false;
  if (i < 0) { i = src.indexOf(`\nfunction ${name}(`); isFn = true; }
  if (i < 0) throw new Error(`declaration ${name} not found`);
  i++;
  let depth = 0, j = i, started = false;
  for (; j < src.length; j++) {
    const c = src[j];
    if (c === '"' || c === "'" || c === '`') {
      const q = c; j++;
      while (j < src.length && src[j] !== q) { if (src[j] === '\\') j++; j++; }
      continue;
    }
    if (c === '/' && src[j + 1] === '/') { while (src[j] !== '\n') j++; if (started && depth === 0 && !isFn) break; continue; }
    if (c === '/' && src[j + 1] === '*') { j = src.indexOf('*/', j) + 1; continue; }
    if (c === '{' || c === '[' || c === '(') { depth++; started = true; }
    else if (c === '}' || c === ']' || c === ')') {
      depth--;
      if (depth === 0 && isFn && c === '}') { j++; break; }
    } else if (depth === 0 && !isFn && (c === ';' || (c === '\n' && started))) { j++; break; }
  }
  return src.slice(i, j);
}

function patch(src, find, repl, label) {
  const n = src.split(find).length - 1;
  if (n !== 1) throw new Error(`instrumentation patch "${label}" matched ${n} times (expected 1); the app changed`);
  return src.replace(find, repl);
}

// ---------- instrumentation splices ----------
const PATCHES = [
  ['stage timer',
    'function progress(stage,pct,text,force){\n  const t=Date.now();',
    'function progress(stage,pct,text,force){\n  const t=Date.now();__probe.stage(stage,t);'],
  ['sim handle',
    'const rho=cfg.rhoA*1e-6,S=makeSim(Ps,lib,R,rho,cfg.seed+3),n=NA;',
    'const rho=cfg.rhoA*1e-6,S=makeSim(Ps,lib,R,rho,cfg.seed+3),n=NA;__probe.sim(S,lib,Ps);'],
  ['placement give-up',
    'if(!bad)break;',
    'if(!bad)break;if(tries===199)__probe.placeFail++;'],
  ['phase 1 end',
    '  // 2. força crescente nos pistões',
    '  __probe.phase1(tt,out.gap,gap50);\n  // 2. força crescente nos pistões'],
  ['phase 2 end',
    '  // 3. acomodação com os pistões parados',
    '  __probe.phase2(tB,forced,out.fpist,tt);\n  // 3. acomodação com os pistões parados'],
  ['settled',
    '  // a base passa a ser z = 0',
    '  __probe.settled(S,out);\n  // a base passa a ser z = 0'],
];

const MAIN_DECLS = ['GRADLIB', 'DEFAULT_CURVE', 'DEFAULTS', 'WMIX', 'FINES', 'TYPE_RANGE', 'midOf', 'wGradation', 'interp', 'composicao'];

let cached = null;
export function loadApp(htmlPath = APP_HTML) {
  if (cached && cached.htmlPath === htmlPath) return cached;
  const html = fs.readFileSync(htmlPath, 'utf8').replace(/\r\n/g, '\n');
  let wsrc = extractWorker(html);
  for (const [label, f, r] of PATCHES) wsrc = patch(wsrc, f, r, label);
  const makeRunAll = new Function('self', '__probe', wsrc + '\n;return {runAll,eqW,LIBS};');

  const mainStart = html.indexOf('<script>', html.indexOf('</script>', html.indexOf('worker-src')));
  const main = html.slice(mainStart);
  let decls = MAIN_DECLS.map(n => extractDecl(main, n)).join('\n');
  // allow mass / mould overrides for the extreme-specimen probes; defaults are the app's
  decls = patch(decls, "const mass=cfg.size==='w'?1000:250,D=cfg.size==='w'?102:65,",
    "const mass=cfg.mass??(cfg.size==='w'?1000:250),D=cfg.D??(cfg.size==='w'?102:65),", 'mass override');
  const helpers = new Function(decls + '\n;return {GRADLIB,DEFAULT_CURVE,DEFAULTS,WMIX,midOf,wGradation,interp,composicao};')();
  cached = { htmlPath, makeRunAll, ...helpers };
  return cached;
}

// ---------- configuration (mirrors readForm + generate in the app) ----------
// Synthetic curve with a chosen Dmax and % passing at 2 mm: power law p = 100·(d/Dmax)^n through (2, p2).
// shape 'dense' = the power law; 'gap' = no material between 2,36 and 6,3 mm; 'single' = everything ≥ 2 mm in the top fraction.
const SIEVES = [50, 37.5, 25, 19, 12.5, 9.5, 6.3, 4.75, 2.36, 2, 1.18, 0.6, 0.3, 0.15, 0.075];
export function synthGradation({ dmax = 19, p2 = 40, shape = 'dense' }) {
  const n = Math.log(p2 / 100) / Math.log(2 / dmax);
  const ss = SIEVES.filter(s => s <= dmax + 1e-9);
  if (ss[0] !== dmax) ss.unshift(dmax);
  const pw = s => s >= dmax ? 100 : 100 * Math.pow(s / dmax, n);
  return ss.map(s => {
    let p = pw(s);
    if (shape === 'gap' && s > 2.36 && s <= 6.3 + 1e-9) p = pw(2.36);
    if (shape === 'single' && s < dmax && s >= 2) p = p2;
    return { s, p: Math.round(p * 10) / 10 };
  });
}

export function gradationOf(app, spec) {
  if (spec.grad) return spec.grad.map(([s, p]) => ({ s, p }));
  if (spec.synth) return synthGradation(spec.synth);
  if (spec.wmix != null) {
    const g = app.wGradation(app.WMIX[spec.wmix]);
    return g.sieves.map((s, k) => ({ s, p: g.pass[k] }));
  }
  const id = spec.curve || app.DEFAULT_CURVE;
  const c = app.GRADLIB.find(c => c.id === id);
  if (!c) throw new Error(`unknown curve ${id}`);
  const pos = spec.bandPos ?? 0.5; // 0 = lower limit, 0.5 = mid-band (app default), 1 = upper limit
  return c.pts.map(p => {
    const lo = p[1] ?? p[2], hi = p[2] ?? p[1];
    const v = pos === 0.5 ? app.midOf(p) : lo + (hi - lo) * pos;
    return { s: p[0], p: Math.round(v * 10) / 10 };
  });
}

// Same rules as readForm() in the app; returns a list of messages (empty = valid).
export function validate(cfg) {
  const e = [], g = cfg.grad;
  if (g.some(r => !isFinite(r.s) || !isFinite(r.p) || r.s <= 0 || r.p < 0 || r.p > 100)) e.push('grad: invalid sieve/passing');
  else {
    g.sort((a, b) => b.s - a.s);
    for (let i = 1; i < g.length; i++) if (g[i].p > g[i - 1].p + 1e-9) { e.push(`grad: passing increases at ${g[i].s} mm`); break; }
    if (!e.length && Math.abs(g[0].p - 100) > 1e-6) e.push('grad: top sieve must be 100%');
    if (!e.length && !g.some(r => r.s > 2)) e.push('grad: no sieve above 2 mm');
  }
  if (!(cfg.pb >= 2 && cfg.pb <= 10)) e.push('pb out of 2-10');
  if (!(cfg.avc >= 0.5 && cfg.avc <= 30)) e.push('avc out of 0.5-30');
  if (!(cfg.ra >= 1.5 && cfg.ra <= 4)) e.push('ra out of 1.5-4');
  if (!(cfg.rb >= 0.9 && cfg.rb <= 1.2)) e.push('rb out of 0.9-1.2');
  if (cfg.bub.mode === 'manual' && !(cfg.bub.B >= 0 && cfg.bub.B <= 100 && cfg.bub.BScmm > 0 && cfg.bub.BSh > 0)) e.push('manual bubbles invalid');
  return e;
}

export function buildCfg(app, spec) {
  const D = app.DEFAULTS;
  const cfg = {
    grad: gradationOf(app, spec),
    pb: spec.pb ?? (spec.wmix != null ? app.WMIX[spec.wmix][7] : D.pb),
    avc: spec.avc ?? (spec.wmix != null ? app.WMIX[spec.wmix][8] : D.avc),
    ra: spec.ra ?? D.ra, rb: spec.rb ?? D.rb,
    seed: spec.seed ?? D.seed,
    lib: spec.lib ?? (spec.wmix != null ? (app.WMIX[spec.wmix][0] === 'L' ? 'WL' : 'WG') : D.lib),
    size: spec.size ?? 'p',
    bub: Object.assign({ mode: 'auto', B: 48, BScmm: 1.15, BSh: 1.47 }, spec.bub || {}),
    seg: Object.assign({ on: true, k: 1 }, spec.seg || {}),
    mass: spec.mass, D: spec.D,
  };
  return cfg;
}

export function workerMsg(cfg, comp, spec) {
  return {
    comp: { R: comp.R, H: comp.H, V: comp.V, m_agg: comp.m_agg, fracoes: comp.fracoes, k250: comp.k250, k1000: comp.k1000,
      V_void: comp.V_void, M: comp.M, V_graudo: comp.V_graudo },
    rhoA: cfg.ra, seed: cfg.seed, lib: cfg.lib, bub: cfg.bub, seg: cfg.seg, avc: cfg.avc,
    voxel: spec.voxel ?? (cfg.size === 'w' ? 0.4 : 0.25), dt: spec.dt ?? 2e-5, coat: spec.coat ?? 0.25,
  };
}

// ---------- probe ----------
function makeProbe() {
  const P = {
    t0: Date.now(), stages: {}, placeFail: 0, trace: [], heapPeak: 0, nonFinite: false,
    stage(s, t) { if (!(s in this.stages)) this.stages[s] = t; },
    heap() { const m = process.memoryUsage(); const v = m.heapUsed + m.arrayBuffers; if (v > this.heapPeak) this.heapPeak = v; },
    sim(S, lib, Ps) {
      this.S = S; this.lib = lib; this.Ps = Ps;
      const orig = S.run, self = this;
      S.run = function (ns, o) {
        const r = orig(ns, o);
        let ke = 0, fin = true;
        for (let i = 0; i < S.n; i++) {
          const vx = S.vel[3 * i], vy = S.vel[3 * i + 1], vz = S.vel[3 * i + 2];
          ke += 0.5 * S.mass[i] * (vx * vx + vy * vy + vz * vz);
          if (!Number.isFinite(S.pos[3 * i] + S.pos[3 * i + 1] + S.pos[3 * i + 2])) fin = false;
        }
        if (!fin || !Number.isFinite(ke)) self.nonFinite = true;
        const phase = o.gd === 4 ? 1 : o.gd === 5 ? 2 : 3;
        self.trace.push([o.t0, phase, ke, r.gap, r.fpist, r.maxov]);
        if (self.trace.length % 20 === 0) self.heap();
        if (self.nonFinite) throw new Error('non-finite state in DEM (NaN/Infinity)');
        return r;
      };
    },
    phase1(tt, gap, gap50) { this.p1 = { t: tt, gap, gap50, timedOut: gap > gap50 + 1e-6 }; },
    phase2(tB, forced, fpist, tt) { this.p2 = { t: tB, forced, fpist, tEnd: tt }; },
    settled(S, out) { this.zb = S.zb; this.zp = S.zp; this.maxovEnd = out.maxov; },
  };
  return P;
}

// ---------- one run ----------
export function runCase(spec, { htmlPath } = {}) {
  const app = loadApp(htmlPath);
  const cfg = buildCfg(app, spec);
  const verrs = validate(cfg);
  if (verrs.length && !spec.skipValidation) return { status: 'invalid', validation: verrs };
  const comp = app.composicao(cfg);
  if (!comp.fracoes.length) return { status: 'invalid', validation: ['no aggregate fractions above 2 mm'] };
  const msg = workerMsg(cfg, comp, spec);
  const probe = makeProbe();
  let done = null;
  const self = { postMessage(o) { if (o.type === 'done') done = o.res; else if (o.type === 'sampled') probe.sampled = o; } };
  const { runAll } = app.makeRunAll(self, probe);
  const t0 = Date.now();
  try { runAll(msg); } catch (err) {
    return { status: 'crash', error: String(err && err.message || err), stack: err && err.stack,
      comp: compSummary(comp), probe: probeSummary(probe, t0) };
  }
  probe.heap();
  return { status: 'ok', cfg, comp, msg, res: done, probe, wall: (Date.now() - t0) / 1000 };
}

export function compSummary(c) {
  return { D: c.D, H: c.H, mass: c.mass, Gmm: c.Gmm, Gmb: c.Gmb, p2: c.p2, V: c.V, V_graudo: c.V_graudo, M: c.M, V_void: c.V_void,
    nfrac: c.fracoes.length, dmax: c.dmax };
}
export function probeSummary(p, t0) {
  const order = ['formas', 'mistura', 'compac', 'pintura', 'bolhas'];
  const seen = order.filter(s => s in p.stages);
  const stageT = {};
  seen.forEach((s, k) => { const end = k + 1 < seen.length ? p.stages[seen[k + 1]] : Date.now(); stageT[s] = (end - p.stages[s]) / 1000; });
  return { stageT, placeFail: p.placeFail, p1: p.p1, p2: p.p2, heapPeakMB: p.heapPeak / 2 ** 20, nonFinite: p.nonFinite,
    steps: p.trace.length, wall: (Date.now() - t0) / 1000 };
}
