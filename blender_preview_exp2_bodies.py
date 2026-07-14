"""
Blender Python script — VISUAL PREVIEW ONLY for Exp2 body-profile calibration.
Does NOT export GLBs, does NOT touch public/Objects/ or blender_gen_objects.py.

Purpose (EXP1_EXP2_IMPLEMENTATION_PLAN.md §2.4, route A): at Exp2's low aspect
ratio (<=1.2:1), check whether the same 4 body_type profile formulas from
Exp1 still read as visually distinct, or need recalibration. Lays out a grid
in the current Blender scene:

  row = body_type (capsule, barrel, spindle, ovoid_cylinder)
  col A   = current Exp1 formula, unchanged, at aspect_ratio = PREVIEW_ASPECT
  col B   = recalibrated formula (capsule: shorter caps; barrel: stronger
            bulge; spindle/ovoid_cylinder: unchanged, already read fine)
  col C/D/E = recalibrated formula + one symmetric feature arrangement at
            FEATURE_PAIR_COUNTS = [6, 5, 4] pairs, to compare crowding on
            the smaller Exp2 body (col C's 6-pair density was reported
            crowded on 2026-07-15; D/E test lower densities per plan §2.2's
            calibration priority)

Run inside Blender: Scripting workspace -> Open this file -> Run Script (Alt+P).
Then orbit the viewport to inspect each row/column (see console for the
row/col -> object_name mapping).
"""

import bpy        # type: ignore
import bmesh      # type: ignore
import math
import random
import mathutils  # type: ignore

print("=== blender_preview_exp2_bodies.py starting ===", flush=True)

# ──────────────────────────────────────────────────────────────────────
#  CONFIGURATION
# ──────────────────────────────────────────────────────────────────────

MINOR_RADIUS    = 0.65     # unchanged from Exp1 (plan §2.1/§2.2)
PREVIEW_ASPECT  = 1.1      # within Exp2's <=1.2:1 target (plan §2.4)

PROFILE_FACETS  = 12       # unchanged from Exp1 (plan §2.1) — kept the same
                           # for all body types; spindle's linear taper is
                           # exact regardless of facet count, so no override
                           # needed for it (see note in plan §2.4)
NUM_SEGS        = 32

ATTACH_SCALE_MIN = 0.15
ATTACH_SCALE_MAX = 0.22
ATTACH_SCALE_REF_RADIUS = 1.0   # unchanged (plan §2.2)
FEATURE_PAIR_COUNTS = [6, 5, 4] # 2026-07-15: col C (6, current Exp1 value)
                                # was reported crowded on the smaller Exp2
                                # body — per plan §2.2's calibration priority
                                # ("reduce NUM_FEATURE_PAIRS first"), added
                                # 5- and 4-pair columns (D, E) for comparison
                                # before touching feature size/theta range
THETA_RANGE_DEG  = (30.0, 150.0)
U_RANGE          = (-0.70, 0.70)

BODY_COLOR     = (0.45, 0.28, 0.04, 1.0)
BODY_ROUGHNESS = 0.6

GRID_SPACING_Y = 2.6   # column spacing
GRID_SPACING_Z = 2.6   # row spacing

BASE_SEED = 4242

# ──────────────────────────────────────────────────────────────────────
#  SCENE HELPERS
# ──────────────────────────────────────────────────────────────────────

def clear_scene():
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
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    bsdf = next((n for n in nodes if n.type == 'BSDF_PRINCIPLED'), None)
    bsdf.inputs["Base Color"].default_value = BODY_COLOR
    bsdf.inputs["Roughness"].default_value  = BODY_ROUGHNESS
    return mat

# ──────────────────────────────────────────────────────────────────────
#  RADIUS PROFILES — parameterized versions of blender_gen_objects.py's
#  base_radius(), so col A / col B can use different parameter values
# ──────────────────────────────────────────────────────────────────────

