import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { EXRLoader } from 'three/addons/loaders/EXRLoader.js';

// http://localhost:5180/view-selection.html?exp=1
// http://localhost:5180/view-selection.html?exp=2
// 前端：npm run dev   后端：python server.py
//
// Implements EXP1_EXP2_IMPLEMENTATION_PLAN.md §3-§7 (Exp1/Exp2 View Selection).

// ── CONFIG BLOCK (plan §7 — copied verbatim) ──────────────────────────
let EXPERIMENT        = 'exp1';        // 'exp1' | 'exp2'
const EXEMPLAR_ALLOC   = { capsule: 4, barrel: 4, spindle: 4, ovoid_cylinder: 4 }; // 16/条件 (4,4,4,4) — 2026-07-14, ellipsoid removed
const PROBE_MIN_GAP    = 8;
const PROBE_MAX_GAP    = 12;
const PROBE_FIRST      = 6;             // first probe lands at trial 6-8 (PROBE_FIRST .. PROBE_FIRST+2)
const MIN_ROTATION_STEPS = 40;
const REST_COUNTDOWN_SEC = 30;          // forced rest before Continue/Enter unlock (plan §3.6, 2026-07-17)
const KEY_REPEAT       = false;
const TEST_MODE        = false;         // local to view-selection.js; unrelated to main.js's TEST_MODE

// ?exp=1 / ?exp=2 URL override (plan §7)
{
  const params = new URLSearchParams(window.location.search);
  const expParam = params.get('exp');
  if (expParam === '1') EXPERIMENT = 'exp1';
  else if (expParam === '2') EXPERIMENT = 'exp2';
}

// JUDGMENT CALL: the plan doesn't specify what TEST_MODE should relax (it only
// says it exists, local to this file, unrelated to main.js's flag). For a fast
// dev smoke-test path we let it shrink the rotation criterion so a human can
// walk the whole flow in seconds; it must stay false for real data collection
// (checked into the config block above).
const EFFECTIVE_MIN_ROTATION_STEPS = TEST_MODE ? 3 : MIN_ROTATION_STEPS;

// ── FIXED CONSTANTS (unchanged from old code) ─────────────────────────
const STEP_DEG  = 5;
const ELEV_MAX  = 30;
const INITIAL_Y = -Math.PI / 2;

const TASKS = {
  T1: {
    key:    'representation',
    title:  'Representation Task',
    text:   'Imagine that you are taking a photograph of this object for a selling website. Rotate the object and stop at the viewpoint that would best represent the object to potential customers.',
    banner: 'Choose the view that best represents the object for a selling website.',
  },
  T2: {
    key:    'memory_oriented',
    title:  'Memory-oriented Task',
    text:   'Please choose the view that you think would best help you memorise this object.',
    banner: 'Choose the view that would help you memorise this object.',
  },
};

// ── OBJECT LIST (plan §2.3 / §3.1 / §7 — built from EXEMPLAR_ALLOC) ───
// Filenames: exp{1|2}_{body_type}_{sym|asym}_{NN}.glb, NN 1-based per body_type
// per arrangement. Metadata (body_type/aspect_ratio/symmetry/yoked_pair_id/
// feature_positions) is looked up from objects_metadata.json
// once it loads; the base list here only fixes identity/URL so the sequence
// builder has something to shuffle even if metadata hasn't resolved yet.
function buildBaseObjectList() {
  const list = [];
  for (const bodyType of Object.keys(EXEMPLAR_ALLOC)) {
    const count = EXEMPLAR_ALLOC[bodyType];
    for (const arr of ['sym', 'asym']) {
      for (let i = 1; i <= count; i++) {
        const name = `${EXPERIMENT}_${bodyType}_${arr}_${String(i).padStart(2, '0')}`;
        list.push({
          name,
          url:      `/Objects/${name}.glb`,
          body_type: bodyType,
          symmetry:  arr === 'sym' ? 'symmetric' : 'asymmetric',
        });
      }
    }
  }
  return list;
}
const baseObjectList = buildBaseObjectList();

// ── PER-OBJECT METADATA (loaded from objects_metadata.json) ──────────
let objectsMetadata = {};
let metadataReady = fetch('/Objects/objects_metadata.json')
  .then(r => r.json())
  .then(d => { objectsMetadata = d; })
  .catch(() => {});

