# Implementation Plan — Experiment 1 & Experiment 2（View Selection）

> 本文件为当前实验的唯一权威参考，取代旧版 `CURRENT_IMPLEMENTATION_PLAN.md`（单实验 2×2 版本，已废弃）。
>
> ⚠️ **工作流规则（必须始终执行）：任何实验调整，先更新本文件，询问用户确认后，再执行代码修改。**
>
> **文件结构说明**
> - 标注 **[固定]** 的内容为已定案设计，不可更改。
> - 标注 **⚠️ 待确认** 的内容需用户决策后方可实现。

---

## 〇、实验室部署清单（优盘迁移用，2026-07-14 记）

> 目的：把当前开发机上的项目原样搬到实验室电脑跑实验。核心思路是**整个项目文件夹连同 `node_modules/`、`.venv/`（如有）一起拷贝**，避免依赖实验室电脑的网络去联网安装。

### 1. 实验室电脑需要预装的软件

| 软件 | 用途 | 备注 |
|------|------|------|
| **Node.js**（含 npm） | 跑 Vite 前端 | 开发机版本 node v24.15.0 / npm 11.12.1；装最新 LTS 即可，不要求精确一致 |
| **Python 3**（含 pip） | 跑 Flask 后端 `server.py` | 开发机版本 3.14.5；3.9+ 均可 |
| **VS Code**（可选） | 只是编辑器，跑实验不是必须 | 如果只是"运行实验收数据"，装个能开两个终端的东西就够（VS Code 或直接用系统终端） |
| **浏览器**（Chrome/Edge） | 打开 `localhost:5180/view-selection.html` 跑实验 | 建议提前确认全屏/无干扰模式 |
| Blender（可选，不建议在实验室装） | 仅在需要**重新生成刺激物 GLB** 时才需要 | 现有 GLB 已生成好，随文件夹一起拷贝，实验室机器上一般用不到 |

### 2. 需要通过优盘整体拷贝的内容（不能只 `git clone`！）

⚠️ 以下目录/文件被 `.gitignore` 排除，**git 仓库里没有**，必须手动连文件夹一起拷进优盘，否则实验室电脑上装完依赖也跑不起来：

- `node_modules/`（约 74 MB）— 如果实验室电脑能联网，也可以不拷、改为到实验室后跑 `npm install`（见下）
- `.venv/`（约 12 MB，如果开发机用了虚拟环境）— 同上，联网的话可以改跑 `pip install -r requirements.txt`
- `public/hdrs/`（约 88 MB，HDR 环境贴图，渲染必需）
- `public/Objects/`（约 2.4 MB，全部刺激物 GLB + `objects_metadata.json`，**目前有一批新的 `exp1_*.glb` 是 untracked 状态，git 里也没有**）
- `data/`（现有的测试数据，如 `PTEST*` 系列 CSV；可选，主要是防止实验室新建的 `data/exp1/` 与本地测试数据混在一起搞混，建议**清空或改名后再带过去**，避免正式数据和测试数据混淆）

最省心的做法：**直接把整个项目文件夹（`.git` 也带上）复制进优盘，到实验室整个拷回硬盘**，不要用 `git clone` + 重新安装依赖的方式，除非确认实验室电脑能连外网装包。

### 3. 到实验室后的启动步骤

```powershell
# 若 node_modules / .venv 没有一起拷贝过去，且实验室电脑能联网，先装依赖：
npm install
pip install -r requirements.txt

# 两个终端分别启动：
python server.py     # 终端 A，应显示 Running on http://127.0.0.1:5006
npm run dev           # 终端 B，应显示 Local: http://localhost:5180/
```

浏览器打开 `http://localhost:5180/view-selection.html` 开始实验。

### 4. 落地前 / 落地后自查

- [x] `public/Objects/` 已清理干净：64 个 GLB = `exp1_*.glb` 32 个 + `exp2_*.glb` 32 个（各 4 body type × sym/asym × 4 exemplar）+ `objects_metadata.json`，无旧 `setA_*/setB_*` 残留（2026-07-15 复核，exp2 由 commit `15b1998` 新增）
- [x] `objects_metadata.json` 已核对：64 条记录（exp1/exp2 各 32），`body_type` 计数 (16,16,16,16)，`symmetry` 计数 (32,32)，`aspect_ratio` 范围 exp1 2.54–2.79 / exp2 1.11–1.30，均落在 §2.4 拍板区间内（2026-07-15 复核）
- [ ] 确认端口 5180 / 5006 在实验室电脑上没有被占用（防火墙可能弹窗，需要允许访问）
- [ ] `node_modules/` 是原样拷贝的情况下，如果实验室电脑与开发机不是同架构/系统，需要重新 `npm install`，不能直接用拷贝的二进制

### 5. ⚠️ "代码已实现" ≠ "可以直接收正式数据" —— 出发前必须确认的几件事

> 2026-07-14 复核代码后发现：`view-selection.js` / `server.py` / `blender_gen_objects.py` 已经把本文件 §2–§7 的设计**基本实现完整**（配置块、40 步旋转判据、50 s 上限、休息/指导语页、probe 调度、`block_events.csv` 四文件落盘等均已在代码里），并不是 HANDOFF.md（2026-07-10 版本，已过期）里说的"什么都没实现"。但下面这些不是"代码 gap"，是**收正式数据前必须人工确认**的事项，直接影响数据能不能用：

- [ ] **§8.2 的 4 项 pilot 校准（P1–P4）在本清单里仍未正式勾选完成**，这些是"必须真人跑一遍肉眼判断"的项目，无法靠读代码替代。`data/exp1/{P002,PP010}_*.csv` 与 `data/exp2/{PEP2_00,PEP2_01}_*.csv` 说明两个实验都已有 dev/pilot 会话跑过，但**尚未针对 Exp2（2026-07-15 才生成，长宽比更低）专门确认过 P1（附件是否因主体缩小而拥挤）**——建议出发前至少针对 exp2 补跑一次完整 pilot session（非 TEST_MODE，真实参数）：
  - P1 端面视角（az≈0°/180°）下 symmetric/asymmetric 是否肉眼可辨，附件是否因主体缩小而拥挤/重叠（Exp2 优先级最高）
  - P2 40 步旋转判据（key repeat 已禁用，每步需一次独立按键）实际操作是否过于繁琐
  - P3 主体棱角化（faceting）粗细是否落在"可辨认切面但仍像有机物体"的区间（太光滑/太多面体都有问题，见 §2.1 末段）
  - P4 50 s 上限下 `timeout` 触发率、`confirmation_latency` 均值是否接近预期的 28–32 s
- [ ] **`data/exp1/` 和 `data/exp2/` 里现有的 dev/pilot 测试数据**（`P002`、`PP010`、`PEP2_00`、`PEP2_01`，共 10 个文件，均非正式被试 ID）出发前建议整体移出这两个目录（例如挪到 `data/_pretest_backup/` 或直接删除），避免和正式被试数据混在一起——后端的重复 ID 检查是精确字符串匹配，不会自动区分测试数据与正式数据
- [x] `TEST_MODE`（`view-selection.js` 第 21 行）当前为 `false`，是正式收集所需状态——**到实验室后重新确认一次**，避免拷贝/合并过程中被意外改动
- [ ] `server.py` 的 CORS 白名单写死为 `http://localhost:5180`（server.py 第 13 行）——**必须用这个确切地址访问**（不能是 `127.0.0.1:5180`，也不能改端口），否则前端请求会被 CORS 拦截、数据传不到后端却不一定有明显报错
- [x] `EXPERIMENT` 常量默认 `'exp1'`；**Exp2 的 32 个刺激物已生成**（`exp2_*.glb` + 合并进 `objects_metadata.json`，2026-07-15，见上）——实验室阶段可以传 `?exp=2` 跑 Exp2，但建议先完成上面的 P1 校准再作为正式数据收集
- [ ] 收集当天严格走 §7 "每场次检查单"：关闭休眠/屏保、电源常插、浏览器全屏/kiosk、当日结束整目录备份一次（建议额外拷一份到云端或第二个优盘，不要只留一份在实验室电脑本地）

