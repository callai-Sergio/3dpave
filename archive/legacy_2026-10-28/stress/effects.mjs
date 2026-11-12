// Effects analysis for the Phase 1 screening (2^(9-4) IV, see grids/make_screening.mjs).
// For each response: the 31 contrasts of the base factors A–E with their alias chains (main effects and
// two-factor interactions), significance by Lenth's pseudo standard error, and break rates per factor level.
// Usage: node stress/effects.mjs stress/results/screening.jsonl
import fs from 'node:fs';

const rows = fs.readFileSync(process.argv[2], 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
const NAMES = { A: 'AVC', B: 'Pb', C: 'p2', D: 'Dmax', E: 'gap-graded', F: '1000 g', G: 'granite', H: 'radial k', J: 'bubbles' };
// each design factor as a subset (bitmask) of the base factors A..E
const GEN = { A: 1, B: 2, C: 4, D: 8, E: 16, F: 2 | 4 | 8 | 16, G: 1 | 4 | 8 | 16, H: 1 | 2 | 8 | 16, J: 1 | 2 | 4 | 16 };
const F = Object.keys(GEN);

const broke = r => r.status === 'crash' || r.status === 'hang' || r.category === 'D' || r.category === 'C';
const LOG = new Set(['K14_bathtub', 'K16_vertRatio', 'K7_overlap', 'K9_outside', 'K12_keRest', 'K13_keBlowup', 'K19_bubTouch', 'K21_wall_s', 'K22_heapPeakMB', 'K11b_gapErr_mm']);
const RESP = ['broke', 'K1_avcErr_pp', 'K3_mastErr', 'K5_bubErr', 'K7_overlap', 'K9_outside', 'K11b_gapErr_mm', 'K12_keRest', 'K14_bathtub',
  'K15_quadCV', 'K16_vertRatio', 'K17_segregation', 'K19_bubTouch', 'K21_wall_s', 'K22_heapPeakMB'];
const val = (r, key) => {
  if (key === 'broke') return broke(r) ? 1 : 0;
  const v = r.kpi?.[key];
  if (v == null || !Number.isFinite(v)) return null;
  return LOG.has(key) ? Math.log10(Math.max(v, 1e-6)) : v;
};

// cells
const cells = new Map();
for (const r of rows) {
  const id = r.spec.id.split('|')[0];
  if (!cells.has(id)) cells.set(id, { coded: r.spec.coded, runs: [] });
  cells.get(id).runs.push(r);
}
const fact = [...cells.entries()].filter(([id]) => id !== 'C0').map(([, c]) => c);
const mean = a => a.reduce((s, x) => s + x, 0) / a.length;
const cellMean = (c, key) => { const v = c.runs.map(r => val(r, key)).filter(x => x != null); return v.length ? mean(v) : null; };
const mask = c => F.slice(0, 5).reduce((m, k, i) => m | (c.coded[k] > 0 ? 1 << i : 0), 0);
const sign = (c, sub) => { let p = 1; for (let i = 0; i < 5; i++) if (sub >> i & 1) p *= c.coded['ABCDE'[i]]; return p; };

function aliasLabel(sub) {
  const terms = [];
  for (const f of F) if (GEN[f] === sub) terms.push(f);
  for (let i = 0; i < F.length; i++) for (let j = i + 1; j < F.length; j++) if ((GEN[F[i]] ^ GEN[F[j]]) === sub) terms.push(F[i] + F[j]);
  return terms.join('=') || `[${sub}]`;
}
const human = lbl => lbl.split('=').map(t => t.split('').map(k => NAMES[k]).join('×')).join(' = ');

function lenth(eff) {
  const a = eff.map(Math.abs).sort((x, y) => x - y);
  const s0 = 1.5 * a[a.length >> 1];
  const t = a.filter(x => x < 2.5 * s0);
  const pse = 1.5 * t[t.length >> 1];
  return { pse, me: 2.22 * pse }; // t(0.975, m/3 ≈ 10)
}

console.log(`${rows.length} runs in ${cells.size} cells. Overall: ${rows.filter(broke).length} broke, ` +
  `${rows.filter(r => r.status === 'crash').length} crash, ${rows.filter(r => r.status === 'hang').length} hang.\n`);
const centre = cells.get('C0');
const report = {};
for (const key of RESP) {
  const usable = fact.filter(c => cellMean(c, key) != null);
  if (usable.length < 16) { console.log(`${key}: only ${usable.length} usable cells, skipped\n`); continue; }
  const grand = mean(usable.map(c => cellMean(c, key)));
  const eff = [];
  for (let sub = 1; sub < 32; sub++) {
    const pl = usable.filter(c => sign(c, sub) > 0).map(c => cellMean(c, key)), mi = usable.filter(c => sign(c, sub) < 0).map(c => cellMean(c, key));
    if (!pl.length || !mi.length) continue;
    eff.push({ sub, label: aliasLabel(sub), e: mean(pl) - mean(mi) });
  }
  const { me } = lenth(eff.map(x => x.e));
  eff.sort((a, b) => Math.abs(b.e) - Math.abs(a.e));
  const sig = eff.filter(x => Math.abs(x.e) > me);
  report[key] = { grand, me, effects: eff };
  const cm = centre ? cellMean(centre, key) : null;
  console.log(`${key}${LOG.has(key) ? ' (log10)' : ''}: mean ${grand.toPrecision(3)}${cm != null ? `, centre ${cm.toPrecision(3)}` : ''}, Lenth ME ${me.toPrecision(2)}`);
  for (const x of eff.slice(0, 6)) console.log(`   ${Math.abs(x.e) > me ? '*' : ' '} ${x.e >= 0 ? '+' : ''}${x.e.toPrecision(3).padStart(8)}  ${human(x.label)}`);
  if (centre && cm != null) {
    // curvature: centre point vs factorial mean, compared with the seed-to-seed spread at the centre
    const cv = centre.runs.map(r => val(r, key)).filter(x => x != null);
    const sd = cv.length > 1 ? Math.sqrt(mean(cv.map(x => (x - cm) ** 2)) * cv.length / (cv.length - 1)) : null;
    console.log(`     curvature (centre − factorial): ${(cm - grand).toPrecision(3)}${sd ? `, centre seed SD ${sd.toPrecision(2)}` : ''}`);
  }
  console.log('');
}

console.log('Break rate per factor level (factorial cells):');
for (const f of F) {
  const r = lv => { const rs = fact.filter(c => c.coded[f] === lv).flatMap(c => c.runs); return `${rs.filter(broke).length}/${rs.length}`; };
  console.log(`   ${f} ${NAMES[f].padEnd(11)}  low ${r(-1).padStart(6)}   high ${r(1).padStart(6)}`);
}
console.log('\nHow often each KPI breaks (all runs):');
const kc = {};
for (const r of rows) for (const b of r.breaks || []) kc[b] = (kc[b] || 0) + 1;
for (const [k, n] of Object.entries(kc).sort((a, b) => b[1] - a[1])) console.log(`   ${k.padEnd(22)} ${n}`);
const fl = {};
for (const r of rows) for (const [k, v] of Object.entries(r.flags || {})) if (v === true || (typeof v === 'number' && v > 0)) fl[k] = (fl[k] || 0) + 1;
console.log('Flags:', Object.entries(fl).map(([k, n]) => `${k} ${n}`).join(', '));
fs.writeFileSync(process.argv[2].replace(/\.jsonl$/, '.effects.json'), JSON.stringify(report, null, 1));