// ── THREE.JS SETUP (unchanged) ─────────────────────────────────────────
const scene    = new THREE.Scene();
const camera   = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 0.3, 7);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace    = THREE.SRGBColorSpace;
renderer.toneMapping         = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled   = false;
document.body.appendChild(renderer.domElement);

scene.add(new THREE.AmbientLight(0xffffff, 1.4));
const keyLight = new THREE.DirectionalLight(0xffffff, 1.0);
keyLight.position.set(-5, 8, 5);
scene.add(keyLight);

const pmrem = new THREE.PMREMGenerator(renderer);
pmrem.compileEquirectangularShader();
new EXRLoader()
  .setDataType(THREE.FloatType)
  .setPath('/hdrs/')
  .load('table_mountain_1_puresky_4k.exr', (tex) => {
    const envMap = pmrem.fromEquirectangular(tex).texture;
    scene.background          = envMap;
    scene.backgroundIntensity = 0.5;
    scene.environment         = null;
    tex.dispose();
  });

renderer.setAnimationLoop(() => renderer.render(scene, camera));

window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ── EXPERIMENT STATE ──────────────────────────────────────────────────
let participantId  = '';
let taskOrder       = 'T1T2';           // 'T1T2' | 'T2T1', by participant-id-last-digit parity
let blockObjects    = { 1: [], 2: [] }; // shuffled 32-object list per block
let blockTask       = { 1: 'T1', 2: 'T2' };
let probeSchedule   = { 1: new Set(), 2: new Set() }; // local trial indices (1-based) after which a probe fires
let blockProbeCount = { 1: 0, 2: 0 };
let blockEvents     = {
  1: { rest_start_ms: '', rest_end_ms: '', instruction_confirm_ms: '', block_start_ms: '', block_end_ms: '' },
  2: { rest_start_ms: '', rest_end_ms: '', instruction_confirm_ms: '', block_start_ms: '', block_end_ms: '' },
};

let currentBlock       = 1;
let currentLocalIdx    = 0;   // 1-based trial index within the current block
let lastCompletedLocalIdx = 0;
let pendingNextLocalIdx   = 0;

let model        = null;
let azimuth      = 0;
let elevation    = 0;
let startAzimuth = 0;
let upDownCount    = 0;
let leftRightCount = 0;   // == cumulative_rotation_steps (azimuth-only, plan §3.3)
let criterionMet   = false;

// Diagnostic-only (plan §3.3/§4.1): distinct 5°-azimuth bins visited this
// trial. NOT used to gate criterionMet — that stays raw-count so revisiting/
// dwelling on an angle costs nothing (see plan's 2026-07-16 decision record
// on why a dedup'd coverage criterion would perversely penalize dwelling).
let visitedAzimuthBins = new Set();

let inTrial          = false;
let isProcessing     = false;
let isPracticeTrial  = false; // plan §3.3b: one-off, unrecorded trial before block 1

// trajectory sampling (100 ms during entire trial)
let trajectorySamples   = [];
let trajectoryInterval  = null;
let trajectoryStartTime = 0;

// ── VIEW CLASSIFICATION (plan §4.2) ────────────────────────────────────
function getAxisCategory(az) {
  const a = ((az % 360) + 360) % 360;
  // end_on: azimuth near 0° or 180° (within ±22.5°)
  if (a <= 22.5 || a >= 337.5 || (a >= 157.5 && a <= 202.5)) return 'end_on';
  // side_on: azimuth near 90° or 270° (within ±22.5°)
  if ((a >= 67.5 && a <= 112.5) || (a >= 247.5 && a <= 292.5)) return 'side_on';
  return 'oblique';
}

// Symmetric objects only (plan §4.2): fixed azimuth window nested inside
// end_on (±22.5°) — ±10° around the long axis (0°/180°), any elevation.
// Chosen over a per-feature occlusion model for methods-section clarity; see
// plan §4.2 for the derivation.
function isSymmetryReadable(az) {
  const a = ((az % 360) + 360) % 360;
  return a <= 10 || a >= 350 || (a >= 170 && a <= 190);
}

