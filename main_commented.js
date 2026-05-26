/**
 * ============================================================
 * 总体说明 / OVERVIEW
 * ============================================================
 *
 * 这是一个基于 Three.js 的 **认知心理学 / HCI 实验** 前端程序。
 * 整个实验分为两个阶段：
 *
 * 【第一阶段：学习阶段 (main module)】
 *   - 每次随机加载一个 3D 物体（GLB 格式），呈现给被试（参与者）。
 *   - 被试可以用键盘方向键旋转该物体，每次旋转 5°。
 *   - 每一步旋转都会记录：旋转前/后角度、动作类型、时间戳，并通过 POST
 *     请求上传到后端 API（/api/record）。
 *   - 每个物体有固定步数限制（countdown），到达上限后显示"Next"按钮。
 *   - 共展示 16 个物体，全部看完后自动进入第二阶段。
 *
 * 【第二阶段：记忆测试阶段 (end module)】
 *   - 从"看过"和"没看过"的物体中各随机抽取若干张截图。
 *   - 被试需要勾选自己认为"看过"的图片。
 *   - 提交后显示正误，并将结果上传到 /api/memory_result。
 *   - 可以进行多轮记忆测试，之后可重新开始实验。
 *
 * 技术栈：Three.js（3D渲染）、GLTFLoader（加载模型）、EXRLoader（环境贴图）、
 *         原生 fetch API（与后端通信）、localStorage（会话持久化）。
 * ============================================================
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { EXRLoader } from 'three/addons/loaders/EXRLoader.js';


// ============================================================
// 工具函数区：角度转换 / UTILITY FUNCTIONS: Angle Conversion
// ============================================================

/**
 * toDegNorm(rad)
 * 将弧度转换为 0~360° 范围内的角度（标准化，无负数）。
 * 例如：-10° → 350°
 * @param {number} rad - 弧度值
 * @returns {number} 0~360 范围内的角度
 */
function toDegNorm(rad) {
  const deg = THREE.MathUtils.radToDeg(rad);
  return (deg % 360 + 360) % 360;
}

/**
 * wrap180(deg)
 * 将任意角度"折叠"到 -180~180° 范围内。
 * 用于计算旋转前后的角度差（delta），
 * 例如：350° - 10° 的差值应该是 -20°（而不是 340°）。
 * @param {number} deg - 任意角度值
 * @returns {number} -180~180 范围内的等效角度
 */
function wrap180(deg) {
  return ((deg + 180) % 360 + 360) % 360 - 180;
}

/**
 * getWorldYPRDeg(obj)
 * 从 Three.js 3D 对象中提取世界坐标系下的 偏航(Yaw)、俯仰(Pitch)、翻滚(Roll)。
 * 使用 YXZ 欧拉角顺序：Y轴=偏航，X轴=俯仰，Z轴=翻滚。
 * 返回值均为 0~360° 的标准化角度。
 * @param {THREE.Object3D} obj - Three.js 场景对象
 * @returns {{ yaw: number, pitch: number, roll: number }}
 */
function getWorldYPRDeg(obj) {
  const q = new THREE.Quaternion();
  obj.getWorldQuaternion(q);
  const e = new THREE.Euler(0, 0, 0, 'YXZ');
  e.setFromQuaternion(q, 'YXZ');
  return { yaw: toDegNorm(e.y), pitch: toDegNorm(e.x), roll: toDegNorm(e.z) };
}


// ============================================================
// 会话管理 / SESSION MANAGEMENT
// ============================================================

/**
 * sessionId：唯一标识本次实验运行的 ID。
 * 使用 localStorage 持久化存储，确保刷新页面后同一被试的数据仍归属同一会话。
 * 格式示例：RUN-1716000000000
 * 如需手动指定被试编号（如 P001），可改用 getOrCreateSessionId()。
 */
let sessionId = localStorage.getItem('sessionId') || `RUN-${Date.now()}`;
localStorage.setItem('sessionId', sessionId);

/**
 * getOrCreateSessionId()
 * 可选的交互式会话 ID 获取方式。
 * 如果 localStorage 中没有存储，会弹出 prompt 框让实验员输入被试编号。
 * 适用于需要手动管理被试编号的实验场景。
 * 目前此函数已定义但未被使用（sessionId 直接在上方初始化）。
 */