def radius_capsule(x, half_L, R, cap_len_factor):
    """cap_len_factor=1.0 matches current Exp1 formula (cap depth = R).
    Lower values shorten the spherical cap so more of half_L stays a
    visible straight cylindrical band, even when half_L is close to R."""
    cap_len = R * cap_len_factor
    straight_half = max(0.0, half_L - cap_len)
    ax = abs(x)
    if ax <= straight_half:
        return R
    d = ax - straight_half
    d = min(d, cap_len)
    return math.sqrt(max(0.0, R * R - d * d))


def radius_barrel(x, half_L, R, bulge_power):
    """bulge_power=4 matches current Exp1 formula. Higher values keep the
    radius closer to R across more of the middle, tapering more sharply
    only near the tips (a stronger/flatter-shouldered bulge)."""
    t = x / half_L
    return R * math.sqrt(max(0.0, 1.0 - abs(t) ** bulge_power))


def radius_spindle(x, half_L, R):
    t = x / half_L
    return R * (1.0 - abs(t))


def radius_ovoid_cylinder(x, half_L, R, cap_len_factor=0.5):
    cap_len = R * cap_len_factor
    straight_half = max(0.0, half_L - cap_len)
    ax = abs(x)
    if ax <= straight_half:
        return R
    d = ax - straight_half
    d = min(d, cap_len)
    return R * math.sqrt(max(0.0, 1.0 - (d / cap_len) ** 2))


def build_profile_facets(radius_fn, half_L, n=PROFILE_FACETS):
    xs = [-half_L + i * (2.0 * half_L) / n for i in range(n + 1)]
    rs = [radius_fn(x) for x in xs]
    return xs, rs


def faceted_radius_and_slope(x, facet_xs, facet_rs):
    n = len(facet_xs) - 1
    if x <= facet_xs[0]:
        i = 0
    elif x >= facet_xs[-1]:
        i = n - 1
    else:
        i = 0
        for k in range(n):
            if facet_xs[k] <= x <= facet_xs[k + 1]:
                i = k
                break
    x0, x1 = facet_xs[i], facet_xs[i + 1]
    r0, r1 = facet_rs[i], facet_rs[i + 1]
    dx = x1 - x0
    t = 0.0 if dx == 0 else (x - x0) / dx
    r = r0 + t * (r1 - r0)
    slope = 0.0 if dx == 0 else (r1 - r0) / dx
    return r, slope


def surface_point(u, theta, half_L, facets):
    x = u * half_L
    r, _ = faceted_radius_and_slope(x, *facets)
    y = r * math.sin(theta)
    z = r * math.cos(theta)
    return (x, y, z)


def surface_normal(u, theta, half_L, facets):
    x = u * half_L
    _, slope = faceted_radius_and_slope(x, *facets)
    n = mathutils.Vector((-slope, math.sin(theta), math.cos(theta)))
    if n.length < 1e-8:
        n = mathutils.Vector((1.0 if x > 0 else -1.0, 0.0, 0.0))
    return n.normalized()

# ──────────────────────────────────────────────────────────────────────
#  MESH BUILD (unchanged logic from blender_gen_objects.py)
# ──────────────────────────────────────────────────────────────────────

def build_revolution_mesh(facets, num_segs=NUM_SEGS):
    facet_xs, facet_rs = facets
    bm = bmesh.new()
    rings = []
    for x, r in zip(facet_xs, facet_rs):
        if r < 1e-6:
            rings.append(None)
            continue
        ring = []
        for j in range(num_segs):
            theta = 2.0 * math.pi * j / num_segs
            y = r * math.sin(theta)
            z = r * math.cos(theta)
            ring.append(bm.verts.new((x, y, z)))
        rings.append(ring)
    bm.verts.ensure_lookup_table()

    pole_start = bm.verts.new((facet_xs[0], 0.0, 0.0)) if rings[0] is None else None
    pole_end   = bm.verts.new((facet_xs[-1], 0.0, 0.0)) if rings[-1] is None else None

    for i in range(len(rings) - 1):
        a, b = rings[i], rings[i + 1]
        if a is None and b is not None:
            for j in range(num_segs):
                j1 = (j + 1) % num_segs
                bm.faces.new([pole_start, b[j], b[j1]])
        elif a is not None and b is None:
            for j in range(num_segs):
                j1 = (j + 1) % num_segs
                bm.faces.new([a[j1], a[j], pole_end])
        elif a is not None and b is not None:
            for j in range(num_segs):
                j1 = (j + 1) % num_segs
                bm.faces.new([a[j], a[j1], b[j1], b[j]])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm

# ──────────────────────────────────────────────────────────────────────
#  ATTACHMENT (trimmed down to CYLINDER/CONE/HEMISPHERE/OCTAHEDRON,
#  same shapes as blender_gen_objects.py, for the col C crowding check)
# ──────────────────────────────────────────────────────────────────────

def _make_curved_cylinder_mesh(scale, num_segs=8, num_rings=4, bulge=0.12):
    H  = 2.0 * scale
    bm = bmesh.new()
    rings = []
    for i in range(num_rings + 1):
        t = i / num_rings
        z = t * H
        r = scale * (1.0 + bulge * math.sin(math.pi * t))
        ring = []
        for j in range(num_segs):
            angle = 2.0 * math.pi * j / num_segs
            v = bm.verts.new((r * math.cos(angle), r * math.sin(angle), z))
            ring.append(v)
        rings.append(ring)
    bm.verts.ensure_lookup_table()
    for i in range(num_rings):
        for j in range(num_segs):
            j1 = (j + 1) % num_segs
            bm.faces.new([rings[i][j], rings[i][j1], rings[i+1][j1], rings[i+1][j]])
    bc = bm.verts.new((0.0, 0.0, 0.0))
    for j in range(num_segs):
        j1 = (j + 1) % num_segs
        bm.faces.new([bc, rings[0][j1], rings[0][j]])
    tc = bm.verts.new((0.0, 0.0, H))
    for j in range(num_segs):
        j1 = (j + 1) % num_segs
        bm.faces.new([tc, rings[-1][j], rings[-1][j1]])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


def place_attachment(surface_pos, normal, att_type, scale, mat):
    pos_vec  = mathutils.Vector(surface_pos)
    norm_vec = mathutils.Vector(normal).normalized()
    up       = mathutils.Vector((0.0, 0.0, 1.0))

    if att_type == 'CYLINDER':
        mesh_data = bpy.data.meshes.new("cyl_mesh")
        att = bpy.data.objects.new("cyl_obj", mesh_data)
        bpy.context.collection.objects.link(att)
        bm = _make_curved_cylinder_mesh(scale)
        bm.to_mesh(mesh_data)
        bm.free()
        att.rotation_euler = up.rotation_difference(norm_vec).to_euler('XYZ')
        att.location = pos_vec

    elif att_type == 'CONE':
        bpy.ops.mesh.primitive_cone_add(
            radius1=scale, radius2=0.0, depth=scale * 2, vertices=6,
            location=(0, 0, 0))
        att = bpy.context.active_object
        att.rotation_euler = up.rotation_difference(norm_vec).to_euler('XYZ')
        att.location = pos_vec + norm_vec * scale

    elif att_type == 'HEMISPHERE':
        bpy.ops.mesh.primitive_uv_sphere_add(
            radius=scale, segments=8, ring_count=6, location=(0, 0, 0))
        att = bpy.context.active_object
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.mesh.bisect(
            plane_co=(0.0, 0.0, 0.0), plane_no=(0.0, 0.0, 1.0),
            clear_inner=True, clear_outer=False, use_fill=True)
        bpy.ops.object.mode_set(mode='OBJECT')
        att.rotation_euler = up.rotation_difference(norm_vec).to_euler('XYZ')
        att.location = pos_vec

    else:  # OCTAHEDRON
        R   = scale
        H   = scale * math.sqrt(2.0)
        s3h = math.sqrt(3.0) * 0.5
        verts = [
            ( R,        0.0,      0.0),
            (-R*0.5,    R*s3h,   0.0),
            (-R*0.5,   -R*s3h,   0.0),
            ( R*0.5,    R*s3h,   H),
            (-R,        0.0,      H),
            ( R*0.5,   -R*s3h,   H),
        ]
        faces = [(0,2,1),(3,4,5),(0,1,3),(1,4,3),(1,2,4),(2,5,4),(2,0,5),(0,3,5)]
        mesh_data = bpy.data.meshes.new("oct_mesh")
        att = bpy.data.objects.new("oct_obj", mesh_data)
        bpy.context.collection.objects.link(att)
        bm = bmesh.new()
        bm_verts = [bm.verts.new(v) for v in verts]
        bm.verts.ensure_lookup_table()
        for f in faces:
            bm.faces.new([bm_verts[i] for i in f])
        bm.to_mesh(mesh_data)
        bm.free()
        att.rotation_euler = up.rotation_difference(norm_vec).to_euler('XYZ')
        att.location = pos_vec

    att.data.materials.clear()
    att.data.materials.append(mat)
    bpy.ops.object.select_all(action='DESELECT')
    att.select_set(True)
    bpy.context.view_layer.objects.active = att
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    return att