---

## ⚠️ 与旧版计划的重大变更摘要

| 维度 | 旧版（已废弃） | 新版（本文件） |
|------|--------------|--------------|
| 总体结构 | 单实验 2×2（Global Shape × Feature Arrangement） | **两个实验**：Exp1 = elongated（sym vs asym）；Exp2 = non-elongated（sym vs asym）；elongation 为 between-experiment 因素 |
| Set A/B | Set A → T1，Set B → T2，物体不重叠 | **取消 Set 结构**。每个实验内 T1、T2 共享同一物体集；Task order 被试间平衡；carryover 通过 Task × Order 与 exposure 相关性诊断 |
| Task 统计地位 | 分开分析，Task 不作统计变量 | Task 与 Task Order 进入分析（Order 为 between-subjects 因素） |
| 主体形状 | Box（长方体） | **Surfaces of revolution（全部前后对称、凸面族）**：capsule / barrel / spindle / ovoid-cylinder（2026-07-14 移除 ellipsoid，见 §2.1）|
| Symmetry 承载 | 主体面上镜像放置附件 | 主体旋转对称、自身不提供 azimuth 信息；symmetry **完全由 attached features 承载**（柱面坐标 ±θ 镜像） |
| Elongated 比例 | 2.5–3 : 1 | **2.5 : 1**（抖动只向上，2.5–2.8 : 1）⚠️ 见 §2 |
| 物体数（Exp1） | — | **16/条件**（sym + asym = 32 物体 = 16 yoked pairs），4 body types 按 (4,4,4,4) 均分 exemplar |
| Trial 计时 | 50 s 探索 + 10 s 确认窗口（上限 60 s/trial）| **旋转达标解锁 Enter（≥40 步 ≈200°）+ 50 s 上限超时自动记录（倒计时不可见，临近上限才提示）**，见 §3.3 |
| Trial 数/被试 | 40（每 task 20，物体不重叠） | 物体共享后 = 32 × 2 = **64 trials**（每 task 32）|
| 命名 | `set{A|B}_{NE|E}_{sym|asym}_{id}` | `exp{1|2}_{bodytype}_{sym|asym}_{id}` |
| Blender 脚本 | box + 按面放置 | 需重写：revolution profile + 柱面坐标放置，删除 Set A/B 与 NE 分支 |

---

## 一、总体结构 [固定]

| | Exp1 | Exp2 |
|---|------|------|
| 主体 | Elongated（2.5:1 起） | Non-elongated（≤1.3:1）|
| 操纵因素 | Symmetry：symmetric vs asymmetric（feature-carried） | 同左 |
| Task | T1（Representation）+ T2（Memory-oriented），被试内，共享物体集 | 同左 |
| 被试 | 独立样本 | 独立样本（与 Exp1 不重叠）|

- 两实验共用同一套代码与流程，仅通过配置切换（见 §7 执行便利性）。
- **先完整实现并跑通 Exp1；Exp2 的刺激细节在 Exp1 pilot 后定稿**（Exp2 遗留问题见 §2.4）。
- Elongation × Symmetry 的 interaction 不在单一设计内检验；跨实验比较为 descriptive / exploratory，写作时使用弱表述。

---

## 二、刺激物体（Exp1）

### 2.1 主体（body）[固定]

- **四种** surfaces of revolution（全部前后对称、凸面族）：**capsule、barrel、spindle、ovoid-cylinder**。长轴 = Blender X 轴。**2026-07-14：已移除 ellipsoid**（见下方说明），4 种主体恰好可均分 16/条件（各 4 个 exemplar），不再需要 (4,3,3,3,3) 这种不均衡分配。
  - 选型逻辑（保守路线）：四体的侧轮廓覆盖 convex（barrel、ovoid-cylinder）→ straight（capsule 的柱身、ovoid-cylinder 的中段）→ pointed（spindle，纺锤形，两端收成尖点），端部处理覆盖 rounded / pointed。ovoid-cylinder = 中段近似柱面、两端以椭球面收束的桶变体，bulge 弱于 barrel、端帽扁于 capsule 的半球，轮廓与其余三体均不重合。全部主体均为凸面（无内凹腰部），构建最简、渲染最稳。**全部前后对称（关于赤道面镜像）且旋转对称**，因此既不携带首尾极性、也不携带 azimuth 信息——symmetry 操纵被完全隔离到 attached features。spindle 补回原 ogive 的尖端轮廓，其余三体覆盖 rounded/straight 端部与不同 bulge 程度。
  - **移除 ellipsoid 的理由**：① 4 种主体可被 16/条件整除（4×4），消除了原 5 体方案下 (4,3,3,3,3) 的 body_type 不平衡分配，简化 exemplar 配平；② ellipsoid 的轮廓（两端对称收圆、无直段）与 ovoid-cylinder（两端椭球收束）在中高分段棱角化后区分度较低，剩余四体（capsule 直柱 / barrel 强 bulge / spindle 尖端 / ovoid-cylinder 弱 bulge+平缓收束）轮廓辨识度更均匀。
- 裸主体绕长轴旋转对称 → 自身不携带任何 azimuth 信息；symmetry 操纵由 features 独立承载。方法章须明确写出这一隔离逻辑。
- **Aspect ratio（length : diameter）：2.5 : 1**（各 exemplar 抖动只向上，2.5–2.8 : 1），远离 ~1.7 的 non-elongated 工作边界，确保 axis of elongation 为 salient principal axis。
- **端面可读性 × 主体宽度（设计约束，与 §2.2 特征尺寸联动）— 已决议**：bilateral symmetry 仅在 line of sight 落入 mirror plane 时可见——对本设计即 **azimuth 0°/180°（端面正对镜头）** 一带；此时端面投影为直径 = minor diameter 的圆，±θ 特征对呈左右镜像。原先担心 **minor diameter 过小**会导致端面圆过小、绕周特征拥挤——但那条顾虑成立的前提是"附件尺寸随 `MINOR_RADIUS` 等比例缩放"；现已改为**附件绝对尺寸不随主体缩放**（见 §2.2），缩小主体反而让固定大小的附件占比更大、更显眼，直接达成本节初衷。**主体缩放决议**：`MINOR_RADIUS` 从 1.0 缩小约 35% 至 **0.65**（aspect ratio 仍保持 2.5–2.8:1，两者一起等比例缩小，elongation 操纵本身不变）。⚠️ **新的 pilot 观察项**：主体变小后，同样绝对尺寸的附件在更小的圆周上是否会相互拥挤/重叠——若出现，优先减少 `NUM_FEATURE_PAIRS` 或收紧特征尺寸，而不是再放大主体。
- **body polarity — 已决议（选项 b，保守路线）**：原 frustum、ogive 的首尾极性会独立牵引 preferred azimuth，构成混淆；已用前后对称的凸面主体（spindle、ovoid-cylinder）替换，从刺激层面消除极性，无需再作 stimulus-level 极性检查。全部四体前后对称，`body_polarity` 恒为 false，故从 metadata 中移除该字段。
- **主体轮廓棱角化（profile faceting）— 已决议：启用，替代原波纹/褶皱方案**。原因：四体均为前后对称、光滑连续曲率的凸面体，elongated 比例（2.5:1 起）+ 光滑浑圆两端 + 原计划的环状波纹叠加后，视觉上容易引发解剖学（男性生殖器官）联想，构成非预期的注意/情绪混淆；已废弃波纹方案（原"波纹/褶皱"决议作废）。改为：**纵剖面（profile curve）由平滑曲线改为多段折线（低多边形/切面化）拼接**，仍绕长轴 lathe 生成——横截面保持圆形，绕轴旋转仍为连续旋转对称，**不引入任何新的镜像面**，与"主体自身零 symmetry 信息"的核心隔离逻辑完全兼容（相较之下，若改为横截面多边形化或纵向棱纹，会引入 N 个离散镜像面，直接违反该隔离逻辑，已否决）。切面边界在主动旋转时产生锐利的高光/阴影跳变，提供不弱于原波纹方案的运动结构线索，**故不再需要额外的环状波纹**。**四种 body type 统一采用同一棱角粗细度**（具体分段数由 pilot 目视校准，避免"光滑 vs 棱角"风格差异与 body_type 绑定、产生新的 nuisance 混淆）。棱角粗细需控制在"可辨识切面、但仍读作同一类有机物体"的中间地带——过细趋近光滑（联想风险回升）、过度低多边形化（明显钻石切割/blocky 感）会让物体被归类为人工几何体而非自然物体，等于引入另一种风格混淆，见 §8.2 P3 待验项。

