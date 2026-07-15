# Developer Handoff — View Selection Experiment

_Last updated: 2026-07-15. Use this as the starting point for any new Claude Code conversation._

---

## 0. ⚠️ Plan documents — read this first

- **`EXP1_EXP2_IMPLEMENTATION_PLAN.md`** — the current authoritative plan, **and it is what actually runs today**. Exp1 (elongated bodies: capsule / barrel / spindle / ovoid-cylinder, symmetry entirely feature-carried, rotation-criterion trial flow, rest/instruction pages, per-participant CSV files) is fully implemented and has been pilot-tested. Exp2 (non-elongated bodies, same 4 body types reparameterized to aspect ratio 1.1–1.3) stimuli are **now generated** (32 `exp2_*.glb`, commit `15b1998`) — but the plan's §8.2 pilot-calibration checklist (P1–P4) has not yet been confirmed specifically for Exp2's lower aspect ratio (see §7).
- **`CURRENT_IMPLEMENTATION_PLAN.md`** — **ARCHIVED**, superseded by the file above (its own header says so). Describes the old 2×2 Set A/B box-body design that no longer runs. Kept only for historical reference to that design's decisions.
- **`Experiment_Execution_Spec.md`** — spec for the old 2×2 design; also superseded, same caveat as above.

**Workflow rule (still in force): before any experiment adjustment, update `EXP1_EXP2_IMPLEMENTATION_PLAN.md` and get user confirmation before touching code.**

---

## 1. Project Overview

**What it is:** A Three.js psychophysics experiment where participants freely rotate novel 3D objects and confirm a preferred viewpoint under two different task instructions.

**Scientific goal:** Two separate between-subjects experiments sharing the same code/flow:
- **Exp1** — bodies are elongated (aspect ratio ~2.5:1). Manipulates **symmetry** (symmetric vs asymmetric attached features) within-subject.
- **Exp2** — bodies are non-elongated (aspect ratio 1.1–1.3:1). Same symmetry manipulation. Stimuli are **built** (32 `exp2_*.glb`, generated 2026-07-15) — pending a pilot walkthrough to confirm P1–P4 (plan §8.2) at this lower aspect ratio before real data collection.

Within each experiment, participants do both tasks on the **same 32-object set** (no Set A/B split like the old design):

| Task | Instruction | Objects |
|------|------------|-----------|
| T1 — Representation | Best photo for a selling website | All 32 (shared with T2) |
| T2 — Memory-oriented | Best view to help remember the object | All 32 (same objects, 2nd exposure) |

Task order is counterbalanced by participant ID parity (odd → T1 first, even → T2 first).

**User-facing flow:**
1. Participant enters an ID → ID uniqueness checked against existing CSVs → instruction page for block 1
2. Each trial: object loads at random 30°/330° oblique azimuth → free rotation (arrow keys); Enter unlocks only after **≥40 azimuth-only rotation steps** (200° cumulative); 50 s hard cap with countdown hidden until the last 8 s ("Please choose your view soon.")
3. Probe after every block's trial 6–8, then every 8–12 trials thereafter (confidence self-rating, 3 buttons) — independent counter per block
4. Rest page (no forced wait — press Enter or click Continue whenever ready) + new instruction page between block 1 and block 2 (both blocks get an instruction page, including block 1)
5. **64 trials total** (32 per task)

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
├── CURRENT_IMPLEMENTATION_PLAN.md   ARCHIVED — old 2×2 design, historical reference only
├── Experiment_Execution_Spec.md     ARCHIVED — spec for the old 2×2 design
├── HANDOFF.md                  This file
│
├── public/
│   ├── Objects/                ← 64 GLBs (exp{1|2}_{body_type}_{sym|asym}_{01-04}.glb) + objects_metadata.json
│   └── hdrs/                   HDR environment map(s)
│
└── data/
    ├── exp1/                   Per-participant output (git-ignored), 4 files per participant:
    └── exp2/                   Same layout, per-experiment directory:
          P{ID}_view_record.csv     one row per trial
          P{ID}_probe.csv           one row per probe
          P{ID}_samples.csv         one row per 100 ms trajectory sample
          P{ID}_block_events.csv    one row per block (rest/instruction timestamps)
