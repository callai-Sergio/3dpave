// KPIs K1-K26 of Marshall_digital_stress_test.md §3, computed from one runCase() result.
// Thresholds are the initial ones from the design (§5 says to recalibrate them after the screening phase).
import { compSummary, probeSummary } from './engine.mjs';

// [pass limit, warn limit, direction]; 'lt' = smaller is better
export const THRESH = {
  K1_avcErr_pp: [0.1, 0.3, 'lt'],
  K2_aggClosure: [0.02, 0.05, 'abs'],
  K3_mastErr: [0.03, 0.06, 'abs'],
  K4_fracClosure_part: [1, 2, 'lt'],
  K5_bubErr: [0.05, 0.15, 'abs'],
  K6_Bgap_pp: [2, 5, 'abs'],
  K7_overlap: [0.02, 0.04, 'lt'],
  K8_maxPen_rel: [0.10, 0.25, 'lt'],
  K9_outside: [1e-9, 0.005, 'lt'],
  K12_keRest: [1e-3, 1e-2, 'lt'],
  K13_keBlowup: [10, 100, 'lt'],
  K14_bathtub: [1.3, 1.0, 'gt'],
  K15_quadCV: [0.25, 0.50, 'lt'],
  K11b_gapErr_mm: [0.05, 0.5, 'lt'],
  K19_bubTouch: [0, 0.005, 'lt'], // fraction of bubble voxels face-adjacent to aggregate
  K23_meshTri: [250000, 250000, 'lt'],
  // plano_app_unificado_compactacao.md §8
  K33_penMax: [0.02, 0.04, 'lt'], // max stone-stone penetration by the real hull, / Min Feret of the smaller particle
  // (max − min AVC of the thirds) / target AVC. A calibrar: with more voids at the faces (K27 > 1, as in real CT) the end thirds
  // differ from the middle by design, so the plan's 0,30 / 0,60 conflicts with K27; widened until a CT reference exists
  K16b_vertSpread: [0.75, 1.0, 'lt'],
  K27_faceVoids: [1.0, 0.7, 'gt'], // AVC within ~2 slices of the faces / AVC of the central third
  K29_skelUniform: [0.85, 0.70, 'gt'], // aggregate fraction in the core / near the faces (2nd–4th slice)
  KE_adjEffort: [0.10, 0.25, 'lt'], // locked AVC: share of the height reduction made by the final adjustment
};

function grade(key, v) {
  const t = THRESH[key];
  if (v == null || Number.isNaN(v)) return 'na';
  const [p, w, dir] = t;
  if (dir === 'band') return v >= p[0] && v <= p[1] ? 'pass' : v >= w[0] && v <= w[1] ? 'warn' : 'break';
  if (dir === 'gt') return v > p ? 'pass' : v > w ? 'warn' : 'break';
  const x = dir === 'abs' ? Math.abs(v) : v;
  return x <= p ? 'pass' : x <= w ? 'warn' : 'break';
}

const mean = a => a.reduce((s, x) => s + x, 0) / (a.length || 1);

// fraction of each particle's volume outside the cylinder / between-piston space, by sampling its convex hull
function containment(res, probe) {
  const { R, H, h } = res, lib = probe.lib, n = res.tpl.length;
  let out = 0, tot = 0, maxR = 0, maxZ = 0;
  for (let i = 0; i < n; i++) {
    const t = lib[res.tpl[i]], s = res.sc[i];
    const qw = res.q[4 * i], qx = res.q[4 * i + 1], qy = res.q[4 * i + 2], qz = res.q[4 * i + 3];
    const Rm = [1 - 2 * (qy * qy + qz * qz), 2 * (qx * qy - qw * qz), 2 * (qx * qz + qw * qy), 2 * (qx * qy + qw * qz), 1 - 2 * (qx * qx + qz * qz),
      2 * (qy * qz - qw * qx), 2 * (qx * qz - qw * qy), 2 * (qy * qz + qw * qx), 1 - 2 * (qx * qx + qy * qy)];
    const px = res.pos[3 * i], py = res.pos[3 * i + 1], pz = res.pos[3 * i + 2];
    const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
    for (let v = 0; v < t.v.length; v += 3) {
      const a = t.v[v] * s, b = t.v[v + 1] * s, c = t.v[v + 2] * s;
      const w = [Rm[0] * a + Rm[1] * b + Rm[2] * c + px, Rm[3] * a + Rm[4] * b + Rm[5] * c + py, Rm[6] * a + Rm[7] * b + Rm[8] * c + pz];
      for (let k = 0; k < 3; k++) { if (w[k] < mn[k]) mn[k] = w[k]; if (w[k] > mx[k]) mx[k] = w[k]; }
      const r = Math.hypot(w[0], w[1]); if (r - R > maxR) maxR = r - R;
      if (-w[2] > maxZ) maxZ = -w[2]; if (w[2] - H > maxZ) maxZ = w[2] - H;
    }
    const np = t.pl.length / 4, PW = new Float64Array(4 * np);
    for (let p = 0; p < np; p++) {
      const a = t.pl[4 * p], b = t.pl[4 * p + 1], c = t.pl[4 * p + 2];
      PW[4 * p] = Rm[0] * a + Rm[1] * b + Rm[2] * c; PW[4 * p + 1] = Rm[3] * a + Rm[4] * b + Rm[5] * c; PW[4 * p + 2] = Rm[6] * a + Rm[7] * b + Rm[8] * c; PW[4 * p + 3] = t.pl[4 * p + 3] * s;
    }
    for (let z = Math.floor(mn[2] / h) * h + h / 2; z < mx[2]; z += h)
      for (let y = Math.floor(mn[1] / h) * h + h / 2; y < mx[1]; y += h)
        for (let x = Math.floor(mn[0] / h) * h + h / 2; x < mx[0]; x += h) {
          const X = x - px, Y = y - py, Z = z - pz; let ok = true;
          for (let p = 0; p < np; p++) if (PW[4 * p] * X + PW[4 * p + 1] * Y + PW[4 * p + 2] * Z + PW[4 * p + 3] > 0) { ok = false; break; }
          if (!ok) continue;
          tot++; if (x * x + y * y > R * R || z < 0 || z > H) out++;
        }
  }
  return { frac: tot ? out / tot : 0, maxRadialExcess: Math.max(0, maxR), maxAxialExcess: maxZ };
}

