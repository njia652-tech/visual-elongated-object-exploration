# 数据收集操作计划（第三版）

> 面向正式收数据阶段。代码已按 PLAN(2) 实现完毕，本文件只关注"如何跑起来、如何管理数据"。

---

## 一、一次性准备（每台收数据的电脑只需做一次）

### 1. 生成 18 个 GLB 物体

当前 `public/Objects/` 已有 18 个文件，但它们是**旧版方块主体**，需用新 Blender 脚本重新生成。

```
Blender → Scripting → Open blender_gen_objects.py → Alt+P 运行
```

- 确认 System Console 输出 `Done: 18/18 objects exported`
- 生成完后可用 `blender_preview.py` 抽查（改 `OBJ_IDX` 看三种拉伸是否为椭球体）

### 2. 安装依赖（仅首次）

```powershell
npm install
pip install flask flask-cors
```

---

## 二、每次开机启动（2 个终端，保持开着）

**终端 A — Flask 后端：**
```powershell
python server.py
```
看到 `Running on http://127.0.0.1:5001` 即可。

**终端 B — Vite 前端：**
```powershell
npm run dev
```
看到 `Local: http://localhost:5180/` 即可。

实验地址：`http://localhost:5180/view-selection.html`

> 两个终端都不能关，关了哪个数据就存不上（Flask 关了）或页面打不开（Vite 关了）。

---

## 三、Participant ID 规范

| 末位数字 | Task 顺序 |
|---------|---------|
| 奇数（1, 3, 5…） | T1（Representation）→ T2（Recognition） |
| 偶数（0, 2, 4…） | T2（Recognition）→ T1（Representation） |

建议命名格式：`P001`、`P002` … 奇偶交替分配，自动平衡 task 顺序。

实验开始时参与者在输入框填入分配好的 ID，点 Start。

---

## 四、单次 Session 流程

| 步骤 | 说明 |
|------|------|
| 浏览器打开实验页面 | 全屏（F11）后交给参与者 |
| 参与者输入 ID，点 Start | 自动按末位奇偶分配 task 顺序 |
| Block 1（18 trial + 3 probe） | 每 6 trial 插入一次 probe |
| Block 2（18 trial + 3 probe） | task 切换，同结构 |
| 完成页面出现 "Thank you!" | Session 结束，记录已写入 CSV |

每个 trial：50 s 探索 → 10 s 确认窗口（可按 Enter 提前确认，超时自动提交）

---

## 五、数据文件

| 文件 | 内容 |
|------|------|
| `view_record.csv` | 每个 trial 的最终视角 + 操作统计（每行一个 trial） |
| `view_probe.csv` | 每次 probe 的作答 |

两个文件**追加写入**，多个参与者数据累积在同一文件，通过 `participantId` 字段区分。

### view_record.csv 字段说明

| 字段 | 说明 |
|------|------|
| `participantId` | 参与者 ID |
| `task` | `T1` 或 `T2` |
| `block` | 1 或 2 |
| `trialNumber` | 1–36（全局序号） |
| `objectName` | 如 `object03_medium` |
| `baseId` | 如 `object03` |
| `level` | `low` / `medium` / `high` |
| `startAzimuth` | trial 起始 azimuth（30 或 330） |
| `finalAzimuth` | 确认时的 azimuth（0–360°） |
| `finalElevation` | 确认时的 elevation（−30…+30°） |
| `upDownCount` | 上/下键按下总次数 |
| `leftRightCount` | 左/右键按下总次数 |
| `upDownRatio` | upDownCount / 总按键次数 |
| `leftRightRatio` | leftRightCount / 总按键次数 |
| `timeShortSide` | 短边视角停留时长（ms，采样粒度 100ms） |
| `timeLongSide` | 长边视角停留时长（ms） |
| `timeOblique` | 斜视角停留时长（ms） |
| `ratioShortSide` | timeShortSide / 总采样时长 |
| `ratioLongSide` | timeLongSide / 总采样时长 |
| `ratioOblique` | timeOblique / 总采样时长 |
| `timestamp` | Unix 时间戳（ms） |

---

## 六、每位参与者结束后

1. **备份 CSV**：把 `view_record.csv` 和 `view_probe.csv` 复制到另一个文件夹（防止意外覆盖）。
   - 推荐命名：`view_record_backup_YYYYMMDD.csv`
2. CSV 文件本身**不需要清空**，追加写入不影响下一位参与者。
3. 如果某位参与者数据有问题需要删除，用 Excel 或 Python 按 `participantId` 过滤删除对应行。

---

## 七、快速排查

| 问题 | 原因 | 处理 |
|------|------|------|
| 页面打不开 | Vite 未启动 | 重开终端 B，`npm run dev` |
| 视角选了没有保存 | Flask 未启动 | 重开终端 A，`python server.py` |
| 物体不显示 | GLB 文件缺失或路径错误 | 检查 `public/Objects/` 是否有 18 个 `.glb` 文件 |
| HDR 背景不加载 | EXR 文件缺失 | 检查 `public/hdrs/` 下 EXR 文件是否存在 |
| 按 Enter 没反应 | 还在 50 s 探索阶段 | 等倒计时归零、出现确认提示后再按 |
| 同一 ID 跑了两次 | 参与者重新开始 | 事后按 `participantId` + `timestamp` 识别，保留后一次或两次均删除 |

---

## 八、实验规格速查

- **物体：** 6 base × 3 elongation（low 1.3×、medium 1.7×、high 2.5×）= 18 个
- **Trial：** 2 block × 18 = 36 个；两个 block 独立随机排列（同 base 的三个版本不相邻）
- **Task 顺序：** 按参与者 ID 末位奇偶平衡
- **单 trial 时长：** 最长 60 s（50 s 探索 + 10 s 确认）
- **Probe：** 共 6 次，每 6 trial 后触发，3 选 1 按钮
- **操控：** ← → 无限旋转；↑ ↓ 限 ±30°；每次 keydown 转 5°，长按不连续
