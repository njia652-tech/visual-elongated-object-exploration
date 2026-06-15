# Blender 生成物体 — 检查步骤

## 运行脚本

1. 打开 Blender → **Scripting** 工作区
2. 点击 **Open** 加载 `blender_gen_objects.py`
3. 按 **Alt+P**（或点击 ▶ Run Script）

## 查看输出文字

**Window → Toggle System Console**（Windows）

正常输出示例：
```
=== blender_gen_objects.py starting ===
Output directory: .../public/Objects
Scene cleared.
[1/18] object01_low (elongation 1.3:1, flat 0.5) ...
  -> .../public/Objects/object01_low.glb
[2/18] object01_medium ...
...
=== Done: 18/18 objects exported ===
```

## 预期结果

- 生成 **18 个 GLB 文件**（object01–06 × low/medium/high）
- 输出路径：`public/Objects/`
- 每个物体：椭球体主体 + 8 个随机附件（cylinder/cube/cone/sphere）

## 错误排查

| 输出                          | 原因 & 处理                              |
|-------------------------------|------------------------------------------|
| `ERROR on objectXX_YY: ...`   | 单个物体失败，脚本自动清场继续           |
| `FATAL ERROR: ...`            | 脚本顶层崩溃，检查 OUTPUT_DIR 是否可写  |
| `Done: N/18`（N < 18）        | 查看具体 ERROR 行，重新运行即可覆盖     |
| Console 无输出                | 确认已打开 System Console 再运行脚本    |

## 在 Blender 中预览 GLB

1. **File → Import → glTF 2.0 (.glb/.gltf)**
2. 选择 `public/Objects/` 下任意 `.glb` 文件
3. 按 **Numpad 1** 正视图 / **Numpad 5** 切换透视，确认：
   - 主体为扁椭球（X 轴方向拉伸，Z 轴压扁）
   - 表面分布 8 个小附件

## 在 Blender 内直接预览生成效果（无需导出）

使用项目根目录中的 **`blender_preview.py`** 文件（独立脚本，无需复制粘贴）。

**步骤**：
1. Blender → **Scripting** 工作区
2. 文本编辑器左上角点 **Open** → 选择 `blender_preview.py`
3. 确认左上角模式为 **Object Mode**
4. 按 **Alt+P** 运行

**切换物体**：打开文件后修改顶部两行再重新运行：
- `OBJ_IDX = 0`（0–5，对应 object01–06）
- `LEVEL = 'medium'`（`'low'` / `'medium'` / `'high'`）

运行后在 System Console 可看到每步进度（`附件 1/8 OK` …）；按 **Numpad 1**（正面）和 **Numpad 5**（透视切换）查看物体形态。

---

## 关键参数（blender_gen_objects.py）

```python
NUM_OBJECTS     = 6
NUM_ATTACHMENTS = 8
FLAT_RATIO      = 0.5   # Z = 50% of MINOR_RADIUS
ELONGATION_LEVELS = [('low', 1.3), ('medium', 1.7), ('high', 2.5)]
```
