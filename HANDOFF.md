# Developer Handoff — View Selection Experiment

_Last updated: 2026-07-18. Use this as the starting point for any new Claude Code conversation._

---

## 0. ⚠️ Plan documents — read this first

- **`EXP1_EXP2_IMPLEMENTATION_PLAN.md`** — the current authoritative plan, **and it is what actually runs today**. Exp1 (elongated bodies: capsule / barrel / spindle / ovoid-cylinder, symmetry entirely feature-carried, rotation-criterion trial flow, practice trial, rest/instruction pages, per-participant CSV files) is fully implemented and has been pilot-tested. Exp2 (non-elongated bodies, same 4 body types reparameterized to aspect ratio 1.1–1.3) stimuli are generated (32 `exp2_*.glb`) — but the plan's §8.2 pilot-calibration checklist (P1–P3) has not yet been confirmed specifically for Exp2's lower aspect ratio.

**Workflow rule (still in force): before any experiment adjustment, update `EXP1_EXP2_IMPLEMENTATION_PLAN.md` and get user confirmation before touching code.**

---

## 1. Project Overview

**What it is:** A Three.js psychophysics experiment where participants freely rotate novel 3D objects and confirm a preferred viewpoint under two different task instructions.

**Scientific goal:** Two separate between-subjects experiments sharing the same code/flow:
- **Exp1** — bodies are elongated (aspect ratio ~2.5:1). Manipulates **symmetry** (symmetric vs asymmetric attached features) within-subject.
- **Exp2** — bodies are non-elongated (aspect ratio 1.1–1.3:1). Same symmetry manipulation. Stimuli are built — pending a pilot walkthrough to confirm P1–P3 (plan §8.2) at this lower aspect ratio before real data collection.

Within each experiment, participants do both tasks on the **same 32-object set** (no Set A/B split):

| Task | Instruction | Objects |
|------|------------|-----------|
| T1 — Representation | Best photo for a selling website | All 32 (shared with T2) |
| T2 — Memory-oriented | Best view to help remember the object | All 32 (same objects, 2nd exposure) |

Task order is counterbalanced by participant-number parity (odd → T1 first, even → T2 first).

