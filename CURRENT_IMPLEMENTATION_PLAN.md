# [已归档 ARCHIVED] Current Implementation Plan — View Selection Experiment

> ⚠️ **本文件已归档，仅留作备查（archived for reference only），不再是权威计划。**
> 当前权威计划请见 `EXP1_EXP2_IMPLEMENTATION_PLAN.md`。任何新的实验调整，请在该文件中更新并经用户确认后再改代码，不要再更新本文件。
>
> 本文件保留原因：完整记录了 2×2 Set A/B 设计（曾经"当前实际运行"的实现），供追溯历史设计决策使用。
>
> --- 以下为归档前原文 ---
>
> 本文件为当前实验的唯一权威参考，依据 `Experiment_Execution_Spec.md`（§0 声明的权威 source）全面修订。
> 旧版本（基于拉伸3级）已废弃，以本文件为准。
>
> ⚠️ **工作流规则（必须始终执行）：任何实验调整，先更新本文件，询问用户确认后，再执行代码修改。**
>
> **文件结构说明**
> - 标注 **[Spec §X.X 固定]** 的内容源自 Spec，不可更改。
> - 标注 **[执行参数 §4]** 的内容需在开始实现前确认。
> - 标注 **⚠️ 待确认** 的内容存在不确定性或与旧版冲突，需用户决策。

---

## ⚠️ 与旧版计划的重大变更摘要

| 维度 | 旧版（已废弃） | 新版（本文件） |
|------|--------------|--------------|
| 实验因素 | 拉伸3级（low/medium/high） | 2×2：Global Shape × Feature Arrangement |
| 拉伸操纵 | 连续3档（1.3×/1.7×/2.5×） | **类别型**（有轴elongated vs 无轴non-elongated） |
| 对称性 | 无（随机放置附件） | **核心操纵**：双侧对称 vs 非对称 |
| 物体总数 | 18 | **40**（Set A 20个 + Set B 20个） |
| Task-物体绑定 | 两task共用同一套 | Set A → T1；Set B → T2；不重叠 |
| Trial总数 | 36 | **40**（每task 20） |
| T2名称/描述 | "Memory Task"，暗示记忆测试 | "Memory-oriented viewpoint selection"，非记忆测试 |
| Blender脚本 | `blender_gen_objects.py`（拉伸+随机附件） | 需完全重写（对称/非对称操纵） |
| 数据字段 | level, timeShortSide/Long/Oblique等 | global_shape, feature_arrangement, axis_category等 |

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
├── blender_gen_objects.py        ← Blender 生成脚本（需依新设计重写）
├── blender_preview.py            ← Blender 预览脚本（导入 GLB 查看）
├── public/
│   ├── Objects/                  ← 40 个 GLB 文件（见§二命名规范）
│   ├── Objects/objects_metadata.json ← 每个物体的轴方向、镜像平面、非对称特征位置（§二）
│   └── hdrs/                     ← HDR 环境贴图（table_mountain_1_puresky_4k.exr）
├── view_record.csv               ← 新实验 trial 数据（追加写入）
└── view_probe.csv                ← ⚠️ Probe 数据（是否保留见§四）
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

## 二、刺激物体 [Spec §2.3, §2.8, §6 固定]

### 设计结构

**2 Object Sets × 4 Conditions × 5 Exemplars = 40 个物体**

| Set | 绑定Task | 用途 |
|-----|---------|------|
| Set A | T1（Representation） | 与 T2 独立，物体不重叠 |
| Set B | T2（Memory-oriented） | 与 T1 独立，物体不重叠 |

每个 Set 的 4 个 Condition：

| Condition | Global Shape | Feature Arrangement |
|-----------|-------------|---------------------|
| 1 | Non-elongated（非拉伸） | Symmetric（双侧对称） |
| 2 | Non-elongated | Asymmetric（非对称） |
| 3 | Elongated（拉伸） | Symmetric |
| 4 | Elongated | Asymmetric |

每个 Condition 5 个 exemplar → 每 Set 20个 → 全实验 40个物体，每个被试每个物体仅见一次。

### 物体构建原则 [Spec §2.8, §6 固定]

**Global Shape（主体形状）**
- Non-elongated：近等比三轴（约 1:1:1）
- Elongated：沿一个轴拉伸（约 2.5–3:1），具有清晰的主轴（major axis）
- **类别型操纵**：仅分"有主轴"和"无主轴"两类，不按拉伸程度分级
- 主体本身在所有4个 condition 中保持**双侧对称**（主体不引入非对称性）

