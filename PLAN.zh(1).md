# 改编计划：视角选择实验

## 目标
在现有的 3D 物体探索界面基础上进行改编，让参与者自由旋转物体，并在两种任务框架下
**确认一个最终视角**。采用 2（任务）× 3（拉伸程度）的被试内设计，共 60 个 trial，
带有周期性 probe，并记录基于角度的数据。

---

## A. 扩展方式 —— 保留旧实验，在其旁边新增新实验

**重要：** 现有的 80 物体好奇心 / 记忆测验实验**完整保留、保持可用、不做改动**。新的
视角选择实验作为一个*并行模式*来构建，而不是替换。

**推荐架构（方案 1 —— 独立页面 + 模块）：**
- `index.html` + `main.js` 原样保留 → 旧实验，通过 `/` 访问。
- 新增一个入口，例如 `view-selection.html` + `view-selection.js`，作为新实验，通过
  `/view-selection.html` 访问。（Vite 开发服务器会自动同时提供两个页面；`vite build`
  时需在 `vite.config.js` 的 `build.rollupOptions.input` 中加入两个 HTML 文件。）
- Flask 服务器新增**新的**路由（如 `/record_view`、`/probe`），写入**新的** CSV 文件；
  旧的 `/record` 和 `/memory_result` 路由及其 CSV 保持不变。

**备选架构（可自行选择）：**
- *方案 2 —— 共享核心模块：* 把场景/渲染器/灯光/按键处理抽取到 `core.js`，由两个实验
  共同 import。代码重复更少，但需要轻微改动旧的 `main.js`，因此旧代码不再严格"零改动"。
- *方案 3 —— 单页面、模式切换：* 用 URL 参数或 welcome 界面开关在"好奇心模式"与
  "视角选择模式"之间切换。代码交织最多、破坏旧行为的风险最高 —— 不推荐。

**作为构建块复用（复制进新模块，或通过 `core.js` 共享）：** Vite + Three.js + Flask
技术栈、`/api` 代理、场景/灯光/渲染器/HDR 环境、基于 `keyup` 的按键处理（含
`isProcessing` 锁）、fetch → Flask → CSV 的记录管线、session-ID 采集、`switchModule()`
屏幕切换模式，以及 `export_sessions.py`。

**新实验不沿用的部分（在新模块中重新构建，而不是从旧实验中删除）：**
- 16 个一组的 block 结构、90 步预算与 `countdown`、`seenModels`、foils。
- 识别记忆测验（`showModelList`、`renderMemoryTest`、`/memory_result`、
  `output_pngs` 图片）。新的"Memory task"只是同一个视角选择任务的**不同指导语**。
- 相机相对的增量旋转算法（新引擎改用显式的受限 elevation + 不受限 azimuth 状态）。
- `main_for_ai.js` 和图片/wifi 辅助脚本与新模式无关。

---

## B. 工作模块（要做什么 —— 不涉及怎么做）

### 1. 物体集合与元数据
- 将发现逻辑切换到 **30 个物体的集合**（10 个 base × 3 个拉伸程度）。
- 每个物体需要暴露 **baseId** 和 **拉伸程度（elongation level）**，以便记录数据以及
  用于"相邻约束"。*（依赖命名规范 —— 见设计决策。）*

### 2. Trial 排序
- 构建 **60-trial 结构**：两个任务 block，每个 block 包含全部 30 个物体。
- 在每个 block 内随机化这 30 个物体，**约束条件是：同一 base object 不能连续相邻出现**。
- 跟踪一个全局 trial 编号，并在**每 10 个 trial 后触发一次 probe**。

### 3. 旋转引擎（核心概念变化）
- 用**两个显式状态变量**表示视角：azimuth 和 elevation。
- **Azimuth（方位角）：** 左/右键，每次 5°，不受限 0–360°（循环回绕）。
- **Elevation（仰角）：** 上/下键，每次 5°，**限制在 −45°…+45°**。
- 定义好**零点**，使其符合实验几何（elevation 0 = 起始；azimuth 0 = 长轴与视线方向
  对齐 = "短边视角"）。这需要对照真实导出的模型进行标定。

### 4. Trial 流程与界面
- 在 `switchModule()` 上新增/重命名几个界面：**instruction（指导语，T1 / T2 文本）**、
  **trial（查看器 + 25 秒计时 + 确认）**、**probe（三按钮回答）**，以及保留现有的
  welcome 和 end 界面（更新 welcome 文案）。
- 单个 trial 循环：指导语 → 加载物体 + 重置视角 → 25 秒探索 → 确认 → 记录 → 下一个；
  在第 10 个 trial 的节点处插入 probe。

### 5. 数据记录与表结构
- 按规格采集：**participant ID、task type、object ID、base object ID、拉伸程度、
  trial number、最终 azimuth、最终 elevation、旋转轨迹（rotation trajectory）**，
  以及 probe 回答。
