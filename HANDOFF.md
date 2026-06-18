# Developer Handoff — View Selection Experiment

_Last updated: 2026-06-18. Use this as the starting point for any new Claude Code conversation._

---

## 1. Project Overview

**What it is:** A Three.js psychophysics experiment where participants freely rotate novel 3D elongated objects and confirm a preferred viewpoint under two different task instructions.

**Scientific goal:** Compare which viewpoints participants select when the task is (T1) representational ("brochure" impression) vs (T2) recognition-based ("remember later"). 2×3 within-subject design: 2 tasks × 3 elongation levels (low/medium/high).

**User-facing flow:**
1. Participant enters an ID → clicks Start
2. Task instruction screen shown at the start of each block
3. Each trial: object loads at random ±30° oblique azimuth → 50 s free rotation (arrow keys) → 10 s confirmation window (Enter to confirm, or auto-submit on timeout)
4. Probe question every 6 trials (memory rating, 3-button)
5. 36 trials total (2 blocks × 18 objects), 5 probes total (after trials 6/12/18/24/30; no probe after trial 36)

---

## 2. File Structure

```
project root/
├── index.html                  OLD curiosity experiment — DO NOT TOUCH
├── main.js                     OLD experiment logic — DO NOT TOUCH
│
├── view-selection.html         NEW experiment — UI, CSS, all static text
├── view-selection.js           NEW experiment — all JS logic (Three.js + experiment flow)
├── server.py                   Flask backend — /record_view and /probe_result endpoints
├── vite.config.js              Vite config: port 5180, proxy /api → :5006
├── package.json                npm deps: three, vite
│
├── blender_gen_objects.py      Blender script — generates 18 GLB stimuli (run inside Blender)
├── blender_preview.py          Blender script — imports GLBs for visual inspection
├── blender_check.md            Blender usage reference notes
│
├── CURRENT_IMPLEMENTATION_PLAN.md   Authoritative design spec (read before editing)
├── HANDOFF.md                  This file
│
├── public/
│   ├── Objects/                18 GLBs present (regenerated 2026-06-18 with HEMISPHERE/OCTAHEDRON)
│   └── hdrs/
│       └── table_mountain_1_puresky_4k.exr   HDR environment map
│
├── view_record.csv             Trial data output (append-only, NOT committed)
└── view_probe.csv              Probe data output (append-only, NOT committed)
```

### Files to ignore

All old experiment files (`index.html`, `main.js`, `app.js`, `cut_image.py`, `export_sessions.py`, `getModelList.py`, `main_for_ai.js`, etc.) belong to the original curiosity experiment. Leave them untouched.

---

## 3. Running Locally

### Install dependencies (first time only)

```powershell
npm install
pip install flask flask-cors
```

### Start both servers (two terminals, keep both open)

```powershell
# Terminal A — Flask backend
python server.py
# Expected: "Running on http://127.0.0.1:5006"

# Terminal B — Vite frontend
npm run dev
# Expected: "Local: http://localhost:5180/"
```

### Access URLs

| URL | Content |
|-----|---------|
| `http://localhost:5180/view-selection.html` | New view-selection experiment |
| `http://localhost:5180/` | Old curiosity experiment (must remain working) |

### Port configuration

| Component | Port | Where configured |
|-----------|------|-----------------|
| Flask backend | **5006** | `server.py` line: `app.run(port=5006)` |
| Vite dev server | **5180** | `vite.config.js` → `server.port` |
| Vite proxy target | **5006** | `vite.config.js` → `proxy['/api'].target` |

All three must match. If Flask is on a different port, update both `server.py` and `vite.config.js` together.

---

## 4. Experiment Logic (`view-selection.js`)

### Constants (top of file)

```js
const STEP_DEG    = 5;       // degrees per keypress
const ELEV_MAX    = 30;      // elevation hard limit ±30°
const EXPLORE_SEC = 50;      // free exploration phase duration
const CONFIRM_SEC = 10;      // confirmation window duration
const PROBE_EVERY = 6;       // probe inserted after every N trials
const INITIAL_Y   = -Math.PI / 2;  // rotates model so azimuth 0° = short-side view
```

### Object loading

GLB URLs are constructed statically (NOT via `import.meta.glob`) because Vite serves `public/` at root:

```js
// /Objects/object01_low.glb ... /Objects/object06_high.glb
for (let i = 1; i <= 6; i++) {
  for (const level of ['low', 'medium', 'high']) {
    allObjects.push({ name, url: `/Objects/${name}.glb`, baseId, level });
  }
}
```

⚠️ Do NOT change back to `import.meta.glob('/public/Objects/...')` — that path is wrong for Vite's public directory.