### 2.2 Symmetry 操纵（feature-carried）[固定]

- Mirror plane = XZ 平面（Y = 0），**包含 axis of elongation**（沿用"axis of elongation lying within the mirror plane"定案）。
- 附件放置改用**柱面坐标**：沿轴位置 u + 绕轴角 θ，法向由 profile curve 给出。
  - **Symmetric**：每个 feature 以 (u, θ) 与 (u, −θ) 成对镜像；约束 |θ| ∈ [30°, 150°]，避免落在 mirror plane 上自我镜像。整体恰好只有**唯一一个** mirror plane。
  - **Asymmetric**：相同 feature inventory（数量/类型/尺寸一致），θ 不配对且间距不规则，保证**不存在任何** mirror plane；非对称度须明显高于阈值。
  - 仅放置于侧表面（lateral surface），不放端面。
- Yoked pairs：同一 body + 同一 feature inventory 只变 arrangement（沿用现有 `inv_seed` 逻辑）。
- 附件类型/尺寸参数沿用旧版：CURVED-CYLINDER / CONE / HEMISPHERE / OCTAHEDRON；`ATTACH_SCALE 0.15–0.22 × ATTACH_SCALE_REF_RADIUS`（见下方"主体缩放"决议，附件尺寸不再随主体 `MINOR_RADIUS` 联动缩放）。
- **端面可读性校准（联动 §2.1）— 已决议**：由于 symmetry 主要在端面视角（az 0°/180°）辨读，±θ 特征对须在该视角下足够大、足够分离以呈现镜像关系。采用的旋钮是**缩小主体、附件绝对尺寸不变**：`MINOR_RADIUS` 从 1.0 缩小约 35% 至 **0.65**（长宽比仍保持 2.5–2.8:1，两端连同主体一起等比例缩小，不改变 elongation 操纵本身），同时把附件尺寸计算从"`ATTACH_SCALE × MINOR_RADIUS`"改为"`ATTACH_SCALE × ATTACH_SCALE_REF_RADIUS`"（`ATTACH_SCALE_REF_RADIUS` 固定为原始 1.0，不随主体缩放），使附件保持原有绝对大小——相对更小的主体，附件占比更大、对称/非对称排列更易辨识。原先"收紧 |θ| 范围"的备选旋钮暂不需要，若 pilot 仍觉得不够明显可再启用。
- **因素命名 — 已决议**：Factor 2 统一命名为 `symmetry`（取值 symmetric / asymmetric），取代旧名 `feature_arrangement`。理由：现在 symmetry 完全由 attached features 承载，无其他来源，命名直接对应操纵的属性本身。数据字段、代码、文档一律使用 `symmetry`。

### 2.3 命名与元数据

**Exemplar 分配（16/条件，16 yoked pairs）— 2026-07-14：移除 ellipsoid 后 4 体均分**：4 种主体（capsule / barrel / spindle / ovoid-cylinder）**恰好整除** 16/条件，按 **(4, 4, 4, 4)** 分配，不再需要不均衡分配，body_type 作为 nuisance 变量的配平问题随之消失。sym 与 asym 用**同一分配**（yoked pair 逐对对应），Exp1/Exp2 保持一致的分配方案。

```
exp1_capsule_sym_01.glb … exp1_capsule_sym_04.glb       （capsule: 4）
exp1_capsule_asym_01.glb …（与同号 sym 为 yoked pair）
exp1_barrel_…(4) / exp1_spindle_…(4) / exp1_ovoidcyl_…(4)
```

`objects_metadata.json` 每物体字段：

| 字段 | 说明 |
|------|------|
| `body_type` | capsule / barrel / spindle / ovoid_cylinder |
| `aspect_ratio` | 实际 length : diameter |
| `major_axis_vector` | [1,0,0] |
| `mirror_plane_normal` | [0,1,0] |
| `symmetry` | symmetric / asymmetric |
| `yoked_pair_id` | 配对编号 |
| `feature_positions` | 全部附件柱面坐标 (u, θ) 与类型 |

### 2.4 Exp2 刺激 [已决议，2026-07-15 定稿并生成——路线 A：沿用 revolution，仅收窄 aspect_ratio 区间]

- Aspect ratio ≤ 1.3 : 1（2026-07-15 由 ≤1.2 上调，见下方"预览结果定稿"——用户要求确保 elongation 存在即 aspect ratio > 1，抖动区间收紧到贴近上限反而不够安全，改为 1.1–1.3），与 Exp1 之间留出清晰间隔带（1.3 ↔ 2.5）。
- Symmetry 操纵、feature 逻辑、命名规则与 Exp1 完全一致（`exp2_…`），复用同一套判读代码（`axis_category` / `feature_category` / `symmetry_readable`）、同一套 metadata schema、同一套柱面坐标 (u, θ) 放置逻辑。

**核心设计思路——不换 body 族，只重新参数化同一套 profile 生成函数**：Exp1 的四种 body_type 之所以互相可区分，靠的不只是整体长宽比，而是两组独立于长宽比的局部曲率特征：

| body_type | 极点（poles）处理 | 赤道（equator）处理 |
|---|---|---|
| capsule | 圆顶（半球端帽） | 直筒（无鼓起） |
| barrel | 收窄的圆顶 | 强鼓起（中段明显宽于两极） |
| spindle | 尖点（收成锐角） | 无鼓起，两端直接锥形收尖 |
| ovoid_cylinder | 扁平/椭球端帽（比 capsule 更扁） | 弱鼓起 |

这两组特征在 aspect ratio 压到 ≤1.3:1 时**不会消失**，只是需要重新校准强度，否则会被"整体接近球形"的视觉效应平均掉：

- **body_type 命名与 4 条 profile 函数保持不变**，仅将 `aspect_ratio` 目标从 2.5–2.8 降到 1.1–1.3（沿用 §2.3 的 (4,4,4,4) 均分与 yoked pair 逻辑，`EXEMPLAR_ALLOC` 无需改动）。
- **barrel** 的鼓起系数需要在低 aspect ratio 下适当放大（否则强鼓起在整体近球形状下不明显）。
- **spindle** 的尖点在棱角化（faceting）时不能被磨圆——低长宽比下尖点是它与其余三体的主要区分线索，faceting 分段数可能需要 body_type 特定的下限（⚠️ 注意：这与 §2.1 "四体统一棱角粗细度"的决议冲突，需要明确是否为 Exp2 单独放开这条约束，或改用其他方式保留尖点可读性）。
- **ovoid_cylinder** 的扁平端帽需要与 capsule 的圆顶端帽保持可辨识的曲率差异（扁平 vs 圆顶）。
- **capsule** 的直筒段在 1.1–1.3:1 下会很短，"直筒"这一识别特征主要靠该短直段与两端球冠的曲率突变（棱角化的切面跳变）来呈现，而非段长本身。

