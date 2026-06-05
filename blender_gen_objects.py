"""
Blender Python script — generate 3D stimuli for a visual perception experiment.
Compatible with Blender 4.x / 5.x.

Run inside Blender: Scripting workspace → Open this file → Run Script (Alt+P).
Output is printed to: Window → Toggle System Console
"""

import bpy  # type: ignore  (Blender built-in)
import math
import random
import os
import mathutils  # type: ignore  (Blender built-in)
import traceback

print("=== blender_gen_objects.py starting ===", flush=True)

# ==============================================================
#  CONFIGURATION  ← edit here
# ==============================================================

OUTPUT_DIR = "C:/Users/lenovo/Documents/GitHub/visual-elongated-object-exploration/public/Objects"

RANDOM_SEED     = 42
NUM_OBJECTS     = 10
NUM_ATTACHMENTS = 10

ELONGATION_LEVELS = [
    ('low',    1.3),   # long axis = 1.3× short axis
    ('medium', 1.7),
    ('high',   2.5),
]

MINOR_RADIUS     = 1.0
FLAT_RATIO       = 0.5   # Z height = 50% of MINOR_RADIUS (same for all objects)
ATTACH_SCALE_MIN = 0.08
ATTACH_SCALE_MAX = 0.14
BODY_COLOR       = (0.78, 0.78, 0.78, 1.0)
BODY_ROUGHNESS   = 0.85

# ==============================================================
#  SCENE HELPERS
# ==============================================================

def clear_scene():
    """Remove all mesh objects and orphaned data blocks."""
    for obj in list(bpy.data.objects):
        if obj.type == 'MESH':
            bpy.data.objects.remove(obj, do_unlink=True)
    for m in list(bpy.data.meshes):
        if m.users == 0:
            bpy.data.meshes.remove(m)
    for m in list(bpy.data.materials):
        if m.users == 0:
            bpy.data.materials.remove(m)


def make_grey_material(name):
    """Matte neutral-grey Principled BSDF, compatible with Blender 3.6–5.x."""
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes

    # Find Principled BSDF by type (name can differ across localisations)
    bsdf = next((n for n in nodes if n.type == 'BSDF_PRINCIPLED'), None)
    if bsdf is None:
        raise RuntimeError(f"No Principled BSDF node in material '{name}'")

    bsdf.inputs["Base Color"].default_value = BODY_COLOR
    bsdf.inputs["Roughness"].default_value  = BODY_ROUGHNESS

    # "Specular" was renamed to "Specular IOR Level" in Blender 4.0
    for key in ("Specular IOR Level", "Specular"):
        if key in bsdf.inputs:
            bsdf.inputs[key].default_value = 0.05
            break

    return mat


# ==============================================================
#  BOX BODY
# ==============================================================

def create_box(semi_x, semi_z, name, mat):
    # primitive_cube_add(size=2) → vertices at ±1 on each axis
    # after scaling: X = ±semi_x, Y = ±MINOR_RADIUS, Z = ±semi_z
    bpy.ops.mesh.primitive_cube_add(size=2.0, location=(0, 0, 0))
    obj = bpy.context.active_object
    obj.name = name

    obj.scale.x = semi_x        # elongation (varies by level)
    obj.scale.y = MINOR_RADIUS  # short horizontal axis (fixed)
    obj.scale.z = semi_z        # flatness (fixed for all objects)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)

    obj.data.materials.clear()
    obj.data.materials.append(mat)
    return obj


# ==============================================================
#  SURFACE GEOMETRY
# ==============================================================

def box_point_and_normal(theta, phi, a, b, c):
    """
    Cast a ray from the origin in direction (theta, phi) and find
    where it first intersects the box surface ±(a, b, c).
    Returns (surface_point, outward_face_normal).
    """
    st, ct = math.sin(theta), math.cos(theta)
    sp, cp = math.sin(phi),   math.cos(phi)
    dx, dy, dz = st * cp, st * sp, ct

    tx = a / abs(dx) if dx != 0 else float('inf')
    ty = b / abs(dy) if dy != 0 else float('inf')
    tz = c / abs(dz) if dz != 0 else float('inf')
    t  = min(tx, ty, tz)

    px, py, pz = dx * t, dy * t, dz * t

    tol = 1e-8
    if abs(abs(px) - a) < tol:
        normal = (math.copysign(1.0, px), 0.0, 0.0)
    elif abs(abs(py) - b) < tol:
        normal = (0.0, math.copysign(1.0, py), 0.0)
    else:
        normal = (0.0, 0.0, math.copysign(1.0, pz))

    return (px, py, pz), normal


# ==============================================================
#  ATTACHMENT CONFIG  (shared across elongation levels)
# ==============================================================