### Trial sequence

```
buildTrialSequence(taskOrder)
  → constrainedShuffle(allObjects, o => o.baseId) × block 1   (18 trials, same-baseId non-adjacent)
  → constrainedShuffle(allObjects, o => o.baseId) × block 2
  → 36 trials [{name, url, baseId, level, task, block}, ...]
```

### Task counterbalancing

```js
const lastDigit = parseInt(participantId.replace(/\D/g,'').slice(-1));
const taskOrder = lastDigit % 2 === 1 ? 'T1T2' : 'T2T1';
// Odd ID (P001, P003…) → T1 first; Even ID (P002, P004…) → T2 first
```

### Starting azimuth

Each trial starts at azimuth **30° or 330°** (50/50 random), elevation 0°.

### Rotation controls

| Key | Effect |
|-----|--------|
| ← → | Azimuth ±5°, wraps 0–360° |
| ↑ ↓ | Elevation ±5°, hard-clamped to ±30° |
| Enter | Confirm view (only active during confirm phase) |

Key repeat is suppressed (`if (e.repeat) return`) — each physical keypress = one 5° step.

Rotation applied as:
```js
model.rotation.order = 'YXZ';
model.rotation.y = INITIAL_Y + THREE.MathUtils.degToRad(azimuth);
model.rotation.x = THREE.MathUtils.degToRad(elevation);
```

### Two-phase timer

```
startTimer()          → 50 s countdown, zone sampling starts (100 ms interval)
  ↓ timeLeft === 0
startConfirmPhase()   → confirmReady = true, confirm prompt appears, 10 s countdown
  ↓ Enter pressed OR confirmTimeLeft === 0
confirmTrial()        → guard: if (!confirmReady || isProcessing || !inTrial) return
                      → POSTs data to /api/record_view → nextStep()
```

### Zone dwell sampling

During explore phase only, sampled every 100 ms:

```
short:   azimuth ≤ 22.5° OR ≥ 337.5° OR 157.5°–202.5°
long:    67.5°–112.5° OR 247.5°–292.5°
oblique: everything else
```

### Probe logic

After `confirmTrial()` → `nextStep()`:
- If `next % 6 === 0` → show probe screen
- After probe button click:
  - `next === 18` → `startBlock(2)` (instruction screen for block 2)
  - `next >= 36` → `showModule('end')`
  - else → `startTrial(next)`

---

## 5. Data Logging

### view_record.csv — one row per trial

Written by Flask `/record_view` endpoint. Fields:

| Field | Description |
|-------|-------------|
| `participantId` | Entered ID (uppercased), or `P-{timestamp}` if blank |
| `task` | `T1` or `T2` |
| `block` | `1` or `2` |
| `trialNumber` | 1–36 |
| `objectName` | e.g. `object03_medium` |
| `baseId` | e.g. `object03` |
| `level` | `low` / `medium` / `high` |
| `startAzimuth` | 30 or 330 |
| `finalAzimuth` | 0–360° at confirmation |
| `finalElevation` | −30…+30° at confirmation |
| `upDownCount` | Physical ↑↓ keypresses |
| `leftRightCount` | Physical ←→ keypresses |
| `upDownRatio` | upDownCount / total keypresses |
| `leftRightRatio` | leftRightCount / total keypresses |
| `timeShortSide` | ms spent in short-side zone (samples × 100) |
| `timeLongSide` | ms spent in long-side zone |
| `timeOblique` | ms spent in oblique zone |
| `ratioShortSide` | timeShortSide / total zone time |
| `ratioLongSide` | timeLongSide / total zone time |
| `ratioOblique` | timeOblique / total zone time |
| `timestamp` | Unix ms at confirmation |

### view_probe.csv — one row per probe

| Field | Description |
|-------|-------------|
| `participantId` | Participant ID |
| `afterTrial` | Trial number after which probe appeared (6/12/18/24/30/36) |
| `answer` | `Not clearly` / `Somewhat clearly` / `Clearly` |
| `timestamp` | Unix ms |

### Storage

Both CSVs are **append-only** files in the project root. They are **not tracked by git** (not in .gitignore by default — do not commit test data). Back up after each participant by copying with a date/ID suffix.

---

## 6. Current Implementation Status

### What is fully working (verified this session)

- Complete experiment flow: welcome → instruction → 36 trials → 5 probes → end screen
- Two-phase timer (50 s explore + 10 s confirm) with auto-submit
- Zone dwell sampling, all 20 data fields recorded correctly
- Flask `/record_view` and `/probe_result` endpoints, CSV write verified
- Task counterbalancing by participant ID last digit
- Constrained shuffle (same baseId non-adjacent) with greedy fallback
- `view_record.csv` and `view_probe.csv` both write and accumulate correctly

