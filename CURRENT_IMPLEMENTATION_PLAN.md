# Current Implementation Plan — View Selection Experiment

> 本文件为当前实验的唯一权威参考，整合自 PLAN.zh(1)、PLAN(2)、PLAN(3)。
> 旧计划文件仅供追溯，以本文件为准。

---

## 一、项目结构

### 文件架构

```
project/
├── index.html / main.js          ← 旧好奇心实验，保持原样，通过 / 访问
├── view-selection.html           ← 新实验 HTML（UI 结构、样式）
├── view-selection.js             ← 新实验前端逻辑（Three.js + 实验流程）
├── server.py                     ← Flask 后端（同时服务旧 /record 和新 /record_view）
├── vite.config.js                ← 代理 /api → Flask :5001；双 HTML 入口
├── blender_gen_objects.py        ← Blender 生成脚本（在 Blender 内运行）
├── blender_preview.py            ← Blender 预览脚本（导入 GLB 查看）
├── public/
│   ├── Objects/                  ← 18 个 GLB 文件（object01_low.glb … object06_high.glb）
│   └── hdrs/                     ← HDR 环境贴图（table_mountain_1_puresky_4k.exr）
├── view_record.csv               ← 新实验 trial 数据（追加写入）
└── view_probe.csv                ← 新实验 probe 数据（追加写入）
```

### 访问地址

| 地址 | 内容 |
|------|------|
| `http://localhost:5180/` | 旧好奇心实验（不改动） |
| `http://localhost:5180/view-selection.html` | 新视角选择实验 |

### 技术栈

- 前端：Vite + Three.js（GLTFLoader、EXRLoader、PMREMGenerator）
- 后端：Flask + flask-cors，监听 `:5001`
- Vite 代理：`/api/*` → `http://127.0.0.1:5006/*`（去掉 `/api` 前缀）

---

## 二、刺激物体

### 规格

| 参数 | 值 |
|------|----|
| Base objects | 6 个（object01–object06） |
| 拉伸级别 | 3 个：low (1.3×)、medium (1.7×)、high (2.5×) |
| 总计 | **18 个 GLB 文件** |
| 主体形状 | **长方体**（cuboid，`primitive_cube_add` 三轴缩放） |
| 长轴 | X 轴，半长 = `MINOR_RADIUS × ratio` |
| 短横轴 | Y 轴，半长 = `MINOR_RADIUS = 1.0` |
| 高度轴 | Z 轴，半长 = `MINOR_RADIUS × FLAT_RATIO = 0.5` |
| 附件数量 | 每个物体 **12 个** |
| 附件分布 | 全部 6 个面均可放置；**±Y 长侧面权重 × `SIDE_BOOST = 4.0`**，其余面按自然面积加权；预期约 60% 的附件落在长侧面，端面和顶/底面各占少数 |
| 附件类型 | CYLINDER / CUBE / CONE / SPHERE（等概率随机） |
| 颜色与材质 | 中性灰 matte（BODY_COLOR = 0.78, 0.78, 0.78；BODY_ROUGHNESS = 1.0；Specular IOR Level = 0.0）— 全漫反射、无高光，呈哑光石膏质感 |
| 随机种子 | `RANDOM_SEED = 42`（三种拉伸共用同一套附件角度配置） |

### 命名规范

```
object01_low.glb    object01_medium.glb    object01_high.glb
object02_low.glb    object02_medium.glb    object02_high.glb
…
object06_low.glb    object06_medium.glb    object06_high.glb
```

文件名以 `_` 分割，最后一段为拉伸级别，其余为 baseId（`object01` … `object06`）。

### 生成方式

```
Blender → Scripting 工作区 → Open blender_gen_objects.py → Alt+P
```

输出目录：`public/Objects/`，共 18 个 GLB，覆盖旧文件。

### 三维渲染（Three.js）

增强物体立体感的渲染配置：