function getOrCreateSessionId() {
  let id = localStorage.getItem('sessionId');
  if (!id) {
    id = prompt("Enter Session ID (e.g., P001, TestA, etc.):");
    if (!id) {
      id = `run-${Date.now()}`; // 用户取消时的兜底值
    }
    localStorage.setItem('sessionId', id);
  }
  return id;
}


// ============================================================
// 模型资源自动发现 / AUTO-DISCOVERY OF ASSETS
// ============================================================

/**
 * Vite 的 import.meta.glob 在构建时静态扫描 /public/models/ 下的所有 .glb 文件，
 * 并将其路径和 URL 映射为一个数组：discoveredModels。
 * - nameToUrl：文件名 → 可访问 URL 的映射表（用于 loadModel）
 * - modelList：所有模型文件名组成的字符串数组
 */
const modules = import.meta.glob('/public/models/*.glb', { as: 'url', eager: true });
const discoveredModels = Object.entries(modules).map(([path, url]) => {
  const name = path.split('/').pop();
  return { name, url };
});
const nameToUrl = new Map(discoveredModels.map(m => [m.name, m.url]));
const modelList = discoveredModels.map(m => m.name);
console.log(`✅ Discovered ${modelList.length} models:`, modelList[1]);

/**
 * 同样地，自动发现 /public/output_pngs/ 下的所有 .png 截图文件。
 * 这些截图是各个模型的预渲染图，用于记忆测试阶段展示给被试看。
 * - nameToUrl_screenshot：文件名 → URL 的映射表
 * - modelList_screenshot：所有截图文件名数组
 */
const modules_screenshot = import.meta.glob('/public/output_pngs/*.png', { as: 'url', eager: true });
const discoveredModels_screenshot = Object.entries(modules_screenshot).map(([path, url]) => {
  const name = path.split('/').pop();
  return { name, url };
});
const nameToUrl_screenshot = new Map(discoveredModels_screenshot.map(m => [m.name, m.url]));
const modelList_screenshot = discoveredModels_screenshot.map(m => m.name);
console.log(`✅ Discovered ${modelList_screenshot.length} models:`, modelList_screenshot[1]);


// ============================================================
// 实验状态变量 / EXPERIMENT STATE VARIABLES
// ============================================================

let model = null;                  // 当前场景中加载的 3D 模型对象
let countdown = 90;                // 当前物体剩余可操作步数（每次旋转 -1）
let countdownInterval = null;      // 倒计时定时器句柄（保留但暂未使用自动倒计时）
let autoSwitchTimeout = null;      // 自动切换模型的定时器句柄（保留）
let currentModelName = '';         // 当前正在展示的模型文件名
const loader = new GLTFLoader();   // Three.js GLB 模型加载器
let interactionCount = 0;          // 已交互的模型数量（当前未直接使用，由 currentIndex 代替）
const maxInteractions = 16;        // 每轮实验最多展示的模型数量
let memoryTestRound = 1;           // 当前是第几轮记忆测试（1 或 2）

// ============================================================
// Three.js 场景初始化 / SCENE SETUP
// ============================================================

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xcfcfcf); // 默认灰色背景（会被 EXR 环境贴图覆盖）

// 模型序列相关状态
let modelSequence = [];            // 当前轮次打乱后的模型列表（16 个）
let seenModels = [];               // 已经展示过的模型名称（跨轮次累积）
let testModels = modelList.filter(m => m.startsWith('Foil')); // "干扰项"模型（名称以 Foil 开头，用于记忆测试）
let currentIndex = 0;              // modelSequence 中当前已展示到第几个

/**
 * resetModelSequence()
 * 重置并重新生成本轮实验的模型展示序列。
 * 逻辑：
 *   1. 从所有模型中排除"已看过"和以 'Foil' 开头的干扰项。
 *   2. 取前 16 个，做 Fisher-Yates 随机打乱。
 *   3. 重置 currentIndex 并刷新 UI 计数器。
 */
function resetModelSequence() {
  const remainingModels = modelList.filter(m => !seenModels.includes(m) && !m.startsWith('Foil'));
  modelSequence = [...remainingModels].slice(0, 16);
  // Fisher-Yates 洗牌算法：保证均匀随机
  for (let i = modelSequence.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [modelSequence[i], modelSequence[j]] = [modelSequence[j], modelSequence[i]];
  }
  currentIndex = 0;
  updateObjectsLeftUI();
}

/**
 * updateObjectsLeftUI()
 * 更新页面上"还剩 N 个物体"的提示文本。
 * 只在主实验模块（module-main）可见时显示。
 */