### Changes made in the 2026-06-16 session

- **Fixed GLB URL path**: replaced `import.meta.glob('/public/Objects/...')` with static URL construction using `/Objects/` prefix (Vite serves `public/` at root, not `/public/`)
- **Fixed port mismatch**: aligned Flask (`server.py`) and Vite proxy (`vite.config.js`) both to port **5006**
- **Committed all code**: commit `824699f` includes view-selection.html/js, server.py, vite.config.js, blender scripts, documentation

### Changes made in subsequent design iterations (blender_gen_objects.py)

- **NUM_ATTACHMENTS**: 8 → **12**
- **Attachment distribution**: all 6 faces eligible; ±Y long-side faces boosted by `SIDE_BOOST = 4.0` (≈60% of attachments land on long sides); ±X end faces and ±Z top/bottom receive the rest at natural area weights
- **Material — fully matte**: `BODY_ROUGHNESS` 0.85 → **1.0**; `Specular IOR Level` 0.05 → **0.0** (zero specular, clay/plaster look)

### Changes made in 2026-06-18 session (blender_gen_objects.py)

- **Attachment types**: `CYLINDER / CUBE / CONE / SPHERE` → **`CYLINDER / CONE / HEMISPHERE / OCTAHEDRON`**
- **Face-to-face contact**: all four shapes now have their flat base face lying exactly on the body surface (no vertex-to-face or edge-to-face contact):
  - `CYLINDER` / `CONE`: base circle at local z = −scale; translation = `pos + norm * scale` (unchanged)
  - `HEMISPHERE`: UV sphere bisected at z = 0 (`mesh.bisect` with `use_fill=True`); flat base at local z = 0; translation = `pos` (no normal offset)
  - `OCTAHEDRON`: custom bmesh triangular antiprism (6 verts, 8 faces); base triangle centroid at local z = 0; translation = `pos`
- **Material unified**: body and attachments share the same material object; `ATTACH_COLOR` separate entry removed from plan doc (code was already using one material for both)
- **Added `import bmesh`** at top of script

### Changes made in subsequent design iterations (view-selection.js)

- **Lighting replaced**: removed `HemisphereLight` + 2 × `DirectionalLight` → `AmbientLight(0xffffff, 0.5)` + single `keyLight` (`DirectionalLight`, intensity 1.8, position (−5, 8, 5))
- **Shadow removed**: `renderer.shadowMap` disabled; `keyLight.castShadow` removed; GLB traverse block removed entirely
- **HDR decoupled**: `scene.background = envMap` (sky panorama kept); `scene.environment = null` (no IBL on materials — manual lights only)
- **T1 instruction updated**: new text — *"Imagine that you are taking a photograph of this object for a promotional brochure. Rotate the object and stop at the viewpoint that would best represent the object to potential customers."*
- **Exploration timer hidden**: `startTimer()` sets `elTimer.style.display = 'none'`; timer reappears only when `startConfirmPhase()` is called

### Changes made in 2026-06-19 session (blender_gen_objects.py)

- **Attachment scale increased**: `ATTACH_SCALE_MIN` 0.08 → **0.15**；`ATTACH_SCALE_MAX` 0.14 → **0.22**（约 1.6× ，附件更明显）
- **CYLINDER → curved cylinder**: 以自定义 bmesh `_make_curved_cylinder_mesh()` 替代 `primitive_cylinder_add`；侧面微凸 12%（`bulge=0.12`），外观仍像普通圆柱，视线平行于附着面时保留轻微弧线轮廓；底面 z=0，放置方式与 HEMISPHERE 相同（`att.location = pos_vec`，无法向偏移）

### What is NOT yet done

- No end-to-end test with a real participant ID (only auto-generated test IDs used)
- Old experiment at `/` not re-verified since recent changes (low risk — those files were untouched)

---

## 7. Immediate Next Steps

> GLB 已于 2026-06-18 重新生成并提交（commit `e961434` 脚本 + 后续 GLB commit）。
> 当前配置（勿改）：