**User-facing flow:**
1. Welcome screen: participant types a **digits-only numeric code** next to a static `Exp1_`/`Exp2_` prefix (auto zero-padded to 3 digits, e.g. `Exp1_007`) → uniqueness checked against existing CSVs in that experiment's data directory.
2. **One-off practice trial** (plan §3.3b): a short intro screen explains the controls and the 40-step rotation requirement, then a practice round runs on a **code-generated gold ellipsoid** (not a GLB, not one of the 32 real stimuli) — same rotation/criterion/confirm interaction as a real trial, `#trial-counter` shows "Practice", **nothing is written to CSV**. Confirming jumps straight to the block 1 instruction page.
3. Each real trial: object loads at random 30°/330° oblique azimuth → free rotation (arrow keys); Enter unlocks only after **≥40 azimuth-only rotation steps** (200° cumulative, raw keypress count — see §5 for why this isn't deduplicated). **No time limit** — trial ends only when the participant confirms. The exploration prompt is a static (non-numeric) reminder, not a live counter.
4. Probe after every block's trial 6–8, then every 8–12 trials thereafter (confidence self-rating, 3 buttons) — independent counter per block.
5. Rest page between block 1 and 2 (**forced 30 s countdown** — Enter/Continue are disabled until it reaches zero) + instruction page before each block (including block 1).
6. **64 trials total** (32 per task), practice trial not counted.

---

## 2. File Structure

```
project root/
├── index.html                  OLD curiosity experiment — DO NOT TOUCH
├── main.js                     OLD experiment logic — DO NOT TOUCH
│
├── view-selection.html         Exp1/Exp2 experiment — UI, CSS, all static text
├── view-selection.js           Exp1/Exp2 experiment — all JS logic (Three.js + trial flow)
├── server.py                   Flask backend — /record_view, /probe_result, /sample_log, /block_event, /check_participant
├── vite.config.js              Vite config: port 5180, proxy /api → :5006
├── package.json / requirements.txt   npm / pip dependencies
│
├── blender_gen_objects.py      Blender script — generates the 32 exp1_*/exp2_* GLBs (EXPERIMENT switch, run inside Blender)
├── blender_preview.py          Blender script — imports GLBs for visual inspection
│
├── EXP1_EXP2_IMPLEMENTATION_PLAN.md AUTHORITATIVE plan — matches the live code (see §0)
├── HANDOFF.md                  This file
│
├── public/
│   ├── Objects/                ← 64 GLBs (exp{1|2}_{body_type}_{sym|asym}_{01-04}.glb) + objects_metadata.json — tracked in git, NOT gitignored
│   └── hdrs/                   HDR environment map(s) — gitignored, must be copied manually for lab deployment
│
└── data/
    ├── exp1/                   Per-participant output (git-ignored), 4 files per participant:
    └── exp2/                   Same layout, per-experiment directory:
          Exp{1|2}_NNN_view_record.csv     one row per trial (practice trial NOT included)
          Exp{1|2}_NNN_probe.csv           one row per probe
          Exp{1|2}_NNN_samples.csv         one row per 100 ms trajectory sample
          Exp{1|2}_NNN_block_events.csv    one row per block (rest/instruction timestamps)
```

Participant ID / filename prefix: the welcome screen shows a static `Exp1_`/`Exp2_` prefix (from `EXPERIMENT`) next to a digits-only input; the numeric code is zero-padded to 3 digits and concatenated to form `participant_id` (e.g. `Exp1_007`). Task-order parity (§1) is computed from the **unpadded numeric code's last digit**, not the full prefixed string. Older `P001`/`PP010`/`PEXP2_00`-style files in `data/` are pre-existing pilot artifacts from before this convention — harmless, not renamed, but not real data either.

### Files to ignore

All old experiment files (`index.html`, `main.js`, `app.js`, `cut_image.py`, `export_sessions.py`, `getModelList.py`, `main_for_ai.js`, etc.) belong to the original curiosity experiment. Leave them untouched.

`CURRENT_IMPLEMENTATION_PLAN.md` and `Experiment_Execution_Spec.md` (old 2×2 Set A/B design docs) have been **deleted** — don't look for them, don't recreate them; `EXP1_EXP2_IMPLEMENTATION_PLAN.md` is the sole plan document.

---

## 3. Running Locally

```powershell
# First time only
npm install
pip install -r requirements.txt

# Two terminals, keep both open
python server.py     # Terminal A — Flask backend, expect "Running on http://127.0.0.1:5006"
npm run dev           # Terminal B — Vite frontend, expect "Local: http://localhost:5180/"
```

Open `http://localhost:5180/view-selection.html?exp=1` (or `?exp=2` for Exp2 — stimuli are generated, but do a pilot walkthrough first per plan §8.2).

⚠️ **`server.py` has no auto-reload** (`app.run(port=5006)`, no `debug=True`). Any edit to `server.py` requires **manually killing and restarting** that terminal's process — Vite's frontend HMR does not help here, and a stale process will silently drop any new CSV fields not in its in-memory `VIEW_HEADERS`/etc. lists (bit us this exact way on 2026-07-15, see §8).

No project `run` skill exists yet. To verify UI/interaction changes without a human: Playwright is a devDependency (`node_modules/playwright`), `chromium-cli` is not installed. Drive it with a Node script, setting `NODE_PATH="$(pwd)/node_modules"` so `require('playwright')` resolves even from a script outside the project directory. See §9 for the interaction flow to script.

| Component | Port | Where configured |
|-----------|------|-----------------|
| Flask backend | **5006** | `server.py` → `app.run(port=5006)` |
| Vite dev server | **5180** | `vite.config.js` → `server.port` |
| Vite proxy target | **5006** | `vite.config.js` → `proxy['/api'].target` |
| CORS allow-list | `http://localhost:5180` exactly | `server.py` — must match this exact origin, not `127.0.0.1:5180` |

---

## 4. Generating Stimuli (Blender)

✅ **All 64 GLBs (32 Exp1 + 32 Exp2) are already generated, present in `public/Objects/`, and committed to git** (this directory is NOT gitignored — only `public/hdrs/` needs manual copying for a lab-machine deployment, see plan §0). Re-run Blender only if you edit `blender_gen_objects.py`.

```
Blender → Scripting workspace → Open blender_gen_objects.py → Run Script (Alt+P)
```

### Object naming / allocation

```
exp{1|2}_{body_type}_{sym|asym}_{01-04}.glb
body_type ∈ {capsule, barrel, spindle, ovoid_cylinder}   — 4 exemplars each, (4,4,4,4)
= 32 objects per experiment = 16 yoked sym/asym pairs
```

Bodies are all **surfaces of revolution** (rotationally symmetric about the long axis, front/back mirror-symmetric) so the body itself carries no azimuth or polarity information — symmetry is carried entirely by attached features placed in cylindrical coordinates (u, θ), mirrored at (u, ±θ) for symmetric objects. Exp2 reuses the exact same profile functions/params as Exp1; the only difference is the `aspect_ratio` target range (2.5–2.8 vs 1.1–1.3).

**Not from Blender**: the practice-trial stimulus (§1, §5) is a plain ellipsoid built procedurally in `view-selection.js` via `THREE.SphereGeometry`, scaled non-uniformly. It is not a GLB, not in `public/Objects/`, not in `objects_metadata.json` — deliberately independent of both experiments' stimulus-generation pipeline.

### `objects_metadata.json` schema

```json
{
  "exp1_capsule_sym_01": {
    "body_type": "capsule",
    "aspect_ratio": 2.6,
    "major_axis_vector": [1, 0, 0],
    "mirror_plane_normal": [0, 1, 0],
    "symmetry": "symmetric",
    "yoked_pair_id": 1,
    "feature_positions": [{ "u": ..., "theta_deg": ... }, ...]
  }
}
```

---

## 5. Experiment Logic (`view-selection.js`)

### Config block (top of file)

```js
let EXPERIMENT           = 'exp1';        // 'exp1' | 'exp2' — or override with ?exp=1 / ?exp=2 in the URL
const EXEMPLAR_ALLOC      = { capsule: 4, barrel: 4, spindle: 4, ovoid_cylinder: 4 };
const PROBE_MIN_GAP       = 8;
const PROBE_MAX_GAP       = 12;
const PROBE_FIRST         = 6;            // first probe lands at trial 6-8
const MIN_ROTATION_STEPS  = 40;           // azimuth-only RAW keypress count to unlock Enter (200° cumulative)
const REST_COUNTDOWN_SEC  = 30;           // forced rest between block 1 and 2; Enter/Continue disabled until it hits 0
const KEY_REPEAT          = false;        // each physical keypress = one 5° step
const TEST_MODE           = false;        // MUST be false for real data collection
const STEP_DEG            = 5;
const ELEV_MAX            = 30;
const INITIAL_Y           = -Math.PI / 2; // azimuth 0° = end-on view
```

`TEST_MODE = true` shrinks the rotation criterion for fast dev smoke-testing (`EFFECTIVE_MIN_ROTATION_STEPS = 3`) — never leave it on for real sessions. Note: there is no longer any per-trial time cap constant (`MAX_TRIAL_SEC`/`TIMER_WARNING_SEC` were removed 2026-07-16, see §8) — trials are untimed by design.

### Trial flow

```
btn-start → showModule('practice-intro') → startPracticeTrial() (gold ellipsoid, "Practice" counter,
    same rotation/criterion/Enter interaction, no CSV writes) → confirmTrial() detects
    isPracticeTrial and jumps straight to showInstructionPage(1)
  → startTrialAtLocal(1) … (32 real trials per block, each: oblique start azimuth 30°/330°,
     Enter locked until ≥40 azimuth keypresses, NO time limit)
  → probe fires at block-local trial 6-8, then every 8-12 trials (independent per block)
finishBlock() → block 1: rest page (forced 30s countdown, then Enter/Continue unlock) → instruction page for block 2
             → block 2: showModule('end')
```

Rotation controls: ← → azimuth ±5° (wraps 0–360°), ↑ ↓ elevation ±5° (clamped ±30°), Enter to confirm (locked until criterion met). Key repeat is suppressed — each physical keypress is exactly one step. `beforeunload` is intercepted to warn against accidental navigation mid-session.

**Rotation criterion — raw keypress count, deliberately NOT deduplicated**: `MIN_ROTATION_STEPS = 40` counts every azimuth (←/→) keypress, including revisits/oscillation over the same range. A "distinct 5°-bins visited" (coverage-based, dedup'd) criterion was considered and rejected — see plan §3.3's 2026-07-16 decision record: the study's `dwell_ratio_*` fields exist specifically to measure time spent revisiting/lingering at various viewing angles, so a criterion that gives zero credit for revisits would perversely incentivize participants to sweep monotonically and avoid the exact lingering behavior the dwell ratios are meant to capture. A separate **diagnostic-only** field, `azimuth_coverage_deg` (distinct-bins × 5°), is still logged — it doesn't gate Enter, it's for post-hoc flagging of degenerate low-coverage trials.

**Exploration prompt text** (`updateConfirmPrompt()`) is static, not a live-updating counter: `"Explore the object mainly by left/right rotation before you can confirm your view."` before criterion met, `"Press Enter to confirm your chosen view."` after. A numeric live counter (`{n}/40`) was tried and reverted (plan §3.3, 2026-07-17 decision record) — same rationale as hiding the old time countdown: a ticking number risks making participants watch the digit instead of the object. The practice trial (below) now carries the burden of explaining the mechanic instead.

**Practice trial** (`startPracticeTrial()` / `loadPracticeModel()`, plan §3.3b): one-off, before block 1 only. Loads a procedurally-generated gold ellipsoid (`THREE.SphereGeometry` scaled `(1, 0.65, 1.3)`, color `0xc9a227` — matches the real stimuli's color so it reads clearly against the HDR sky, doesn't blend in). Same criterion/Enter logic as a real trial via the shared `confirmTrial()` path, which special-cases `isPracticeTrial` to skip all `/api/record_view` and `/api/sample_log` POSTs and route straight to `showInstructionPage(1)` instead of normal block/probe bookkeeping. The practice-intro screen (`#module-practice-intro`) states the controls and explicitly names the 40-step left/right requirement and its rationale (seeing the object's full structure before choosing) — this is the one place in the UI that spells out the mechanic; neither the live trial prompt nor the T1/T2 task instructions do (see plan §3.3's decision records on why not).

### Viewpoint classification (plan §4.2)

```js
// axis_category — all Exp1 AND Exp2 objects:
//   end_on   — azimuth within ±22.5° of 0°/180°
//   side_on  — azimuth within ±22.5° of 90°/270°
//   oblique  — everything else

// feature_category — ASYMMETRIC objects only (symmetric = N/A, 2026-07-15 fix, see §8):
//   feature_revealing / feature_concealed / ambiguous, based on per-feature
//   normal-to-camera angle (<60° = visible), majority vote across features

// symmetry_readable — SYMMETRIC objects only (asymmetric = N/A):
//   true if azimuth within ±10° of 0°/180° (a strict subset of end_on's ±22.5°),
//   any elevation — fixed-window operationalization chosen for methods-section
//   clarity over a per-feature occlusion model (see plan §4.2 for the derivation)
```

---

## 6. Data Logging

### `data/{exp1|exp2}/Exp{1|2}_NNN_view_record.csv` — one row per REAL trial (practice trial excluded)

Current `VIEW_HEADERS` (`server.py`), in order:

```
participant_id, experiment, task, object_id, body_type, symmetry,
exposure_index, trial_index, task_order,
start_azimuth, final_azimuth, final_elevation,
axis_category, feature_category, symmetry_readable,
confirmation_latency,
cumulative_rotation_steps, azimuth_coverage_deg,
up_down_count, left_right_count,
dwell_ratio_end_on, dwell_ratio_side_on, dwell_ratio_oblique,
dwell_ratio_symmetry_readable,
timestamp
```

- `cumulative_rotation_steps`: raw azimuth keypress count (the actual gating criterion, ≥40 to unlock Enter).
- `azimuth_coverage_deg`: distinct 5°-bins visited × 5 (0–360). **Diagnostic only** — does not gate Enter (see §5). Will generally be ≤ `cumulative_rotation_steps` since revisits don't add new bins.
- `dwell_ratio_end_on` / `_side_on` / `_oblique` (sum to 1): proportion of the trial's 100 ms trajectory samples in each `axis_category` bucket, from trial start to confirm — computed client-side from `trajectorySamples`, no separate file needed.
- `dwell_ratio_symmetry_readable`: same idea, restricted to the `symmetry_readable` window; `N/A` for asymmetric objects.
- **No `timeout` / `enter_pressed` / `criterion_met` fields** — these existed when trials had a time cap and could end without an explicit Enter press; the 50 s cap was removed 2026-07-16 (see §8), so every recorded trial is now, by construction, an active Enter confirmation after the criterion was met. Keeping those fields would have meant three columns that are always the same constant value — removed rather than left as dead weight.
- ⚠️ Any new field added to the JS `record` object in `confirmTrial()` **must also be added to `VIEW_HEADERS` in `server.py`**, or it is silently dropped (`DictWriter(..., extrasaction='ignore')`) — see §8.

### `data/{exp}/Exp{1|2}_NNN_probe.csv`

`participant_id, task, block_index, block_probe_index, after_trial_index, answer, timestamp` — `answer` ∈ `Not confident` / `Somewhat confident` / `Confident`.

### `data/{exp}/Exp{1|2}_NNN_samples.csv` — one row per 100 ms sample

`participant_id, task, object_id, trial_index, timestamp_ms, azimuth, elevation` — sampled for the full trial duration, sent as one batch POST to `/api/sample_log` at trial end.

### `data/{exp}/Exp{1|2}_NNN_block_events.csv` — one row per block

`participant_id, block_index, task, task_order, rest_start_ms, rest_end_ms, instruction_confirm_ms, block_start_ms, block_end_ms` — block 1 has no `rest_start_ms`/`rest_end_ms` (no rest before the first block).

### Storage

Per-participant files under `data/{experiment}/`, git-ignored. Back up the whole `data/` directory after each session (see plan §0 for lab-deployment backup checklist).

---

## 7. Current Implementation Status (as of 2026-07-18)

### What is live and working

- All of `EXP1_EXP2_IMPLEMENTATION_PLAN.md` §2–§7 for **Exp1** is implemented and pilot-tested: revolution-body Blender generation (32 GLBs), rotation-criterion trial flow (untimed), practice trial, rest/instruction pages, jittered probes, per-participant 4-file CSV layout, digits-only participant-number entry, `TEST_MODE`/`beforeunload` anti-interruption guards, `EXPERIMENT`/`?exp=` config switch.
- **Exp2 stimuli are generated**: `blender_gen_objects.py`'s `EXPERIMENT` switch changes only the `aspect_ratio` target (2.5–2.8 → 1.1–1.3) and output prefix; all 4 body profiles/feature params are shared with Exp1. 32 `exp2_*.glb` + merged metadata are in `public/Objects/` (64 objects total).
- **This session's changes (2026-07-16 to 2026-07-18)** — see plan doc for full reasoning on each:
  - Removed the 50 s per-trial time cap entirely (trials are now untimed; `timeout`/`enter_pressed`/`criterion_met` CSV fields removed as a result, since they'd be constant).
  - Added `azimuth_coverage_deg`, a diagnostic-only field (does not gate Enter — the criterion stayed raw-count on purpose, see §5).
  - Iterated the exploration-prompt copy twice (numeric live counter → tried and reverted to a static non-numeric line) — final state: static text, no exposed threshold number.
  - Added a one-off practice trial before block 1 (gold procedural ellipsoid, unrecorded) that now carries the job of explaining the rotation-lock mechanic, replacing an earlier attempt to explain it via the T1/T2 instruction pages (rejected as clutter) or a live counter (rejected as gamification risk).
  - Retuned the on-screen layout: bottom exploration prompt and top task-reminder banner repositioned/resized to frame the object without overlapping it at any elevation, verified via Playwright screenshots across multiple object exemplars.
  - (Made in parallel, not by this thread of work, but now part of the live app: participant ID entry changed to digits-only + auto `Exp1_`/`Exp2_` prefix; rest-page forced 30 s countdown reinstated after a brief period without one.)
- Verified end-to-end via Playwright-driven test sessions this session (script pattern in §9); test participant CSVs were deleted after each check.

### What is NOT done

- **Pilot calibration items P1–P3** (plan §8.2 — P4 was retired along with the time cap) — end-on symmetry legibility, rotation key-repeat ergonomics, profile faceting coarseness — have not been formally confirmed as done in the plan checklist, especially **P1 for Exp2** specifically (its stimuli have a much lower aspect ratio than Exp1's).
- **Test/pilot data cleanup**: `data/exp1/` and `data/exp2/` currently hold a mix of old-style (`P002`, `PEXP2_00`, `PEXP2_01`, ...) and new-style (`Exp1_001`, `Exp1_002`, `Exp2_001`, `Exp2_002`) dev-session files — none of which are real participant data. These must be moved out or backed up separately before real collection starts (the backend's duplicate-ID check is an exact string match and won't distinguish test IDs from real ones).
- **Lab deployment checklist** (plan §0, items 4–5) — several pre-departure checks (confirming `TEST_MODE=false` post-copy, port/firewall check on the lab machine, architecture check for `node_modules/`) are still open and can only be confirmed on-site.

---

## 8. Session Notes

### 2026-07-15 — `feature_category` miscalibration for symmetric objects

The per-feature visibility formula reduces to `dot = cos(theta - elevation) × sin(azimuth)`, which is exactly 0 for every feature at azimuth = 0°/180° (end-on) — the view where symmetry should be *most* legible. Pilot data confirmed this: every symmetric-object trial showed `feature_concealed`, including all `end_on` trials. Root cause: the formula measures "is this feature's surface facing the camera" (right construct for judging a single asymmetric feature's visibility), not "are both members of a mirror pair visible." Fix: `feature_category` is now asymmetric-only (`N/A` for symmetric); symmetry legibility is a separate field, `symmetry_readable`, using a fixed ±10°-of-end-on azimuth window — see `EXP1_EXP2_IMPLEMENTATION_PLAN.md` §4.2.

**Gotcha: `server.py` doesn't hot-reload.** After adding new CSV fields, a stale `python server.py` process kept silently dropping them — no header, no error, just missing columns — because `_append_row()`'s `DictWriter` uses `extrasaction='ignore'` against the in-memory `VIEW_HEADERS` list. **Any `server.py` edit needs a manual restart of that terminal to take effect.** This bit us again this session (2026-07-16) when `azimuth_coverage_deg` was added — same fix (kill + restart), same lesson.

### 2026-07-16 to 2026-07-18 — trial-timing and rotation-criterion redesign

Removing the 50 s time cap (plan §3.2) surfaced a real UX gap: a participant who settled on their preferred view before the 40-step criterion was met had no time-based rescue if confused, and pressing Enter early was completely silent (no feedback at all). Explored and rejected several fixes before landing on the current design — full reasoning is in the plan doc (§3.3, §3.3b decision records), condensed version:

1. **"Mark now, confirm later" two-phase Enter** — rejected. Its premise (an early-formed preference is the "true" answer and later forced exploration is contamination) conflicts with why the criterion exists: the `dwell_ratio_*` fields are supposed to capture exploration/reconsideration behavior across the whole trial, not just up to the first tentative pick.
2. **Coverage-based (deduplicated) rotation criterion** — considered, then reversed for the same reason: it would reward monotonic sweeping and penalize revisiting an angle, i.e. penalize exactly the dwelling behavior the study wants to measure. Kept as a non-gating diagnostic field instead (`azimuth_coverage_deg`).
3. **Live numeric progress counter (`{n}/40`)** — implemented, then reverted to a static non-numeric prompt line, on the theory that a ticking number risks the same "watching the digit instead of the object" problem that motivated hiding the old time countdown.
4. **Explaining the lock in the T1/T2 instruction pages** — tried, then reverted (too verbose, distracts from the actual task instructions participants need to read).
5. **Landed on**: a one-off practice trial before block 1 (§1, §5, §7) that teaches the mechanic experientially, on a stimulus (procedural gold ellipsoid) with zero relationship to either experiment's real objects. This let the live trial prompt go back to being simple/non-numeric without reintroducing the "silent, no feedback" confusion, since by the time a participant hits a real locked Enter, they've already done it once in practice.

If you're asked to touch the rotation criterion or exploration-prompt copy again, read plan §3.3/§3.3b's decision records first — several plausible-looking "improvements" here were already tried and specifically rejected for reasons that aren't obvious without that history.

---

## 9. Verification Checklist

### GLB files present

```powershell
(Get-ChildItem "public\Objects\*.glb" | Measure-Object).Count   # → 64 (32 exp1 + 32 exp2)
Test-Path "public\Objects\objects_metadata.json"                 # → True
```

### Scripted end-to-end check (no human required)

No project `run` skill exists yet (see §3). Pattern used throughout this session — Node + Playwright, `NODE_PATH` set to the project's `node_modules`:

```bash
cd "c:/Users/lenovo/Documents/GitHub/visual-elongated-object-exploration"
(python server.py > /tmp/server.log 2>&1 &)
(npm run dev > /tmp/vite.log 2>&1 &)
timeout 20 bash -c 'until curl -sf http://localhost:5180 >/dev/null 2>&1; do sleep 1; done'

NODE_PATH="$(pwd)/node_modules" node -e "
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const pid = String(Math.floor(Math.random() * 900) + 100); // digits only
  await page.goto('http://localhost:5180/view-selection.html?exp=1');
  await page.fill('#participant-id', pid);
  await page.click('#btn-start');
  await page.waitForSelector('#module-practice-intro', { state: 'visible' });
  await page.click('#btn-begin-practice');
  await page.waitForSelector('#confirm-prompt', { state: 'visible' });
  for (let i = 0; i < 40; i++) { await page.keyboard.press('ArrowRight'); }
  await page.keyboard.press('Enter'); // practice confirm -> block 1 instruction page
  await page.waitForSelector('#module-instruction', { state: 'visible' });
  await page.click('#btn-begin-block');
  // ... continue driving real trials the same way (40x ArrowRight, Enter) ...
  await browser.close();
})();"
```

**Cleanup after every verification run — do not skip:** delete the `data/{exp}/Exp{1|2}_<pid>_*.csv` files your test run created, and stop both dev processes (`Get-NetTCPConnection -LocalPort 5180,5006 -State Listen` → `Stop-Process`). Test data left lying around gets mistaken for real pilot data.

### Manual walkthrough

1. Open `http://localhost:5180/view-selection.html?exp=1`
2. Enter a numeric ID → practice-intro page → Begin Practice → gold ellipsoid, "Practice" badge, Enter has no effect until ~40 azimuth steps → confirm → block 1 instruction page (no data written for the practice round)
3. Click Begin Block → an `exp1_*` object loads at azimuth 30° or 330°
4. Rotate with arrow keys — Enter has no effect until ~40 azimuth steps done; prompt reads "Explore the object mainly by left/right rotation before you can confirm your view." until then, then switches
5. After criterion met, press Enter → trial ends immediately (no time limit ever forces this), next trial begins (or probe, if scheduled)
6. After 32 trials → rest page (30 s forced countdown, Enter/Continue disabled until it hits 0) → instruction page for block 2 → 32 more trials → end screen
7. `data/exp1/Exp1_NNN_view_record.csv` → 64 rows + header (practice trial not included); `_probe.csv`, `_samples.csv`, `_block_events.csv` (2 rows) also present

### Field sanity checks

- Symmetric object, `final_azimuth` near 0°/180° → `feature_category = N/A`, `symmetry_readable = True`
- Symmetric object, `final_azimuth` far from 0°/180° → `symmetry_readable = False`
- Asymmetric object → `symmetry_readable = N/A`, `dwell_ratio_symmetry_readable = N/A`, `feature_category` populated normally
- `dwell_ratio_end_on + dwell_ratio_side_on + dwell_ratio_oblique ≈ 1` for every row
- `azimuth_coverage_deg ≤ cumulative_rotation_steps × 5` always (coverage counts unique bins, the other counts every keypress)
- No `timeout`, `enter_pressed`, or `criterion_met` columns in the CSV at all

---

## 10. Design Decisions — Do Not Change Without Review

| Decision | Rationale |
|----------|-----------|
| `INITIAL_Y = -π/2` | Azimuth 0° = end-on view; changing invalidates data labels |
| `KEY_REPEAT = false` | Each physical press = one step; prevents inflated rotation-criterion counts |
| `MIN_ROTATION_STEPS = 40`, azimuth-only, **raw keypress count (not deduplicated)** | Elevation excluded so up/down oscillation can't satisfy it without orbiting; raw (not coverage-based) so revisiting/dwelling on an angle isn't penalized — the `dwell_ratio_*` fields depend on that behavior being unconstrained (plan §3.3, 2026-07-16 decision record) |
| **No per-trial time limit** | Removed 2026-07-16; pilot data showed the old 50 s cap wasn't needed and risked cutting off participants mid-decision. Do not reintroduce without updating the CSV schema back (timeout/enter_pressed/criterion_met would need to come back too) |
| Exploration prompt is static text, not a live `{n}/40` counter | Tried the live counter, reverted — same "don't make them watch a number" logic as the (now-removed) hidden time countdown. See plan §3.3 |
| One practice trial before block 1, on a procedural (non-GLB) ellipsoid | Exists specifically so the live trial prompt can stay simple/non-numeric without reintroducing "silent locked Enter" confusion on trial 1, which is real data with no do-over. Don't reuse a real stimulus or another experiment's object for this — novelty for the 32 real objects must stay intact |
| `azimuth_coverage_deg` does not gate Enter | It's a diagnostic-only field; making it gating was tried and rejected (rewards monotonic sweeping, penalizes the dwelling behavior `dwell_ratio_*` is meant to capture) |
| `REST_COUNTDOWN_SEC = 30`, forced | Enter/Continue disabled until it reaches 0 on the block 1→2 rest page. This was removed 2026-07-15 then reinstated 2026-07-17 — if asked to change it again, confirm which direction is actually wanted |
| GLB URL = `/Objects/...` | Vite serves `public/` at root, not `/public/` |
| Flask port 5006, CORS origin exactly `http://localhost:5180` | Must match `server.py` and `vite.config.js`; wrong origin (e.g. `127.0.0.1`) silently blocks POSTs |
| `feature_category` = asymmetric-only, `N/A` for symmetric | Normal-facing threshold measures per-feature detail visibility, not mirror-pair legibility (2026-07-15 fix, see §8) |
| `symmetry_readable` = azimuth ±10° of end-on, any elevation | Fixed window nested inside `end_on` (±22.5°); chosen over per-feature occlusion modeling for methods-section reproducibility (plan §4.2) |
| `dwell_ratio_*` fields computed client-side from `trajectorySamples` | Reuses the existing 100ms sampling buffer; no new sampling infrastructure |
| `server.py` has no auto-reload | Any server.py edit requires manually restarting that terminal (§8) |
| Per-participant CSV files (`data/{exp}/Exp{1|2}_NNN_*.csv`) | Natural per-participant backup granularity; no shared-file race conditions across sessions |
| Participant ID = digits-only input + auto `Exp1_`/`Exp2_` prefix | Prevents inconsistent manual prefixes (old pilot data has both `P002` and `PP010`-style IDs); zero-padded to 3 digits so filename sort order matches numeric order |

---

## Prompt for next Claude Code conversation

```
I am continuing a Three.js psychophysics experiment called "View Selection Experiment" in:
C:\Users\lenovo\Documents\GitHub\visual-elongated-object-exploration

Please read HANDOFF.md first — it has the full project state, file map, and next steps.
Then read EXP1_EXP2_IMPLEMENTATION_PLAN.md — this is the AUTHORITATIVE plan AND matches
what's actually running. Workflow rule: any experiment adjustment must update this plan
file and get user confirmation before touching code.

Key files:
- view-selection.js      LIVE experiment logic — Exp1 + Exp2 both implemented
- view-selection.html    UI structure
- server.py              Flask backend (port 5006); NO auto-reload — restart manually after edits
- blender_gen_objects.py stimulus generation — run inside Blender, not from terminal;
                         EXPERIMENT switch generates the 32 exp1_* or 32 exp2_*
                         surfaces-of-revolution GLBs (same profiles, different aspect ratio)
- vite.config.js         proxy config (port 5180 → 5006)

Current situation (as of 2026-07-18):
- Exp1 is fully implemented and pilot-verified end-to-end, including a one-off practice
  trial before block 1 (procedural ellipsoid, unrecorded) and a fully untimed trial flow
  (the old 50 s cap was removed).
- Exp2 stimuli are generated (32 exp2_*.glb) — pass ?exp=2 to run it. Not yet pilot-walked
  through specifically at this lower aspect ratio (plan §8.2 P1-P3), so don't treat it as
  ready for real data collection until that's done.
- This session (2026-07-16 to 2026-07-18) did a significant redesign of the rotation-
  criterion / Enter-unlock UX after removing the time cap exposed a "locked Enter, zero
  feedback" confusion problem. Several plausible fixes were tried and specifically
  rejected — READ HANDOFF.md §8 and plan §3.3/§3.3b's decision records before touching
  this area again, so you don't re-propose something already ruled out (e.g. a coverage-
  based rotation criterion, a two-phase "mark then confirm" Enter, or a live numeric
  progress counter — all tried, all reverted, reasons documented).
- Pilot calibration items P1-P3 (plan §8.2) and the lab-deployment checklist (plan §0)
  are still open before this is ready for real data collection. data/exp1/ and data/exp2/
  currently hold a mix of old- and new-style dev-session files that need clearing out
  before real participants run.

IMPORTANT constraints on the LIVE code (do NOT change without reason):
- INITIAL_Y = -π/2, ELEV_MAX = 30, MIN_ROTATION_STEPS = 40 (azimuth-only, raw count)
- No time limit on trials — do not reintroduce one without updating the CSV schema
- REST_COUNTDOWN_SEC = 30 (forced, block 1→2 rest page only)
- GLB URL prefix: /Objects/ (NOT /public/Objects/)
- Flask port 5006, CORS origin exactly http://localhost:5180
- TEST_MODE must be false for real data collection
- Any new view_record field added in view-selection.js's confirmTrial() must also be added
  to VIEW_HEADERS in server.py, and server.py must be manually restarted to pick it up
- No project `run` skill exists — use the Playwright + NODE_PATH pattern in HANDOFF.md §9
  to verify UI changes, and always clean up test data + stop dev servers afterward

After reading HANDOFF.md, confirm what you understand the current state to be, then
[describe your specific task here].
```
