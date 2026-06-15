import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { EXRLoader } from 'three/addons/loaders/EXRLoader.js';

// http://localhost:5180/view-selection.html 
// 前端：npm run dev
// 后端：python server.py

// ── CONSTANTS ────────────────────────────────────────────────────────
const STEP_DEG    = 5;
const ELEV_MAX    = 30;
const EXPLORE_SEC = 50;
const CONFIRM_SEC = 10;
const PROBE_EVERY = 6;
// Long axis of objects is Blender X → Three.js X after GLTF export.
// Rotate -90° around world Y so the long axis points toward the camera (+Z) at azimuth 0°
// → azimuth 0° = short-side view, 90°/270° = long-side view
const INITIAL_Y = -Math.PI / 2;

const TASKS = {
  T1: {
    title: 'Representation Task',
    text:   'Suppose you were making a brochure and you tried to give your customers the best possible impression of the objects shown on the screen. Which views would you choose?',
    banner: 'Choose the view that best represents the object for a brochure.',
  },
  T2: {
    title: 'Recognition Task',
    text:   'Please choose the view that you think would help you recognise this object best later.',
    banner: 'Choose the view that would best help you recognise this object later.',
  },
};

// ── OBJECT DISCOVERY ─────────────────────────────────────────────────
// public/ files are served at root — URLs must be /Objects/... not /public/Objects/...
const allObjects = [];
for (let i = 1; i <= 6; i++) {
  for (const level of ['low', 'medium', 'high']) {
    const name   = `object0${i}_${level}`;
    const baseId = `object0${i}`;
    allObjects.push({ filename: `${name}.glb`, name, url: `/Objects/${name}.glb`, baseId, level });
  }
}
allObjects.sort((a, b) => a.name.localeCompare(b.name));

// ── THREE.JS SETUP ────────────────────────────────────────────────────
const scene    = new THREE.Scene();
const camera   = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 0.3, 7);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace    = THREE.SRGBColorSpace;
renderer.toneMapping         = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
document.body.appendChild(renderer.domElement);

// Lights
scene.add(new THREE.HemisphereLight(0xffffff, 0xe0e0e0, 0.8));
function addLight(x, y, z, intensity) {
  const l = new THREE.DirectionalLight(0xffffff, intensity);
  l.position.set(x, y, z);
  scene.add(l);
}
addLight(-5, 4, 3, 2.0);
addLight( 3, 2, 2, 1.0);