ATT_TYPES = ['CYLINDER', 'CONE', 'HEMISPHERE', 'OCTAHEDRON']

def generate_feature_configs(rng, n):
    return [
        {'type': rng.choice(ATT_TYPES),
         'scale': rng.uniform(ATTACH_SCALE_MIN, ATTACH_SCALE_MAX) * ATTACH_SCALE_REF_RADIUS}
        for _ in range(n)
    ]


def _u_positions(rng, n, u_range=U_RANGE):
    lo, hi = u_range
    positions = []
    for k in range(n):
        cell_lo = lo + (hi - lo) * k / n
        cell_hi = lo + (hi - lo) * (k + 1) / n
        positions.append(rng.uniform(cell_lo, cell_hi))
    rng.shuffle(positions)
    return positions


def place_symmetric_features(configs, half_L, facets, rng, mat):
    n = len(configs)
    us = _u_positions(rng, n)
    lo, hi = THETA_RANGE_DEG
    thetas = [math.radians(rng.uniform(lo, hi)) for _ in range(n)]
    att_objects = []
    for cfg, u, theta in zip(configs, us, thetas):
        for sign in (+1, -1):
            th = sign * theta
            pos  = surface_point(u, th, half_L, facets)
            norm = surface_normal(u, th, half_L, facets)
            att_objects.append(place_attachment(pos, tuple(norm), cfg['type'], cfg['scale'], mat))
    return att_objects

# ──────────────────────────────────────────────────────────────────────
#  BUILD ONE PREVIEW OBJECT AT A GRID CELL
# ──────────────────────────────────────────────────────────────────────

def build_body(name, radius_fn, half_L, R, mat, n_pairs, feature_rng_seed):
    facets = build_profile_facets(radius_fn, half_L)
    mesh_data = bpy.data.meshes.new(f"{name}_mesh")
    body = bpy.data.objects.new(name, mesh_data)
    bpy.context.collection.objects.link(body)
    bm = build_revolution_mesh(facets)
    bm.to_mesh(mesh_data)
    bm.free()
    body.data.materials.append(mat)

    att_objs = []
    if n_pairs:
        rng = random.Random(feature_rng_seed)
        configs = generate_feature_configs(rng, n_pairs)
        att_objs = place_symmetric_features(configs, half_L, facets, rng, mat)

    bpy.ops.object.select_all(action='DESELECT')
    body.select_set(True)
    for att in att_objs:
        att.select_set(True)
    bpy.context.view_layer.objects.active = body
    if att_objs:
        bpy.ops.object.join()
    return body

# ──────────────────────────────────────────────────────────────────────
#  MAIN
# ──────────────────────────────────────────────────────────────────────