| 项目 | 设置 |
|------|------|
| 相机 | `PerspectiveCamera(60°, aspect, 0.1, 100)`，位置 `(0, 0.3, 7)` |
| 材质 | Blender 导出的 grey `MeshStandardMaterial`（roughness=1.0, specular=0，无金属感） |
| 环境光 | `AmbientLight(0xffffff, 0.5)`，均匀漫反射填充，替代原 HemisphereLight |
| 主光 | `DirectionalLight(0xffffff, 1.8)`，位置 `(−5, 8, 5)`，投射软阴影 |
| 软阴影 | `renderer.shadowMap.type = PCFSoftShadowMap`，mapSize 2048×2048，`radius=4` |
| HDR 背景 | 保留为场景背景（`scene.background = envMap`）；不作为 IBL（`scene.environment = null`），避免叠加额外高光 |
| 阴影接收 | 每次 GLB 加载后 traverse 所有 Mesh，设 `castShadow = true`、`receiveShadow = true` |

### Azimuth 零点

长轴 = Blender X 轴。脚本将物体初始旋转 `INITIAL_Y = −π/2`，使：
- **azimuth 0° = 短边视角**（从 X 轴端部看）
- **azimuth 90° / 270° = 长边视角**

---

## 三、实验设计

### 被试内设计

- **任务因素（2）：** T1（Representation）× T2（Recognition）
- **拉伸因素（3）：** low / medium / high
- **Trial 总数：** 2 block × 18 objects = **36 trial**

### Task 顺序平衡

按 Participant ID 末位数字：

| 末位 | Task 顺序 |
|------|---------|
| 奇数（1, 3, 5 …） | T1 → T2 |
| 偶数（0, 2, 4 …） | T2 → T1 |

推荐 ID 格式：`P001`、`P002` … 奇偶交替分配。

### Task 指导语

**T1 — Representation Task**
> "Suppose you were making a brochure and you tried to give your customers the best possible impression of the objects shown on the screen. Which views would you choose?"

**T2 — Recognition Task**
> "Please choose the view that you think would help you recognise this object best later."

---

## 四、Trial 流程

### 单个 Trial 时序

```
物体加载 → 随机起始视角 → 50 s 自由探索（计时显示）
         → 确认窗口出现（10 s）→ Enter 提前确认 或 超时自动提交
```

| 阶段 | 时长 | 界面 |
|------|------|------|
| 自由探索 | 50 s | 计时器显示倒计时，无确认提示 |
| 确认窗口 | 10 s | 出现提示语，可按 Enter 提前确认 |
| 超时自动提交 | — | 10 s 内未按 Enter 则以当前视角自动提交 |

确认提示文字：
> "Press Enter to confirm your chosen view, or leave the object in that view until the timer ends."

### 起始视角

每个 trial 开始时 azimuth **随机设为 30° 或 330°**（各 50% 概率），elevation = 0°。

### Block 排列约束

每个 block 内 18 个物体随机排列，**同一 baseId 的三个拉伸版本不相邻出现**。

### Probe 插入

每完成 **6 个 trial** 后自动插入一次 probe，共 **6 次**（第 6、12、18、24、30、36 trial 后）。

Probe 文字：
> "Please briefly think back to the views you selected in the previous few trials. How clearly can you remember the views you chose?"

三个按钮：**Not clearly / Somewhat clearly / Clearly**（鼠标点击）

---

## 五、操控方式

| 按键 | 行为 |
|------|------|
| ← → | Azimuth：每次 5°，无限循环（0–360°） |
| ↑ ↓ | Elevation：每次 5°，限制在 **±30°** |
| Enter | 确认当前视角（仅在确认窗口阶段有效） |

**长按行为：** 忽略 OS key repeat（`if (e.repeat) return`），每次物理按下 = 一步 5° + 计数 +1。