// Dwell-time proportions over the trial's 100ms trajectory samples (plan
// §4.1, 2026-07-15) — reuses the same classification functions applied to
// the final view, just aggregated across the whole trial.
function computeDwellRatios(samples) {
  if (!samples || samples.length === 0) {
    return { end_on: 0, side_on: 0, oblique: 0, symmetry_readable: 0 };
  }
  let endOn = 0, sideOn = 0, oblique = 0, symReadable = 0;
  for (const s of samples) {
    const cat = getAxisCategory(s.azimuth);
    if (cat === 'end_on') endOn++;
    else if (cat === 'side_on') sideOn++;
    else oblique++;
    if (isSymmetryReadable(s.azimuth)) symReadable++;
  }
  const n = samples.length;
  return {
    end_on:            +(endOn / n).toFixed(4),
    side_on:           +(sideOn / n).toFixed(4),
    oblique:           +(oblique / n).toFixed(4),
    symmetry_readable: +(symReadable / n).toFixed(4),
  };
}

// JUDGMENT CALL (documents a mechanical elaboration of plan §4.2, not a design
// decision): for each attached feature we approximate its outward normal in
// the object's local frame as (0, sin(theta), cos(theta)) — i.e. we ignore the
// profile curve's radial slope term used by the Blender generator's exact
// surface_normal() and treat the surface as locally cylindrical, which is a
// reasonable first-order approximation for classifying gross visibility. That
// normal is rotated by the same Euler (elevation about X, INITIAL_Y+azimuth
// about Y, order YXZ) applied to the model mesh itself, so it tracks the
// object's actual on-screen orientation. "Visible to the viewer" = the angle
// between the rotated normal and the camera-ward direction is < 60°, matching
// the old code's threshold. We then bucket by the FRACTION of the object's
// features currently visible (majority vote) rather than a single feature,
// since asymmetric objects carry several features with no single "the"
// diagnostic one: >50% visible => feature_revealing, <50% => feature_concealed,
// ==50% => ambiguous.
//
// asymmetric-only (plan §4.2, 2026-07-15 fix): this normal-facing threshold
// measures per-feature detail visibility, which is the right construct for
// asymmetric objects but not for symmetric ones — mirror-pair readability
// depends on whether both paired features clear self-occlusion together, not
// on facing the camera. Applying this same formula to symmetric objects made
// feature_category collapse to feature_concealed at every azimuth including
// end_on (dot = cos(theta-el)*sin(az) is exactly 0 at az=0°/180° regardless of
// theta — confirmed in PPILOT_001_view_record.csv, 0/N end_on trials came back
// non-concealed for symmetric objects). Symmetry readability is now its own
// field (isSymmetryReadable / dwell_ratio_symmetry_readable) computed
// independently of this function.
const CAMERA_FACING_DIR = new THREE.Vector3(0, 0, 1); // camera at (0,0.3,7) looking toward origin; y-offset ignored as negligible for this angle check
function getFeatureCategory(meta, az, el) {
  if (!meta || meta.symmetry !== 'asymmetric' || !meta.feature_positions || meta.feature_positions.length === 0) return 'N/A';
  const euler = new THREE.Euler(
    THREE.MathUtils.degToRad(el),
    INITIAL_Y + THREE.MathUtils.degToRad(az),
    0,
    'XYZ'
  );
  let visibleCount = 0;
  for (const feat of meta.feature_positions) {
    const th = THREE.MathUtils.degToRad(feat.theta_deg);
    const n = new THREE.Vector3(0, Math.sin(th), Math.cos(th));
    n.applyEuler(euler);
    if (n.dot(CAMERA_FACING_DIR) > 0.5) visibleCount++; // cos(60deg) = 0.5
  }
  const total = meta.feature_positions.length;
  if (visibleCount > total / 2) return 'feature_revealing';
  if (visibleCount < total / 2) return 'feature_concealed';
  return 'ambiguous';
}

// ── SEQUENCE / SCHEDULE BUILDERS ────────────────────────────────────────
function shuffle(arr) {
  return arr
    .map(v => [Math.random(), v])
    .sort((a, b) => a[0] - b[0])
    .map(v => v[1]);
}