function updateObjectsLeftUI() {
  const el = document.getElementById('objects-left');
  if (!el) return;
  const total = Math.min(16, modelSequence.length || 16);
  const left = Math.max(0, total - currentIndex);
  el.textContent = `${left} object${left === 1 ? '' : 's'} left`;
  const mainVisible = document.getElementById('module-main')?.style.display !== 'none';
  el.style.display = mainVisible ? 'block' : 'none';
}


// ============================================================
// 场景灯光与地面 / LIGHTING & GROUND PLANE
// ============================================================

// 添加地面平面（接受阴影投射）
const plane = new THREE.Mesh(
  new THREE.PlaneGeometry(40, 40),
  new THREE.MeshPhongMaterial({ color: 0xcbcbcb, specular: 0x474747 })
);
plane.rotation.x = -Math.PI / 2; // 旋转 90° 使平面水平
plane.position.y = -20;           // 向下偏移，避免遮挡模型
plane.receiveShadow = true;
scene.add(plane);

// 半球光：提供柔和的天空/地面环境光，模拟自然漫射
scene.add(new THREE.HemisphereLight(0xffffff, 0xe0e0e0, 0.8));

// 主阳光（来自左后上方）+ 补充光（来自右侧）
addShadowedLight(-10, 2, 3, 0xffffff, 2.8);
addShadowedLight(2, 1, 2, 0xffffff, 1.5);

/**
 * addShadowedLight(x, y, z, color, intensity)
 * 在指定位置创建一个支持阴影投射的方向光（DirectionalLight）。
 * 配置了高分辨率阴影贴图（2048×2048）和宽阔的阴影投影范围，
 * 并设置了轻微的 shadow bias 以减少"阴影痘"（shadow acne）。
 * @param {number} x, y, z - 光源世界坐标
 * @param {number|string} color - 光源颜色（十六进制）
 * @param {number} intensity - 光源强度
 * @returns {THREE.DirectionalLight}
 */
function addShadowedLight(x, y, z, color, intensity) {
  const directionalLight = new THREE.DirectionalLight(color, intensity);
  directionalLight.position.set(x, y, z);
  directionalLight.castShadow = true;
  directionalLight.shadow.mapSize.set(2048, 2048);
  const d = 10;
  directionalLight.shadow.camera.left   = -d;
  directionalLight.shadow.camera.right  =  d;
  directionalLight.shadow.camera.top    =  d;
  directionalLight.shadow.camera.bottom = -d;
  directionalLight.shadow.camera.near   = 0.1;
  directionalLight.shadow.camera.far    = 50;
  directionalLight.shadow.bias = -0.0005;
  scene.add(directionalLight);
  return directionalLight;
}


// ============================================================
// 渲染器与相机 / RENDERER & CAMERA
// ============================================================

// 透视相机：FOV=75°，近截面=0.1，远截面=1000
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 0, 1); // 相机初始位于原点前方 1 单位

// WebGL 渲染器：开启抗锯齿，保留绘图缓冲区（用于截图）
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// 颜色空间与色调映射配置，使渲染结果更接近真实摄影效果
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping; // 电影级色调曲线
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap; // 软阴影

// 渲染循环：每帧调用一次 renderer.render
renderer.setAnimationLoop(() => {
  renderer.render(scene, camera);
});


// ============================================================
// 环境贴图（HDR）/ ENVIRONMENT MAP (EXR HDR)
// ============================================================

/**
 * 使用 PMREMGenerator 将 EXR 格式的高动态范围全景图转换为环境贴图。
 * 同时用作场景背景（scene.background）和 PBR 材质的间接照明（scene.environment）。
 * 文件路径：/hdrs/table_mountain_1_puresky_4k.exr
 */
const pmrem = new THREE.PMREMGenerator(renderer);
pmrem.compileEquirectangularShader();

new EXRLoader()
  .setDataType(THREE.FloatType)
  .setPath('/hdrs/')
  .load('table_mountain_1_puresky_4k.exr', (exrTex) => {
    const envMap = pmrem.fromEquirectangular(exrTex).texture;
    scene.environment = envMap;
    scene.background = envMap;
    exrTex.dispose(); // 原始纹理已转换，释放内存
  }, undefined, (err) => {
    console.error('❌ exr 加载失败:', err);
  });


// ============================================================
// 工具函数：确定性哈希 / UTILITY: Deterministic Hash
// ============================================================

