# Marshall Digital: stress-test experimental design

Target: the engine in `marshall_digital_app.html` (worker `runAll`: composition → shape library → particle sampling → DEM mixing/compaction → voxel mastic painting → bubble seeding → stats/mesh). Spec and reference values: `Marshall_digital_especificacao.md`.

Goal: find the regions of input space where the pipeline **crashes, hangs, silently degrades, or produces a specimen that is physically wrong while reporting success**.

---

## 1. What "breaks" means

Ranked by severity. Category D is the most important: the UI shows "Pronto" but the result is wrong.

| Code | Failure | How it is detected |
|---|---|---|
| A | Crash: exception, worker error, NaN/Infinity in any output | `type:'error'` message, `Number.isFinite` on every stat |
| B | Hang / timeout: run exceeds budget, browser tab OOM | wall-clock watchdog, worker heap |
| C | Declared degradation: `forced=true` (skeleton locked), bubble deficit `warn`, B/BSc/BSh fallback | flags already in `st` and `bub` |
| D | Silent degradation: target met numerically but specimen is invalid (high overlap, particles outside the mould, AVC met only by the painter, phase-1 timeout) | KPIs in §3 |
| E | Statistical failure: result passes on one seed but fails on others | seed replication (§5) |

Known silent paths found in the code that the tests must cover:

1. **Phase 1 cap.** `while(out.gap>gap50 && tt<4)` exits after 4 s simulated with **no flag**. Phase 2 then starts from a gap above `gap50`.
2. **Forced closure.** After 1.5 s in phase 2 the pistons are driven to H regardless of force. AVC then "hits target" by geometry and the error moves into particle overlap.
3. **AVC is guaranteed by the painter.** Voxel painting always labels exactly `V_esq` of void, so `AVC real ≈ target` is not evidence that compaction worked. Overlap and particle containment are the real checks.
4. **Bubble fallback.** If bubbles don't fit, the deficit becomes skeleton void. B real drops but AVC stays on target.
5. **Eq. (3) fallback** to B = 48% (the default C-12,5 already triggers it).
6. **Placement loop.** Initial column placement gives up after 200 tries and places the particle anyway (possible initial overlap).
7. **Void mesh.** The mesh coarsens until it is under 250 k triangles or `step>4`. Above that it is accepted as is, so memory can grow without bound.

---

## 2. Factors and levels

### 2.1 Primary factors (screened)

| # | Factor | Low (−) | Centre (0) | High (+) | Extreme probes |
|---|---|---|---|---|---|
| F1 | Target AVC (%) | 2 | 4 | 12 | 0,5 · 20 · 30 |
| F2 | Bitumen Pb (%) | 3,5 | 5,5 | 7,5 | 2 · 10 |
| F3 | Passing 2 mm, p2 (%) | 20 (open/SMA) | 40 (C-12,5) | 58 (fine) | 8 · 75 |
| F4 | NMAS / Dmax relative to mould (4·TNM/Ø) | 0,4 | 0,75 | 1,0 | 1,3 (TNM 19 in Ø65) |
| F5 | Gradation shape | dense (0,45 line) | mid-band | gap-graded (missing 2,36–6,3) | single-size (one fraction) |
| F6 | Specimen | 250 g / Ø65 | — | 1000 g / Ø102 | 2000 g / Ø102 (tall) |
| F7 | Stone library | L | — | G | — |
| F8 | Radial force intensity | 0 | 1 | 2 | — |
| F9 | Bubble mode | off | auto | manual B = 100%, BSc 0,3 cm, BSh 0,8 | manual B = 100 %, BSc 0,02 |
| F10 | Seed | 5 replicates per cell (§5) | | | |

### 2.2 Numerical / engine factors (second campaign)

| # | Factor | Levels | Why |
|---|---|---|---|
| N1 | `dt` | 1e−5 · 2e−5 · 4e−5 · 8e−5 s | explicit-integration stability limit (`dt_crit ≈ 2√(m_min/kn)`) |
| N2 | Contact stiffness kn | 250 · 1000 · 4000 mN/mm | overlap vs stability trade-off |
| N3 | Contact distance (`coat`) | 0 · 0,12 · 0,25 · 0,5 mm | overlap from uncovered convex-hull corners |
| N4 | Voxel size h | 0,15 · 0,25 · 0,4 · 0,6 mm | convergence of AVC, B, radial profile |
| N5 | Mass scale (m_max/m_min) | driven by F3/F4 | stiff-system ratio, mixing-kick scaling `3·m_min·g` |
| N6 | Shape library size (`ntpl`) | 10 · 60 · 200 | variance of NA and of the shape statistics |

### 2.3 Input-validation (fuzz) factors

Non-monotonic curve, top sieve below 100 %, no sieve above 2 mm, one sieve above 2 mm (NA < 2 → expected error), duplicate sieves, sieves > 37,5 mm (above class L5), curve pasted with mixed `;`/`,` decimals, 0 % on intermediate sieves, ρa at 1,5 and 4,0, ρb at 0,9 and 1,2.
Pass condition: either a clear validation message or a valid run. Never a hang or NaN.