**Feature Arrangement（附件排列）**
- Symmetric 版本：使用 Blender Mirror modifier 沿参考平面镜像放置附件 → 整体恰好具有**唯一一个**镜像平面
- Asymmetric 版本：手动放置**相同数量/大小/类型**的附件于非镜像位置，使**不存在任何**镜像平面
- 两个版本主体相同，附件库存相同（数量/体积/类型一致），仅空间排列不同
- 非对称度必须**明显高于阈值**（不能是近对称的微小偏移）

**镜像平面约定（Reference Plane）**
- Elongated 物体：参考平面**包含主轴**（左右两侧互为镜像，两端可不同）
- Non-elongated 物体：使用固定的物体中心平面作为参考平面

**视角可见性要求**
- 非对称（Asymmetric）物体的诊断性特征（区分左右的附件）必须具有视角依赖性：从某些视角可见，从其他视角被遮挡或前缩

**附件参数建议** [执行参数 §4，需确认]

| 参数 | 建议值 |
|------|------|
| 附件类型 | CURVED-CYLINDER / CONE / HEMISPHERE / OCTAHEDRON |
| 每个物体附件数量 | ~12（待确认，需保证对称版本可精确镜像配对） |
| 附件大小 | `ATTACH_SCALE_MIN=0.15`，`ATTACH_SCALE_MAX=0.22` × MINOR_RADIUS |
| 材质 | 统一暗金色半哑光（与旧版相同） |

### 命名规范

```
setA_NE_sym_01.glb   ... setA_NE_sym_05.glb    (Set A, Non-elongated, Symmetric, exemplar 1-5)
setA_NE_asym_01.glb  ... setA_NE_asym_05.glb   (Set A, Non-elongated, Asymmetric)
setA_E_sym_01.glb    ... setA_E_sym_05.glb      (Set A, Elongated, Symmetric)
setA_E_asym_01.glb   ... setA_E_asym_05.glb     (Set A, Elongated, Asymmetric)

setB_NE_sym_01.glb   ... setB_E_asym_05.glb     (Set B，同结构)
```

文件名字段：`{set}_{global_shape}_{feature_arrangement}_{exemplar_id}.glb`

### 每物体元数据（per-object metadata）[Spec §6.9, §4 固定]

每个物体须导出以下元数据，存入 `public/Objects/objects_metadata.json`：
- `major_axis_vector`：主轴方向向量（Elongated 物体；Non-elongated 为 null）
- `mirror_plane_normal`：参考/镜像平面法向量
- `asymmetric_feature_positions`：诊断性附件的局部坐标（Asymmetric 物体；Symmetric 为空数组）

此元数据用于将最终视角分类至 **axis-based bins** 和 **feature-revealing bins**（见§六）。

### 生成方式

```
Blender → Scripting 工作区 → Open blender_gen_objects.py（需重写）→ Alt+P
```

输出目录：`public/Objects/`，共 40 个 GLB + 1 个 `objects_metadata.json`。

### 三维渲染（Three.js）[执行参数 §4]

| 项目 | 设置 |
|------|------|
| 相机 | `PerspectiveCamera(60°, aspect, 0.1, 100)`，位置 `(0, 0.3, 7)` |
| 材质 | 暗金色半哑光（roughness=0.6，Specular IOR Level=0.5） |
| 环境光 | `AmbientLight(0xffffff, 0.75)` |
| 主光 | `DirectionalLight(0xffffff, 1.0)`，位置 `(−5, 8, 5)` |
| 补光 | `DirectionalLight(0xffffff, 0.4)`，位置 `(0, −3, 6)` |
| 阴影 | 关闭 |
| HDR 背景 | `scene.backgroundIntensity = 0.5`；不作为 IBL |

### Azimuth 零点 [执行参数 §4]

Elongated 物体长轴 = Blender X 轴。脚本将物体初始旋转 `INITIAL_Y = −π/2`，使：
- **azimuth 0° = 短端视角**（从主轴端部看）
- **azimuth 90° / 270° = 长侧视角**

Non-elongated 物体：参考平面法向量对齐到 azimuth 0° 方向（面向相机）。

---

## 三、实验设计 [Spec §2.1–§2.3 固定]

### 被试内设计

- **每个 Task 内因素（2×2）：** Global Shape（Non-elongated / Elongated）× Feature Arrangement（Symmetric / Asymmetric）
- **每个 Task：** 20 trials（4 条件 × 5 exemplars）
- **Trial 总数：** 40（T1 20 + T2 20）

### 两个 Task 与物体集合绑定 [Spec §2.2, 约束 §3.5 固定]