**2026-07-15 用户确认（4 项均已拍板，仍待预览校准，见下）**：
1. ✅ 认可"沿用同一 body_type 命名 + 重新参数化"路线，不引入全新 body 族。
2. ✅ spindle 尖点问题——**核对代码后修正**：`blender_gen_objects.py` 里 spindle 的半径公式 `R*(1-|t|)` 本身就是分段线性的，`PROFILE_FACETS` 只是采样这条曲线的断点数，对已经是直线的函数不产生任何磨圆效果——**尖点在任意 facet 数下都精确保留，不存在"被棱角化磨圆"的风险**，§2.1 "四体统一棱角粗细度"决议对 Exp2 无需为 spindle 单独放宽。（此前草案里的判断有误，已订正。）真正需要重新校准的是 **capsule**：其球冠深度固定 `cap_len = R`，当 `half_L = MINOR_RADIUS × aspect_ratio` 压到 ≤1.3 时（如 aspect=1.1 → half_L≈0.715，`cap_len=0.65`），直筒段只剩 `half_L-cap_len≈0.065`，几乎不可见，capsule 会退化成近似纯球体——见下方预览脚本的 short-cap 变体。（预览与最终决策见下："预览结果定稿"最终仍选择了 A/现行公式，短直筒段的观感被判定为可接受。）
3. ✅ 先出 Blender 预览再讨论具体参数数值——不在文档里空转拍板参数。**已产出**：`blender_preview_exp2_bodies.py`（纯预览，不导出 GLB，不改 `blender_gen_objects.py`/`public/Objects/`），在场景中按 4 (body_type) × 3 (A/B/C 变体) 摆开对比：
   - capsule：A=现行公式（cap=R）vs B=缩短球冠（cap=0.5R，直筒段更明显）vs C=B+当前 feature 密度
   - barrel：A=现行鼓起指数（pow=4）vs B=加强版（pow=8，肩部更平、两端收缩更陡）vs C=B+features
   - spindle / ovoid_cylinder：现行公式已够用，A/B 相同，C=+features，仅用于对比附件拥挤度
   - 运行方式：Blender Scripting workspace → 打开该文件 → Alt+P；控制台会打印每个 object 的 row/col 对照表
4. ✅ 附件绝对尺寸/密度需针对 Exp2 更小主体表面积重新校准——预览脚本的 C 列（现行 `NUM_FEATURE_PAIRS=6`）用于目视判断是否拥挤，若拥挤则下调该值或收紧特征尺寸（参照 Exp1 §2.2 解耦逻辑）。

**2026-07-15 预览结果定稿**：capsule 选 **A**（现行公式，`cap_len=R`，不变）；barrel 选 **A**（现行公式，`bulge_power=4`，不变）；feature 密度选 **C**（`NUM_FEATURE_PAIRS=6`，不变，此前的拥挤观感出现在"重新参数化"的 B 形状上，A 形状 + 6 对密度目视确认不拥挤）。

**结论：Exp2 不需要重新参数化任何 profile 公式**——四条 body_type（capsule/barrel/spindle/ovoid_cylinder）与 `NUM_FEATURE_PAIRS`、`ATTACH_SCALE_*`、`THETA_RANGE_DEG`、`U_RANGE` 等全部沿用 Exp1 原始参数，**唯一的差异是 `aspect_ratio` 目标区间**（Exp1: 2.5–2.8，Exp2: 1.1–1.3）。`blender_preview_exp2_bodies.py` 的 B/D/E 列（重新参数化形状、5/4 对密度）**未被采用**，仅作为本轮校准的排除记录保留在预览脚本里，不影响正式生成脚本。

**2026-07-15 aspect ratio 上限最终调整：≤1.2 → ≤1.3**：用户要求确保 `aspect_ratio > 1`（elongation 确实存在，不能等于 1 变成纯粹的旋转对称球），抖动区间定为 **1.1–1.3**（不再是"贴 1.2 上限只向下抖动"，而是上限本身上调至 1.3，下限 1.1 留出与 1.0 的安全边际）。本文件所有此前写 "≤1.2" 的地方均已同步改为 "≤1.3"（§一总体结构表、本节各处）。与 Exp1（2.5–2.8）之间的间隔带相应变为 1.3 ↔ 2.5，仍然清晰。

**下一步**：改写 `blender_gen_objects.py`，新增 `exp2_` 分支——复用全部现有 profile 函数与参数，只将该分支的 `ASPECT_MIN`/`ASPECT_MAX` 改为 **1.1/1.3**，输出 `exp2_{body_type}_{sym|asym}_{01-04}.glb` + 对应 metadata（`experiment` 字段区分 exp1/exp2）。动代码前需用户最终确认。

**已排除选项（2026-07-15）：环形/甜甜圈（torus）类主体**——曾在讨论候选形状时提及，用户否决：洞的可见性随视角剧烈变化（正对洞口 vs 侧面几乎看不出洞），本身就是新引入的、视角相关的混淆变量；且 torus 拓扑上亏格为 1（有洞），不再是简单凸面体，破坏"主体自身零对称信息、symmetry 完全由 features 承载"这条隔离逻辑的简洁性；也可能引发"戒指/甜甜圈"类物体识别联想，构成额外的语义混淆。现有 4 条 profile（capsule/barrel/spindle/ovoid_cylinder，均无穿孔）不受影响，仅作为后续候选形状讨论时的排除记录。

---

## 三、设计与试次结构

### 3.1 Task 与物体共享 [固定]

| Task | 指导语目标 | 物体 |
|------|-----------|------|
| T1 — Representation | 选择最能代表物体的视角 | 全部物体 |
| T2 — Memory-oriented | 选择最有助于之后记住物体的视角（非记忆测试，无后测） | 全部物体（同一套） |

- Task order 按 Participant ID 末位奇偶平衡（奇 = T1→T2，偶 = T2→T1），作为 between-subjects 因素。
- Carryover 已接受，诊断手段：**Task × Order interaction** + 每物体第一次/第二次 exposure 视角的 circular correlation。数据须记录 `exposure_index`（该物体第 1 / 第 2 次出现）。
- 每个 task 内物体顺序独立随机，但**须同时满足 symmetry 与 body_type 两条交替约束（已决议，2026-07-14 新增 body_type 约束）**：
  - `symmetry`（symmetric/asymmetric）同类不得连续出现超过 2 次——即允许 AABB 式的成对重复，但不允许连续 3 个及以上同类（如 AAA）。
  - **`body_type`（capsule/barrel/spindle/ovoid-cylinder）同类同样不得连续出现超过 2 次**——4 体各 8 个 trial/block（4 exemplar × sym/asym），排列时同一 body_type 不允许连续 3 个及以上。
  - **实现方式**：两条约束需同时满足，简单的"先打乱 symmetry 再交叉填入"手法不足以保证 body_type 也不违反游程限制，改用**拒绝采样**——随机打乱 32 个 trial 顺序，检查 symmetry 与 body_type 两个序列是否均无连续 3 个及以上同类，不满足则重新打乱，直至两条约束同时满足为止（32 个 trial 规模下该采样通常几次内即可收敛，无需复杂的确定性编织算法）。
  - 理由：避免被试在同一 symmetry 条件或同一 body_type 下连续做 3 个以上 trial，产生适应/预期效应或视觉疲劳，同时不要求逐个交替（过于机械）。

### 3.2 物体数量与单次时长 [已决议：16/条件 — 2026-07-14 由 18/条件下调]

**变更背景**：原 18/条件 + 40 s 可见倒计时上限，被反馈"倒计时可见会让被试感到催促"。改为**倒计时不可见**（探索期不显示读秒数字，只在临近上限前给出文字提示，见 §3.3）后，为了在同一 ~60 min 会话上限内留出上限从 40 s 提到 50 s 的余量，物体数从 18/条件降至 **16/条件**。

共享物体集后，trial 数 = 物体数 × 2。每 trial 上限 50 s（达旋转判据后被试通常提前确认，均值预计仍 ~25–30 s，倒计时隐藏后实际均值可能略有上浮，需 pilot 验证）：

