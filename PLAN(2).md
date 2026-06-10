# 修订计划：视角选择实验（第二版）

> 本文件记录相对于 PLAN.zh(1).md 的所有变更。未提及的设计决策沿用原计划。

---

## 变更摘要

| 项目 | 原计划（Plan 1） | 新计划（Plan 2） |
|------|-----------------|-----------------|
| Elevation 范围 | −45° … +45° | 0°–360°，完全不受限 |
| 物体形态 | 未详细指定 | 主体改为椭球体；附件系统保留，短边端帽（±X 方向）不放附件 |
| 物体数量 | 10 base × 3 = 30 | 6 base × 3 = 18 |
| Trial 起始视角 | azimuth 0°，elevation 0° | 随机左倾或右倾 30° 的斜视角 |
| 探索时长 | 25 秒 | 50 秒自由探索 + 10 秒确认窗口 |
| Probe 触发频次 | 每 10 个 trial | 每 6 个 trial |
| 最终记录内容 | azimuth + elevation | azimuth + elevation（同原） |

---

## A. 旋转引擎调整

### A1. Elevation 完全解锁（0°–360°）

**原行为：** elevation 硬限制在 −45°…+45°，物体长轴无法竖直朝向摄像机。

**新行为：**
- elevation 采用与 azimuth 相同的环绕策略：`elevation = (elevation + delta + 360) % 360`。
- 度数范围为 0°–360°（或等价的 −180°…+180° 表示，取决于实现），无任何硬性截断。
- 物体的长轴（elongation 轴）因此可以完全垂直于水平面（elevation ≈ 90° 或 270°）。

**实现要点：**
- 删除 `ELEV_MAX` 常量及对应的边界检查 `if (elevation < ELEV_MAX)` / `if (elevation > -ELEV_MAX)`。
- `applyRotation()` 中 `model.rotation.x` 改用完整角度值，无截断。
- Three.js 欧拉角旋转顺序保持 `'YXZ'`，先绕 Y（azimuth）再绕 X（elevation），与原逻辑一致。

**数据记录：**
- 记录确认时的原始 elevation 值（0°–360° 或 −180°…+180° 均可，在元数据中注明约定）。
- elevation = 0° 仍对应水平视角；elevation = 90° 对应物体长轴正对上方；elevation = 270° 对应正对下方。

---

## B. 物体集合调整

### B1. 物体形态：主体改为椭球体，附件系统保留

**新规范（Blender 生成脚本，最小改动）：**
- Base object 主体从**方块（cube 缩放）** 改为**椭球体（UV sphere 缩放）**，三轴缩放不变：长轴 X = `MINOR_RADIUS × ratio`，短横轴 Y = `MINOR_RADIUS`，高度轴 Z = `MINOR_RADIUS × FLAT_RATIO`。
- **附件系统保留**（`NUM_ATTACHMENTS`、`generate_attachment_configs`、`place_attachment` 等均不改）。
- **短边端帽不放附件**：将原 `box_point_and_normal` 替换为 `ellipsoid_point_and_normal`（椭球面参数化），并在放置前过滤掉 `|pos_x| / semi_x > 0.80` 的端帽区域。
- 其余逻辑（材质、随机种子、导出路径、命名规范）**完全不变**。
- 所有物体导出时**长轴对齐 Blender X 轴**，保持与原命名约定一致（`object01_low.glb` 等）。

### B2. 物体数量：6 base × 3 elongation = 18 objects

**原计划：** 10 base × 3 = 30 objects。  
**新计划：** 6 base × 3 = 18 objects。

**命名规范（不变）：**
```
object01_low.glb    object01_medium.glb    object01_high.glb
object02_low.glb    object02_medium.glb    object02_high.glb
…
object06_low.glb    object06_medium.glb    object06_high.glb
```

**对 Trial 结构的影响（级联变更）：**
- 每个 block 呈现全部 18 个物体（不再是 30 个）。
- 2 个 task block → 共 18 × 2 = **36 个 trial**（不再是 60 个）。
- Probe 频次按新规则（每 6 个 trial）触发，36 个 trial 共触发 **6 次 probe**（分别在第 6、12、18、24、30、36 个 trial 后）。

**受约束随机化规则不变：** 同一 base object 的三个拉伸版本在同一 block 内不相邻出现。

---

## C. Trial 流程调整

### C1. 起始视角：随机 ±30° 斜视角

**原行为：** 每个 trial 开始时 azimuth = 0°，elevation = 0°。

**新行为：**
- 每个 trial 开始时，azimuth 随机设为 **+30° 或 −30°**（即 330°），二者等概率。
  - +30°：物体向右倾斜 30°（右倾斜视角）。
  - −30° / 330°：物体向左倾斜 30°（左倾斜视角）。
- elevation 仍初始化为 **0°**。

**实现要点（`loadTrialModel` / `startTrial`）：**
```js
azimuth   = Math.random() < 0.5 ? 30 : 330;   // 随机左倾或右倾 30°
elevation = 0;
applyRotation();
```

**记录：** 起始 azimuth 写入数据字段 `startAzimuth`，方便后期分析起始偏置的影响。

### C2. 时间流程：50 秒探索 + 10 秒确认窗口

**原行为：** 25 秒倒计时结束后直接弹出确认提示；按 Enter 确认。

**新行为：**

| 阶段 | 时长 | 界面状态 |
|------|------|---------|
| 自由探索 | 50 秒 | 仅显示 trial 界面（无任何提示） |
| 确认窗口 | 10 秒 | 出现提示语 "Press Enter to confirm your chosen view, or leave the object in that view until the timer ends." |
| 超时自动提交 | — | 10 秒内未按 Enter 则自动记录当前视角并跳转下一步 |