// Random sym/asym type sequence with no run longer than maxRun (plan §3.1
// symmetry alternation constraint) — greedy pick among still-legal types at
// each step, restart from scratch on the rare dead end (only possible near
// the tail when one type has been exhausted early).
function buildAlternatingTypeSequence(nSym, nAsym, maxRun = 2) {
  for (let attempt = 0; attempt < 1000; attempt++) {
    const seq = [];
    let sym = nSym, asym = nAsym;
    let ok = true;
    while (sym + asym > 0) {
      const tail = seq.slice(-maxRun);
      const tailIsFull = (t) => tail.length === maxRun && tail.every(x => x === t);
      const candidates = [];
      if (sym > 0 && !tailIsFull('sym')) candidates.push('sym');
      if (asym > 0 && !tailIsFull('asym')) candidates.push('asym');
      if (candidates.length === 0) { ok = false; break; }
      const pick = candidates[Math.floor(Math.random() * candidates.length)];
      seq.push(pick);
      if (pick === 'sym') sym--; else asym--;
    }
    if (ok) return seq;
  }
  throw new Error('buildAlternatingTypeSequence: could not satisfy run constraint');
}

// True if `seq` (mapped through keyFn) has a run of more than maxRun
// consecutive equal values.
function hasRunLongerThan(seq, keyFn, maxRun) {
  let run = 1;
  for (let i = 1; i < seq.length; i++) {
    if (keyFn(seq[i]) === keyFn(seq[i - 1])) {
      run++;
      if (run > maxRun) return true;
    } else {
      run = 1;
    }
  }
  return false;
}

// Independently shuffle the sym and asym objects, then interleave them
// according to a run-constrained type sequence (plan §3.1). That sequence
// already guarantees the symmetry run constraint by construction, but
// body_type is independent of it, so satisfying both at once needs a
// check-and-retry (rejection sampling) pass: 2026-07-14 plan §3.1 update.
function buildBlockOrder(objectList, maxRun = 2, maxAttempts = 2000) {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const symObjs  = shuffle(objectList.filter(o => o.symmetry === 'symmetric'));
    const asymObjs = shuffle(objectList.filter(o => o.symmetry === 'asymmetric'));
    const typeSeq  = buildAlternatingTypeSequence(symObjs.length, asymObjs.length, maxRun);
    let si = 0, ai = 0;
    const order = typeSeq.map(t => (t === 'sym' ? symObjs[si++] : asymObjs[ai++]));
    if (!hasRunLongerThan(order, o => o.body_type, maxRun)) {
      return order;
    }
  }
  throw new Error('buildBlockOrder: could not satisfy symmetry + body_type run constraints');
}

function buildBlocks(order) {
  const [task1, task2] = order === 'T1T2' ? ['T1', 'T2'] : ['T2', 'T1'];
  blockTask = { 1: task1, 2: task2 };
  blockObjects = { 1: buildBlockOrder(baseObjectList), 2: buildBlockOrder(baseObjectList) };
}

// Probe fires AFTER the trial at the returned local index completes (plan
// §3.4): first probe after trial PROBE_FIRST..PROBE_FIRST+2 (6-8), then every
// PROBE_MIN_GAP..PROBE_MAX_GAP (8-12) trials, independently per block.
function buildProbeSchedule(blockSize) {
  const schedule = new Set();
  let idx = PROBE_FIRST + Math.floor(Math.random() * 3); // 6, 7, or 8
  while (idx <= blockSize) {
    schedule.add(idx);
    idx += PROBE_MIN_GAP + Math.floor(Math.random() * (PROBE_MAX_GAP - PROBE_MIN_GAP + 1));
  }
  return schedule;
}

// ── THREE.JS MODEL ────────────────────────────────────────────────────
const loader = new GLTFLoader();

function loadTrialModel(trial) {
  scene.children.filter(o => o.userData.isModel).forEach(o => scene.remove(o));
  model = null;
  loader.load(trial.url, (gltf) => {
    model = gltf.scene;
    model.userData.isModel = true;
    model.scale.setScalar(1.0);
    scene.add(model);
    applyRotation();
  });
}

// Plan §3.3b: the practice trial uses a plain ellipsoid, generated in-code
// (not a GLB) so it shares zero lineage with either experiment's stimulus
// set. Colored to match the real objects (rather than a neutral tone) since
// it needs to read clearly against the HDR sky background, not blend into it.
function loadPracticeModel() {
  scene.children.filter(o => o.userData.isModel).forEach(o => scene.remove(o));
  const geometry = new THREE.SphereGeometry(1, 32, 24);
  const material = new THREE.MeshStandardMaterial({ color: 0xc9a227, roughness: 0.6, metalness: 0.1 });
  model = new THREE.Mesh(geometry, material);
  model.scale.set(1, 0.65, 1.3);
  model.userData.isModel = true;
  scene.add(model);
  applyRotation();
}

