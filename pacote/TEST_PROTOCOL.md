# Marshall Simulator: test protocol for colleagues

Version 2 (2026-11-10: the 250 g specimen was removed from the app) · for app 1.1.0a2 · questions to Sergio Callai

Thank you for testing. The aim is to **find errors**, not to show that the app works. A test that makes the app fail is a successful test.

The protocol is built so that results from different people and PCs can be combined and checked:

- everybody tests **the same app version** during a test round;
- every test starts from **Reset to default** and sets only the fields listed (including *Compaction* and the specimen, which Reset does not always restore), so anybody can repeat it;
- the **random seed is always written down**: with the same inputs and seed the app must give exactly the same result on every PC;
- you **write down what you expect before you run** (lab values, direction of change), so the result cannot be read in hindsight;
- every problem is **repeated** before it is reported, and reported with what is needed to repeat it.

Record everything in the tables of §10, in your own copy of this file (`TEST_PROTOCOL_<testerID>.md`), and send it to Sergio at the end of the round, together with the files it mentions.

---

## 0. Before you start (5 min)

1. Unzip `MarshallSimulator_<version>.zip` into a new folder. Do not mix it with an older version.
2. Fill in table §10.Tester: your tester ID (given by Sergio, e.g. T03), name, date, PC (CPU, number of cores, RAM), Windows version, how you run the app (EXE or Python/wheel), and the zip file name.
3. Start the app. Switch the language to **EN** (top right) if you prefer English. Keep the same language for the whole round and note it in §10.Tester.
4. Close heavy programs while you run tests and note in §10.Tester if the PC was busy (time measurements depend on it).

**Rules for every run**
- Start with **Reset to default**, then set only the fields the test lists. The default is: Compaction **Marshall** with the **Standard Marshall specimen (Ø101,6 mm, 63,5 mm high, ~1200 g)**, locked AVC 4 %, 75 blows per face, random seed 2024, binder 50/70, 150 °C. Each compaction has one specimen, which the app sets by itself: Marshall Ø101,6 mm, [W] 1000 g in Ø102 mm, gyratory Ø150 mm.
- **Quick test** (used wherever a test says so): Compaction = **[W] pistons, no gravity** (specimen **As in [W]: 1000 g in Ø102 mm mould**). [W] has no blows, binder grade, temperature or AVC-mode fields. The **reference case** is Marshall with the Standard Marshall specimen (~1200 g). Both take minutes, more on a PC with few cores: always note the elapsed time.
- If *Compaction* is not the one the test needs, set it (and the specimen) **before** anything else.
- Do not change the calibration fields (mastic film λ, viscosity factor, hammer energy scale, pressure scale, face weight) unless the test says so.
- After each finished run, write down the values the tables of §10 ask for, exactly as shown (all decimals), and the elapsed time from the progress panel.
- If a run ends in an error, a freeze or a strange result, go to §6 before anything else.

---

## 1. Test R: same result on every PC (everyone, 4 runs)

Purpose: the same inputs and seed must give **identical** numbers on all PCs. A difference in any decimal is a defect.

| Test | Settings (after Reset to default) |
|---|---|
| R1 | Compaction = **[W]** (1000 g in Ø102 mm mould; AVC 4 %, seed 2024): the Quick test |
| R2 | Compaction = **Marshall** (Standard Marshall specimen), AVC mode = **free AVC**, 75 blows, seed 2024 |
| R3 | Compaction = **Marshall** (Standard Marshall specimen), AVC mode = **locked AVC** 4 % (the default), 75 blows, seed 2024 |

For each: run, write NA, AVC, elapsed time. Then run **R1 a second time** without closing the app and write the values again: they must be identical to the first run.

Sergio fills the reference values in §10.R before the round. Compare your numbers with them: any difference goes to §10.Problems.

## 2. Test S: spread between seeds (everyone, 3 runs)

Purpose: measure how much one virtual specimen varies with the random seed, as with real specimens. Every tester gets **different seeds** (§10.Seeds), so together we cover many.

Settings: as R1 (the Quick test: [W], 1000 g). Run once with each of your three seeds. Write NA and AVC.

## 3. Test D: does it go the right way? (everyone, ~1.5–2 h)

Purpose: check that the app reacts to the inputs in the physically expected direction. You do not need to know the right value, only the direction.

Settings: as R2 (Marshall, Standard Marshall specimen, free AVC, 75 blows, seed 2024). Change **one** field at a time; the middle level is the R2 run, so you do not repeat it (about 8 new runs, ~1.5–2 h depending on the PC):

