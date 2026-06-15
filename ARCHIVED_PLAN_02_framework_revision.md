# 修订计划：视角选择实验（第二版）

> 本文件记录相对于 PLAN.zh(1).md 的所有变更。未提及的设计决策沿用原计划。

---
+
## 变更摘要

| 项目 | 原计划（Plan 1） | 新计划（Plan 2） |
|------|-----------------|-----------------|
| Elevation 范围 | −45° … +45° | **±30°**（硬限制） |
| 物体形态 | 未详细指定 | 主体为**长方体（cuboid）**；每个 object 随机无规律附着 **8 个附件** |
| 物体数量 | 10 base × 3 = 30 | 6 base × 3 = 18 |
| Trial 起始视角 | azimuth 0°，elevation 0° | 随机左倾或右倾 30° 的斜视角 |
| 探索时长 | 25 秒 | 50 秒自由探索 + 10 秒确认窗口 |
| Probe 触发频次 | 每 10 个 trial | 每 6 个 trial |
| 按键计数行为 | 未定义 | 方案 A：忽略 key repeat，每次 keydown 转 5°、计数 +1 |
| 最终记录内容 | azimuth + elevation | azimuth + elevation + 按键次数占比 + **azimuth 视角区域停留时间占比** |

---

## A. 旋转引擎调整

### A1. Elevation 范围调整为 ±30°

**原行为：** elevation 硬限制在 −45°…+45°。

**新行为：**
- elevation 硬限制在 **−30°…+30°**。
- 向上键使 elevation 增加（俯视），向下键使 elevation 减少（仰视），碰到边界不继续。

**实现要点：**
- 将原常量 `ELEV_MAX = 45` 改为 `ELEV_MAX = 30`。
- 边界检查逻辑不变：`if (elevation < ELEV_MAX) elevation += STEP_DEG` / `if (elevation > -ELEV_MAX) elevation -= STEP_DEG`。
- Three.js 欧拉角旋转顺序保持 `'YXZ'`，`applyRotation()` 不需要其他改动。

**数据记录：**
- `finalElevation` 记录确认时的 elevation（范围 −30…+30°）。
- elevation = 0° 对应水平视角；正值 = 俯视；负值 = 仰视。

---

## B. 物体集合调整

### B1. 物体形态：主体为长方体，8 个随机附件

**新规范（Blender 生成脚本，最小改动）：**
- Base object 主体为**长方体（cube 缩放）**，三轴缩放不变：长轴 X = `MINOR_RADIUS × ratio`，短横轴 Y = `MINOR_RADIUS`，高度轴 Z = `MINOR_RADIUS × FLAT_RATIO`。主体形状与 Plan 1 一致，不改为椭球体。
- **附件数量改为 8**：`NUM_ATTACHMENTS = 10` → `NUM_ATTACHMENTS = 8`。
- **附件随机无规律分布于整个长方体表面**（含短边面），面积加权随机，无位置过滤。
- 使用 `box_point_and_normal(u, v, w, a, b, c)` 实现面积加权的长方体表面随机采样：`u` 选面（按面面积加权），`v`/`w` 定位于所选面的 2D 坐标。
- `generate_attachment_configs` 改为存储 `u`/`v`/`w`（三个独立 [0,1) 均匀随机数）代替原 `theta`/`phi`。
- 其余逻辑（材质、随机种子、`place_attachment`、导出路径、命名规范）**完全不变**。
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

### E1. 字段清单

在原有字段基础上新增/修改：

| 字段 | 说明 |
|------|------|
| `startAzimuth` | 新增：trial 起始时的随机初始 azimuth（30 或 330）|
| `finalAzimuth` | 不变：确认时的 azimuth（0–360°）|
| `finalElevation` | 修改范围说明：elevation（−30…+30°） |
| `upDownCount` | 不变：上/下键总触发次数 |
| `leftRightCount` | 不变：左/右键总触发次数 |
| `upDownRatio` | 不变：上下键次数 / 总次数 |
| `leftRightRatio` | 不变：左右键次数 / 总次数 |
| `timeShortSide` | 新增：50 s 探索期间处于短边视角区域的累计时长（ms） |
| `timeLongSide` | 新增：50 s 探索期间处于长边视角区域的累计时长（ms） |
| `timeOblique` | 新增：50 s 探索期间处于斜视角区域的累计时长（ms） |
| `ratioShortSide` | 新增：`timeShortSide / 50000`（保留 4 位小数） |
| `ratioLongSide` | 新增：`timeLongSide / 50000` |
| `ratioOblique` | 新增：`timeOblique / 50000` |

**Azimuth 视角区域定义（±22.5°）：**
- **Short-side**：azimuth ∈ [0°–22.5°] ∪ [337.5°–360°] ∪ [157.5°–202.5°]（对应 0° / 180° ±22.5°）
- **Long-side**：azimuth ∈ [67.5°–112.5°] ∪ [247.5°–292.5°]（对应 90° / 270° ±22.5°）
- **Oblique**：其余区域

**实现方式：** 50 s 探索期间以 100 ms 为间隔采样当前 azimuth，统计各区域帧数后换算时长。采样在 `startTimer` 的探索阶段随 `setInterval(sample, 100)` 一起启动，进入确认窗口或提前确认时停止。

---

### E2. 按键计数行为 ⚠️ 待确认

长按方向键会触发操作系统的 **key repeat**，导致一次长按产生大量事件，旋转极快、计数虚高。两种方案：

| 方案 | 行为 | 优点 | 缺点 |
|------|------|------|------|
| **A — 忽略 repeat（推荐）** | 在 `keydown` 中加 `if (e.repeat) return;`，每次按下只转 5°、计数 +1 | 按键次数真实反映"刻意操作"次数，数据含义清晰 | 旋转较慢，不能连按时流畅滑动 |
| **B — 计入 repeat** | 按住连续旋转，每个 key repeat 事件都计数 | 交互更流畅 | 按键次数受按住时长影响，不同参与者数据难以比较 |