/**
 * hashString(str)
 * 对字符串计算一个简单的确定性哈希值（非加密用途）。
 * 用于为每个模型生成固定的初始旋转角度，确保同一模型每次加载时
 * 呈现角度一致，排除随机初始姿态对实验结果的影响。
 * @param {string} str - 输入字符串（通常是模型文件名）
 * @returns {number} 非负整数哈希值
 */
function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) >>> 0; // 无符号右移确保非负
  }
  return hash;
}


// ============================================================
// 记忆测试初始化（旧版）/ MEMORY TEST INIT (Legacy)
// ============================================================

/**
 * window.showModelList()
 * 早期版本的记忆测试入口函数（已被 renderMemoryTest 取代，但保留兼容）。
 * 从"看过"和"没看过"的模型中各随机抽取 4 个，共 8 张截图展示给被试，
 * 并生成带复选框的表单让被试选择"我看过这个"。
 * 结果不在此函数中提交，仅渲染 UI。
 */
window.showModelList = () => {
  const listEl = document.getElementById('shown-models-list');
  const imageEl = document.getElementById('shown-models-images');
  if (!listEl || !imageEl) return;

  const topModels = modelSequence.slice(0, 16);
  const unseenModels = modelList.filter(name => !topModels.includes(name));

  const seenSubset = [...topModels].sort(() => Math.random() - 0.5).slice(0, 4);
  const unseenSubset = [...unseenModels].sort(() => Math.random() - 0.5).slice(0, 4);
  const testSet = [...seenSubset, ...unseenSubset].sort(() => Math.random() - 0.5);

  imageEl.innerHTML = `
    <form id="guess-form">
      <div style="display: flex; flex-wrap: wrap; gap: 20px; justify-content: center;">
        ${testSet.map((name, index) => {
          const imgName = name.replace('.glb', '.png');
          return `
            <div class="guess-block" data-model="${name}" style="flex: 0 1 calc(20% - 10px); text-align: center;">
              <img src="./public/output_pngs/${imgName}" style="width: 100%; max-width: 400px;" />
              <div style="margin-top: 5px;">
                <label>
                  <input type="checkbox" name="guess-${index}" />
                  I have seen this
                </label>
              </div>
              <div class="result-text" style="margin-top: 4px; height: 18px;"></div>
            </div>
          `;
        }).join('')}
      </div>
      <div style="text-align:center; margin-top: 10px;">
        <button type="submit">Submit</button>
      </div>
    </form>
  `;
};


// ============================================================
// 后端通信 / BACKEND COMMUNICATION
// ============================================================

/**
 * sendInitRow(name, init)
 * 当一个新模型加载完成后，向后端发送该模型的初始角度信息。
 * actionId = -1 表示这是初始状态行（区别于每次旋转的记录行）。
 * 采用 fire-and-forget 模式（不 await），不阻塞模型加载流程。
 * @param {string} name - 模型文件名
 * @param {{ yaw: number, pitch: number }} init - 模型初始偏航和俯仰角
 */
async function sendInitRow(name, init) {
  try {
    const res = await fetch('api/record', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        modelName: name,
        actionId: -1,        // -1 表示初始状态，不是一次旋转操作
        initialAngles: { yaw: init.yaw, pitch: init.pitch },
        s_t_img: '',
        s_t1_img: '',
        imgData1: 'data:image/png;base64,',
        imgData2: 'data:image/png;base64,'
      })
    });
    if (!res.ok) throw new Error('Upload failed');
  } catch (e) {
    console.warn('Init row POST failed (non-fatal):', e);
  }
}


// ============================================================
// 模型加载 / MODEL LOADING
// ============================================================

/**
 * loadModel(name)
 * 根据文件名加载指定的 3D GLB 模型到场景中。
 * 流程：
 *   1. 清除场景中所有之前的模型（userData.isModel 标记）。
 *   2. 用 GLTFLoader 异步加载目标模型。
 *   3. 使用 hashString 为模型生成确定性的初始旋转角度（可重现性）。
 *   4. 记录初始角度并通过 sendInitRow 上传到后端。
 * @param {string} name - 模型文件名（如 "Object_001.glb"）
 */
