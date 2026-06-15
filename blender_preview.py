import bpy
import os

GLB_DIR = r"C:\Users\lenovo\Documents\GitHub\visual-elongated-object-exploration\public\Objects"

for obj in list(bpy.data.objects):
    if obj.type == 'MESH':
        bpy.data.objects.remove(obj, do_unlink=True)

files = sorted(
    f for f in os.listdir(GLB_DIR)
    if f.endswith('_medium.glb')
)[:6]   # 只取前 6 个

for i, filename in enumerate(files):
    filepath = os.path.join(GLB_DIR, filename)
    before = set(obj.name for obj in bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=filepath)
    after = set(obj.name for obj in bpy.data.objects)
    for name in (after - before):
        bpy.data.objects[name].location = (i * 5.0, 0, 0)
    print(f"[{i+1}/6] {filename}", flush=True)

print("完成 — 按小键盘 Home 居中", flush=True)