**实现要点（`startTimer`）：**
```js
const EXPLORE_SEC  = 50;   // 自由探索
const CONFIRM_SEC  = 10;   // 确认窗口
```
- 第一段 50 秒：纯倒计时，不显示任何提示，`confirmReady = false`。
- 50 秒结束：显示确认提示语，启动第二段 10 秒倒计时，`confirmReady = true`。
- 第二段结束（10 秒到期）：自动调用 `confirmTrial()`，使用当前 azimuth/elevation 提交。

**常量调整（`view-selection.js` 顶部）：**
```js
const EXPLORE_SEC  = 50;   // 替换原 TRIAL_SEC = 25
const CONFIRM_SEC  = 10;   // 新增
```

**确认提示文字（`view-selection.html` 或 JS 动态设置）：**
```
Press Enter to confirm your chosen view, or leave the object in that view until the timer ends.
```

---

## D. Probe 频次与内容调整

### D1. 频次：每 6 个 trial

**原计划：** `PROBE_EVERY = 10`  
**新计划：** `PROBE_EVERY = 6`

代码修改：
```js
const PROBE_EVERY = 6;   // 原为 10
```

在 36 个 trial 的结构下，probe 出现于第 6、12、18、24、30、36 个 trial 完成后。

### D2. Probe 文字（确认沿用原文本）

提示文字保持不变：
> "Please briefly think back to the views you selected in the previous few trials. How clearly can you remember the views you chose?"

三个可点击按钮（不变）：
- Not clearly
- Somewhat clearly
- Clearly

---

## E. 数据记录调整

在原有字段基础上新增/修改：

| 字段 | 说明 |
|------|------|
| `startAzimuth` | 新增：trial 起始时的随机初始 azimuth（30 或 330）|
| `finalAzimuth` | 不变：确认时的 azimuth（0–360°）|
| `finalElevation` | 修改：确认时的 elevation（0–360°，不再是 −45…+45）|
| `elevationConvention` | 建议新增元数据字段：注明 elevation 的零点和方向约定 |

---

## F. Blender 脚本调整（生成物体）

`blender_gen_objects.py` 最小改动，其余结构完全保留：

1. **数量：** `NUM_OBJECTS = 10` → `NUM_OBJECTS = 6`。
2. **主体形态：** 将 `create_box`（`primitive_cube_add` + 缩放）替换为 `create_ellipsoid`（`primitive_uv_sphere_add` + 相同三轴缩放 + `shade_smooth`）。三轴缩放参数不变：`semi_x`（长轴）、`MINOR_RADIUS`（短横轴）、`semi_z`（高度）。
3. **表面采样：** 将 `box_point_and_normal` 替换为 `ellipsoid_point_and_normal`（椭球面参数化：`x=a·sinθ·cosφ`, `y=b·sinθ·sinφ`, `z=c·cosθ`，法向量为归一化梯度）。
4. **短边过滤：** 放置附件前加判断：若 `|pos_x| / semi_x > 0.80` 则跳过（端帽区域不放附件）。
5. **导出：** 输出文件仍为 `object01_low.glb` … `object06_high.glb`，共 18 个文件。长轴方向不变。

---

## G. 建议构建顺序

1. **更新 Blender 脚本** → `NUM_OBJECTS=6`，主体改为椭球体，`box_point_and_normal` → `ellipsoid_point_and_normal`，加短边过滤 → 生成 18 个新 GLB，覆盖 `public/Objects/`。
2. **更新常量**（`view-selection.js`）：
   - `PROBE_EVERY = 6`
   - 删除 `ELEV_MAX`，新增 `EXPLORE_SEC = 50` / `CONFIRM_SEC = 10`。
3. **修改旋转引擎**：elevation 去除限制，改为环绕回绕。
4. **修改 `startTrial`**：加入随机起始 azimuth（+30° 或 −30°/330°）。
5. **修改 `startTimer`**：拆分为 50 秒探索 + 10 秒确认窗口，加入超时自动提交逻辑。
6. **更新确认提示文字**（HTML 或 JS）。
7. **更新数据记录**：新增 `startAzimuth` 字段，更新 `finalElevation` 的取值范围说明。
8. **端到端验证**：运行一次完整 session（含 36 个 trial + 6 次 probe），确认旧 `/` 实验不受影响。

---

## H. 实验规格（更新版参考）

- **物体：** 6 个 base object（椭球体主体 + 侧面附件，短边端帽无附件）× 3 个拉伸程度（low / medium / high）= **18 个物体**。
- **设计：** 2（任务）× 3（拉伸程度）被试内设计。
- **Trial 数：** 2 block × 18 objects = **36 trial**。
- **起始视角：** 随机左倾或右倾 30° 斜视角（azimuth = 30° 或 330°，elevation = 0°）。
- **单个 trial 流程：**
  1. 加载物体，设置随机起始视角。
  2. 50 秒自由旋转探索（上下左右键；elevation 完全不受限，可达 0°–360°）。
  3. 出现提示："Press Enter to confirm your chosen view, or leave the object in that view until the timer ends."。
  4. 10 秒确认窗口，按 Enter 提交；超时自动提交当前视角。
  5. 记录 `startAzimuth`、`finalAzimuth`、`finalElevation`、操作次数等。
- **Probe：** 每完成 **6 个 trial** 后插入一次，共 6 次。
  - 文字："Please briefly think back to the views you selected in the previous few trials. How clearly can you remember the views you chose?"
  - 三个按钮：Not clearly / Somewhat clearly / Clearly。
- **Elevation 约定：** 0° = 水平视角；90° = 长轴正上方；180° = 倒置水平；270° = 长轴正下方。