// ── ROTATION ENGINE ─────────────────────────────────────────────────────
// Order must be 'XYZ' (elevation applied last/outermost, in world space),
// not 'YXZ'. With 'YXZ' the effective transform is Ry(azimuth)*Rx(elevation),
// so incrementing elevation at a fixed azimuth rotates around
// Ry(azimuth)*worldX*Ry(azimuth)^-1 -- i.e. around the object's OWN current
// long axis (elevation is applied to the pristine local frame before the
// azimuth spin reorients it). For the old box bodies this was disguised
// because a box's flat faces make any rotation look eventful; for these
// rotationally-symmetric-about-the-long-axis bodies it reads as spinning
// (only the attachments swing, the smooth hull shows no change) instead of
// tilting. With 'XYZ' the transform is Rx(elevation)*Ry(azimuth), so an
// elevation-only change is a pure Rx(delta) -- a fixed world-X-axis tilt,
// independent of the current azimuth, exactly as elevation should behave.
function applyRotation() {
  if (!model) return;
  model.rotation.order = 'XYZ';
  model.rotation.y = INITIAL_Y + THREE.MathUtils.degToRad(azimuth);
  model.rotation.x = THREE.MathUtils.degToRad(elevation);
  model.rotation.z = 0;
}

// ── TRAJECTORY ──────────────────────────────────────────────────────
const elConfirm = document.getElementById('confirm-prompt');
const elRotProgress = document.getElementById('rotation-progress');

function stopTrajectory() {
  clearInterval(trajectoryInterval);
  trajectoryInterval = null;
}

function updateConfirmPrompt() {
  if (!elRotProgress) return;
  if (criterionMet) {
    elRotProgress.textContent = 'Press Enter to confirm your chosen view.';
  } else {
    elRotProgress.textContent =
      'Explore the object mainly by left/right rotation before you can confirm your view.';
  }
}

function startTrialSampling() {
  criterionMet  = false;
  trajectorySamples = [];
  trajectoryStartTime = Date.now();

  elConfirm.style.display = 'block';
  updateConfirmPrompt();
  stopTrajectory();

  // Sample azimuth + elevation every 100 ms throughout the entire trial
  trajectoryInterval = setInterval(() => {
    trajectorySamples.push({
      timestamp_ms: Date.now() - trajectoryStartTime,
      azimuth,
      elevation,
    });
  }, 100);
}

// ── MODULE SWITCHING ──────────────────────────────────────────────────
const elBanner        = document.getElementById('instruction-banner');
const elCounter       = document.getElementById('trial-counter');
const elModuleWelcome = document.getElementById('module-welcome');

function showModule(name) {
  ['welcome', 'practice-intro', 'instruction', 'rest', 'probe', 'end'].forEach(m => {
    document.getElementById(`module-${m}`).style.display = m === name ? 'flex' : 'none';
  });
  const active = name === 'trial';
  elBanner.style.display  = active ? 'block' : 'none';
  elCounter.style.display = active ? 'block' : 'none';
  if (!active) {
    stopTrajectory();
    elConfirm.style.display = 'none';
  }
  inTrial = active;
}

// ── TRIAL FLOW ────────────────────────────────────────────────────────
function trialStartTimestamp() {
  return trajectoryStartTime;
}

function startTrialAtLocal(localIdx) {
  currentLocalIdx = localIdx;
  isProcessing    = false;
  upDownCount     = 0;
  leftRightCount  = 0;
  criterionMet    = false;

  const trial = blockObjects[currentBlock][localIdx - 1];
  const blockSize = blockObjects[currentBlock].length;

  startAzimuth = Math.random() < 0.5 ? 30 : 330;
  azimuth      = startAzimuth;
  elevation    = 0;
  visitedAzimuthBins = new Set([startAzimuth]);

  elBanner.textContent  = TASKS[blockTask[currentBlock]].banner;
  elCounter.textContent = `Task ${currentBlock} (${TASKS[blockTask[currentBlock]].title}) — Trial ${localIdx} / ${blockSize}`;
  showModule('trial');
  loadTrialModel(trial);
  startTrialSampling();
}