```

The old root-level `view_record.csv` / `view_probe.csv` / `view_trajectory.csv` files described in earlier handoffs are **no longer used** — replaced by the per-participant `data/{experiment}/P{ID}_*.csv` layout.

### Files to ignore

All old experiment files (`index.html`, `main.js`, `app.js`, `cut_image.py`, `export_sessions.py`, `getModelList.py`, `main_for_ai.js`, etc.) belong to the original curiosity experiment. Leave them untouched.

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

Open `http://localhost:5180/view-selection.html?exp=1` (or `?exp=2` for Exp2 — stimuli are generated, but do a pilot walkthrough first per §7).

⚠️ **`server.py` has no auto-reload** (`app.run(port=5006)`, no `debug=True`). Any edit to `server.py` requires **manually killing and restarting** that terminal's process — Vite's frontend HMR does not help here, and a stale process will silently drop any new CSV fields not in its in-memory `VIEW_HEADERS`/etc. lists (bit us in this exact way on 2026-07-15, see §8).

| Component | Port | Where configured |
|-----------|------|-----------------|
| Flask backend | **5006** | `server.py` → `app.run(port=5006)` |
| Vite dev server | **5180** | `vite.config.js` → `server.port` |
| Vite proxy target | **5006** | `vite.config.js` → `proxy['/api'].target` |
| CORS allow-list | `http://localhost:5180` exactly | `server.py` — must match this exact origin, not `127.0.0.1:5180` |

---

## 4. Generating Stimuli (Blender)

✅ **The 32 Exp1 GLBs are already generated and present in `public/Objects/`**, along with `objects_metadata.json`. Re-run only if you edit `blender_gen_objects.py`.

```
Blender → Scripting workspace → Open blender_gen_objects.py → Run Script (Alt+P)
```

### Object naming / allocation

```
exp1_{body_type}_{sym|asym}_{01-04}.glb
body_type ∈ {capsule, barrel, spindle, ovoid_cylinder}   — 4 exemplars each, (4,4,4,4)
= 32 objects = 16 yoked sym/asym pairs
```

Bodies are all **surfaces of revolution** (rotationally symmetric about the long axis, front/back mirror-symmetric) so the body itself carries no azimuth or polarity information — symmetry is carried entirely by attached features placed in cylindrical coordinates (u, θ), mirrored at (u, ±θ) for symmetric objects.

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
let EXPERIMENT          = 'exp1';        // 'exp1' | 'exp2' — or override with ?exp=1 / ?exp=2 in the URL
const EXEMPLAR_ALLOC     = { capsule: 4, barrel: 4, spindle: 4, ovoid_cylinder: 4 };
const PROBE_MIN_GAP      = 8;
const PROBE_MAX_GAP      = 12;
const PROBE_FIRST        = 6;            // first probe lands at trial 6-8
const MIN_ROTATION_STEPS = 40;           // azimuth-only steps to unlock Enter (200° cumulative)
const MAX_TRIAL_SEC      = 50;
const TIMER_WARNING_SEC  = 8;            // countdown hidden until this many seconds remain
const KEY_REPEAT         = false;        // each physical keypress = one 5° step
const TEST_MODE          = false;        // MUST be false for real data collection
const STEP_DEG           = 5;
const ELEV_MAX           = 30;
const INITIAL_Y          = -Math.PI / 2; // azimuth 0° = end-on view
```

`TEST_MODE = true` shrinks the rotation criterion / rest timer / trial cap for fast dev smoke-testing — never leave it on for real sessions.

### Trial flow

```
startInstructionPage(1) → participant reads T1 or T2 instructions (odd ID → T1 first)
  → startTrialAtLocal(1) … (32 trials, each: oblique start azimuth 30°/330°,
     Enter locked until ≥40 azimuth steps, 50s cap, countdown hidden till ≤8s left)
  → probe fires at block-local trial 6-8, then every 8-12 trials (independent per block)
finishBlock() → block 1: rest page (press Enter to continue, no forced wait) → instruction page for block 2
             → block 2: showModule('end')
```

Rotation controls: ← → azimuth ±5° (wraps 0–360°), ↑ ↓ elevation ±5° (clamped ±30°), Enter to confirm. Key repeat is suppressed — each physical keypress is exactly one step. `beforeunload` is intercepted to warn against accidental navigation mid-session (anti-interruption measure, see plan §7).

### Viewpoint classification (plan §4.2)

```js
// axis_category — all Exp1 AND Exp2 objects (2026-07-15 correction: Exp2 is
// NOT N/A — Exp2's aspect ratio was finalized at 1.1-1.3, still elongated,
// and the code never special-cased this by experiment anyway; see plan §4.2):
//   end_on   — azimuth within ±22.5° of 0°/180°
//   side_on  — azimuth within ±22.5° of 90°/270°
//   oblique  — everything else