| 方案 | 物体数（sym+asym）| Trials | 纯 trial 时间（均值 ~28–32 s / 上限 50 s）| 总时长（含指导语/probe/休息，开销约 11–12 min）|
|------|-------|--------|--------------|------------|
| **已选：16/条件 + 50 s 上限** | 32 | 64 | ~30–34 min / 最坏情况上限 **53.3 min** | ~41–65 min |
| （对照）原 18/条件 + 40 s 上限 | 36 | 72 | ~34 min / 最坏情况上限 48 min | ~45–60 min |
| （参考，若改 45 s 上限）16/条件 | 32 | 64 | — / 最坏情况上限 48 min | ~41–60 min（与原方案打平）|
| （参考，若维持 55–60 s 上限）16/条件 | 32 | 64 | — / 最坏情况上限 58.7–64 min | ~59.7–76 min（超一小时风险高）|

⚠️ **已知并接受的风险（2026-07-14 用户已确认选择 50 s）**：50 s 上限下，"每个 trial 都撞上限"的最坏情况总时长约 **65.3 min**，比原设计的 60 min 硬性上限多出约 5 min。这是小概率尾部情形——隐藏倒计时后，均值预计仍主要由 40 步旋转判据（而非倒计时可见性）驱动，多数被试仍会在判据达标后不久确认。**pilot 时需重点监控 `timeout` 触发率**：若某位被试连续多个 trial 触发 timeout（提示均值偏离预期、时长失控），应在正式收集前重新评估上限或物体数；若 timeout 率维持低位（个位数百分比），维持现状即可。

**2026-07-14 更新**：移除 ellipsoid 后剩 4 种主体，16/条件恰好整除，按 (4,4,4,4) 均分（见 §2.3），原先 5 体不整除导致的分配不平衡问题已消失。若 pilot 实测仍偏紧，可进一步退到 12/条件（干净的 4×3），退路见 §3.6 pilot 观察项。

### 3.3 Trial 流程 [已更新——旋转达标解锁 + 50 s 上限（倒计时不可见）]

每个 trial：novel object 以 **initial oblique viewpoint** 呈现（实现：azimuth 30° 或 330°、elevation 0°，随机其一——oblique in azimuth，既非 end-on 亦非 side-on）。被试自由旋转寻找 preferred view。

**最小旋转达标解锁 Enter**：为确保被试在确认前充分 inspect 物体，Enter 键**仅在累计旋转达到最小判据后**才可用。判据 = **40 rotation steps**（step size 5° → 200° cumulative rotation）。**累计步数仅计 azimuth（←→ / left_right）触发的步数，elevation（↑↓ / up_down）步数不计入判据**——原因：elevation 被限制在 ±30°（单向最多 6 步），若与 azimuth 合并计数，被试可仅靠上下振荡凑够 40 步而从未环绕物体，架空"充分 inspect"的设计意图；只算 azimuth 步数才能保证 40 步确实对应 200° 的环绕探索。达标后被试可随时按 Enter 确认，**final viewpoint = 按 Enter 时刻的 azimuth 与 elevation**。

**上限与超时（2026-07-14 变更：40 s → 50 s，倒计时改为不可见）**：每 trial 最长 **50 s**；若 50 s 内未按 Enter，则**自动记录当前视角并标记为 timeout**。

- **变更原因**：现有实现（`view-selection.js`，`#timer-display`）在整个探索期持续显示逐秒倒数的数字，被认为会让被试感到"被催促"，可能干扰其自然探索节奏。
- **新行为 — 倒计时不可见**：探索期**不显示**任何数字读秒；界面提示文字维持现状（"Use the arrow keys to explore…" / 达标后 "Press Enter to confirm your chosen view."）。
- **临近上限的文字提示**：仅在剩余时间 ≤ **8 s** 时，在原倒计时数字的位置改为显示简短文字提示（暂定 "Please choose your view soon."），不显示具体秒数——目的是保留"快到上限"的软提示，同时不引入贯穿全程的可见倒计时压力。此阈值（8 s）与提示文案为 pilot 待校准项，见 §8.2。
- `timeout` 标记与数据记录逻辑不变，仅上限数值由 40 s 改为 50 s。

英文 methods 定稿措辞（可直接引用，已按 50 s 更新）：

> On each trial, a novel object was presented from an initial oblique viewpoint. Participants freely rotated the object until they found the view they preferred. To ensure that participants inspected the object before making a selection, the Enter key became available only after a minimum cumulative azimuthal rotation criterion had been met. This criterion was set at 40 rotation steps (left/right key presses only, changes in elevation not counted), corresponding to 200° of cumulative rotation around the object's vertical axis with a 5° step size. Once this criterion was met, participants could confirm their selected view by pressing Enter. The final viewpoint was defined as the azimuth and elevation of the object at the moment of confirmation. Each trial had a maximum duration of 50 s; a numeric countdown was not displayed during the trial, and a brief on-screen prompt appeared only in the final seconds to encourage a timely response. If no response was made within the 50 s window, the current viewpoint was automatically recorded and the trial was marked as a timeout.

无练习试次。指导语沿用旧版 T1/T2 原文。

⚠️ **需注意——旋转判据 × key repeat 交互**：§3.5 现定"忽略 key repeat"，即每步需一次独立按键。据此 40 steps = **40 次独立的 azimuth 按键**（←→，不含 ↑↓）才解锁 Enter，可能偏繁琐并挤占 40 s 预算。两个选项：(a) 保持忽略 key repeat（40 次离散按键，强制 deliberate inspection）；(b) 对旋转启用 key repeat（按住连续转，达 200° 更快）——但需重新校准 step 计数（连续步仍按 5°/step 累计）。**默认 (a)。招募前确认，见 §8。**

### 3.4 Probe

- **频率 — 已决议：平均每 10 trials 一次，实现为每 block 内 8–12 trial 随机抖动**（而非硬编码第 10/20/30…）。理由：固定序号会让 probe 系统性落在特定物体后、可能与 body_type/symmetry 条件对齐；随机抖动打散这种对齐。**2026-07-14 更新**：block 大小由 36 降至 32 后，每 block 约 **3** 次，两 block 共约 **6** 次（原文"约 4 次/约 8 次"按旧 block 大小估算，已更新）。
  - **block 内独立计数**：probe 计数器在每个 task block 开始时重置，不跨 block 累计——保证两 task 的 probe 次数严格相等（structural equivalence 硬要求），不受 task order 影响。
  - **首个 probe 提前**：落在每 block 第 6–8 个 trial（而非第 10），避免 block 开头注意提醒的空窗。
- **内容/措辞 — 已决议：confidence 自评版（对两 task 中性的统一 probe）**。定稿 prompt（两 block 通用，文字完全一致）：

  > "How confident are you that the view you selected best fit what the task asked for?"

  三档、鼠标点击的按钮：**Not confident / Somewhat confident / Confident**。非主 DV，仅作维持注意用途，不计正确率、不作 manipulation check、不作再认测验（守"memory task 绝非 memory test"规则）。⚠️ 旧版"难度评分（Difficult/Somewhat easy/Easy）"及一度考虑的 memory-clarity 版均已弃用。
  - **中性设计说明**："what the task asked for" 为占位式表达——representation 被试代入"是否代表物体"、memory-oriented 被试代入"是否有助记忆"，probe 本身不 invoke 任何一方的构念、不偏袒任一 task。两 block 用完全相同的 prompt，同时保 textual equivalence 与对两 task 的构念中性，不引入指导语之外的第二个 task 间差异。

### 3.5 操控 [固定，沿用旧版]

←→ azimuth ±5°（0–360° 循环）；↑↓ elevation ±5°（±30°）；忽略 key repeat；Euler `XYZ`（elevation 作为最外层/世界系旋转施加，避免其随 azimuth 变成绕物体自身长轴的"滚转"——已在实现中发现并修正，见开发记录）；`INITIAL_Y = −π/2`（azimuth 0° = end-on，90°/270° = side-on）。

### 3.6 Block 间休息与指导语呈现 [已决议]

两个 block（T1、T2）之间插入一次休息，位置**仅 block 间一次**（不在 block 内中途插入）。设计原则：保护每个 block 内部的连续性与两 block 的结构对称，保护指导语操纵的注册强度——两者都是 instruction-only 设计的命脉。

**流程（两 block 前严格对称）**：