---

## 3. KPIs

### 3.1 Volumetric fidelity (does the specimen match the design?)

| KPI | Definition | Pass | Warn | Break |
|---|---|---|---|---|
| K1 AVC error | \|AVC_real − AVC_target\| (pp) | ≤ 0,1 | ≤ 0,3 | > 0,3 |
| K2 Aggregate volume closure | (V_agg,voxel + overlap − V_graúdo) / V_graúdo | ≤ 2 % | ≤ 5 % | > 5 % |
| K3 Mastic volume error | (V_mast − M) / M | ≤ 3 % | ≤ 6 % | > 6 % |
| K4 Fraction mass closure | max over fractions \|m_sampled − m_target\| / m_particle,max | ≤ 1 particle | ≤ 2 | > 2 |
| K5 Bubble volume error | (V_bol − V_vazios·B/100) / target | ≤ 5 % | ≤ 15 % | > 15 % or deficit `warn` |
| K6 B real vs B used | B_real − B (pp) | ≤ 2 | ≤ 5 | > 5 |

### 3.2 Physical validity (did compaction really work?)

These are the KPIs that catch category D.

| KPI | Definition | Pass | Warn | Break |
|---|---|---|---|---|
| K7 Overlap ratio | voxel overlap / V_graúdo | < 2 % | < 4 % | ≥ 4 % |
| K8 Max pair penetration | `maxov` / radius of the smaller sphere | < 10 % | < 25 % | ≥ 25 % |
| K9 Containment | % of particle volume outside the cylinder or the pistons | 0 | < 0,5 % | ≥ 0,5 % |
| K10 Skeleton lock | `forced` flag; piston force at lock (N) | false | — | true |
| K11 Phase-1 completion | gap at the end of phase 1 vs gap50 (needs a new flag) | reached | — | timed out (tt ≥ 4 s) |
| K12 Kinetic energy at the end of settling | Σ½mv² / Σ m·g·d_mean | < 1e−3 | < 1e−2 | larger (not at rest) |
| K13 Energy blow-up | max KE during the run / KE at the mixing kick | < 10 | < 100 | ≥ 100 or NaN |

### 3.3 Structural realism (against [W])

| KPI | Definition | Pass | Break |
|---|---|---|---|
| K14 Bathtub index | mean(2 wall bins each side) / mean(6 central bins) of the radial void profile | > 1,3 (radial force on) | ≤ 1,0 |
| K15 Quadrant homogeneity | CV of the 4 quadrant AVCs at mid-height | < 25 % | > 50 % |
| K16 Vertical homogeneity | AVC(top third) / AVC(bottom third) | 0,8–1,25 | outside 0,6–1,6 |
| K17 Segregation index | mean z-centred radius of the small fraction / that of the large fraction | < 1 with F8 > 0 | > 1 with F8 = 2 |
| K18 Section shape | median Min Feret and AR of cut sections vs the [W] Table 2 input | within 10 % | > 20 % |
| K19 Bubbles touching aggregate | count of bubble voxels adjacent to phase 4 | 0 | > 0 |
| K20 Preset RMSE | for [W] mixes 1–14: RMSE of B, BSc, BSh vs Table 3 | ≤ [W] model R² band | — |

### 3.4 Performance and robustness

| KPI | Definition | Budget, 250 g | Budget, 1000 g |
|---|---|---|---|
| K21 Wall time, total and per stage (shapes, DEM, paint, bubbles, mesh) | `tDem` plus stage timers | ≤ 3 min | ≤ 30 min |
| K22 Peak worker heap | `performance.memory` / Node `--max-old-space-size` | < 1 GB | < 2,5 GB |
| K23 Void mesh triangles | `mE.idx.length/3` | ≤ 250 k | ≤ 250 k (break if step > 4 was hit) |
| K24 Crash/hang rate | (A + B) / runs per cell | 0 | 0 |
| K25 Seed variance | CV over 5 seeds of NA, K7, K14, B_real | < 5 % (NA), < 20 % (others) | — |
| K26 Determinism | same seed, same inputs → bit-identical NA and phase counts | identical | — |

**Headline KPI ("break rate"):** fraction of runs in a cell with any KPI in Break, or category A/B/C. A cell is a **breaking scenario** when its break rate is ≥ 2/5 seeds.

---

## 4. Experimental plan

### Phase 0: harness (prerequisite)

- Extract the worker source (`<script type="text/x-worker">`) and run it headless in Node with a stub `postMessage`. The spec already reports a Node test, so reuse it.
- Add the instrumentation that is missing today: phase-1 timeout flag (K11), containment (K9), kinetic energy trace (K12/K13), stage timers (K21), and bubble–aggregate adjacency (K19). Instrumentation only; no behaviour change.
- Golden run: C-12,5 default, seed 2024. It must reproduce the spec §7.4 table (NA 578, AVC 4,00 %, B real 48,0 %, overlap 0,61 cm³). This is the regression anchor.
- Runner: a JSON grid in, one JSONL line per run out (inputs, all KPIs, flags, timings, error text).