| Test | Field | Levels | Expected |
|---|---|---|---|
| D1 | Binder content (% by mass) | 4,5 · 5,5 · 6,5 | AVC goes **down** as binder goes up |
| D2 | Blows per face | 35 · 50 · 75 | AVC goes **down** with more blows |
| D3 | Compaction temperature (°C) | 130 · 150 · 170 | AVC goes **down** at higher temperature |
| D4 | Gradation curve: same curve, choose a coarser and a finer one from the list | coarse · default · fine | write the expected direction for NA **before** running |

Before running, write in §10.D the direction you expect for each test (column "My expectation"). After running, write the values. A change in the wrong direction is a finding, even if it is small: report it with the values.

## 4. Test L: comparison with your own lab data (if you have Marshall lab data)

Purpose: the most important test. It tells how close the app is to real specimens.

What you need from the lab, per mix: gradation (all sieves, % passing), binder content, binder grade, aggregate density (or Gsb) and binder density, compaction temperature, blows per face, specimen mass and mould, and the **measured air voids of each specimen** (not only the mean), with Gmb and Gmm.

Procedure:
1. **First** write the lab data in §10.Lab, including every measured AVC. Do this before running the app and do not change it afterwards.
2. In the app: Reset to default → Compaction Marshall, mould **Standard Marshall Ø101,6 mm**, AVC mode **free AVC**, and your gradation (Import CSV/TXT or type it), binder content, grade, densities, temperature, blows.
3. Save the gradation with **Save curve** and note its name.
4. Run with seeds **2024, 11 and 101** (three virtual specimens, like three lab specimens). Each run takes 10–40 min.
5. Save each result with **Save result (.mdres.gz)** and name it `<testerID>_L<n>_<seed>.mdres.gz`.
6. Write the three AVC values. Do not change any calibration field to get closer to the lab.

Mixes with other binder grades or the gyratory compactor are welcome, but note that only Marshall with 60/70 is calibrated so far: those results tell us how far the uncalibrated cases are.

## 5. Test F: functions of the app (everyone, ~45 min)

Write OK or FAIL for each step in §10.F; for every FAIL fill a problem report (§6).

| ID | Steps | Expected |
|---|---|---|
| F1 | Open each example in "Examples" | it opens in < 2 min; the AVC shown is plausible for that mix (note it) |
| F2 | After a run: Save result → close the app → open it again → Open result… → choose the file | the form and the AVC/NA are exactly as before saving |
| F3 | Open result… with a file that is not a result (e.g. a .txt or a random .gz) | a clear message; the app keeps working |
| F4 | Export: Download STL (.zip), ASCII STL of aggregates and of voids | the files open in a 3D viewer (e.g. MeshLab, Windows 3D Viewer) |
| F5 | 3D view: rotate, zoom, horizontal and vertical cut, animation ▶ Play | works, no freeze |
| F6 | Start a run and press Cancel halfway; then start a new run | the new run completes normally |
| F7 | Wrong inputs: a curve that goes up then down; a top sieve below 100 %; the same sieve twice; decimals with comma and with point mixed; binder content 0 and 20 % | a clear message before the run, or a normal run; never an error, freeze or NaN |
| F8 | Switch PT ↔ EN on every screen and message you see | every text is translated (list the ones that are not) |
| F9 | Help, References, About | open and are readable |

## 6. When something goes wrong: problem report

1. **Do not close the app yet.** Take a screenshot of the whole window (with the message, if any).
2. Note: the test ID, the exact settings (or save the curve), the seed, what you expected, what happened, and the elapsed time.
3. If the run finished, **Save result** and keep the file.
4. **Repeat** the same run (Reset to default, same settings, same seed). Write how often it happened: e.g. "2 of 2" or "1 of 3".
5. Try to make the case **smaller**: does it still happen with the Quick test ([W], 1000 g)? With the default curve? With fewer changed fields? The smallest case that still fails is the most useful.
6. Fill one row in §10.Problems. Severity:
   - **Blocker**: the app crashes, freezes, or cannot be used.
   - **Wrong result**: the app says it finished, but a number is clearly wrong or goes the wrong way.
   - **Annoying**: works, but is confusing, slow or badly translated.
   - **Idea**: a suggestion.

Name screenshots and files with the problem number: `<testerID>_P<n>_...`.

## 7. Free testing (optional, 30 min per session)

Pick one goal and try for 30 minutes to make the app fail. Write the goal, what you tried and what happened in §10.Free. Suggested goals:

- extreme mixes: very open, very fine, SMA, porous asphalt, a single-size aggregate;
- extreme numbers: AVC 0,5 % or 25 %, binder 2 % or 10 %, temperature 100 or 200 °C;
- the largest specimen (Standard gyratory Ø150 mm: slow and not calibrated): time and memory, is the PC still usable;
- using the app the "wrong" way: clicking fast, changing fields during a run, opening two results in a row.