```
[block 1 结束]
→ 休息页（无强制时长：休息提示常驻，按 Enter 即可继续，同一界面）
→ 指导语页（呈现下一 task 的完整指导语，被试主动确认后开始；可设最短停留防止秒跳）
→ [block 2 开始]
```

- **休息页**（2026-07-15 变更）：取消 30 s 强制倒计时/禁用期，只保留休息提示文字；按 Enter 键即可继续（鼠标点击「Continue」按钮保留作为备用方式），仍是同一个界面，不拆分。
- **指导语页与休息页分离**（两页）：休息=放松、指导语=装载新任务规则，目标相反，不合并——避免指导语被当作休息页说明而略读，削弱操纵。
- **对称性要求**：**每个 block 前都要有指导语页**（含第一个 block，此时无前置休息但仍走指导语页），保证两 task 的指导语呈现方式一致；task order 反向（T2→T1）的被试流程同样对称。
- 记录：`rest_start_ms` / `rest_end_ms`（休息实际时长，即使不再强制最短时长仍记录，供事后查看被试实际休息了多久）、`instruction_confirm_ms`（指导语页确认时刻），供核对被试是否真读了指导语。**这三个时间戳落在 `block_events.csv`（每 block 一行），不进 view_record，见 §4.4。**

⚠️ **pilot 观察项（不阻塞）**：单个 block（16/条件下约 30–34 min）是否过长——若后半段 timeout 率上升或旋转步数骤降，优先**减少物体数（16→12，即干净的 4×3）缩短 block**，而非在 block 内加中途休息（后者破坏 block 对称与 carryover 诊断）。

---

## 四、数据记录

### 4.1 view_record.csv（每 trial 一行）

沿用旧版字段，做以下增删：

| 变更 | 字段 | 说明 |
|------|------|------|
| 新增 | `experiment` | `exp1` / `exp2` |
| 新增 | `body_type` | 四种主体之一（stimulus-level 分析用）|
| 新增 | `exposure_index` | 1 / 2（该物体全程第几次出现，carryover 诊断）|
| 新增 | `timeout` | true = 50 s 上限自动记录、未按 Enter；false = 主动确认 |
| 新增 | `cumulative_rotation_steps` | 该 trial 累计 **azimuth（left_right）** 步数，判据为 ≥40（对齐 §3.3，此前本表曾误写 ≥50，已修正）；elevation（up_down）步数不计入此字段，`up_down_count` 单独记录 |
| 新增 | `criterion_met` | azimuth 步数达标（≥40）后才解锁 Enter；诊断极少数 timeout 前未达标的 trial |
| 改名 | `symmetry` | 原 `feature_arrangement`（已定案，见 §2.2）|
| 删除 | `object_set` | Set 结构已取消 |
| 删除 | `global_shape` | elongation 为 between-experiment，由 `experiment` 字段承载 |
| 删除 | `condition` | 旧版为 `${shape}_${arr}`（如 `E_asym`）；shape 维度已删，剩余信息与 `symmetry` 完全同义。**只留 `symmetry`，不设别名列**，避免两列同义在分析时混淆 |

保留（`confirmation_latency` 语义 = trial 起始到按 Enter 的时长；timeout 时 = 50 s）：`participant_id, task, object_id, symmetry(sym/asym), trial_index, task_order, start_azimuth, final_azimuth, final_elevation, axis_category, feature_category, confirmation_latency, enter_pressed, up_down_count, left_right_count, timestamp`。

> 注：`symmetry` 是 sym/asym 的唯一权威列；旧代码若有 `condition` 输出须移除，CSV schema 不含 `condition`。

**新增（2026-07-14，探索行为补充指标）— 已决议**：

| 字段 | 说明 |
|------|------|
| `dwell_ratio_end_on` | 该 trial 全程（trial 起始至按 Enter / timeout）内，视角处于 `end_on` 的采样点占比（0–1） |
| `dwell_ratio_side_on` | 同上，`side_on` 占比 |
| `dwell_ratio_oblique` | 同上，`oblique` 占比 |

- 三者之和 = 1（Exp1、Exp2 全部物体均适用，见下方 §4.2 的 2026-07-15 更正）。
- **实现方式**：不新增采样基础设施，复用已有的 100 ms 轨迹采样（`trajectorySamples`，§4.3）——在 trial 确认/超时那一刻，遍历该 trial 已收集的全部采样点，用既有的 `getAxisCategory(azimuth)` 逐点分类计数，除以采样总点数得到三个比例，作为新字段随该行一起写入 `view_record.csv`（不新增文件、不改采样频率）。
- **按键次数（up_down_count / left_right_count）— 已确认无需改动**：现有字段是整个 trial 的总按键次数，已满足"探索时左右/上下按键次数"的需求，不新增比例或分阶段字段。

**新增（2026-07-15，对称可读性指标）— 已决议**：

| 字段 | 说明 |
|------|------|
| `symmetry_readable` | 仅 symmetric 物体适用（asymmetric 记 `N/A`）：`final_azimuth` 是否落在对称可读窗口内（`true`/`false`），窗口定义见 §4.2 |
| `dwell_ratio_symmetry_readable` | 仅 symmetric 物体适用（asymmetric 记 `N/A`）：该 trial 全程内，视角落在对称可读窗口的采样点占比（0–1） |

- **实现方式**：与 `dwell_ratio_end_on` 等字段一致，复用已有的 100 ms 轨迹采样（`trajectorySamples`），不新增采样基础设施；`symmetry_readable` 基于确认/超时时刻的 `final_azimuth` 单点判定，`dwell_ratio_symmetry_readable` 基于整段轨迹逐点判定后取占比。

### 4.2 视角分类

- `axis_category`（**2026-07-15 更正：Exp1、Exp2 全部物体均适用**，不再是 Exp2=N/A）：end_on ±22.5°；side_on 90°±22.5°；其余 oblique。
  - **更正原因**：本节原写"Exp2 为 N/A"，是基于旧假设——Exp2 aspect ratio ≤1.2、接近球体，azimuth 分类没有意义。但 `view-selection.js` 的 `getAxisCategory`/`getFeatureCategory` 实际从未按 experiment 做区分，一直对两个实验都计算真实值（pilot 测试 CSV `data/exp2/PEP2_00_view_record.csv` 证实了这点）。且 Exp2 的 aspect ratio 已定稿为 **1.1–1.3**（见 §2.4，用户明确要求"确保 elongation 存在"），并非纯球体，`end_on`/`side_on`/`oblique` 分类在该长宽比下依然有意义。**决议：保留现状，两实验都计算真实值，不改代码**；本文件此前"Exp2=N/A"的表述已更正，避免文档与代码行为不一致造成误解。`feature_category`（下方，仅 asymmetric 适用）不受此项影响，其 N/A 规则（symmetric 一律 N/A）与 experiment 无关。
- `feature_category`（**仅 asymmetric 物体适用，symmetric 一律 `N/A`**）：视角-法向量夹角 < 60° 为 feature_revealing；沿用旧版阈值。柱面坐标下每个 feature 的法向从 metadata 的 (u, θ) + profile 导出。
  - ⚠️ **2026-07-15 修正**：pilot 数据（`PPILOT_001_view_record.csv`）发现现有实现对 symmetric 物体也套用了同一套法向量阈值计算，且由于该公式在 azimuth=0°/180°（end-on）处恒为 0，导致 symmetric 物体的 `feature_category` 在全部 64 个 trial 中无一例外都是 `feature_concealed`，即便是 end_on 视角也不例外——该字段对 symmetric 物体完全没有区分度。原因：法向量朝向相机的判据（"细节是否正对镜头"）适用于衡量单个 asymmetric 特征的可辨识度，但不适用于衡量"镜像对称是否可读"这一不同的构念（后者关心的是镜像两侧是否同时可见，而非表面朝向）。修正方案：**`feature_category` 收窄为仅对 asymmetric 物体计算**（symmetric 输出 `N/A`），对称可读性改由下方独立定义的 `symmetry_readable` / `dwell_ratio_symmetry_readable` 承载，两者不再混用同一套判据。