```python
RANDOM_SEED      = 42
NUM_OBJECTS      = 6
NUM_ATTACHMENTS  = 12
ELONGATION_LEVELS = [('low', 1.3), ('medium', 1.7), ('high', 2.5)]
MINOR_RADIUS     = 1.0
FLAT_RATIO       = 0.5
ATTACH_SCALE_MIN = 0.15   # was 0.08 — increased for visibility
ATTACH_SCALE_MAX = 0.22   # was 0.14 — increased for visibility
SIDE_BOOST       = 4.0
BODY_COLOR       = (0.45, 0.28, 0.04, 1.0)   # dark gold — body and attachments share this
BODY_ROUGHNESS   = 0.6
# Specular IOR Level = 0.5   (set inside make_grey_material)
# att_types = ['CURVED-CYLINDER', 'CONE', 'HEMISPHERE', 'OCTAHEDRON']
#   CYLINDER replaced by curved cylinder (base z=0, sides bulge 12% at mid-height)
```

### 1. Verify objects in the browser

Start both servers and open `http://localhost:5180/view-selection.html`. Confirm:
- Object loads at start of trial (no 404 in browser console)
- Shape looks correct (cuboid with attachments)
- Arrow keys rotate correctly
- Timer counts down

### 2. Run a complete test session

Use a proper participant ID (e.g. `P001`). Verify:
- All 36 trials complete
- 6 probe screens appear at trials 6, 12, 18, 24, 30, 36
- Block 2 instruction screen appears after trial 18
- `view_record.csv` has 36 rows + header
- `view_probe.csv` has 6 rows + header

### 3. Verify old experiment is unaffected

Open `http://localhost:5180/` and confirm the original experiment loads without errors.

---

## 8. Verification Checklist

### Servers start correctly

```powershell
python server.py
# → "Running on http://127.0.0.1:5006"

npm run dev
# → "Local: http://localhost:5180/"
```

### GLB files are present

```powershell
(Get-ChildItem "public\Objects\*.glb" | Measure-Object).Count
# → 18
```

### One trial works end to end

1. Open `http://localhost:5180/view-selection.html`
2. Enter `P001`, click Start
3. Instruction screen should say **Representation Task** (odd ID → T1 first)
4. Click Begin Block — object loads, 50-second timer starts
5. Rotate with arrow keys — object rotates
6. Wait for confirm prompt (or wait full 60 s) — confirm phase appears
7. Press Enter — trial ends, trial 2 begins

### Data is logged

After trial 1:
```powershell
Get-Content "view_record.csv"
# Row 2 should have: P001, T1, 1, 1, object??_???, ...
```

After trial 6 + probe:
```powershell
Get-Content "view_probe.csv"
# Row 2 should have: P001, 6, <answer>, <timestamp>
```

### No console errors

Open browser DevTools → Console. No red errors during normal trial flow.

---

## 9. Design Decisions — Do Not Change Without Review

| Decision | Rationale |
|----------|-----------|
| `INITIAL_Y = -π/2` | Makes azimuth 0° = short-side view; changing this invalidates all collected data labels |
| `if (e.repeat) return` | Each physical press = one step; prevents inflated key counts from OS repeat |
| `PROBE_EVERY = 6` | Probe inserted every 6 trials, but skipped after the final trial (36); 5 probes total |
| GLB URL = `/Objects/...` not `/public/Objects/...` | Vite's public dir is served at root, not at `/public/` |
| Flask port 5006 | Must match in both `server.py` (`app.run`) and `vite.config.js` (`proxy.target`) |
| CSV append-only | Multiple participants accumulate; filter by `participantId` in analysis |
| `constrainedShuffle` key = `o => o.baseId` | Ensures same-object variants (low/medium/high) don't appear consecutively |

---

## Prompt for next Claude Code conversation

```
I am continuing a Three.js psychophysics experiment called "View Selection Experiment" in:
C:\Users\lenovo\Documents\GitHub\visual-elongated-object-exploration

Please read HANDOFF.md first — it has the full project state, file map, and next steps.
Then read CURRENT_IMPLEMENTATION_PLAN.md for the authoritative experiment spec.

Key files:
- view-selection.js      all experiment logic
- view-selection.html    UI structure
- server.py              Flask backend (port 5006), CSV recording
- blender_gen_objects.py stimulus generation (run inside Blender, not from terminal)
- vite.config.js         proxy config (port 5180 → 5006)

Current situation (as of 2026-06-18):
- Experiment JS/HTML/server code is fully working and end-to-end tested (commit 824699f)
- public/Objects/ has 18 GLBs, regenerated with CYLINDER/CONE/HEMISPHERE/OCTAHEDRON
  face-to-face attachment geometry (committed 2026-06-18)
- blender_gen_objects.py is finalised — do NOT change parameters without review
- Do NOT change the GLB URL format (/Objects/...) — it was deliberately fixed earlier
- Do NOT change INITIAL_Y, PROBE_EVERY, or the constrainedShuffle key function

After reading HANDOFF.md, confirm what you understand the current state to be, then
[describe your specific task here].
```