// feature_category — ASYMMETRIC objects only (symmetric = N/A, 2026-07-15 fix, see §8):
//   feature_revealing / feature_concealed / ambiguous, based on per-feature
//   normal-to-camera angle (<60° = visible), majority vote across features

// symmetry_readable — SYMMETRIC objects only (asymmetric = N/A, new 2026-07-15):
//   true if azimuth within ±10° of 0°/180° (a strict subset of end_on's ±22.5°),
//   any elevation — fixed-window operationalization chosen for methods-section
//   clarity over a per-feature occlusion model (see plan §4.2 for the derivation)
```

---

## 6. Data Logging

### `data/exp1/P{ID}_view_record.csv` — one row per trial

Current `VIEW_HEADERS` (`server.py`), in order:

```
participant_id, experiment, task, object_id, body_type, symmetry,
exposure_index, trial_index, task_order,
start_azimuth, final_azimuth, final_elevation,
axis_category, feature_category, symmetry_readable,
confirmation_latency, enter_pressed, timeout,
cumulative_rotation_steps, criterion_met,
up_down_count, left_right_count,
dwell_ratio_end_on, dwell_ratio_side_on, dwell_ratio_oblique,
dwell_ratio_symmetry_readable,
timestamp
```

- `dwell_ratio_end_on` / `_side_on` / `_oblique` (sum to 1): proportion of the trial's 100 ms trajectory samples in each `axis_category` bucket — computed client-side from `trajectorySamples` at confirm/timeout, no separate file needed.
- `dwell_ratio_symmetry_readable`: same idea, restricted to the `symmetry_readable` window; `N/A` for asymmetric objects.
- ⚠️ Any new field added to the JS `record` object in `confirmTrial()` **must also be added to `VIEW_HEADERS` in `server.py`**, or it is silently dropped (`DictWriter(..., extrasaction='ignore')`) — see §8 for how this bit us.

### `data/exp1/P{ID}_probe.csv`

`participant_id, task, block_index, block_probe_index, after_trial_index, answer, timestamp` — `answer` ∈ `Not confident` / `Somewhat confident` / `Confident`.

### `data/exp1/P{ID}_samples.csv` — one row per 100 ms sample

`participant_id, task, object_id, trial_index, timestamp_ms, azimuth, elevation` — sampled for the full trial duration, sent as one batch POST to `/api/sample_log` at trial end.

### `data/exp1/P{ID}_block_events.csv` — one row per block

`participant_id, block_index, task, task_order, rest_start_ms, rest_end_ms, instruction_confirm_ms, block_start_ms, block_end_ms` — block 1 has no `rest_start_ms`/`rest_end_ms` (no rest before the first block).

### Storage

Per-participant files under `data/{experiment}/`, git-ignored. Back up the whole `data/` directory after each session (see plan §0 for lab-deployment backup checklist).

---

## 7. Current Implementation Status (as of 2026-07-15)

### What is live and working

- All of `EXP1_EXP2_IMPLEMENTATION_PLAN.md` §2–§7 for **Exp1** is implemented: revolution-body Blender generation (32 GLBs), rotation-criterion trial flow, rest/instruction pages, jittered probes, per-participant 4-file CSV layout, `TEST_MODE`/`beforeunload` anti-interruption guards, `EXPERIMENT`/`?exp=` config switch.
- **Exp2 stimuli are now generated** (commit `15b1998`): `blender_gen_objects.py` gained an `EXPERIMENT` switch that only changes the `aspect_ratio` target (2.5–2.8 → 1.1–1.3) and output prefix; all 4 body profiles/feature params are shared with Exp1. 32 `exp2_*.glb` + merged metadata are in `public/Objects/` (64 objects total, verified `body_type` (16,16,16,16) / `symmetry` (32,32) split, aspect ratios confirmed in-range).
- Verified end-to-end via pilot/test sessions — current files: `data/exp1/{P002,PP010}_*.csv`, `data/exp2/{PEP2_00,PEP2_01}_*.csv` (the latter includes a `_block_events.csv` and `_probe.csv`, i.e. a full 2-block run).
- **2026-07-15 session**: fixed `feature_category` (was incorrectly computed for symmetric objects, collapsing to `feature_concealed` at every azimuth including end_on — see §8) and added `symmetry_readable` + four `dwell_ratio_*` fields. Verified working in `PP010_view_record.csv` after restarting `server.py`.

### What is NOT done

- **Pilot calibration items P1–P4** (plan §8.2) — end-on symmetry legibility, rotation key-repeat ergonomics, profile faceting coarseness, timeout rate at the 50s cap — have not been formally confirmed as done in the plan checklist. Existing pilot data (above) suggests walkthroughs happened, but **P1 in particular (feature crowding at low aspect ratio) needs a dedicated look at Exp2** specifically, since its stimuli are much newer than Exp1's and were generated the same day.
- **Test/pilot data cleanup**: `data/exp1/` and `data/exp2/` currently hold dev-session files (`P002`, `PP010`, `PEP2_00`, `PEP2_01` — 10 files total, none of which are real participant data). These must be moved out or backed up separately before real collection starts, or they'll sit alongside real participant CSVs (the backend's duplicate-ID check is an exact string match and won't distinguish test IDs from real ones).
- **Lab deployment checklist** (plan §0, items 4–5) — several pre-departure checks (confirming `TEST_MODE=false` post-copy, port/firewall check on the lab machine, architecture check for `node_modules/`) are still open and can only be confirmed on-site.

---

## 8. Session Notes — 2026-07-15

**`feature_category` was miscalibrated for symmetric objects.** The per-feature visibility formula reduces to `dot = cos(theta - elevation) × sin(azimuth)`, which is exactly 0 for every feature at azimuth = 0°/180° (end-on) — the view where symmetry should be *most* legible. Pilot data (`PPILOT_001_view_record.csv`) confirmed this: every symmetric-object trial showed `feature_concealed`, including all `end_on` trials. Root cause: the formula measures "is this feature's surface facing the camera" (right construct for judging a single asymmetric feature's visibility), not "are both members of a mirror pair visible" (the actual construct for symmetry legibility). Fix: `feature_category` is now asymmetric-only (`N/A` for symmetric); symmetry legibility is a separate new field, `symmetry_readable`, using a fixed ±10°-of-end-on azimuth window (any elevation) chosen for methods-section clarity over a per-feature occlusion model — see `EXP1_EXP2_IMPLEMENTATION_PLAN.md` §4.2 for the full derivation and reasoning.

**Gotcha: `server.py` doesn't hot-reload.** After adding the new CSV fields, a stale `python server.py` process (started before the edit) kept silently dropping them from `data/exp1/P*_view_record.csv` — no header, no error, just missing columns — because `_append_row()`'s `DictWriter` uses `extrasaction='ignore'` against the in-memory `VIEW_HEADERS` list. Confirmed the process (`Get-NetTCPConnection -LocalPort 5006`), killed it, restarted, re-ran a trial, fields appeared correctly (`data/exp1/PP010_view_record.csv`). **Any future `server.py` edit needs a manual restart of that terminal to take effect.**

---

## 9. Verification Checklist

### GLB files present

```powershell
(Get-ChildItem "public\Objects\*.glb" | Measure-Object).Count   # → 32
Test-Path "public\Objects\objects_metadata.json"                 # → True
```

### One trial works end to end

1. Open `http://localhost:5180/view-selection.html?exp=1`
2. Enter a participant ID, click Start → instruction page for block 1
3. Click Begin Block → an `exp1_*` object loads at azimuth 30° or 330°
4. Rotate with arrow keys — Enter has no effect until ~40 azimuth steps done
5. After criterion met, press Enter → trial ends, next trial begins (or probe, if scheduled)
6. After 32 trials → rest page (press Enter to continue) → instruction page for block 2 → 32 more trials → end screen
7. `data/exp1/P{ID}_view_record.csv` → 64 rows + header; `_probe.csv`, `_samples.csv`, `_block_events.csv` (2 rows) also present