function loadModel(name) {
  // 清除场景中所有已标记为模型的对象
  scene.children
    .filter(obj => obj.userData?.isModel)
    .forEach(obj => scene.remove(obj));

  currentModelName = name;
  const url = nameToUrl.get(name);
  if (!url) {
    console.error('❌ URL not found for model:', name);
    return;
  }

  loader.load(url, (gltf) => {
    model = gltf.scene;
    model.userData.isModel = true;
    model.scale.set(0.5, 0.5, 0.5);     // 缩小到原尺寸的 50%
    model.position.set(0, 0, -2.5);      // 放置在相机前方 2.5 单位

    // 使用文件名哈希值计算确定性的初始旋转角度（5° 步进）
    const hashX = hashString('test' + name);
    const rotationsX = Math.floor(hashX % (360 / 5) * 5);
    const angleRadX = THREE.MathUtils.degToRad(rotationsX);

    const hashY = hashString('test/' + name);
    const rotationsY = Math.floor(hashY % (360 / 5) * 5);
    const angleRadY = THREE.MathUtils.degToRad(rotationsY);

    model.rotation.set(angleRadX, angleRadY, 0);

    // 记录初始姿态角度并上传（fire-and-forget）
    const init = getWorldYPRDeg(model);
    model.userData.initialAngles = { yaw: init.yaw, pitch: init.pitch };
    sendInitRow(name, init);

    // 再次确认清除旧模型后添加新模型（双重保险）
    scene.children
      .filter(obj => obj.userData?.isModel)
      .forEach(obj => scene.remove(obj));

    scene.add(model);
  }, undefined, (err) => {
    console.error('❌ 模型加载失败:', err);
  });
}


// ============================================================
// 实验流程控制 / EXPERIMENT FLOW CONTROL
// ============================================================

/**
 * loadRandomModel()
 * 从当前打乱的 modelSequence 中按顺序加载下一个模型。
 * 流程逻辑：
 *   - 如果已达到 maxInteractions (16)：进入记忆测试阶段（end module）。
 *   - 如果 modelSequence 已耗尽：进入"模型耗尽"提示页面。
 *   - 否则：取 currentIndex 处的模型名，加载并递增索引，重置倒计时。
 */
function loadRandomModel() {
  if (currentIndex >= maxInteractions) {
    // 16 个模型都展示完毕，切换到记忆测试模块
    currentIndex = 0;
    if (window.showModelList) window.showModelList();
    if (window.switchModule) {
      setTimeout(() => {
        window.switchModule('end');
        if (window.showModelList) window.showModelList();
        renderMemoryTest();
      }, 500);
    }
    return;
  }
  if (currentIndex >= modelSequence.length) {
    console.warn("📛 modelSequence 已经全部加载完");
    window.switchModule('model-run-out');
    return;
  }

  const name = modelSequence[currentIndex];
  console.warn(currentIndex, name);
  currentIndex++;
  updateObjectsLeftUI();
  countdown = 91;          // 重置步数倒计时（实际从 90 开始）
  updateStepCountdownUI();
  loadModel(name);
  seenModels.push(name);   // 记入"已看过"列表
  console.warn(findScreenShot(name));
}

/**
 * window.resetMainModule()
 * 重置主实验模块到初始状态，可用于重新开始一轮实验。
 * 操作：重新生成模型序列、重置所有计数器和倒计时、加载第一个模型。
 * 挂载到 window 上，供 HTML 中的按钮或其他模块调用。
 */
window.resetMainModule = () => {
  resetModelSequence();
  interactionCount = 0;
  currentIndex = 0;
  countdown = 91;
  updateStepCountdownUI();
  loadRandomModel();
  clearInterval(countdownInterval);
  clearTimeout(autoSwitchTimeout);
};

/**
 * generateFilename(groupId, suffix)
 * 生成截图文件名，格式为 "{时间戳-随机数}_{suffix}.png"。
 * 用于标识每次旋转操作前后的截图（s_t_img / s_t1_img）。
 * @param {string} groupId - 唯一的分组 ID（时间戳+随机数）
 * @param {string} suffix - 'before' 或 'after'
 * @returns {string} 文件名字符串
 */
function generateFilename(groupId, suffix) {
  return `${groupId}_${suffix}.png`;
}

// 测试模式标志：为 true 时"Next"按钮始终显示（不依赖倒计时归零）
const TEST_MODE = true;

/**
 * updateStepCountdownUI()
 * 更新页面上的步数倒计时显示，并控制"Next"按钮的可见性。
 * 逻辑：
 *   - 在测试模式（TEST_MODE=true）或步数耗尽时显示 Next 按钮。
 *   - 每次调用将 countdown 减 1，并更新文本显示。
 * 注意：此函数在每次成功记录旋转操作后被调用（非计时器驱动）。
 */