// Plan §3.3b: same rotation/criterion/confirm interaction as a real trial,
// but on a throwaway ellipsoid, with no CSV writes and no block/probe/rest
// bookkeeping — confirmTrial() special-cases isPracticeTrial to skip all that.
function startPracticeTrial() {
  isPracticeTrial = true;
  isProcessing    = false;
  upDownCount     = 0;
  leftRightCount  = 0;
  criterionMet    = false;

  startAzimuth = Math.random() < 0.5 ? 30 : 330;
  azimuth      = startAzimuth;
  elevation    = 0;
  visitedAzimuthBins = new Set([startAzimuth]);

  elBanner.textContent  = 'Practice round — this round will not be recorded.';
  elCounter.textContent = 'Practice';
  showModule('trial');
  loadPracticeModel();
  startTrialSampling();
}

function confirmTrial() {
  if (isProcessing || !inTrial) return;
  if (!criterionMet) return; // Enter locked until rotation criterion met (plan §3.3)
  isProcessing = true;
  inTrial      = false;
  stopTrajectory();

  if (isPracticeTrial) {
    isPracticeTrial = false;
    showInstructionPage(1); // straight to block 1, no probe/rest, no CSV writes (plan §3.3b)
    return;
  }

  const trial      = blockObjects[currentBlock][currentLocalIdx - 1];
  const meta       = objectsMetadata[trial.name] || null;
  const bodyType   = (meta && meta.body_type) || trial.body_type;
  const symmetry   = (meta && meta.symmetry)   || trial.symmetry;
  const confirmLat = +((Date.now() - trialStartTimestamp()) / 1000).toFixed(2);
  const dwellRatios = computeDwellRatios(trajectorySamples);
  const isSymmetric = symmetry === 'symmetric';

  const record = {
    participant_id:            participantId,
    experiment:                EXPERIMENT,
    task:                      blockTask[currentBlock],
    object_id:                 trial.name,
    body_type:                 bodyType,
    symmetry:                  symmetry,
    exposure_index:            currentBlock, // both blocks show all 32 objects once each; block 1 = 1st exposure, block 2 = 2nd
    trial_index:               currentLocalIdx,
    task_order:                taskOrder,
    start_azimuth:             startAzimuth,
    final_azimuth:             azimuth,
    final_elevation:           elevation,
    axis_category:             getAxisCategory(azimuth),
    feature_category:          getFeatureCategory(meta, azimuth, elevation),
    symmetry_readable:         isSymmetric ? isSymmetryReadable(azimuth) : 'N/A',
    confirmation_latency:      confirmLat,
    cumulative_rotation_steps: leftRightCount,
    azimuth_coverage_deg:      visitedAzimuthBins.size * STEP_DEG,
    up_down_count:             upDownCount,
    left_right_count:          leftRightCount,
    dwell_ratio_end_on:            dwellRatios.end_on,
    dwell_ratio_side_on:           dwellRatios.side_on,
    dwell_ratio_oblique:           dwellRatios.oblique,
    dwell_ratio_symmetry_readable: isSymmetric ? dwellRatios.symmetry_readable : 'N/A',
    timestamp:                 Date.now(),
  };

  fetch('/api/record_view', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(record),
  }).catch(() => {});

  if (trajectorySamples.length > 0) {
    fetch('/api/sample_log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        participant_id: participantId,
        experiment:     EXPERIMENT,
        task:           blockTask[currentBlock],
        object_id:      trial.name,
        trial_index:    currentLocalIdx,
        samples:        trajectorySamples,
      }),
    }).catch(() => {});
  }

  lastCompletedLocalIdx = currentLocalIdx;
  afterTrialRecorded();
}

function afterTrialRecorded() {
  const blockSize = blockObjects[currentBlock].length;

  if (lastCompletedLocalIdx === blockSize) {
    finishBlock();
    return;
  }
  if (probeSchedule[currentBlock].has(lastCompletedLocalIdx)) {
    pendingNextLocalIdx = lastCompletedLocalIdx + 1;
    blockProbeCount[currentBlock]++;
    showModule('probe');
    return;
  }
  startTrialAtLocal(lastCompletedLocalIdx + 1);
}