✅ **已确认方案 A**：在 `keydown` 处理器开头加 `if (e.repeat) return;`，每次物理按键只转 5°、计数 +1，长按 repeat 一律忽略。

---

## F. Blender 脚本调整（生成物体）

`blender_gen_objects.py` 最小改动，其余结构完全保留：

1. **物体数量：** `NUM_OBJECTS = 10` → `NUM_OBJECTS = 6`。
2. **附件数量：** `NUM_ATTACHMENTS = 10` → `NUM_ATTACHMENTS = 8`。
3. **主体形态：** 保留 `create_box`（`primitive_cube_add` + 三轴缩放），主体仍为长方体，不改为椭球体。
4. **表面采样：** 将原 `generate_attachment_configs` 中的 `theta`/`phi` 改为 `u`/`v`/`w`（三个独立随机数），实现面积加权的完整表面均匀采样（无过滤）：

   ```python
   # generate_attachment_configs 中：
   configs.append({
       'u':    rng.random(),   # 面选择器
       'v':    rng.random(),   # 面内坐标 1
       'w':    rng.random(),   # 面内坐标 2
       'type': rng.choice(att_types),
       'scale': rng.uniform(ATTACH_SCALE_MIN, ATTACH_SCALE_MAX) * MINOR_RADIUS,
   })

   def box_point_and_normal(u, v, w, a, b, c):
       areas = [2*b*c, 2*b*c, 2*a*c, 2*a*c, 2*a*b, 2*a*b]  # ±X, ±Y, ±Z
       total = sum(areas)
       r = u * total
       face, cumul = 5, 0
       for i, area in enumerate(areas):
           cumul += area
           if r < cumul: face = i; break
       if   face == 0: return ( a, (2*v-1)*b, (2*w-1)*c), ( 1,0,0)
       elif face == 1: return (-a, (2*v-1)*b, (2*w-1)*c), (-1,0,0)
       elif face == 2: return ((2*v-1)*a,  b, (2*w-1)*c), (0, 1,0)
       elif face == 3: return ((2*v-1)*a, -b, (2*w-1)*c), (0,-1,0)
       elif face == 4: return ((2*v-1)*a, (2*w-1)*b,  c), (0,0, 1)
       else:           return ((2*v-1)*a, (2*w-1)*b, -c), (0,0,-1)
   ```

5. **导出：** 输出文件仍为 `object01_low.glb` … `object06_high.glb`，共 18 个文件。长轴方向不变。

---

## G. 建议构建顺序

1. **✅ E2 按键行为已确认方案 A**（忽略 repeat）。
2. **更新 Blender 脚本** → `NUM_OBJECTS=6`、`NUM_ATTACHMENTS=8`，主体改为椭球体，`box_point_and_normal` → `ellipsoid_point_and_normal`（全面随机，不过滤）→ 生成 18 个新 GLB，覆盖 `public/Objects/`。
3. **更新常量**（`view-selection.js`）：
   - `ELEV_MAX = 45` → `ELEV_MAX = 30`
   - `PROBE_EVERY = 10` → `PROBE_EVERY = 6`
   - `TRIAL_SEC = 25` → 拆分为 `EXPLORE_SEC = 50` / `CONFIRM_SEC = 10`
4. **修改旋转引擎**：保留 elevation 边界检查，仅把 45 改为 30；按 E2 确认方案处理 key repeat。
5. **修改 `startTrial`**：加入随机起始 azimuth（30° 或 330°）；记录 `startAzimuth`。
6. **修改 `startTimer`**：拆分为 50 s 探索（含 azimuth 区域采样 100ms 间隔）+ 10 s 确认窗口（超时自动提交）。
7. **更新服务端**：`server.py` 的 `VIEW_HEADERS` 加入 `startAzimuth`、`timeShortSide`、`timeLongSide`、`timeOblique`、`ratioShortSide`、`ratioLongSide`、`ratioOblique`。
8. **更新 HTML**：物体数量 30 → 18，控件说明（elevation 改为 ±30°，时长改为 50 s）。
9. **端到端验证**：运行一次完整 session（含 36 个 trial + 6 次 probe），确认旧 `/` 实验不受影响。

---

## H. 实验规格（更新版参考）

- **物体：** 6 个 base object（椭球体主体 + 全面随机 8 个附件）× 3 个拉伸程度（low / medium / high）= **18 个物体**。
- **设计：** 2（任务）× 3（拉伸程度）被试内设计。
- **Trial 数：** 2 block × 18 objects = **36 trial**。
- **起始视角：** 随机左倾或右倾 30° 斜视角（azimuth = 30° 或 330°，elevation = 0°）。
- **单个 trial 流程：**
  1. 加载物体，设置随机起始视角。
  2. 50 秒自由旋转探索（上下左右键；elevation 限 ±30°，azimuth 不受限）；后台每 100 ms 采样 azimuth 区域。
  3. 出现提示："Press Enter to confirm your chosen view, or leave the object in that view until the timer ends."。
  4. 10 秒确认窗口，按 Enter 提交；超时自动提交当前视角。
  5. 记录 `startAzimuth`、`finalAzimuth`、`finalElevation`、操作次数等。
- **Probe：** 每完成 **6 个 trial** 后插入一次，共 6 次。
  - 文字："Please briefly think back to the views you selected in the previous few trials. How clearly can you remember the views you chose?"
  - 三个按钮：Not clearly / Somewhat clearly / Clearly。
- **Elevation 约定：** 0° = 水平视角；正值 = 俯视（−30°…+30°）。