function updateStepCountdownUI() {
  const nextButton = document.getElementById('load-random-model');
  if (TEST_MODE || countdown <= 1) {
    nextButton.style.display = 'block';
  } else {
    nextButton.style.display = 'none';
  }
  const el = document.getElementById('countdown-timer');
  if (countdown <= 0) {
    el.textContent = `${countdown} steps remaining`;
    return;
  } else {
    countdown--;
    if (el) el.textContent = `${countdown} steps remaining`;
  }
}


// ============================================================
// 旋转操作与数据记录 / ROTATION ACTION & DATA RECORDING
// ============================================================

/**
 * getCameraRelativeAxes()
 * 计算相机视角下的"右"和"上"方向向量（世界坐标系中）。
 * 用于将键盘方向键的输入转换为相机视角相对的旋转轴，
 * 确保无论相机朝向如何，"左"键总是让物体向观察者的左边转。
 * @returns {{ cameraRight: THREE.Vector3, cameraUp: THREE.Vector3 }}
 */
function getCameraRelativeAxes() {
  const direction = new THREE.Vector3();
  camera.getWorldDirection(direction);
  const worldUp = new THREE.Vector3(0, 1, 0);
  // 叉积：方向 × 世界上 = 相机右方向
  const cameraRight = new THREE.Vector3().crossVectors(direction, worldUp).normalize();
  // 叉积：相机右 × 方向 = 相机上方向
  const cameraUp = new THREE.Vector3().crossVectors(cameraRight, direction).normalize();
  return { cameraRight, cameraUp };
}

// 防并发锁：防止用户快速连按时多次旋转同时进行
let isProcessing = false;

/**
 * recordStepAndAct(actionId)
 * 核心函数：执行一步旋转操作，并将所有相关数据上传到后端。
 * 
 * 操作 ID 含义：
 *   0 = 向上旋转（绕相机右轴负方向）
 *   1 = 向下旋转（绕相机右轴正方向）
 *   2 = 向左旋转（绕相机上轴负方向）
 *   3 = 向右旋转（绕相机上轴正方向）
 * 
 * 流程：
 *   1. 记录旋转前的角度（before）和时间戳（t_start_ms）。
 *   2. 按 actionId 执行 5° 旋转。
 *   3. 等待 50ms（让渲染帧刷新后再截图）。
 *   4. 记录旋转后的角度（after）和角度变化量（delta）。
 *   5. 通过 POST 请求将所有数据上传到 /api/record。
 * 
 * 注意：截图（imgData1/imgData2）当前已禁用（设为空字符串）以节省带宽，
 *       适用于人类被试阶段；AI 训练阶段可重新启用。
 * 
 * @param {number} actionId - 旋转方向编号（0-3）
 */
async function recordStepAndAct(actionId) {
  if (!model || isProcessing) return; // 防止模型未加载或上一操作未完成
  if (countdown <= 0) return;         // 步数耗尽，不允许继续旋转
  isProcessing = true;

  const t_start_ms = Date.now();
  const before = getWorldYPRDeg(model);

  // 生成本次操作的唯一文件名组 ID
  const modelName = currentModelName;
  const timestamp = Date.now();
  const rand = Math.floor(Math.random() * 1e6);
  const groupId = `${timestamp}-${rand}`;
  const s_t_img = `${groupId}_before.png`;
  const imgData1 = ""; // 截图已禁用（节省带宽）

  // 执行旋转：5° 步进，基于相机视角的相对旋转轴
  const { cameraRight, cameraUp } = getCameraRelativeAxes();
  const step = THREE.MathUtils.degToRad(5);
  switch (actionId) {
    case 0: model.rotateOnWorldAxis(cameraRight, -step); break; // 上键：向上翻
    case 1: model.rotateOnWorldAxis(cameraRight, step); break;  // 下键：向下翻
    case 2: model.rotateOnWorldAxis(cameraUp, -step); break;    // 左键：向左转
    case 3: model.rotateOnWorldAxis(cameraUp, step); break;     // 右键：向右转
  }

  // 等待渲染帧刷新（50ms），确保截图时画面已更新
  await new Promise(resolve => setTimeout(resolve, 50));

  const after = getWorldYPRDeg(model);
  // 计算角度变化量（折叠到 -180~180° 避免跨越 0/360 的歧义）
  const delta = {
    yaw:   wrap180(after.yaw   - before.yaw),
    pitch: wrap180(after.pitch - before.pitch),
  };

  const s_t1_img = generateFilename(groupId, 'after');
  const imgData2 = ""; // 截图已禁用
  const t_end_ms = Date.now();
  const duration_ms = t_end_ms - t_start_ms;

  try {
    const res = await fetch('api/record', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        modelName: currentModelName,
        actionId,
        s_t_img, s_t1_img, imgData1, imgData2,
        afterAngles: { yaw: after.yaw, pitch: after.pitch },
        deltaAngles: { yaw: delta.yaw, pitch: delta.pitch },
        t_start_ms, t_end_ms, duration_ms
      })
    });
    updateStepCountdownUI(); // 成功后更新倒计时 UI
    if (!res.ok) throw new Error('Upload failed');
    console.log(`✅ Recorded: ${modelName}, ${s_t_img}, ${actionId}, ${s_t1_img}`);
  } catch (e) {
    console.error('❌ Recording failed:', e);
  } finally {
    isProcessing = false; // 无论成功失败，解锁以允许下一次操作
  }
}


