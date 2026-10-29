# Stress harness for Marshall Digital

Runs the simulation engine of `../marshall_digital_app.html` headless in Node (v20+, no npm packages) and scores each run against the KPIs of `../Marshall_digital_stress_test.md`.

The app file is not modified. `engine.mjs` reads the worker `<script type="text/x-worker">` and the composition helpers out of the HTML at load time, then splices in a few probes (stage timers, end of phase 1 and phase 2, final piston gap, a wrapper around the DEM step). Each splice must match exactly once. If the app changes underneath one, loading fails with `instrumentation patch "..." matched 0 times` instead of measuring the wrong thing.

## Commands

```bash
node stress/golden.mjs --determinism
```
Default case (C-12,5, limestone, Pb 5,5 %, AVC 4 %, 250 g, seed 2024) checked against the reference table of the spec (§5.3, §7.4), plus a bit-identical rerun (K26). About 40 s. Run this first after any change to the app.

```bash
node stress/run.mjs stress/grids/smoke.json --jobs 6
```
Runs a grid with one process per case: a hang (`--timeout`, s) or an OOM (`--mem`, MB) loses only that case. Writes `stress/results/<grid>.jsonl`, one line per run. `--resume` skips cases already in the file.

```bash
node stress/report.mjs stress/results/smoke.jsonl --csv stress/results/smoke.csv
```
Groups runs by cell (every spec field except the seed) and prints the break rate with a Wilson 95 % CI, the reasons, and median KPIs. A cell is **breaking** when ≥ 40 % of its seeds (at least 2) break.

```bash
node stress/grids/make_screening.mjs --seeds 3
```
Regenerates the Phase 1 design (`grids/screening.json`).

## Case spec

| Field | Meaning | Default |
|---|---|---|
| `curve` | id from the embedded library (`GRADLIB`) | `BR_DNIT031-2024_C-12,5` |
| `bandPos` | 0 = lower limit, 0.5 = mid-band, 1 = upper limit | 0.5 |
| `wmix` | 0–13: Wan et al. Table 1 mix (also sets Pb, AVC, stone) | |
| `synth` | `{dmax, p2, shape: dense \| gap \| single}` synthetic curve | |
| `grad` | `[[sieve_mm, passing_%], ...]` | |
| `pb`, `avc`, `ra`, `rb` | as in the app | 5,5 · 4 · 2,70 · 1,04 |
| `lib` | `WL` limestone, `WG` granite | `WL` |
| `size` | `p` 250 g Ø65, `w` 1000 g Ø102 | `p` |
| `mass`, `D` | override specimen mass (g) and mould (mm) | |
| `bub` | `{mode: auto \| manual \| off, B, BScmm, BSh}` | auto |
| `seg` | `{on, k}` radial force | on, 1 |
| `voxel`, `dt`, `coat` | engine numerics (N1, N3, N4) | 0,25 / 0,4 · 2e-5 · 0,25 |
| `seed` | | 2024 |
| `skipValidation` | run even if the app's form would refuse the input | false |

## KPIs and verdicts

`kpi.mjs` holds the thresholds (`THRESH`). They are the initial values from the design and should be recalibrated after Phase 1.

| Category | Meaning |
|---|---|
| `pass` / `warn` | no KPI in break |
| `C` | a declared degradation: bubble deficit warning or placement give-up |
| `D` | at least one KPI in break while the app reports success |
| `A` / `crash` | exception, NaN, OOM |
| `B` / `hang` | exceeded `--timeout` |
| `invalid` | rejected by the same rules as the app's form (expected for bad input) |

KPIs the harness adds or measures differently from the design:

- **K11b** final piston gap vs H. Catches runs where the particle column starts shorter than H, so the pistons never get there.
- **K15** quadrant CV over the central third of the height, not the single mid-height slice the app shows (`detail.st.quad` still has that one).
- **K16** max/min AVC across the three height thirds.
- **K19** fraction of bubble voxels face-adjacent to an aggregate voxel.
- **K8** final maximum sphere penetration, relative to 1 mm (radius of the smallest admissible particle).
- **K18** (section shape vs Table 2) and **K20** (preset RMSE) are not implemented yet.

## Files

- `engine.mjs`: loads the app source, adds the probes, builds the config like the app's form, runs one case.
- `kpi.mjs`: K1–K23 and the verdict.
- `golden.mjs`: regression anchor.
- `run.mjs`, `child.mjs`: parallel grid runner.
- `report.mjs`: per-cell summary.
- `grids/`: smoke test, Phase 1 screening, S1 AVC sweep, input fuzz.
