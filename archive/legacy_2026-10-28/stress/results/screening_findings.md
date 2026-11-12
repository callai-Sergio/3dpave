# Phase 1 screening: findings

Run on 2026-10-28 on the PC: 99 runs (33 cells × 3 seeds), 69,5 min, 9 jobs. Raw data: `screening.jsonl`; effects: `node stress/effects.mjs stress/results/screening.jsonl`.

Design: 2^(9−4) resolution IV plus a centre point. Factors at low / high:
- A AVC 2 / 12 %
- B Pb 3,5 / 7,5 %
- C p2 20 / 58 %
- D Dmax 12,5 / 25 mm
- E dense / gap-graded
- F 250 g Ø65 / 1000 g Ø102
- G limestone / granite
- H radial force k 0 / 2
- J bubbles off / manual (B 100 %, BSc 3 mm, BSh 0,8)

Centre: C-12,5-like curve, AVC 4, Pb 5,5, Dmax 19, 250 g, k 1, auto bubbles.

## Robustness

- **No crashes, hangs, NaN or energy blow-up** in 99 runs.
- The pistons always reached H (K11b = 0) and compaction never had to be forced (`forced` = 0). Phase 1 never timed out.
- The AVC target is always met (K1 < 0,01 pp), but that is by construction: the painter enforces it.
- 87/99 runs broke at least one KPI; 49/99 if K16 is left out. At the current thresholds, "broke" is not a useful discriminator: every factor level breaks 81–94 % of the time. The continuous KPIs below are what the screening actually resolves.

## Breaking scenarios, by mechanism

### 1. Without the radial force the specimen is not homogeneous in height (K16), and it is the DEM

Middle third AVC divided by the end-thirds AVC (median per group):

| | AVC 2 % | AVC 12 % |
|---|---|---|
| k 0, 250 g | 1,05 | 2,78 |
| k 0, 1000 g | **12,9** | 5,2 |
| k 2, 250 g | 0,99 | 0,80 |
| k 2, 1000 g | 1,16 | 1,27 |

Significant effects on log K16: radial k −0,52, 1000 g +0,39, p2 +0,29.

Diagnosis, from cell S06 split into sixths of the height: aggregate fraction is 40–44 % near the pistons and **19–23 % in the middle**. Without gravity and without friction, the two pistons push the stones against the end faces and leave a loose, mastic-rich band at mid-height. The painter then puts the voids there, because they are farthest from aggregate.

So the radial force is doing two jobs: the "castanha-do-pará" segregation that [W] calibrated it for, and keeping the specimen from layering. Setting k = 0, which the app allows, gives a layered specimen with no warning.

### 2. Low fines: aggregate overlap shows up as excess mastic (K3, K7)

At p2 = 20 % the mastic volume is 5–11 % above target, against 0–3 % at p2 = 58 %. The p2 effect on K3 is −0,053, the largest.

The mastic is whatever is left after aggregate and voids. Aggregate overlap (K7: log effect of p2 −0,35; 1000 g +0,16) therefore turns directly into extra mastic: with a stone skeleton and little mastic, the overlapped volume is a large share of M.

The densest cell (S01: AVC 2, Pb 3,5, p2 20, 1000 g) reached a 0,59 mm penetration between particles (K8). It is the one closest to locking.

### 3. Bubbles that cannot fit (K5, K6, K19)

With manual bubbles (B 100 %, large diameters), AVC 12 % gives a **33–49 % bubble deficit**. The app fills the shortfall with skeleton voids and shows a warning. Low p2 makes it worse, because there is less mastic to hold the bubbles.

The same cells have bubbles touching aggregate (K19, log effect of bubbles +3,1). This means large bubbles are placed closer to aggregate than the chamfer distance suggests.

At AVC 2 % the same bubble settings fit.

### 4. Large stones in a small mould: quadrant heterogeneity (K15)

The quadrant CV rises with Dmax (+0,16) and falls with AVC (−0,16). The centre point (Dmax 19 in Ø65) already has a CV of 0,48: a 250 g specimen with Dmax ≥ 19 mm is not representative in plan.

### 5. Silent placement give-ups

In 41/99 runs at least one particle could not find a free spot in 200 tries and was placed overlapping. It does not show up in the final overlap, but nothing reports it.

## Cost

- **Wall time:** 1000 g ×5,2; low p2 ×2,6 (more coarse particles); radial force ×2. Range 0,8–25 min per run.
- **Peak heap:** under 500 MB everywhere.

## Next actions

1. **K16 threshold:** the centre point is 1,27–1,64 across seeds, so a 250 g specimen isn't even at 1,25. Recalibrate the threshold. Also add a warning in the app when k = 0, or when the aggregate fraction by height varies more than ±25 %.
2. **Phase 2 sweeps** on the radial force (S8: 0 / 0,25 / 0,5 / 1 / 2), p2 (S2) and bubble B × AVC (S5). Those three are where the breaks are.
3. **K3:** report mastic error net of overlap, or treat K7 as the root cause.
4. The pairs AVC×p2 = 1000 g×radial k are aliased in this design; the S8 sweep separates them.