// ============================================================
// 键盘事件监听 / KEYBOARD EVENT LISTENERS
// ============================================================

/**
 * 键盘控制策略：使用 keyup（松键时触发）而非 keydown（按下时触发）。
 * 原因：避免用户按住方向键时触发大量连续旋转（键盘重复事件）。
 * keydown 仅用于阻止默认的页面滚动行为（e.preventDefault）。
 */

// 阻止方向键默认行为（防止页面上下滚动）
document.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
    e.preventDefault();
    if (e.repeat) return; // 忽略键盘重复事件
  }
});

// 松键时触发旋转操作（一次按键 = 一次 5° 旋转）
document.addEventListener('keyup', (e) => {
  switch (e.key) {
    case 'ArrowUp':    recordStepAndAct(0); break;
    case 'ArrowDown':  recordStepAndAct(1); break;
    case 'ArrowLeft':  recordStepAndAct(2); break;
    case 'ArrowRight': recordStepAndAct(3); break;
  }
});


// ============================================================
// 页面初始化 / DOM CONTENT LOADED
// ============================================================

window.addEventListener('DOMContentLoaded', () => {
  countdown = 90;
  // 绑定"Next"按钮点击事件：加载下一个模型
  const button = document.getElementById('load-random-model');
  if (button) {
    button.addEventListener('click', loadRandomModel);
    updateObjectsLeftUI();
  }
});


// ============================================================
// 截图查找工具函数 / SCREENSHOT LOOKUP UTILITY
// ============================================================

/**
 * findScreenShot(name)
 * 根据模型文件名（.glb）查找对应的截图文件名（.png）。
 * 匹配逻辑：取模型名的"."前缀，在 modelList_screenshot 中找同前缀的文件。
 * 例如：'Object_001.glb' → 'Object_001_preview.png'
 * @param {string} name - 模型文件名
 * @returns {string|null} 截图文件名，找不到时返回 null
 */
function findScreenShot(name) {
  const prefix = name.split('.')[0];
  for (let obj of modelList_screenshot) {
    if (obj.startsWith(prefix)) {
      return obj;
    }
  }
  return null;
}


// ============================================================
// 记忆测试渲染 / MEMORY TEST RENDERING
// ============================================================

/**
 * renderMemoryTest()
 * 渲染记忆识别测试的 UI 界面（第二阶段主函数）。
 * 
 * 测试设计：
 *   - 从展示过的 16 个模型中随机选 4 个（"旧"刺激）。
 *   - 从未展示过的模型中随机选 4 个（"新"刺激）。
 *   - 共 8 张截图随机混合展示，被试需判断哪些是"看过"的。
 * 
 * 支持多轮测试（memoryTestRound）：
 *   - 第 1 轮结束后，可点击按钮进入第 2 轮（重新随机抽取）。
 *   - 第 2 轮结束后，可返回主实验模块重新开始。
 * 
 * 结果提交由页面级的 submit 事件监听器处理（见下方 document.body.addEventListener）。
 */