def generate_attachment_configs(rng):
    """
    Sample NUM_ATTACHMENTS (theta, phi, type, scale) tuples.
    Stored once per base object and re-used for all three elongation levels.
    """
    att_types = ['CYLINDER', 'CUBE', 'CONE', 'SPHERE']
    configs = []
    for _ in range(NUM_ATTACHMENTS):
        configs.append({
            'theta': rng.uniform(0.20, math.pi - 0.20),
            'phi':   rng.uniform(0.0, 2 * math.pi),
            'type':  rng.choice(att_types),
            'scale': rng.uniform(ATTACH_SCALE_MIN, ATTACH_SCALE_MAX) * MINOR_RADIUS,
        })
    return configs


# ==============================================================
#  ATTACHMENT PLACEMENT
# ==============================================================

def place_attachment(surface_pos, normal, att_type, scale, mat):
    """Create a small primitive at surface_pos, aligned to the surface normal."""
    pos_vec  = mathutils.Vector(surface_pos)
    norm_vec = mathutils.Vector(normal).normalized()

    if att_type == 'CYLINDER':
        bpy.ops.mesh.primitive_cylinder_add(
            radius=scale, depth=scale*2, vertices=8, location=(0, 0, 0))
    elif att_type == 'CUBE':
        bpy.ops.mesh.primitive_cube_add(size=scale*2, location=(0, 0, 0))
    elif att_type == 'CONE':
        bpy.ops.mesh.primitive_cone_add(
            radius1=scale, radius2=0.0, depth=scale*2, vertices=6, location=(0, 0, 0))
    else:  # SPHERE
        bpy.ops.mesh.primitive_ico_sphere_add(
            radius=scale, subdivisions=1, location=(0, 0, 0))

    att = bpy.context.active_object

    up = mathutils.Vector((0.0, 0.0, 1.0))
    att.rotation_euler = up.rotation_difference(norm_vec).to_euler('XYZ')
    att.location = pos_vec + norm_vec * scale
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

    att.data.materials.clear()
    att.data.materials.append(mat)
    return att


# ==============================================================
#  EXPORT
# ==============================================================

def export_glb(obj, filepath):
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.export_scene.gltf(
        filepath=filepath,
        use_selection=True,
        export_format='GLB',
    )


# ==============================================================
#  MAIN LOOP
# ==============================================================

def run():
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    print(f"Output directory: {OUTPUT_DIR}", flush=True)
    clear_scene()
    print("Scene cleared.", flush=True)

    rng = random.Random(RANDOM_SEED)
    all_configs = [generate_attachment_configs(rng) for _ in range(NUM_OBJECTS)]

    total = NUM_OBJECTS * len(ELONGATION_LEVELS)
    done  = 0

    for obj_idx in range(NUM_OBJECTS):
        configs = all_configs[obj_idx]
        obj_num = obj_idx + 1

        for level_label, ratio in ELONGATION_LEVELS:
            full_name = f"object{obj_num:02d}_{level_label}"
            semi_x    = MINOR_RADIUS * ratio          # long axis (varies)
            semi_y    = MINOR_RADIUS                  # short horizontal axis (fixed)
            semi_z    = MINOR_RADIUS * FLAT_RATIO     # height (fixed, flat)

            print(f"[{done+1}/{total}] {full_name} (elongation {ratio}:1, flat {FLAT_RATIO}) ...", flush=True)

            try:
                mat  = make_grey_material(f"Mat_{full_name}")
                body = create_box(semi_x, semi_z, full_name, mat)

                att_objects = []
                for cfg in configs:
                    pos, norm = box_point_and_normal(
                        cfg['theta'], cfg['phi'], semi_x, semi_y, semi_z)
                    att = place_attachment(pos, norm, cfg['type'], cfg['scale'], mat)
                    att_objects.append(att)

                bpy.ops.object.select_all(action='DESELECT')
                body.select_set(True)
                for att in att_objects:
                    att.select_set(True)
                bpy.context.view_layer.objects.active = body
                bpy.ops.object.join()

                filepath = os.path.join(OUTPUT_DIR, f"{full_name}.glb")
                export_glb(body, filepath)
                print(f"  -> {filepath}", flush=True)

                bpy.ops.object.select_all(action='DESELECT')
                body.select_set(True)
                bpy.ops.object.delete()

                done += 1

            except Exception as e:
                print(f"  ERROR on {full_name}: {e}", flush=True)
                traceback.print_exc()
                clear_scene()  # clean up and continue

    print(f"\n=== Done: {done}/{total} objects exported ===", flush=True)


try:
    run()
except Exception as e:
    print(f"\nFATAL ERROR: {e}", flush=True)
    traceback.print_exc()
