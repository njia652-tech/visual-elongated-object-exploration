# Developer Handoff — View Selection Experiment

_Last updated: 2026-06-12. Use this as the starting point for any new Claude Code conversation._

---

## 1. Project Overview

**What it is:** A Three.js psychophysics experiment where participants freely rotate 3D elongated objects and confirm a "best view" under two task instructions.

**Experimental goal:** Compare which viewpoints participants prefer when the task is (T1) representational (brochure) vs (T2) recognition-based. 2×3 within-subject design: 2 tasks × 3 elongation levels (low/medium/high).

**User-facing behaviour:**
1. Participant enters an ID → presses Start
2. Brief task instruction screen per block
3. Each trial: object loads at a random ±30° oblique azimuth → 50 s free rotation with arrow keys → 10 s confirmation window (Enter to confirm, or auto-submit on timeout)
4. Probe question every 6 trials (memory rating, 3-button)
5. 36 trials total (2 blocks × 18 objects), 6 probes

---

## 2. Repository & Environment

### Folder structure

```
project root/
├── index.html                  old curiosity experiment (DO NOT TOUCH)
├── main.js                     old experiment logic (DO NOT TOUCH)
├── view-selection.html         new experiment — UI, CSS, static text
├── view-selection.js           new experiment — all JS logic
├── server.py                   Flask backend — /record_view + /probe_result
├── vite.config.js              Vite dev server config (port 5180, proxy /api→5001)
├── package.json                deps: three, vite
├── blender_gen_objects.py      Blender script — generates 18 GLB stimuli
├── blender_preview.py          Blender script — imports GLBs for visual check
├── blender_check.md            Blender usage reference
├── CURRENT_IMPLEMENTATION_PLAN.md   authoritative design spec (read this first)
├── public/
│   ├── Objects/                18 × .glb stimulus files
│   └── hdrs/
│       └── table_mountain_1_puresky_4k.exr   HDR environment
├── view_record.csv             trial data output (append-only)
└── view_probe.csv              probe data output (append-only)
```

### Running locally

```powershell
# Terminal A — Flask backend (keep open)
python server.py
# Expected: "Running on http://127.0.0.1:5001"

# Terminal B — Vite frontend (keep open)
npm run dev
# Expected: "Local: http://localhost:5180/"
```

**Experiment URL:** `http://localhost:5180/view-selection.html`
**Old experiment:** `http://localhost:5180/` (untouched, must remain working)

### Dependencies

```powershell
npm install          # three, vite
pip install flask flask-cors
```

---

## 3. Current Implementation State

### What is fully implemented

- `view-selection.js`: complete experiment logic
  - Object discovery via `import.meta.glob('/public/Objects/*.glb')`
  - Constrained shuffle (same baseId not adjacent)
  - Task counterbalancing by participant ID last digit (odd=T1T2, even=T2T1)
  - Two-phase timer: 50 s explore → 10 s confirm → auto-submit
  - Random start azimuth (30° or 330°) each trial
  - Key handling: `if (e.repeat) return` — each keydown = one 5° step
  - Elevation hard-clamped to ±30°
  - Zone dwell sampling every 100 ms during explore phase
  - `confirmTrial()` POSTs all 20 data fields to `/api/record_view`
  - Probe every 6 trials, POSTs to `/api/probe_result`
- `view-selection.html`: correct object count (18), ±30° text, 50 s timer display
- `server.py`: `/record_view` and `/probe_result` endpoints with correct CSV headers
- `blender_gen_objects.py`: updated for 6 objects, 8 attachments, **cuboid body**, `box_point_and_normal` area-weighted surface sampling

### ⚠️ Known discrepancy — GLB files vs script

**The 18 GLB files currently in `public/Objects/` were generated with the ELLIPSOID body** (from a previous session). The Blender script has since been reverted to **cuboid**. The visual appearance of the stimuli in the browser does NOT match the current script.

**Action required before data collection:** Re-run `blender_gen_objects.py` inside Blender to regenerate the 18 GLBs as cuboids.

### What is NOT yet done

- GLBs have not been regenerated with the final cuboid body
- No end-to-end test run has been completed with the new 36-trial/6-probe structure
- The old experiment at `/` has not been re-verified after changes

### Uncommitted changes (git status)