function postBlockEvent(blockIndex) {
  fetch('/api/block_event', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      participant_id: participantId,
      experiment:     EXPERIMENT,
      block_index:    blockIndex,
      task:           TASKS[blockTask[blockIndex]].key,
      task_order:     taskOrder,
      ...blockEvents[blockIndex],
    }),
  }).catch(() => {});
}

function finishBlock() {
  blockEvents[currentBlock].block_end_ms = Date.now();
  postBlockEvent(currentBlock);

  if (currentBlock === 1) {
    showRestPage();
  } else {
    showModule('end');
  }
}

// ── REST PAGE (plan §3.6 — only between block 1 and block 2) ─────────
const btnContinueRest  = document.getElementById('btn-continue-rest');
const elRestCountdown  = document.getElementById('rest-countdown');
let restPageActive = false;
let restUnlocked = false;
let restCountdownInterval = null;

function showRestPage() {
  blockEvents[2].rest_start_ms = Date.now();
  showModule('rest');
  restPageActive = true;
  restUnlocked = false;
  btnContinueRest.disabled = true;

  // Forced 30 s countdown (plan §3.6, 2026-07-17): Enter/Continue are inert
  // until it reaches zero, then both unlock.
  let secondsLeft = REST_COUNTDOWN_SEC;
  elRestCountdown.textContent = `Suggested rest time remaining: ${secondsLeft}s`;
  clearInterval(restCountdownInterval);
  restCountdownInterval = setInterval(() => {
    secondsLeft--;
    if (secondsLeft > 0) {
      elRestCountdown.textContent = `Suggested rest time remaining: ${secondsLeft}s`;
    } else {
      clearInterval(restCountdownInterval);
      restUnlocked = true;
      btnContinueRest.disabled = false;
      elRestCountdown.textContent = 'You can press Enter or click Continue at any time.';
    }
  }, 1000);
}

function continueFromRest() {
  if (!restPageActive || !restUnlocked) return;
  restPageActive = false;
  clearInterval(restCountdownInterval);
  blockEvents[2].rest_end_ms = Date.now();
  showInstructionPage(2);
}

btnContinueRest.addEventListener('click', continueFromRest);

// ── INSTRUCTION PAGE (plan §3.6 — precedes every block, incl. block 1) ─
function showInstructionPage(blockIndex) {
  currentBlock = blockIndex;
  const task = TASKS[blockTask[blockIndex]];
  document.getElementById('instruction-title').textContent = task.title;
  document.getElementById('instruction-text').textContent  = task.text;
  showModule('instruction');
}

document.getElementById('btn-begin-block').addEventListener('click', () => {
  const blockIndex = currentBlock;
  blockEvents[blockIndex].instruction_confirm_ms = Date.now();
  blockEvents[blockIndex].block_start_ms         = Date.now();
  probeSchedule[blockIndex]   = buildProbeSchedule(blockObjects[blockIndex].length);
  blockProbeCount[blockIndex] = 0;
  startTrialAtLocal(1);
});

// ── KEY HANDLING ──────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) e.preventDefault();
  if (!KEY_REPEAT && e.repeat) return; // plan §3.3/§3.5: ignore key repeat, each step is a discrete press

  if (e.key === 'Enter') {
    if (elModuleWelcome.style.display !== 'none') { startSession(); return; }
    if (restPageActive) { continueFromRest(); return; }
    confirmTrial();
    return;
  }
  if (!inTrial || isProcessing) return;

  switch (e.key) {
    case 'ArrowLeft':
      azimuth = (azimuth - STEP_DEG + 360) % 360;
      leftRightCount++;
      visitedAzimuthBins.add(azimuth);
      if (leftRightCount >= EFFECTIVE_MIN_ROTATION_STEPS) criterionMet = true;
      applyRotation();
      updateConfirmPrompt();
      break;
    case 'ArrowRight':
      azimuth = (azimuth + STEP_DEG) % 360;
      leftRightCount++;
      visitedAzimuthBins.add(azimuth);
      if (leftRightCount >= EFFECTIVE_MIN_ROTATION_STEPS) criterionMet = true;
      applyRotation();
      updateConfirmPrompt();
      break;
    case 'ArrowUp':
      // Elevation steps intentionally do NOT count toward the rotation criterion (plan §3.3 anti-gaming requirement)
      if (elevation > -ELEV_MAX) { elevation -= STEP_DEG; upDownCount++; applyRotation(); }
      break;
    case 'ArrowDown':
      if (elevation < ELEV_MAX) { elevation += STEP_DEG; upDownCount++; applyRotation(); }
      break;
  }
});