// HDR — background + environment reflections
const pmrem = new THREE.PMREMGenerator(renderer);
pmrem.compileEquirectangularShader();
new EXRLoader()
  .setDataType(THREE.FloatType)
  .setPath('/hdrs/')
  .load('table_mountain_1_puresky_4k.exr', (tex) => {
    const envMap = pmrem.fromEquirectangular(tex).texture;
    scene.background  = envMap;
    scene.environment = envMap;
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
let trialSequence  = [];
let currentBlock   = 1;
let currentTrialIdx = -1;
let pendingProbeAfter = 0;

let model       = null;
let azimuth     = 0;   // degrees 0–360
let elevation   = 0;   // degrees −30…+30
let startAzimuth   = 0;
let upDownCount    = 0;
let leftRightCount = 0;

// azimuth zone dwell tracking (sampled every 100 ms during 50-s explore phase)
let zoneSamples     = { short: 0, long: 0, oblique: 0 };
let zoneInterval    = null;

let timerInterval   = null;
let timeLeft        = EXPLORE_SEC;
let confirmReady    = false;
let inTrial         = false;
let isProcessing    = false;

// ── CONSTRAINED SHUFFLE ───────────────────────────────────────────────
function constrainedShuffle(arr, keyFn) {
  for (let attempt = 0; attempt < 300; attempt++) {
    const s = [...arr].sort(() => Math.random() - 0.5);
    let ok = true;
    for (let i = 1; i < s.length; i++) {
      if (keyFn(s[i]) === keyFn(s[i - 1])) { ok = false; break; }
    }
    if (ok) return s;
  }
  // Greedy fallback
  const groups = new Map();
  arr.forEach(item => {
    const k = keyFn(item);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(item);
  });
  groups.forEach(g => g.sort(() => Math.random() - 0.5));
  const result = [];
  const pool   = [...groups.values()].sort(() => Math.random() - 0.5);
  while (result.length < arr.length) {
    let placed = false;
    for (let i = 0; i < pool.length; i++) {
      if (pool[i].length > 0 &&
          (result.length === 0 || keyFn(result[result.length - 1]) !== keyFn(pool[i][0]))) {
        result.push(pool[i].shift());
        pool.sort(() => Math.random() - 0.5);
        placed = true;
        break;
      }
    }
    if (!placed) { // forced (shouldn't happen with 10 groups of 3)
      const g = pool.find(p => p.length > 0);
      if (g) result.push(g.shift());
    }
  }
  return result;
}

// ── SEQUENCE BUILDER ──────────────────────────────────────────────────
function buildTrialSequence(taskOrder) {
  const [t1, t2] = taskOrder === 'T1T2' ? ['T1', 'T2'] : ['T2', 'T1'];
  const block1   = constrainedShuffle(allObjects, o => o.baseId).map(o => ({ ...o, task: t1, block: 1 }));
  const block2   = constrainedShuffle(allObjects, o => o.baseId).map(o => ({ ...o, task: t2, block: 2 }));
  return [...block1, ...block2];
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

// ── ROTATION ENGINE ───────────────────────────────────────────────────
function applyRotation() {
  if (!model) return;
  model.rotation.order = 'YXZ';
  model.rotation.y = INITIAL_Y + THREE.MathUtils.degToRad(azimuth);
  model.rotation.x = THREE.MathUtils.degToRad(elevation);
  model.rotation.z = 0;
}

// ── TIMER ─────────────────────────────────────────────────────────────
const elTimer   = document.getElementById('timer-display');
const elConfirm = document.getElementById('confirm-prompt');

function azimuthZone(az) {
  const a = ((az % 360) + 360) % 360;
  if ((a <= 22.5 || a >= 337.5) || (a >= 157.5 && a <= 202.5)) return 'short';
  if ((a >= 67.5 && a <= 112.5) || (a >= 247.5 && a <= 292.5)) return 'long';
  return 'oblique';
}

function stopZoneSampling() {
  clearInterval(zoneInterval);
  zoneInterval = null;
}

function startTimer() {
  timeLeft        = EXPLORE_SEC;
  confirmReady    = false;
  zoneSamples     = { short: 0, long: 0, oblique: 0 };
  elTimer.textContent     = timeLeft;
  elTimer.style.display   = 'block';
  elConfirm.style.display = 'none';
  clearInterval(timerInterval);
  stopZoneSampling();

  // Zone sampling every 100 ms during exploration
  zoneInterval = setInterval(() => { zoneSamples[azimuthZone(azimuth)]++; }, 100);

  timerInterval = setInterval(() => {
    timeLeft--;
    elTimer.textContent = timeLeft;
    if (timeLeft <= 0) {
      clearInterval(timerInterval);
      stopZoneSampling();
      startConfirmPhase();
    }
  }, 1000);
}

function startConfirmPhase() {
  confirmReady = true;
  elConfirm.style.display = 'block';
  let confirmTimeLeft = CONFIRM_SEC;
  elTimer.textContent = confirmTimeLeft;
  timerInterval = setInterval(() => {
    confirmTimeLeft--;
    elTimer.textContent = confirmTimeLeft;
    if (confirmTimeLeft <= 0) {
      clearInterval(timerInterval);
      confirmTrial();
    }
  }, 1000);
}

// ── MODULE SWITCHING ──────────────────────────────────────────────────
const elBanner  = document.getElementById('instruction-banner');
const elCounter = document.getElementById('trial-counter');

function showModule(name) {
  ['welcome', 'instruction', 'probe', 'end'].forEach(m => {
    document.getElementById(`module-${m}`).style.display = m === name ? 'flex' : 'none';
  });
  const active = name === 'trial';
  elBanner.style.display  = active ? 'block' : 'none';
  elCounter.style.display = active ? 'block' : 'none';
  if (!active) {
    clearInterval(timerInterval);
    stopZoneSampling();
    elTimer.style.display   = 'none';
    elConfirm.style.display = 'none';
  }
  inTrial = active;
}

// ── TRIAL FLOW ────────────────────────────────────────────────────────
function startBlock(blockNum) {
  currentBlock = blockNum;
  const task = trialSequence.find(t => t.block === blockNum).task;
  document.getElementById('instruction-title').textContent = TASKS[task].title;
  document.getElementById('instruction-text').textContent  = TASKS[task].text;
  showModule('instruction');
}

function startTrial(idx) {
  currentTrialIdx = idx;
  isProcessing    = false;
  confirmReady    = false;
  upDownCount     = 0;
  leftRightCount  = 0;

  const trial = trialSequence[idx];
  const task  = trial.task;

  startAzimuth = Math.random() < 0.5 ? 30 : 330;
  azimuth      = startAzimuth;
  elevation    = 0;

  elBanner.textContent  = TASKS[task].banner;
  elCounter.textContent = `Trial ${idx + 1} / ${trialSequence.length}`;
  showModule('trial');
  loadTrialModel(trial);
  startTimer();
}

function confirmTrial() {
  if (!confirmReady || isProcessing || !inTrial) return;
  isProcessing = true;
  inTrial      = false;
  clearInterval(timerInterval);

  const trial      = trialSequence[currentTrialIdx];
  const total      = upDownCount + leftRightCount;
  const totalZone  = zoneSamples.short + zoneSamples.long + zoneSamples.oblique;
  const msPerSample = 100;

  fetch('/api/record_view', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type:           'final',
      participantId,
      task:           trial.task,
      block:          trial.block,
      trialNumber:    currentTrialIdx + 1,
      objectName:     trial.name,
      baseId:         trial.baseId,
      level:          trial.level,
      startAzimuth,
      finalAzimuth:   azimuth,
      finalElevation: elevation,
      upDownCount,
      leftRightCount,
      upDownRatio:    total > 0 ? +(upDownCount    / total).toFixed(4) : 0,
      leftRightRatio: total > 0 ? +(leftRightCount / total).toFixed(4) : 0,
      timeShortSide:  zoneSamples.short   * msPerSample,
      timeLongSide:   zoneSamples.long    * msPerSample,
      timeOblique:    zoneSamples.oblique * msPerSample,
      ratioShortSide: totalZone > 0 ? +(zoneSamples.short   / totalZone).toFixed(4) : 0,
      ratioLongSide:  totalZone > 0 ? +(zoneSamples.long    / totalZone).toFixed(4) : 0,
      ratioOblique:   totalZone > 0 ? +(zoneSamples.oblique / totalZone).toFixed(4) : 0,
      timestamp:      Date.now(),
    }),
  }).catch(() => {});

  nextStep();
}