All changes from this session are **uncommitted**. Staged files include:
`PLAN(2).md`, `PLAN(3).md`, `blender_check.md`, `blender_gen_objects.py`, `blender_preview.py`, `server.py`, `view-selection.html`, `view-selection.js`, all 18 GLB files (ellipsoid versions), deleted object07–10 GLBs.

---

## 4. Experiment Logic

### Constants (`view-selection.js` top)

```js
const STEP_DEG    = 5;       // degrees per keypress
const ELEV_MAX    = 30;      // elevation hard limit ±
const EXPLORE_SEC = 50;      // free exploration phase
const CONFIRM_SEC = 10;      // confirmation window
const PROBE_EVERY = 6;       // trials between probes
const INITIAL_Y   = -Math.PI / 2;  // azimuth 0° = short-side view
```

### Trial structure

```
buildTrialSequence(taskOrder)
  → constrainedShuffle(allObjects, o => o.baseId) × 2 blocks
  → 36 trials [{name, url, baseId, level, task, block}, ...]
```

`allObjects` is auto-discovered from `/public/Objects/*.glb` at import time.

### Task counterbalancing

```js
const lastDigit = parseInt(participantId.replace(/\D/g,'').slice(-1));
const taskOrder = lastDigit % 2 === 1 ? 'T1T2' : 'T2T1';
```

### Rotation engine

```js
// applyRotation() — called after every keydown
model.rotation.order = 'YXZ';
model.rotation.y = INITIAL_Y + THREE.MathUtils.degToRad(azimuth);
model.rotation.x = THREE.MathUtils.degToRad(elevation);
model.rotation.z = 0;
```

State variables: `azimuth` (0–360, wraps), `elevation` (clamped ±30), `upDownCount`, `leftRightCount`.

### Two-phase timer

```
startTimer()          → sets EXPLORE_SEC, starts zoneInterval (100ms), starts 1s countdown
  ↓ timeLeft === 0
startConfirmPhase()   → confirmReady=true, shows #confirm-prompt, starts CONFIRM_SEC countdown
  ↓ confirmTimeLeft === 0  OR  Enter pressed
confirmTrial()        → guard: if (!confirmReady || isProcessing || !inTrial) return
                      → POSTs to /api/record_view, calls nextStep()
```

### Zone dwell sampling

```js
// azimuthZone(az) returns 'short' | 'long' | 'oblique'
// short:   a ≤ 22.5° || a ≥ 337.5° || (157.5° ≤ a ≤ 202.5°)
// long:    67.5° ≤ a ≤ 112.5° || 247.5° ≤ a ≤ 292.5°
// oblique: everything else

zoneInterval = setInterval(() => { zoneSamples[azimuthZone(azimuth)]++; }, 100);
// runs only during EXPLORE phase; stopped in startConfirmPhase() and showModule()
```

### Data payload (`confirmTrial`)

```js
{
  participantId, task, block, trialNumber,
  objectName, baseId, level,
  startAzimuth, finalAzimuth, finalElevation,
  upDownCount, leftRightCount, upDownRatio, leftRightRatio,
  timeShortSide, timeLongSide, timeOblique,    // ms (samples × 100)
  ratioShortSide, ratioLongSide, ratioOblique, // proportion of total zone samples
  timestamp
}
```

### Probe logic

```js
// nextStep() — called after confirmTrial()
if (next % PROBE_EVERY === 0) → showModule('probe')
if (next >= trialSequence.length) → showModule('end')
if (next === half) → startBlock(2)   // switch to block 2 after trial 18
else → startTrial(next)
```

After probe button click, `pendingProbeAfter` determines whether to start block 2, end, or continue trials.

---

## 5. Important Design Decisions

| Decision | Rationale |
|----------|-----------|
| Object body = **cuboid** (not ellipsoid) | Reverted in this session per user instruction; ellipsoid was tried but rejected |
| `if (e.repeat) return` on keydown | Plan A: each physical press = one step; avoids inflated keypress counts from OS repeat |
| 50 s explore + 10 s confirm (not 25 s) | Longer exploration gives more dwell data; 10 s window keeps total under 60 s |
| Zone sampling at 100 ms intervals | Coarse enough to be cheap, fine enough for 50 s dwell analysis |
| Probe every 6 trials (not 10) | Fits cleanly into 36-trial structure (6 probes at trials 6,12,18,24,30,36) |
| `constrainedShuffle` with 300-attempt random + greedy fallback | Handles the constraint "no same baseId adjacent" reliably for 18 items |
| Task order by ID last digit parity | Simple, self-administering counterbalancing; no lookup table needed |
| CSV append-only (never cleared) | Multiple participants accumulate in one file; filtered by `participantId` in analysis |
| `INITIAL_Y = -π/2` | Rotates object so long axis (Blender X) points away from camera → azimuth 0° = short-side view |