### New fields sanity check (2026-07-15 additions)

- Symmetric object, `final_azimuth` near 0°/180° → `feature_category = N/A`, `symmetry_readable = True`
- Symmetric object, `final_azimuth` far from 0°/180° → `symmetry_readable = False`
- Asymmetric object → `symmetry_readable = N/A`, `dwell_ratio_symmetry_readable = N/A`, `feature_category` populated normally
- `dwell_ratio_end_on + dwell_ratio_side_on + dwell_ratio_oblique ≈ 1` for every row

---

## 10. Design Decisions — Do Not Change Without Review

| Decision | Rationale |
|----------|-----------|
| `INITIAL_Y = -π/2` | Azimuth 0° = end-on view; changing invalidates data labels |
| `KEY_REPEAT = false` | Each physical press = one step; prevents inflated rotation-criterion counts |
| `MIN_ROTATION_STEPS = 40`, azimuth-only | Elevation steps deliberately excluded — otherwise the criterion could be met by up/down oscillation without ever orbiting the object (plan §3.3) |
| `TIMER_WARNING_SEC = 8`, countdown hidden | Visible per-second countdown was reported to feel rushed; only a text nudge appears near the cap |
| GLB URL = `/Objects/...` | Vite serves `public/` at root, not `/public/` |
| Flask port 5006, CORS origin exactly `http://localhost:5180` | Must match `server.py` and `vite.config.js`; wrong origin (e.g. `127.0.0.1`) silently blocks POSTs |
| `feature_category` = asymmetric-only, `N/A` for symmetric | Normal-facing threshold measures per-feature detail visibility, not mirror-pair legibility (2026-07-15 fix, see §8) |
| `symmetry_readable` = azimuth ±10° of end-on, any elevation | Fixed window nested inside `end_on` (±22.5°); chosen over per-feature occlusion modeling for methods-section reproducibility (plan §4.2) |
| `dwell_ratio_*` fields computed client-side from `trajectorySamples` | Reuses the existing 100ms sampling buffer; no new sampling infrastructure |
| `server.py` has no auto-reload | Any server.py edit requires manually restarting that terminal (§8) |
| Per-participant CSV files (`data/{exp}/P{ID}_*.csv`) | Natural per-participant backup granularity; no shared-file race conditions across sessions |