function voxelStats(res) {
  const { nx, ny, nz, phase } = res, sxy = nx * ny;
  let touch = 0, nbub = 0;
  const third = [[0, 0], [0, 0], [0, 0]], quad = [[0, 0], [0, 0], [0, 0], [0, 0]];
  for (let z = 0; z < nz; z++) {
    const k = Math.min(2, Math.floor(3 * z / nz));
    for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
      const id = z * sxy + y * nx + x, p = phase[id];
      if (!p) continue;
      const v = p === 2 || p === 3;
      third[k][1]++; if (v) third[k][0]++;
      if (k === 1) { const d = (x >= nx / 2 ? 1 : 0) + (y >= ny / 2 ? 2 : 0); quad[d][1]++; if (v) quad[d][0]++; }
      if (p === 3) {
        nbub++;
        if ((x > 0 && phase[id - 1] === 4) || (x < nx - 1 && phase[id + 1] === 4) || (y > 0 && phase[id - nx] === 4) ||
          (y < ny - 1 && phase[id + nx] === 4) || (z > 0 && phase[id - sxy] === 4) || (z < nz - 1 && phase[id + sxy] === 4)) touch++;
      }
    }
  }
  const avc = third.map(([v, t]) => t ? v / t : 0);
  return { bubTouch: nbub ? touch / nbub : 0, bubTouchVox: touch, avcThirds: avc.map(v => v * 100), vertRatio: Math.min(...avc) > 0 ? Math.max(...avc) / Math.min(...avc) : null,
    quadThird: quad.map(([v, t]) => t ? v / t * 100 : 0) };
}

// small fraction (lowest index present) vs large fraction: mean distance to the specimen centre
function segregation(res) {
  const { pos, fr, H } = res, n = fr.length;
  let lo = 99, hi = -1; for (let i = 0; i < n; i++) { if (fr[i] < lo) lo = fr[i]; if (fr[i] > hi) hi = fr[i]; }
  if (lo === hi) return null;
  const d = f => { const a = []; for (let i = 0; i < n; i++) if (fr[i] === f) a.push(Math.hypot(pos[3 * i], pos[3 * i + 1], pos[3 * i + 2] - H / 2)); return mean(a); };
  return d(lo) / d(hi);
}