| Task | 指导语目标 | 使用物体集合 |
|------|-----------|------------|
| T1 — Representation Task | 选择最能代表物体的视角 | **Set A** |
| T2 — Memory-oriented Task | 选择最有助于之后回忆物体的视角 | **Set B** |

- Set A 与 Set B **完全独立**，无物体重叠
- T2 是**记忆导向的视角选择**，**不是**记忆测试——没有后续的再认或回忆测试 [Spec 约束 §3.2]
- 两个 Task **分开分析**，Task 不作为正式统计变量进行 Task-effect 检验 [Spec 约束 §3.3]

### Task 顺序平衡 [执行参数 §4]

按 Participant ID 末位数字：

| 末位 | Task 顺序 |
|------|---------|
| 奇数（1, 3, 5 …） | T1 → T2 |
| 偶数（0, 2, 4 …） | T2 → T1 |

推荐 ID 格式：`P001`、`P002` … 奇偶交替分配。

### Task 指导语 [Spec §2.4 固定]

**T1 — Representation Task**
> "Imagine that you are taking a photograph of this object for a selling website. Rotate the object and stop at the viewpoint that would best represent the object to potential customers."

**T2 — Memory-oriented Task**
> "Please choose the view that you think would best help you memorise this object."

（措辞避免"测试记忆"含义；选择视角是目的，不是后续会有记忆测试。）

### Block 内 Trial 排列 [执行参数 §4]

每个 Task 内 20 个物体随机排列，无额外约束（⚠️ 与旧版不同：不再需要"同 baseId 不相邻"规则，因每个物体现在是独立 exemplar）。

---

## 四、Trial 流程 [Spec §2.5 固定]

### 单个 Trial 时序

```
物体加载 → 随机起始视角 → 50 s 自由探索（计时隐藏）
         → 确认窗口出现（10 s）→ Enter 提前确认 或 超时自动提交
```

| 阶段 | 时长 | 界面 |
|------|------|------|
| 自由探索 | 50 s | 计时器**不显示**，无确认提示 |
| 确认窗口 | 10 s | 出现提示语，可按 Enter 提前确认 |
| 超时自动提交 | — | 10 s 内未按 Enter 则以当前视角自动提交 |

确认提示文字：
> "Press Enter to confirm your chosen view, or leave the object in that view until the timer ends."

**无练习试次。** [Spec §2.5 固定]

### 起始视角 [执行参数 §4，已确认]

每个 trial 开始时 azimuth **随机设为 30° 或 330°**（各 50% 概率），elevation = 0°。

### 确认期是否可继续旋转 [执行参数 §4，已确认]

确认窗口（10 s）内被试**可继续旋转**，不锁定视角。

### Probe 插入

每完成 **5 个 trial** 后自动插入一次 probe，每个 Task 内共 **3 次**（第 5、10、15 trial 后）；第 20 trial（Task 最后一个）结束后**不插入 probe**，直接跳转到下一 Task 或结束页。全程共 **6 次 probe**（两个 Task 各 3 次）。

Probe 文字：
> "How easy was it to choose a viewpoint in the previous few trials?"

三个按钮：**Difficult / Somewhat easy / Easy**（鼠标点击）

措辞说明：询问选择视角的主观难易度，对 T1 和 T2 均适用，不引入记忆测试含义，也不预设被试对选择有信心。

---