// ── PROBE HANDLING (plan §3.4) ─────────────────────────────────────────
document.querySelectorAll('.probe-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    fetch('/api/probe_result', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        participant_id:     participantId,
        experiment:         EXPERIMENT,
        task:               blockTask[currentBlock],
        block_index:        currentBlock,
        block_probe_index:  blockProbeCount[currentBlock],
        after_trial_index:  lastCompletedLocalIdx,
        answer:             btn.dataset.answer,
        timestamp:          Date.now(),
      }),
    }).catch(() => {});

    startTrialAtLocal(pendingNextLocalIdx);
  });
});

// ── ANTI-INTERRUPTION (plan §7 "第一梯队") ─────────────────────────────
window.addEventListener('beforeunload', (e) => {
  if (!participantId) return; // no session started yet, nothing to protect
  e.preventDefault();
  e.returnValue = '';
});

document.addEventListener('keydown', (e) => {
  const isF5        = e.key === 'F5';
  const isCtrlR      = (e.ctrlKey || e.metaKey) && (e.key === 'r' || e.key === 'R');
  const isCtrlW      = (e.ctrlKey || e.metaKey) && (e.key === 'w' || e.key === 'W');
  const isBackspaceNav = e.key === 'Backspace' &&
    !['INPUT', 'TEXTAREA'].includes((e.target && e.target.tagName) || '');
  if (isF5 || isCtrlR || isCtrlW || isBackspaceNav) {
    e.preventDefault();
  }
}, { capture: true });

// ── START BUTTON ──────────────────────────────────────────────────────
const elStartError = document.getElementById('start-error');
const elPidInput    = document.getElementById('participant-id');
const elPidPrefix   = document.getElementById('participant-id-prefix');

// Participant ID = "Exp1_"/"Exp2_" (auto, from EXPERIMENT) + zero-padded numeric
// code (plan §7, 2026-07-17). The prefix is display-only; the input itself only
// ever holds digits.
const PID_PREFIX = EXPERIMENT === 'exp1' ? 'Exp1_' : 'Exp2_';
elPidPrefix.textContent = PID_PREFIX;
elPidInput.addEventListener('input', () => {
  elPidInput.value = elPidInput.value.replace(/\D/g, '');
});

async function startSession() {
  const rawDigits = (elPidInput.value || '').replace(/\D/g, '');
  if (!rawDigits) {
    if (elStartError) elStartError.textContent = 'Please enter a participant number (digits only).';
    return;
  }
  const candidateId = `${PID_PREFIX}${rawDigits.padStart(3, '0')}`;

  // Duplicate-ID guard (plan §7: "校验 ID 格式与重复")
  try {
    const resp = await fetch(`/api/check_participant?experiment=${EXPERIMENT}&participant_id=${encodeURIComponent(candidateId)}`);
    const data = await resp.json();
    if (data && data.exists) {
      if (elStartError) elStartError.textContent = `Participant ID "${candidateId}" already has data on this machine — use a new ID.`;
      return;
    }
  } catch (err) {
    // Server unreachable at this point would fail every subsequent request anyway;
    // proceed rather than blocking the whole session on this check.
  }

  participantId = candidateId;
  const lastDigit = parseInt(rawDigits.slice(-1), 10); // from the numeric code, not the Exp1_/Exp2_ prefix
  taskOrder = lastDigit % 2 === 1 ? 'T1T2' : 'T2T1'; // odd = T1 first, even = T2 first (plan §3.1)

  await metadataReady; // make sure objects_metadata.json has resolved before building blocks
  buildBlocks(taskOrder);
  showModule('practice-intro'); // one-off practice trial precedes block 1's instruction page (plan §3.3b)
}

document.getElementById('btn-start').addEventListener('click', startSession);
document.getElementById('btn-begin-practice').addEventListener('click', startPracticeTrial);
