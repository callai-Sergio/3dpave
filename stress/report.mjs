// Summarises a results .jsonl by cell (all spec fields except the seed), as in §5 of the design:
// break rate with a Wilson 95 % CI, a cell "breaks" when >= 2/5 of its seeds break, medians of the main KPIs.
// Usage: node stress/report.mjs results/x.jsonl [--csv out.csv]
import fs from 'node:fs';

const file = process.argv[2];
const csvI = process.argv.indexOf('--csv');
const rows = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
const isBreak = r => r.status !== 'ok' && r.status !== 'invalid' ? true : r.category === 'D' || r.category === 'C';
const cellKey = r => { const { seed, id, ...rest } = r.spec; return JSON.stringify(rest); };
const median = a => { const b = a.filter(Number.isFinite).sort((x, y) => x - y); return b.length ? b[b.length >> 1] : null; };
function wilson(k, n, z = 1.96) {
  if (!n) return [0, 0];
  const p = k / n, d = 1 + z * z / n, c = (p + z * z / (2 * n)) / d, h = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d;
  return [Math.max(0, c - h), Math.min(1, c + h)];
}
const KEYS = ['K1_avcErr_pp', 'K7_overlap', 'K9_outside', 'K12_keRest', 'K14_bathtub', 'K15_quadCV', 'K16_vertRatio', 'K19_bubTouch', 'K21_wall_s'];

const cells = new Map();
for (const r of rows) { const k = cellKey(r); if (!cells.has(k)) cells.set(k, []); cells.get(k).push(r); }
const out = [];
for (const [k, rs] of cells) {
  const nb = rs.filter(isBreak).length, n = rs.length, [lo, hi] = wilson(nb, n);
  const why = {};
  for (const r of rs) for (const b of r.breaks || [r.status !== 'ok' ? r.status : null].filter(Boolean)) why[b] = (why[b] || 0) + 1;
  for (const r of rs) for (const [f, v] of Object.entries(r.flags || {})) if (v === true) why['flag:' + f] = (why['flag:' + f] || 0) + 1;
  const med = Object.fromEntries(KEYS.map(key => [key, median(rs.map(r => r.kpi?.[key]))]));
  out.push({ cell: JSON.parse(k), n, breaks: nb, rate: nb / n, ci: [lo, hi], breaking: nb >= Math.max(2, Math.ceil(0.4 * n)), why, med,
    invalid: rs.filter(r => r.status === 'invalid').length, errors: [...new Set(rs.filter(r => r.error).map(r => r.error))] });
}
out.sort((a, b) => b.rate - a.rate);
const fmt = v => v == null ? '–' : Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 1 ? v.toFixed(2) : v.toPrecision(2);
console.log(`${rows.length} runs, ${out.length} cells, ${out.filter(c => c.breaking).length} breaking\n`);
for (const c of out) {
  const label = Object.entries(c.cell).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(' ');
  console.log(`${c.breaking ? 'BREAK' : c.breaks ? 'some ' : 'ok   '} ${c.breaks}/${c.n} [${(c.ci[0] * 100).toFixed(0)}–${(c.ci[1] * 100).toFixed(0)}%]  ${label}`);
  if (Object.keys(c.why).length) console.log('        why:', Object.entries(c.why).map(([k, v]) => `${k}×${v}`).join(', '));
  if (c.errors.length) console.log('        errors:', c.errors.join(' | '));
  console.log('        median:', KEYS.map(k => `${k.split('_')[0]} ${fmt(c.med[k])}`).join('  '));
}
if (csvI > 0) {
  const factors = [...new Set(out.flatMap(c => Object.keys(c.cell)))];
  const head = [...factors, 'n', 'breaks', 'rate', 'ci_lo', 'ci_hi', 'breaking', ...KEYS, 'why'];
  const lines = [head.join(',')].concat(out.map(c => [...factors.map(f => JSON.stringify(c.cell[f] ?? '')), c.n, c.breaks, c.rate.toFixed(3), c.ci[0].toFixed(3), c.ci[1].toFixed(3), c.breaking,
    ...KEYS.map(k => c.med[k] ?? ''), JSON.stringify(Object.entries(c.why).map(([k, v]) => `${k}x${v}`).join(' '))].join(',')));
  fs.writeFileSync(process.argv[csvI + 1], lines.join('\n'));
  console.log('\nCSV →', process.argv[csvI + 1]);
}