function renderMemoryTest() {
  const topModels = modelSequence.slice(0, 16); // 本轮展示过的模型
  const unseenModels = modelList.filter(name => !topModels.includes(name)); // 未展示的模型

  const seenSubset = [...topModels].sort(() => Math.random() - 0.5).slice(0, 4);
  const testSubSet = [...unseenModels].sort(() => Math.random() - 0.5).slice(0, 4); // 干扰项

  // 合并并随机打乱，确保"旧"和"新"刺激的位置不可预测
  const testSet = [...seenSubset, ...testSubSet].sort(() => Math.random() - 0.5);

  const imageEl = document.getElementById('shown-models-images');
  if (!imageEl) return;

  imageEl.innerHTML = `
    <form id="guess-form">
      <div style="display: flex; flex-wrap: wrap; gap: 20px; justify-content: center;">
        ${testSet.map((name, index) => {
          const imgName = findScreenShot(name);
          return `
            <div class="guess-block" data-model="${name}" style="flex: 0 1 calc(20% - 10px); text-align: center;">
              <img src="./public/output_pngs/${imgName}" style="width: 100%; max-width: 400px;" />
              <div style="margin-top: 5px;">
                <label>
                  <input type="checkbox" name="guess-${index}" />
                  I have seen this
                </label>
              </div>
              <div class="result-text" style="margin-top: 4px; height: 18px;"></div>
            </div>
          `;
        }).join('')}
      </div>
      <div style="text-align: center; margin-top: 20px;">
        <button type="submit" id="submit-btn" style="margin-right: 20px;">Submit</button>
        <!-- Next 按钮默认隐藏，提交后显示 -->
        <button type="button" id="next-memory-btn" style="display: none;">
          ${memoryTestRound === 1 ? 'Start Next Memory Test' : 'Start Next Round'}
        </button>
      </div>
    </form>
  `;

  // 绑定"下一步"按钮事件
  const nextBtn = document.getElementById('next-memory-btn');
  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      // 清空已有答案，准备下一轮
      document.querySelectorAll('#guess-form input[type="checkbox"]').forEach(cb => cb.checked = false);
      document.querySelectorAll('.result-text').forEach(el => el.textContent = '');

      if (memoryTestRound === 1) {
        memoryTestRound++;
        renderMemoryTest();          // 进行第二轮记忆测试
      } else {
        memoryTestRound = 1;
        switchModule('main');        // 返回主实验模块
        window.resetMainModule && window.resetMainModule(); // 重置实验
      }
    });
  }
}


// ============================================================
// 记忆测试提交处理 / MEMORY TEST FORM SUBMISSION
// ============================================================

/**
 * document.body 上的 submit 事件监听器
 * 处理记忆测试表单（#guess-form）的提交逻辑：
 * 
 *   1. 阻止表单默认提交行为（页面刷新）。
 *   2. 遍历所有 .guess-block，比对被试勾选结果与实际是否"看过"。
 *   3. 在每张图片下方显示 ✅ Correct 或 ❌ Incorrect 的即时反馈。
 *   4. 将所有结果（含模型名、猜测、真相、是否正确、轮次、时间戳）
 *      POST 到 /api/memory_result 保存。
 *   5. 隐藏 Submit 按钮，显示 Next 按钮。
 * 
 * 使用事件委托（监听 body 而非表单本身）以支持动态生成的表单。
 */
document.body.addEventListener('submit', (e) => {
  const submitBtn = document.getElementById('submit-btn');
  const nextBtn = document.getElementById('next-memory-btn');

  // 切换按钮状态：提交后显示"下一步"
  if (submitBtn) submitBtn.style.display = 'none';
  if (nextBtn) nextBtn.style.display = 'inline-block';

  if (e.target.id === 'guess-form') {
    e.preventDefault();

    const blocks = document.querySelectorAll('.guess-block');
    const results = [];

    blocks.forEach(block => {
      const modelName = block.dataset.model;
      const checkbox = block.querySelector('input[type=checkbox]');
      const resultEl = block.querySelector('.result-text');

      const guessed = checkbox.checked;
      const actuallySeen = modelSequence.includes(modelName); // 真相：是否在展示序列中

      // 即时反馈：正确绿色对勾，错误红色叉
      if (guessed === actuallySeen) {
        resultEl.textContent = '✅ Correct';
        resultEl.style.color = 'green';
      } else {
        resultEl.textContent = '❌ Incorrect';
        resultEl.style.color = 'red';
      }

      // 收集结果数据
      results.push({
        modelName,
        guessed,
        actuallySeen,
        correct: guessed === actuallySeen,
        memoryTestRound,
        timestamp: Date.now()
      });
    });

    // 上传记忆测试结果到后端
    fetch('api/memory_result', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, results })
    }).then(res => {
      if (!res.ok) throw new Error('Failed to save memory results');
      console.log('✅ Memory test results uploaded');
    }).catch(err => {
      console.error('❌ Upload failed:', err);
    });
  }
});