export function computeKPIs(run, spec = {}) {
  if (run.status !== 'ok') return { status: run.status, error: run.error, validation: run.validation, comp: run.comp, probe: run.probe };
  const { res, comp, probe, cfg } = run, st = res.st;
  const ps = probeSummary(probe, probe.t0);
  const scale = st.Vcil / comp.V; // grid cylinder vs analytic volume
  const rho = cfg.ra;
  // K4: worst fraction closure, in units of that fraction's largest particle
  const pm = res.rel.map(() => 0);
  for (let i = 0; i < res.tpl.length; i++) { const m = probe.lib[res.tpl[i]].vol * res.sc[i] ** 3 * rho / 1000; if (m > pm[res.fr[i]]) pm[res.fr[i]] = m; }
  const k4 = Math.max(...res.rel.map((r, k) => pm[k] ? Math.abs(r.massa - r.alvo) / pm[k] : (r.alvo > 0 ? Infinity : 0)));
  const trace = probe.trace, keMix = Math.max(1e-30, ...trace.filter(t => t[1] === 1).map(t => t[2]));
  const keLate = Math.max(0, ...trace.filter(t => t[1] > 1).map(t => t[2]));
  const keEnd = trace.length ? trace[trace.length - 1][2] : 0;
  let mgd = 0; for (let i = 0; i < probe.S.n; i++) mgd += probe.S.mass[i] * 9810 * 2 * probe.S.brad[i];
  const cont = containment(res, probe), vox = voxelStats(res);
  const prof = st.profile, q = vox.quadThird, qm = mean(q); // quadrants over the central third (the app's st.quad is one slice)
  const k = {
    K1_avcErr_pp: Math.abs(st.AVC - cfg.avc),
    K2_aggClosure: (st.Vagg + st.over - comp.V_graudo * scale) / (comp.V_graudo * scale),
    K3_mastErr: (st.Vmast - comp.M * scale) / (comp.M * scale),
    K4_fracClosure_part: k4,
    K5_bubErr: st.VbolT > 0 ? (st.Vbol - st.VbolT) / st.VbolT : 0,
    K6_Bgap_pp: st.Breal - res.bub.B,
    K7_overlap: st.over / (comp.V_graudo * scale),
    K8_maxPen_rel: (probe.maxovEnd ?? st.maxov) / 1.0, // vs radius of the smallest admissible particle (Min Feret 2 mm)
    K9_outside: cont.frac,
    K10_forced: !!st.forced,
    K11_phase1TimedOut: !!(ps.p1 && ps.p1.timedOut),
    K11b_gapErr_mm: Math.abs(probe.zp - probe.zb - res.H), // final piston gap vs the specimen height the voxel grid assumes
    K12_keRest: keEnd / mgd,
    K13_keBlowup: keLate / keMix,
    K14_bathtub: mean([prof[0], prof[1], prof[18], prof[19]]) / Math.max(1e-9, mean(prof.slice(7, 13))),
    K15_quadCV: qm ? Math.sqrt(mean(q.map(x => (x - qm) ** 2))) / qm : null,
    K16_vertRatio: vox.vertRatio,
    K17_segregation: segregation(res),
    K19_bubTouch: vox.bubTouch,
    K21_wall_s: run.wall,
    K22_heapPeakMB: ps.heapPeakMB,
    K23_meshTri: res.meshE.idx.length / 3,
    K33_penMax: st.pen ? st.pen.max : null,
    K16b_vertSpread: (Math.max(...vox.avcThirds) - Math.min(...vox.avcThirds)) / cfg.avc,
    K27_faceVoids: st.vprofile ? ((st.vprofile[0] + st.vprofile[19]) / 2) / Math.max(1e-9, mean(st.vprofile.slice(7, 13))) : null,
    K29_skelUniform: st.vagg ? mean(st.vagg.slice(7, 13)) / Math.max(1e-9, mean([...st.vagg.slice(1, 4), ...st.vagg.slice(16, 19)])) : null,
    KE_adjEffort: st.comp && st.comp.locked ? st.comp.esforco : null,
    AVCpred: st.comp ? st.comp.AVCcp : null,
  };
  const grades = {};
  for (const key of Object.keys(THRESH)) grades[key] = grade(key, k[key]);
  grades.K10_forced = k.K10_forced ? 'break' : 'pass';
  grades.K11_phase1TimedOut = k.K11_phase1TimedOut ? 'break' : 'pass';
  // the bathtub is only expected with the radial force on
  if (!(cfg.seg.on && cfg.seg.k > 0) || (run.msg && run.msg.proto && run.msg.proto !== 'w')) grades.K14_bathtub = 'na';
  // K9 sampled in voxels can never reach 1e-9 (M3): 1e-3 is the recalibrated limit
  if (k.K9_outside != null) grades.K9_outside = k.K9_outside <= 1e-3 ? 'pass' : k.K9_outside <= 5e-3 ? 'warn' : 'break';
  const flags = {
    forced: k.K10_forced, phase1TimedOut: k.K11_phase1TimedOut, bubbleDeficit: !!st.warn,
    BfallbackEq3: !!res.bub.Bfallback, BScBShFallback: !!res.bub.fallback, placeFail: probe.placeFail,
  };
  const breaks = Object.entries(grades).filter(([, g]) => g === 'break').map(([k]) => k);
  const warns = Object.entries(grades).filter(([, g]) => g === 'warn').map(([k]) => k);
  const category = breaks.length ? 'D' : (flags.bubbleDeficit || flags.placeFail) ? 'C' : warns.length ? 'warn' : 'pass';
  return {
    status: 'ok', category, breaks, warns, kpi: k, grades, flags,
    detail: {
      NA: res.NA, NA1000: res.NA * comp.k1000, bub: res.bub, st: { ...st, profile: st.profile.map(v => +v.toFixed(2)), quad: st.quad.map(v => +v.toFixed(2)) },
      containment: cont, avcThirds: vox.avcThirds, quadThird: vox.quadThird, bubTouchVox: vox.bubTouchVox, rel: res.rel, stageT: ps.stageT, p1: ps.p1, p2: ps.p2, steps: ps.steps,
    },
    comp: compSummary(comp),
  };
}