**Euler 旋转顺序：** `YXZ`
- `rotation.y = INITIAL_Y + deg2rad(azimuth)`
- `rotation.x = deg2rad(elevation)`

---

## 六、数据记录

### 关键常量（view-selection.js）

```js
const STEP_DEG    = 5;
const ELEV_MAX    = 30;
const EXPLORE_SEC = 50;
const CONFIRM_SEC = 10;
const PROBE_EVERY = 6;
const INITIAL_Y   = -Math.PI / 2;
```

### view_record.csv — Trial 数据

每个 trial 提交时写入一行，字段如下：

| 字段 | 说明 |
|------|------|
| `participantId` | 参与者 ID |
| `task` | `T1` 或 `T2` |
| `block` | `1` 或 `2` |
| `trialNumber` | 全局 trial 序号（1–36） |
| `objectName` | 如 `object03_medium` |
| `baseId` | 如 `object03` |
| `level` | `low` / `medium` / `high` |
| `startAzimuth` | trial 起始 azimuth（30 或 330） |
| `finalAzimuth` | 确认时的 azimuth（0–360°） |
| `finalElevation` | 确认时的 elevation（−30…+30°） |
| `upDownCount` | ↑↓ 键物理按下总次数 |
| `leftRightCount` | ←→ 键物理按下总次数 |
| `upDownRatio` | upDownCount / 总按键次数 |
| `leftRightRatio` | leftRightCount / 总按键次数 |
| `timeShortSide` | 短边区域（0°/180° ±22.5°）停留时长（ms） |
| `timeLongSide` | 长边区域（90°/270° ±22.5°）停留时长（ms） |
| `timeOblique` | 斜视角区域停留时长（ms） |
| `ratioShortSide` | timeShortSide / 总采样时长 |
| `ratioLongSide` | timeLongSide / 总采样时长 |
| `ratioOblique` | timeOblique / 总采样时长 |
| `timestamp` | Unix 时间戳（ms） |

### view_probe.csv — Probe 数据

| 字段 | 说明 |
|------|------|
| `participantId` | 参与者 ID |
| `afterTrial` | 第几个 trial 后触发（6/12/18/24/30/36） |
| `answer` | `Not clearly` / `Somewhat clearly` / `Clearly` |
| `timestamp` | Unix 时间戳（ms） |

### Azimuth 区域定义（100 ms 采样）

50 s 探索期间，每 100 ms 采样当前 azimuth，归入以下区域：

| 区域 | Azimuth 范围 |
|------|-------------|
| Short-side | 0°–22.5°、337.5°–360°、157.5°–202.5° |
| Long-side | 67.5°–112.5°、247.5°–292.5° |
| Oblique | 其余 |

---

## 七、启动与数据收集

### 一次性准备

1. **生成 GLB**：在 Blender 运行 `blender_gen_objects.py`，确认输出 `Done: 18/18`。
2. **安装依赖**（首次）：`npm install` + `pip install flask flask-cors`

### 每次开机（2 个终端）

```powershell
# 终端 A
python server.py        # Flask :5001

# 终端 B
npm run dev             # Vite :5180
```

实验地址：`http://localhost:5180/view-selection.html`

### 每位参与者结束后

- 将 `view_record.csv` 和 `view_probe.csv` 复制备份，建议命名含日期和参与者 ID。
- CSV 文件**不需要清空**，下一位参与者数据自动追加。

### 快速排查

| 现象 | 处理 |
|------|------|
| 页面打不开 | 检查终端 B，重启 `npm run dev` |
| 视角不保存 | 检查终端 A，重启 `python server.py` |
| 物体不显示 | 确认 `public/Objects/` 有 18 个 GLB |
| HDR 背景不加载 | 确认 `public/hdrs/` 有 EXR 文件 |
| Enter 没反应 | 还在 50 s 探索阶段，等确认提示出现后再按 |
| 物体形状是旧版方块 | 需在 Blender 重新运行 `blender_gen_objects.py` |