## 五、操控方式 [Spec §2.6 固定；步长/速率为执行参数]

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
const PROBE_EVERY = 5;   // 每 Task 内每 5 trial 插入一次 probe（第 5、10、15 trial 后）
const INITIAL_Y   = -Math.PI / 2;
```

### view_record.csv — Trial 数据 [Spec §5 推荐字段]

每个 trial 提交时写入一行：

| 字段 | 说明 |
|------|------|
| `participant_id` | 参与者 ID |
| `task` | `T1` 或 `T2` |
| `object_set` | `A` 或 `B` |
| `object_id` | 如 `setA_E_asym_03` |
| `global_shape` | `non_elongated` 或 `elongated` |
| `feature_arrangement` | `symmetric` 或 `asymmetric` |
| `condition` | 组合码，如 `NE_sym`、`E_asym` |
| `trial_index` | 当前 Task 内的 trial 序号（1–20） |
| `task_order` | `T1_first` 或 `T2_first` |
| `start_azimuth` | trial 起始 azimuth（30 或 330） |
| `final_azimuth` | 确认时的 azimuth（0–360°） |
| `final_elevation` | 确认时的 elevation（−30…+30°） |
| `axis_category` | 最终视角相对于主轴的分类（见下方定义） |
| `feature_category` | 最终视角相对于诊断性特征的分类（见下方定义） |
| `confirmation_latency` | 从确认窗口开始到 Enter 的时长（0–10 s；未按 Enter 则为 10） |
| `enter_pressed` | `true` 或 `false` |
| `up_down_count` | ↑↓ 键物理按下总次数 |
| `left_right_count` | ←→ 键物理按下总次数 |
| `timestamp` | Unix 时间戳（ms） |

### view_probe.csv — Probe 数据

| 字段 | 说明 |
|------|------|
| `participant_id` | 参与者 ID |
| `task` | `T1` 或 `T2` |
| `after_trial_index` | 当前 Task 内第几个 trial 后触发（5 / 10 / 15） |
| `answer` | `Difficult` / `Somewhat easy` / `Easy` |
| `timestamp` | Unix 时间戳（ms） |

### Per-sample log — 轨迹数据（100 ms 采样）[Spec §5 推荐]

探索期每 100 ms 写入一行（发送到后端或在 trial 结束后批量提交）：

| 字段 | 说明 |
|------|------|
| `participant_id` | 参与者 ID |
| `task` | `T1` 或 `T2` |
| `object_id` | 物体 ID |
| `trial_index` | Trial 序号 |
| `timestamp_ms` | 相对 trial 开始的时间（ms） |
| `azimuth` | 当前 azimuth |
| `elevation` | 当前 elevation |

### 视角分类（axis_category 与 feature_category）[Spec §2.7, §4]

分类依赖 `objects_metadata.json` 中的每物体元数据：

**axis_category**（Elongated 物体适用；Non-elongated 为 `N/A`）
- `end_on`：视角接近主轴方向（从端部看）
- `side_on`：视角接近主轴侧面（从侧面看）
- `oblique`：其他角度

具体角度边界为执行参数，需在元数据导出时定义（建议：距主轴方向 ±22.5° 内为 end_on；90° ±22.5° 为 side_on）。

**feature_category**（Asymmetric 物体适用；Symmetric 为 `N/A`）
- `feature_revealing`：诊断性非对称附件在此视角可见（基于法向量与视角夹角）
- `feature_concealed`：诊断性附件被遮挡或严重前缩
- `ambiguous`：部分可见

---

## 七、启动与数据收集

### 一次性准备

1. **重写并运行 Blender 脚本**：依新设计重写 `blender_gen_objects.py`，生成 40 个 GLB + `objects_metadata.json`，确认输出 `Done: 40/40`。
2. **安装依赖**（首次）：`npm install` + `pip install flask flask-cors`

### 每次开机（2 个终端）

```powershell
# 终端 A
python server.py        # Flask :5006

# 终端 B
npm run dev             # Vite :5180
```

实验地址：`http://localhost:5180/view-selection.html`

### 每位参与者结束后

- 将 `view_record.csv`、`view_probe.csv`（若保留）、per-sample log 复制备份，建议命名含日期和参与者 ID。
- CSV 文件不需要清空，下一位参与者数据自动追加。

### 快速排查

| 现象 | 处理 |
|------|------|
| 页面打不开 | 检查终端 B，重启 `npm run dev` |
| 视角不保存 | 检查终端 A，重启 `python server.py` |
| 物体不显示 | 确认 `public/Objects/` 有 40 个 GLB |
| HDR 背景不加载 | 确认 `public/hdrs/` 有 EXR 文件 |
| Enter 没反应 | 还在 50 s 探索阶段，等确认提示出现后再按 |
| 分类字段全为 null | 检查 `objects_metadata.json` 是否正确生成 |

---

## 八、待确认执行参数清单 [Spec §4]

在开始实现前需逐项确认：

| 参数 | 当前确认值 | 状态 |
|------|------------|------|
| Probe 频率与措辞 | 每 5 trial 1 次；询问选择难易度（Difficult / Somewhat easy / Easy） | ✅ 已确认 |
| 确认期（10 s）可否继续旋转 | 可继续旋转 | ✅ 已确认 |
| 起始视角方案 | 随机 30° 或 330° | ✅ 已确认 |
| axis_category 角度边界 | end_on: ±22.5°；side_on: 90°±22.5° | ✅ 已确认 |
| feature_category 可见度阈值 | 视角-法向量夹角 < 60° 为 feature_revealing | ✅ 已确认 |
| 每物体附件数量 | ~12（需保证可镜像配对） | ✅ 已确认 |
| Per-sample log 存储位置 | 独立 CSV | ✅ 已确认 |
| GLB 文件命名规范 | `{set}_{shape}_{arrangement}_{id}.glb` | ✅ 已确认 |