def run():
    clear_scene()
    R = MINOR_RADIUS
    half_L = R * PREVIEW_ASPECT

    # 2026-07-15: col C (6 pairs) reported crowded — added D/E at 5/4 pairs
    # (FEATURE_PAIR_COUNTS) for side-by-side density comparison (plan §2.2
    # calibration priority: reduce NUM_FEATURE_PAIRS before touching feature
    # size/theta range).
    n6, n5, n4 = FEATURE_PAIR_COUNTS
    # (body_type, col_label, radius_fn, n_pairs_or_None)
    rows = [
        ('capsule', [
            ('A_current(cap=R)',        lambda x: radius_capsule(x, half_L, R, 1.0), None),
            ('B_shortcap(cap=0.5R)',    lambda x: radius_capsule(x, half_L, R, 0.5), None),
            (f'C_shortcap+{n6}pairs',   lambda x: radius_capsule(x, half_L, R, 0.5), n6),
            (f'D_shortcap+{n5}pairs',   lambda x: radius_capsule(x, half_L, R, 0.5), n5),
            (f'E_shortcap+{n4}pairs',   lambda x: radius_capsule(x, half_L, R, 0.5), n4),
        ]),
        ('barrel', [
            ('A_current(pow=4)',       lambda x: radius_barrel(x, half_L, R, 4), None),
            ('B_stronger(pow=8)',      lambda x: radius_barrel(x, half_L, R, 8), None),
            (f'C_stronger+{n6}pairs',  lambda x: radius_barrel(x, half_L, R, 8), n6),
            (f'D_stronger+{n5}pairs',  lambda x: radius_barrel(x, half_L, R, 8), n5),
            (f'E_stronger+{n4}pairs',  lambda x: radius_barrel(x, half_L, R, 8), n4),
        ]),
        ('spindle', [
            ('A_current',              lambda x: radius_spindle(x, half_L, R), None),
            ('B_same_as_A',            lambda x: radius_spindle(x, half_L, R), None),
            (f'C_current+{n6}pairs',   lambda x: radius_spindle(x, half_L, R), n6),
            (f'D_current+{n5}pairs',   lambda x: radius_spindle(x, half_L, R), n5),
            (f'E_current+{n4}pairs',   lambda x: radius_spindle(x, half_L, R), n4),
        ]),
        ('ovoid_cylinder', [
            ('A_current(cap=0.5R)',    lambda x: radius_ovoid_cylinder(x, half_L, R, 0.5), None),
            ('B_same_as_A',            lambda x: radius_ovoid_cylinder(x, half_L, R, 0.5), None),
            (f'C_current+{n6}pairs',   lambda x: radius_ovoid_cylinder(x, half_L, R, 0.5), n6),
            (f'D_current+{n5}pairs',   lambda x: radius_ovoid_cylinder(x, half_L, R, 0.5), n5),
            (f'E_current+{n4}pairs',   lambda x: radius_ovoid_cylinder(x, half_L, R, 0.5), n4),
        ]),
    ]

    print(f"\nPreview grid — aspect_ratio={PREVIEW_ASPECT}, MINOR_RADIUS={R}, half_L={half_L:.4f}")
    print("Rows = body_type, Cols = A/B/C/D/E (see labels below). Object names encode both.\n")

    for row_idx, (body_type, cols) in enumerate(rows):
        for col_idx, (label, radius_fn, n_pairs) in enumerate(cols):
            name = f"{body_type}_{label}"
            mat = make_grey_material(f"Mat_{name}")
            body = build_body(
                name, radius_fn, half_L, R, mat,
                n_pairs=n_pairs,
                feature_rng_seed=BASE_SEED + row_idx * 100 + col_idx,
            )
            body.location = (0.0, col_idx * GRID_SPACING_Y, -row_idx * GRID_SPACING_Z)
            print(f"  row={row_idx} col={col_idx}  {name}  @ location {tuple(round(c,2) for c in body.location)}")

    print("\n完成 — 按小键盘 Home 居中，逐行逐列旋转查看对比")


try:
    run()
except Exception as e:
    print(f"\nFATAL ERROR: {e}", flush=True)
    import traceback
    traceback.print_exc()