- **`symmetry_readable`（新增，仅 symmetric 物体适用，asymmetric 为 `N/A`）**：定义为**对称可读窗口** = azimuth 落在长轴方向（0°/180°，即 `end_on` 朝向）左右 **±10°** 以内（即 `[350°,360°]∪[0°,10°]∪[170°,190°]`），窗口内**不限制 elevation**（±30° 全范围均计入）。
  - **方法学定位（直接定案，不依赖 pilot 目视校准）**：采用固定角度窗口而非逐特征遮挡建模，理由是后者虽然几何上更精确，但在 azimuth 严格偏离 0°/180° 后，不同 θ 的镜像特征对会不同步地进入/退出遮挡状态（不存在一段稳定的"全部特征对同时可见"区间，只在单一临界点成立），不利于方法学部分的清晰陈述与复现；固定窗口更简单、可复现，且作为一个保守的（比 `end_on` 更窄的）子集与现有分类体系保持一致。
  - **窗口嵌套关系**：`symmetry_readable` 的 ±10° 窗口是 `axis_category` 中 `end_on`（±22.5°）窗口的**严格子集**——落在对称可读窗口内的视角必然也是 `end_on`，反之不一定（`end_on` 但未落入 ±10° 的视角，`axis_category` 记 `end_on`，但 `symmetry_readable` 为 `false`）。

### 4.3 Per-sample log 与 view_probe.csv

沿用旧版（100 ms 采样；probe 字段不变，`after_trial_index` 按新频率——block 内 8–12 随机抖动——取值，另记录 `block_probe_index` 便于核对每 block 次数）。

### 4.4 block_events.csv（每 block 一行，安置 §3.6 时间戳）

休息/指导语时间戳是 **block 切换时发生一次**的事件，不是每 trial 都有——塞进 `view_record.csv`（每 trial 一行）会产生大量空列，挂在"该 block 第一个 trial 行"则语义别扭。故单开一个每被试的小文件 `data/exp{1,2}/P00X_block_events.csv`，每个 block 一行：

| 字段 | 说明 |
|------|------|
| `participant_id` | |
| `block_index` | 1 / 2 |
| `task` | representation / memory_oriented（该 block 的 task）|
| `task_order` | 与主表一致 |
| `rest_start_ms` / `rest_end_ms` | 休息实际时长（block 1 前无前置休息，留空）|
| `instruction_confirm_ms` | 指导语页确认时刻（核对是否真读、是否秒跳）|
| `block_start_ms` / `block_end_ms` | 该 block 首/末 trial 时刻，便于核对 block 时长 |

分析时按 `participant_id` + `block_index` 与主表关联。此文件与 view_record / probe / samples 并列，构成每被试第四个文件（§7 检查单相应核对）。

---

## 五、Blender 脚本重写清单

基于现有 `blender_gen_objects.py` 改写，保留：材质、导出、yoked inventory seed 逻辑、attachment 造型函数。

1. **删除** Set A/B 分支、NE 条件、box body（`create_box`）。
2. **新增** 四个 profile 函数（capsule / barrel / spindle / ovoid-cylinder），统一以**棱角化（多段折线）profile curve** + 旋转生成（`bmesh` lathe 或 screw modifier 等价实现），参数含 aspect_ratio 与 facet 粗细度（分段数，四体统一，不再含 ripple 参数）。全部 profile 关于赤道面对称（前后对称），且均为凸面轮廓。
3. **重写放置**：`_grid_positions`（面坐标）→ 柱面坐标 (u, θ)；`place_symmetric` 生成 ±θ 对；`place_asymmetric` 同 inventory 不配对放置 + 无 mirror plane 校验。
4. **元数据** 按 §2.3 字段导出。
5. 输出：`public/Objects/exp1_*.glb`（32 个 = 16 sym + 16 asym，分配见 §2.3）+ `objects_metadata.json`。

Exp2 生成逻辑复用同一脚本，配置切换（body 参数表 + `exp2_` 前缀），在 Exp2 定稿后启用。

---

## 六、技术栈与项目结构

**保持不变**：前端 Vite + Three.js、后端 Flask、文件架构、访问地址、渲染参数（相机/灯光/HDR）、快速排查表。

⚠️ **工作量说明（勿低估）**：本计划的多数功能是**从零实现**，不是"改一下现有开关"。核对实际代码库现状——`view-selection.js` 中 `EXEMPLAR_ALLOC` / `PROBE_MIN_GAP` / `MIN_ROTATION_STEPS` / `REST_MIN_SEC` 等配置常量**均不存在**；`beforeunload` 拦截不存在；`TEST_MODE` 在 `main.js`（约 L375）而非 view-selection.js；`blender_gen_objects.py` **仍是纯 box body 逻辑**（约 L114），四种 revolution body 一个都还没写。因此以下均为新建/重写，不是配置微调：

1. **Blender 四体重写**（§5）：四个前后对称 revolution profile + 柱面坐标 ±θ 放置 + profile 棱角化（facet，替代已否决的环状 ripple） + 新元数据——`blender_gen_objects.py` 基本重写。
2. **旋转判据逻辑**（§3.3）：40 步解锁 Enter + 50 s 上限超时（倒计时不可见，剩余 ≤8 s 才转为文字提示） + oblique 起点 + elevation 夹紧 + azimuth 零点锚 end-on。
3. **休息页 / 指导语页**（§3.6）：新页面与流程、强制最短时长、两 block 对称。
4. **probe 调度与呈现**（§3.4）：block 内 8–12 抖动、独立计数、confidence probe UI。
5. **移除旧再认测验**：`renderMemoryTest` / `showModelList` 那套 "I have seen this" 客观再认整体删除。
6. **新 CSV schema**（§4）：view_record 增删字段、新增 `block_events.csv`、移除 `condition`。
7. **TEST_MODE / 防中断改造**（§7）：关 TEST_MODE、beforeunload、禁用误触快捷键。
8. **实验配置块 + 单开关**（§7）：`EXPERIMENT` 切换、URL 参数覆盖。

这不影响计划的正确性，但排期上应按"从零实现"估工，而非"改现有开关"。

---

## 七、执行便利性（新增章节）

**单代码库、单开关。** 两个实验共用全部代码，顶部配置块：

```js
const EXPERIMENT = 'exp1';        // 'exp1' | 'exp2' —— 每期数据收集只改这一行
const EXEMPLAR_ALLOC = {capsule:4, barrel:4, spindle:4, ovoid_cylinder:4}; // 16/条件 (4,4,4,4)，2026-07-14 移除 ellipsoid 后 4 体均分
const PROBE_MIN_GAP = 8;          // probe 间隔随机区间 [8,12]，平均 ~10；block 内独立计数
const PROBE_MAX_GAP = 12;
const PROBE_FIRST = 6;            // 每 block 首个 probe 落在第 6–8 trial
const MIN_ROTATION_STEPS = 40;    // 累计 azimuth 步数达标解锁 Enter（40 × 5° = 200°；elevation 步数不计入）
const MAX_TRIAL_SEC = 50;         // 每 trial 上限（2026-07-14：40→50），超时自动记录并标记 timeout
const TIMER_VISIBLE = false;      // 2026-07-14 新增：探索期不显示逐秒倒计时（原 #timer-display 逐秒刷新，改为隐藏）
const TIMER_WARNING_SEC = 8;      // 新增：剩余 ≤8 s 时，倒计时数字位置改为文字提示（"Please choose your view soon."），仍不显示具体秒数
const KEY_REPEAT = false;         // §3.3 待确认：旋转是否启用 key repeat
// REST_MIN_SEC 已移除（2026-07-15）：休息页不再强制最短时长，按 Enter 即可继续（§3.6）
```

或经 URL 参数覆盖（`view-selection.html?exp=1`），避免收集期间改代码。

**开场输入页做三件事**：录入 Participant ID → 自动按末位奇偶显示本场 task 顺序（主试无需人工判断）→ 校验 ID 格式与重复（后端查 CSV 中已有 ID，防止串号）。