### Do not change without checking

- `INITIAL_Y`: changing this redefines the azimuth zero-point and invalidates all collected data labels
- The `constrainedShuffle` key function `o => o.baseId`: ensures same-object variants don't appear consecutively
- `PROBE_EVERY = 6` must divide evenly into 36 trials; changing it breaks probe timing
- Flask port 5001 and Vite port 5180 are hardcoded in `server.py` (`ALLOWED_ORIGIN`) and `vite.config.js`

---

## 6. Next Steps

### Immediate (before any data collection)

1. **Regenerate GLBs** — open `blender_gen_objects.py` in Blender Scripting workspace, run Alt+P. Verify `Done: 18/18` in System Console. Use `blender_preview.py` to visually confirm cuboid body + 8 attachments.
2. **End-to-end test** — run both servers, open experiment in browser, complete at least 7 trials (to trigger one probe) and verify `view_record.csv` and `view_probe.csv` are written correctly.
3. **Verify old experiment** — open `http://localhost:5180/` and confirm it still loads and functions.
4. **Commit** — once GLBs are regenerated and verified, commit everything.

### Suggested commit message

```
Implement view-selection experiment (PLAN 2/3): cuboid stimuli, 50+10s timer,
zone dwell tracking, constrained shuffle, probe every 6 trials
```

### Files to edit next (if changes needed)

| File | What to change |
|------|---------------|
| `view-selection.js` | Any experiment logic bugs found during test |
| `view-selection.html` | UI text changes |
| `server.py` | Only if CSV fields need to change |
| `blender_gen_objects.py` | Only if object geometry needs adjustment |

---

## 7. Safety Checklist Before Continuing

### Verify servers start

```powershell
python server.py
# → Running on http://127.0.0.1:5001 (no errors)

npm run dev
# → Local: http://localhost:5180/ (no errors)
```

### Verify GLB files are correct

```powershell
# Should list exactly 18 files, all named object0[1-6]_(low|medium|high).glb
ls public/Objects/*.glb | Measure-Object
# Count: 18
```

Open `blender_preview.py` in Blender (Scripting → Open → Alt+P) to visually inspect.

### Verify data recording

1. Run one trial to completion (wait 60 s or press Enter in confirm window)
2. Check `view_record.csv` exists and has 2 rows (header + 1 data row)
3. Run to trial 7, answer the probe
4. Check `view_probe.csv` exists and has a row with `afterTrial: 6`

### Verify old experiment is unaffected

Open `http://localhost:5180/` — should load the original experiment without errors.

### Inspect these functions if something seems wrong

| Symptom | Function to check |
|---------|------------------|
| Timer doesn't start | `startTimer()` in `view-selection.js:200` |
| Enter key does nothing | `confirmTrial()` guard conditions, `confirmReady` flag |
| Object not rotating | `applyRotation()`, check `model` is not null |
| Zone data all zeros | `zoneInterval` — confirm it starts in `startTimer()` and stops in `stopZoneSampling()` |
| Probe not appearing | `nextStep()` — check `next % PROBE_EVERY === 0` |
| Wrong task order | `buildTrialSequence()`, check last-digit parsing |

---

## Prompt for the next Claude Code chat

```
I'm continuing a Three.js psychophysics experiment called "View Selection Experiment" in:
C:\Users\lenovo\Documents\GitHub\visual-elongated-object-exploration

Please read HANDOFF.md first — it has the full project state, file map, and next steps.
Then read CURRENT_IMPLEMENTATION_PLAN.md for the authoritative experiment spec.

The key files are:
- view-selection.js   (all experiment logic)
- view-selection.html (UI)
- server.py           (Flask backend, CSV recording)
- blender_gen_objects.py (stimulus generation)

⚠️ IMPORTANT: The 18 GLB files in public/Objects/ currently show ELLIPSOID bodies but
blender_gen_objects.py has been updated to generate CUBOID bodies. The GLBs must be
regenerated in Blender before data collection.

After reading HANDOFF.md, confirm what you understand the current state to be,
then [describe your specific task here].
```