### Phase 1: screening (main effects and first-order interactions)

- Fractional factorial **2^(9−4) resolution IV** on F1–F9 = 32 cells + 4 centre points, × 3 seeds ≈ **108 runs**, all 250 g except where F6 = 1000 g.
- Analysis: logistic regression of P(break) and linear models of K7, K14, K21 on the coded factors; half-normal plot to rank effects.
- Expected heavy hitters (hypotheses to confirm or reject): F1 low × F3 low (dense skeleton, little mastic → lock and overlap); F4 high (wall effect, NA small); F9 manual high (bubble deficit); F6 1000 g (time and memory).

### Phase 2: one-factor sweeps to locate the breaking points

For each factor ranked significant, sweep from the centre to the extreme probe with all others at the centre, 5 seeds per level, 6–8 levels. Each sweep produces a **break curve** (KPI vs factor) and a threshold estimate (first level where break rate ≥ 40 %).

Mandatory sweeps:

| Sweep | Range | Expected break |
|---|---|---|
| S1 AVC target | 0,5 → 30 % | low end: `forced`, K7 rises; high end: K11 (loose packing), K16 |
| S2 p2 | 8 → 75 % | low end: mastic < skeleton voids and the painter cannot reach V_esq; high end: NA → 2 or error |
| S3 4·TNM/Ø | 0,4 → 1,3 | K14 and K15 degrade; few particles, wall-dominated |
| S4 Mass ratio (Dmax with Ø102, 1000 g) | Dmax 9,5 → 37,5 mm | `dt` instability (K13), the mixing kick scaled by m_min barely moves the large stones |
| S5 Bubble B (manual) | 0 → 100 % at AVC 2 % and 12 % | K5 deficit, `warn` |
| S6 dt | 1e−5 → 8e−5 | K13 energy blow-up, NaN |
| S7 Voxel h | 0,15 → 0,6 mm | K6, K14 convergence; K22 memory at 0,15 mm |
| S8 Radial force | 0 → 2 (and 4, out of range) | K14 vs K17 trade-off; K16 |

### Phase 3: response surface on the critical pair

On the two strongest interacting factors from Phase 1 (likely AVC × p2), run a **central composite design** (face-centred, 9 cells × 5 seeds = 45 runs) to map the **safe-operating envelope**: the contour where P(break) = 10 % and 50 %. Deliver it as a 2-D map with the [W] mixes and the 23 library bands plotted on it.

### Phase 4: corpus sweep (realistic coverage)

All 23 library bands × {low, mid, high} of each band × L/G × the Pb/AVC suggested by each band × 3 seeds ≈ **414 runs** at 250 g, plus the 14 [W] presets at 1000 g × 3 seeds (42 runs, background). Output: a pass/warn/break table per band, which is what users actually see.

### Phase 5: adversarial and fuzz

- The input-validation list in §2.3, about 30 cases, 1 seed each.
- Random curve generator: monotone random curves within a broad envelope, plus random Pb/AVC. Run 300 at 250 g. Shrink each failing case to a minimal reproducer (fewest sieves, simplest values).
- Resource abuse: 2000 g / Ø102 at h = 0,25 to find the memory ceiling (K22) and the mesh path with step > 4 (K23).

### Run budget

| Phase | Runs | Approx. CPU (250 g ≈ 1,5 min, 1000 g ≈ 20 min) |
|---|---|---|
| 1 Screening | ~108 | ~4 h |
| 2 Sweeps | ~8 × 7 × 5 = 280 | ~10 h (S4 has 1000 g runs) |
| 3 CCD | 45 | ~1,5 h |
| 4 Corpus | ~456 | ~25 h |
| 5 Fuzz | ~330 | ~9 h |

Runs are independent, so Node workers can run in parallel (one per core).

---

## 5. Statistical rules

- **Replication:** 5 seeds in sweeps and in the CCD, 3 in screening. Seeds come from a fixed list so the runs can be reproduced.
- **Break threshold for a cell:** ≥ 2/5 seeds break. Report a Wilson 95 % CI on the break rate.
- **Continuous KPIs:** report the median and the IQR across seeds, not single values.
- **Thresholds in §3 are initial.** After Phase 1, recalibrate Pass/Warn from the distribution of the centre points (for example Warn = centre mean + 3σ).
- **Determinism check (K26)** on every golden re-run. A non-identical rerun invalidates the comparison.

---

## 6. Deliverables

1. `stress/` harness: Node runner, grid JSONs, JSONL results.
2. Break-rate table per scenario, with the failing KPI and the minimal reproducer.
3. Break curves for S1–S8 with threshold estimates.
4. Safe-operating envelope map (Phase 3).
5. Recommended fixes, ranked by how many breaking cells each one removes. Likely candidates: flag the phase-1 timeout, refuse or warn when K7 > 4 %, adapt `dt` to m_min, cap the voxel count before allocating, and give a clearer error when p2 makes M < V_skeleton voids.
6. Updated acceptance criteria for §12 of the spec, adding K7, K9, K11 and K14 as gates.