**数据文件按被试落盘**：`data/exp1/P001_view_record.csv`、`P001_probe.csv`、`P001_samples.csv`、`P001_block_events.csv`（§4.4）——每被试独立文件，天然完成备份粒度，无需收集后手工拆分追加式大 CSV；汇总分析时脚本合并。

**每场次检查单（打印贴在主试机旁）**：

1. 终端 A：`python server.py`（:5006）；终端 B：`npm run dev`（:5180）
2. **收集前确认**：代码 `TEST_MODE = false`；机器休眠/屏保已关、电源常插；浏览器全屏/kiosk 已开
3. 打开 `http://localhost:5180/view-selection.html?exp=1`
4. 录入 ID → 核对页面显示的 task 顺序
5. block 1 结束后确认出现休息页（30 s 倒计时）→ 指导语页 → block 2；两 block 前均有指导语页
6. 结束后确认 `data/exp1/` 出现该 ID 的四个文件（view_record / probe / samples / block_events）且行数正确（view_record 行数 = trial 数；block_events = 2 行）
7. 当日结束整目录备份一次（含日期）

**中断预案**：若会话中途崩溃/意外中断——**作废该 ID、换新 ID 重招下一个被试，切勿让原被试重做**（novelty 已污染）。崩前的 per-trial 数据仍在 `data/exp1/`，可留作诊断，不进分析。

**中断恢复 — 已决议：不做断点续跑，采用防中断措施。** 数据收集为实验室内主试全程在场、受控环境，中断概率本身很低；续跑逻辑（含随机化顺序恢复）成本高、新增 bug 面，性价比不足。改为用环境约束 + 小改代码把中断概率压低，剩余风险用"作废该 ID、重招新被试"承接。⚠️ **注意：中断后不得让同一被试重做**——物体已非 novel，preferred-view 会被首次记忆污染，该被试数据须整体弃用。

**防中断——交互改造清单（第一梯队，写入 `view-selection.js` 改造）：**

1. **关闭 `TEST_MODE`**：`TEST_MODE` 目前位于 `main.js`（约 L375），当前为 `true`，会常显"下一个"按钮、跳过步数限制——正式收集必须设 `false`（或迁移到统一配置块后设 false），否则被试可乱跳流程（最大的人为中断源）。
2. **`beforeunload` 拦截**：误触刷新/关闭时弹浏览器原生确认"离开将丢失进度"，给一次反悔机会。
3. **禁用误触快捷键**：拦截 F5、Ctrl/Cmd+R、Backspace 导航、Ctrl/Cmd+W 等；实验中被试仅用方向键 + 鼠标点 probe。
4. **per-trial 落盘保持不变**：现有"每 action/trial 即 POST 写文件"已具备——中途崩溃时已完成 trial 不丢（该被试虽因 novelty 弃用，但数据可用于诊断崩溃原因）。**勿改为批量提交。**

**防中断——收集规范（第二梯队，靠操作而非代码）：**

5. **全屏 / kiosk 模式**：浏览器全屏（F11 或 `--kiosk` 启动），被试看不到地址栏/标签栏，物理上点不到危险控件——单条收益最大。
6. **机器电源与网络**：收集前关闭休眠/屏保（45–60 min 会话最怕中途黑屏）、电源常插、网络稳定（HDR 环境贴图等资源勿在中途断）。

---

## 八、决策与待验清单（本轮）

### 8.1 设计决策项 —— 已全部锁定 ✅

| # | 事项 | 位置 | 决议 |
|---|------|------|------|
| 1 | 每 condition 物体数 | §3.2 | **16/条件**（32 物体，64 trials；分配见 §2.3）——2026-07-14 由 18/条件下调，见 #7 |
| 1b | 主体种类数 | §2.1 / §2.3 | 2026-07-14：移除 ellipsoid，五体→**四体**（capsule/barrel/spindle/ovoid-cylinder），16/条件恰好按 (4,4,4,4) 均分，消除原不均衡分配 |
| 1c | body_type 交替约束 | §3.1 | 2026-07-14 新增：`body_type` 同类连续出现不得超过 2 次（与既有 symmetry 交替约束并行，拒绝采样同时满足两条约束）|
| 2 | 波纹/褶皱 vs profile 棱角化 | §2.1 | 波纹方案已否决（解剖学联想风险），改为 profile curve 棱角化（多段折线 lathe，四体统一），不引入新镜像面 |
| 3 | frustum/ogive body polarity | §2.1 | 换成前后对称凸面主体 spindle / ovoid-cylinder（选项 b，保守路线）|
| 4 | `feature_arrangement` → `symmetry` 改名 | §2.2 | 统一用 `symmetry` |
| 5 | Probe 频率 | §3.4 | 平均每 10（block 内 8–12 随机抖动，独立计数，首个第 6–8）|
| 5b | Probe 内容/措辞 | §3.4 | confidence 版（Not/Somewhat/Confident），对两 task 中性的统一 probe |
| 6 | 断点续跑是否实现 | §7 | 不做续跑，采用防中断措施（在场受控收集）|
| 7 | Trial 上限倒计时是否可见 + 上限秒数 | §3.3 / §3.2 | 2026-07-14：倒计时改为**不可见**（探索期不显示逐秒数字，剩余 ≤8 s 才转文字提示）；上限由 40 s 提到 **50 s**；为把最坏情况总时长控制在可接受范围，物体数同步由 18/条件降至 16/条件（见 #1）。已知代价：50 s × 64 trials 的理论最坏情况总时长约 65 min，比原 60 min 硬上限多约 5 min，接受为低概率尾部风险，**pilot 时须监控 `timeout` 触发率**（§3.2）|

数据收集前需拍板的核心设计决定已全部锁定，可进入代码实现。

### 8.2 pilot 待验项 —— 非决策，需在有可跑刺激/界面后目视校准

> 这两项不是等待回答的决策，而是待执行的检查动作，依赖已生成的刺激与界面，无法在开发前决定。默认按当前参数实现，pilot 时验证、需要才回填。

| # | 待验事项 | 位置 | 检查动作 / 默认 |
|---|------|------|------|
| P1 | 端面视角 symmetry 可读性 | §2.1 / §2.2 | 已应用一版校准：`MINOR_RADIUS` 1.0→0.65（缩小约35%），附件尺寸解耦为固定绝对值（不再随 `MINOR_RADIUS` 缩放）。仍需 pilot 目视确认：端面视角（az 0°）下对称关系是否清晰、附件是否因主体变小而在圆周上拥挤/重叠。仍不理想则按校准优先级继续动参数——先减少 `NUM_FEATURE_PAIRS` 或收紧特征尺寸，再考虑 |θ| 范围收紧至 [45°,135°]，最后才放宽 aspect ratio |
| P2 | 旋转 key repeat 操作体验 | §3.3 | pilot 观察达 40 步的离散按键是否过繁琐/挤占 40 s。默认忽略 key repeat（40 次离散按键）；过繁琐则改为对旋转启用 key repeat 并重校步计数 |
| P3 | profile 棱角粗细校准 | §2.1 | pilot 目视确认棱角粗细是否落在"可辨识切面、仍读作有机物体"区间——过细趋近光滑（解剖学联想风险回升）、过粗趋近多面体/钻石切割（风格混淆，物体被归类为人工几何体）。默认取中等分段数，四体统一，据 pilot 观感调整 |
| P4 | 50 s 上限下的 timeout 触发率 / 临近上限文字提示校准 | §3.2 / §3.3 | pilot 时统计 `timeout` 触发率与实际均值 confirmation_latency，确认是否接近文档预期（均值 ~28–32 s）；若 timeout 率明显偏高或均值明显上浮，需重新评估 50 s 上限或物体数（见 §3.2 已知风险）。同时目视/口头确认剩余 ≤8 s 时的文字提示（"Please choose your view soon."）时机与措辞是否合适，阈值与文案可据 pilot 调整 |