---

## Prompt for next Claude Code conversation

```
I am continuing a Three.js psychophysics experiment called "View Selection Experiment" in:
C:\Users\lenovo\Documents\GitHub\visual-elongated-object-exploration

Please read HANDOFF.md first — it has the full project state, file map, and next steps.
Then read EXP1_EXP2_IMPLEMENTATION_PLAN.md — this is the AUTHORITATIVE plan AND matches
what's actually running (Exp1 fully implemented and pilot-tested). Workflow rule: any
experiment adjustment must update this plan file and get user confirmation before touching
code. CURRENT_IMPLEMENTATION_PLAN.md / Experiment_Execution_Spec.md are ARCHIVED (old 2x2
box-body design, no longer runs) — historical reference only, do not use for new work.

Key files:
- view-selection.js      LIVE experiment logic — Exp1 + Exp2 both implemented
- view-selection.html    UI structure
- server.py              Flask backend (port 5006); NO auto-reload — restart manually after edits
- blender_gen_objects.py stimulus generation — run inside Blender, not from terminal;
                         EXPERIMENT switch generates the 32 exp1_* or 32 exp2_*
                         surfaces-of-revolution GLBs (same profiles, different aspect ratio)
- vite.config.js         proxy config (port 5180 → 5006)

Current situation (as of 2026-07-15):
- Exp1 (elongated bodies, symmetry entirely feature-carried) is fully implemented and
  pilot-verified end-to-end: 32 GLBs generated, rotation-criterion trial flow, rest/
  instruction pages, jittered probes, per-participant CSV files under data/exp1/.
- Exp2 (non-elongated bodies) stimuli are now generated too (32 exp2_*.glb, commit
  15b1998) — pass ?exp=2 to run it. Not yet pilot-walked-through specifically at this
  lower aspect ratio (plan §8.2 P1-P4), so don't treat it as ready for real data
  collection until that's done.
- 2026-07-15: fixed feature_category (was wrongly computed for symmetric objects, always
  collapsed to feature_concealed even at end_on) and added symmetry_readable +
  dwell_ratio_end_on/side_on/oblique/symmetry_readable fields. See HANDOFF.md §8 for the
  root-cause writeup and the server.py-needs-manual-restart gotcha.
- Pilot calibration items P1-P4 (plan §8.2) and the lab-deployment checklist (plan §0)
  are still open before this is ready for real data collection. data/exp1/ and data/exp2/
  currently hold dev-session files (P002, PP010, PEP2_00, PEP2_01) that need clearing
  out before real participants run.

IMPORTANT constraints on the LIVE code (do NOT change without reason):
- INITIAL_Y = -π/2, ELEV_MAX = 30, MIN_ROTATION_STEPS = 40 (azimuth-only), MAX_TRIAL_SEC = 50
- GLB URL prefix: /Objects/ (NOT /public/Objects/)
- Flask port 5006, CORS origin exactly http://localhost:5180
- TEST_MODE must be false for real data collection
- Any new view_record field added in view-selection.js's confirmTrial() must also be added
  to VIEW_HEADERS in server.py, and server.py must be manually restarted to pick it up

After reading HANDOFF.md, confirm what you understand the current state to be, then
[describe your specific task here].
```
