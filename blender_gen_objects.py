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
NUM_OBJECTS     = 6
NUM_ATTACHMENTS = 12

ELONGATION_LEVELS = [
    ('low',    1.3),   # long axis = 1.3× short axis
    ('medium', 1.7),
    ('high',   2.5),
]

MINOR_RADIUS     = 1.0
FLAT_RATIO       = 0.5   # Z height = 50% of MINOR_RADIUS (same for all objects)
ATTACH_SCALE_MIN = 0.08
ATTACH_SCALE_MAX = 0.14
SIDE_BOOST       = 4.0   # weight multiplier for ±Y long-side faces vs. area-based default
BODY_COLOR       = (0.78, 0.78, 0.78, 1.0)
BODY_ROUGHNESS   = 1.0

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
            bsdf.inputs[key].default_value = 0.0
            break

    return mat


# ==============================================================
#  BOX BODY
# ==============================================================

def create_box(semi_x, semi_z, name, mat):
    # Unit cube (size=2) scaled to (semi_x, MINOR_RADIUS, semi_z)
    # Long axis = X; short horizontal = Y (MINOR_RADIUS); height = Z (semi_z)
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

def box_point_and_normal(u, v, w, a, b, c):
    """
    Weighted random point on box surface with half-extents (a, b, c).
      u — selects face by cumulative weight
      v — position along first axis of the chosen face  [0, 1)
      w — position along second axis of the chosen face [0, 1)
    All 6 faces are eligible; ±Y long-side faces are up-weighted by SIDE_BOOST
    so most attachments appear there while end faces and top/bottom still occur.
    """
    # Natural area weights, with ±Y boosted
    # ±X end faces: 2bc  |  ±Y long sides: 2ac × SIDE_BOOST  |  ±Z top/bottom: 2ab
    weights = [
        2*b*c,              # face 0: +X end
        2*b*c,              # face 1: -X end
        2*a*c * SIDE_BOOST, # face 2: +Y long side (boosted)
        2*a*c * SIDE_BOOST, # face 3: -Y long side (boosted)
        2*a*b,              # face 4: +Z top
        2*a*b,              # face 5: -Z bottom
    ]
    total = sum(weights)
    r = u * total
    face, cumul = 5, 0
    for i, w_ in enumerate(weights):
        cumul += w_
        if r < cumul:
            face = i
            break

    sv = 2 * v - 1   # remap [0, 1) → (−1, 1)
    sw = 2 * w - 1
    if   face == 0: return ( a, sv*b, sw*c), ( 1, 0, 0)   # +X end
    elif face == 1: return (-a, sv*b, sw*c), (-1, 0, 0)   # -X end
    elif face == 2: return (sv*a,  b, sw*c), ( 0, 1, 0)   # +Y long side
    elif face == 3: return (sv*a, -b, sw*c), ( 0,-1, 0)   # -Y long side
    elif face == 4: return (sv*a, sw*b,  c), ( 0, 0, 1)   # +Z top
    else:           return (sv*a, sw*b, -c), ( 0, 0,-1)   # -Z bottom


# ==============================================================
#  ATTACHMENT CONFIG  (shared across elongation levels)
# ==============================================================

def generate_attachment_configs(rng):
    """
    Sample NUM_ATTACHMENTS (u, v, w, type, scale) tuples.
    Stored once per base object and re-used for all three elongation levels.
    u/v/w are three independent uniform [0,1) values for box surface sampling.
    """
    att_types = ['CYLINDER', 'CUBE', 'CONE', 'SPHERE']
    configs = []
    for _ in range(NUM_ATTACHMENTS):
        configs.append({
            'u':    rng.random(),
            'v':    rng.random(),
            'w':    rng.random(),
            'type': rng.choice(att_types),
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
                        cfg['u'], cfg['v'], cfg['w'], semi_x, semi_y, semi_z)
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