---

## 8. Sending the results

Send to Sergio: `TEST_PROTOCOL_<testerID>.md` with §10 filled in, all screenshots and `.mdres.gz` files named as above, and the saved curves of test L. If the files are large, use a shared folder.

## 9. How the results are used (for information)

- **R**: the values of all testers are compared digit by digit. Any difference is a defect of reproducibility.
- **S**: the spread over all testers' seeds gives the expected scatter of one virtual specimen, to compare with the scatter between real specimens.
- **D**: a direction is counted as wrong when, over the testers who ran it, the wrong direction appears more often than chance would explain (sign test).
- **L**: the mean of the three virtual specimens is compared with the mean of the lab specimens; over all mixes we report the bias and the typical error, separately for calibrated (Marshall 60/70) and uncalibrated cases. Lab data used to calibrate the app are not used to judge it.
- **Problems**: every report is repeated by Sergio on the reference machine before it is fixed; the fix is checked against the same case.

---

## 10. Results (fill in your copy)

Copy numbers exactly as the app shows them, with all decimals. Elapsed time in minutes.

### 10.Tester

| Field | Answer |
|---|---|
| Tester ID (from Sergio) | |
| Name | |
| Date of the round | |
| App zip file name (version) | |
| EXE or Python wheel | |
| Windows version | |
| CPU model · cores · RAM (GB) | |
| Language used (PT / EN) | |
| PC busy with other work? | |

### 10.Seeds

Tester T*k* uses seeds 1000·*k* + 1, + 2 and + 3 (e.g. T03: 3001, 3002, 3003).

### 10.R · same result on every PC

| Test | NA | AVC (%) | Elapsed | Reference NA (Sergio) | Reference AVC (Sergio) | Identical? |
|---|---|---|---|---|---|---|
| R1 | | | | | | |
| R1 again | | | | = R1 | = R1 | |
| R2 | | | | | | |
| R3 | | | | | | |

### 10.S · spread between seeds (settings as R1: [W], 1000 g)

| Seed | NA | AVC (%) | Elapsed |
|---|---|---|---|
| | | | |
| | | | |
| | | | |

### 10.D · direction (settings as R2: Marshall Standard, free AVC, seed 2024)

| Test | Level | My expectation (before running) | NA | AVC (%) | Elapsed |
|---|---|---|---|---|---|
| D1 binder (%) | 4,5 | AVC: | | | |
| | 5,5 | | | | |
| | 6,5 | | | | |
| D2 blows per face | 35 | AVC: | | | |
| | 50 | | | | |
| | 75 | | | | |
| D3 temperature (°C) | 130 | AVC: | | | |
| | 150 | | | | |
| | 170 | | | | |
| D4 curve (write names) | coarse: | NA: | | | |
| | default | | | | |
| | fine: | | | | |

### 10.Lab · own lab data (fill everything up to "Lab AVC" BEFORE running)

| Mix | Date entered | Saved curve name | Binder (%) | Grade | Agg. density | Binder density | Temp. (°C) | Blows | Mass (g) | Lab AVC per specimen (%) | Sim AVC seeds 2024 / 11 / 101 (%) | Elapsed per run | Source / remarks |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| *example* | *2026-11-10* | *AC11 lab A* | *5,2* | *50/70* | *2,70* | *1,03* | *145* | *50* | *1200* | *4,1 · 4,6 · 3,9* | *4,8 · 5,3 · 4,5* | *25* | *Gmb EN 12697-6 B* |
| | | | | | | | | | | | | | |

### 10.F · functions

| ID | OK / FAIL / not tested | Notes / values | Problem no. |
|---|---|---|---|
| F1 | | | |
| F2 | | | |
| F3 | | | |
| F4 | | | |
| F5 | | | |
| F6 | | | |
| F7 | | | |
| F8 | | | |
| F9 | | | |

### 10.Problems

| No. | Date | Test | Severity | Exact settings and seed | Expected | What happened | How often | Smallest failing case | Files |
|---|---|---|---|---|---|---|---|---|---|
| *ex.* | *2026-11-10* | *D1* | *Wrong result* | *R2, binder 6,5 %, seed 2024* | *AVC lower than at 5,5 %* | *5,91 % vs 5,40 %* | *2 of 2* | *same with seed 11* | *T03_P1_screen.png* |
| 1 | | | | | | | | | |

### 10.Free · free testing

| Session | Date | Goal | Minutes | What I tried | What happened | Problem nos. |
|---|---|---|---|---|---|---|
| 1 | | | | | | |