function nextStep() {
  const next = currentTrialIdx + 1;
  const half = trialSequence.length / 2;

  if (next % PROBE_EVERY === 0) {
    pendingProbeAfter = next;
    showModule('probe');
    return;
  }
  if (next >= trialSequence.length) {
    showModule('end');
    return;
  }
  startTrial(next);
}

// ── KEY HANDLING ──────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)) e.preventDefault();
  if (e.repeat) return;   // ignore OS key-repeat; each physical press = one step

  if (e.key === 'Enter') { confirmTrial(); return; }
  if (!inTrial || isProcessing) return;

  switch (e.key) {
    case 'ArrowLeft':
      azimuth = (azimuth - STEP_DEG + 360) % 360;
      leftRightCount++;
      applyRotation();
      break;
    case 'ArrowRight':
      azimuth = (azimuth + STEP_DEG) % 360;
      leftRightCount++;
      applyRotation();
      break;
    case 'ArrowUp':
      if (elevation < ELEV_MAX) { elevation += STEP_DEG; upDownCount++; applyRotation(); }
      break;
    case 'ArrowDown':
      if (elevation > -ELEV_MAX) { elevation -= STEP_DEG; upDownCount++; applyRotation(); }
      break;
  }
});

// ── PROBE HANDLING ────────────────────────────────────────────────────
document.querySelectorAll('.probe-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    fetch('/api/probe_result', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        participantId,
        afterTrial: pendingProbeAfter,
        answer:     btn.dataset.answer,
        timestamp:  Date.now(),
      }),
    }).catch(() => {});

    const next = pendingProbeAfter;
    const half = trialSequence.length / 2;
    if (next >= trialSequence.length) {
      showModule('end');
    } else if (next === half) {
      startBlock(2);
    } else {
      startTrial(next);
    }
  });
});

// ── BLOCK INSTRUCTION CONTINUE ────────────────────────────────────────
document.getElementById('btn-begin-block').addEventListener('click', () => {
  const startIdx = (currentBlock - 1) * (trialSequence.length / 2);
  startTrial(startIdx);
});

// ── START BUTTON ──────────────────────────────────────────────────────
document.getElementById('btn-start').addEventListener('click', () => {
  const raw = (document.getElementById('participant-id').value || '').trim();
  participantId    = raw.toUpperCase() || `P-${Date.now()}`;
  const digits     = participantId.replace(/\D/g, '');
  const lastDigit  = digits.length > 0 ? parseInt(digits.slice(-1)) : 0;
  const taskOrder  = lastDigit % 2 === 1 ? 'T1T2' : 'T2T1';
  trialSequence    = buildTrialSequence(taskOrder);
  startBlock(1);
});