- 复用逐动作 POST 的*模式*作为**旋转轨迹**（每个旋转步骤一行），并在确认时追加一条
  **最终视角记录** —— 但写入**新的端点和新的 CSV 文件**，使旧的 `/record` /
  `record.csv` 保持不变。
- 新表结构放在新的服务器路由以及一个新的 reset/export 辅助脚本里（或在现有脚本中新增
  分支）。azimuth 视角类别（short / long / oblique ±22.5°）是在记录时计算，还是留到
  后期分析，本身也是一个设计决策。

---

## C. 需要自己做的设计决策

这些会实质性地影响实现，也是很好的设计练习：

0. **扩展架构** —— 选择上面的方案 1 / 2 / 3（独立页面、共享核心模块、或单页面模式
   切换）。推荐方案 1。
1. **25 秒计时语义** —— 硬性截止 vs. 软性提示；若到 0 秒仍未确认时的行为（自动提交当前
   视角，还是继续等待）。25秒探索 时间后，出现提示词 “Click Confirm when you are satisfied with your selection.” 然后按回车确认
2. **任务 block 顺序** —— 平衡方案（按参与者）一半先T1，一半先T2
3. **确认方式** —— 按键、屏幕按钮，或两者皆可。
4. **30 个 Blender 输出文件的命名规范**（决定元数据解析器怎么写）。
obj01_low.glb
obj01_medium.glb
obj01_high.glb
obj02_low.glb
...
obj10_high.glb
5. **Probe 范围** —— 全局每 10 个 trial vs. 每个 block 内；是否/如何记录 probe 反应时。出现提示框，让参与者Probe 的文字是：“Please briefly think back to the views you selected in the previous few trials. How clearly can you remember the views you chose?”
下面显示三个选择按键 clickable response buttons：
Not clearly
Somewhat clearly
Clearly

6. **指导语展示** —— 每个 trial 都显示 vs. 每个 block 显示一次；是否加入注视点/trial 间
   间隔。
7. **Azimuth/elevation 零点标定** —— 确认模型导入后的朝向，使 0° 真正落在短边视角。
8. **视角类别计算** —— 在记录时计算还是在分析阶段计算。
9. **轨迹格式** —— 逐步行（per-step rows）vs. 在最终记录上序列化为一个数组。这里不用记轨迹，记录参与者操作（上下操作，和左右操作次数）最后我需要得到分别两类操作占总操作的比例.

---
## D. 建议的构建顺序
1. 新增新页面 + 模块（`view-selection.html` / `view-selection.js`），在其独立的
   Three.js 场景中加载一个物体；确认 `/` 处的旧实验仍能正常工作。
2. 实现 azimuth/elevation 旋转引擎 + 零点标定。
3. 接入 30 个物体的元数据 + 受约束的随机化 + 60-trial 序列。
4. 添加 instruction / 25 秒计时 / 确认 / probe 界面。
5. 新增新的服务器路由 + CSV 表结构；端到端验证一次完整 session，且不破坏旧的
   `/record` 流程。

---

## 实验规格（参考）

- **物体：** 10 个 base object × 3 个拉伸版本 = 30 个物体（Blender 生成；所有物体的
  长轴都在 0°/180°）。
- **设计：** 2 × 3 被试内设计。
  - *任务因素（2）：* Representation task（"为宣传册留下最好印象"）和 Memory task
    （"最有助于之后回忆这个物体的视角"）。
  - *拉伸因素（3）：* low / medium / high。
- **Trial 数：** 每位参与者完成 2 个任务 block；每个 block 呈现全部 30 个物体 →
  30 × 2 = 60 trial。block 内随机化这 30 个物体，约束是同一 base object 的三个拉伸
  版本不相邻。
- **单个 trial 流程：**
  1. 出现 instruction。
     - T1："Suppose you were making a brochure and you tried to give your customers
       the best possible impression of the objects shown on the screen. Which views
       would you choose?"
     - T2："Please choose the view that you think would help you recognise this
       object best later."
  2. 呈现一个 3D 物体。
  3. 25 秒自由旋转探索。
  4. 将物体旋转到最终选择的视角。
  5. 确认选择（按键或按钮）。
  6. 每完成 10 个 trial 后，插入一个简短 probe 界面 —— 文本："Please briefly think
     back to the views you selected in the previous few trials. How clearly can you
     remember the views you chose?"，下方三个按钮：Not clearly / Somewhat clearly /
     Clearly。
  7. 系统记录最终视角数据。
- **Azimuth 视角类别（±22.5°）：** 长边视角 90°/270°；短边视角 0°/180°；
  斜视角 45°/135°/225°/315°。
- **Elevation：** 记录最终 elevation 的绝对值；0° 是起始点（物体长轴与视线方向同向）。
- **采集数据：** participant ID、task type、object ID / base object ID、拉伸程度、
  trial number、最终 azimuth、最终 elevation、旋转轨迹。
