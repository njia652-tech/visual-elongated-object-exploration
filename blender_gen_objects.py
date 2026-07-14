"""
Blender Python script — generate Exp1/Exp2 stimuli for the view-selection
experiment. Set EXPERIMENT below to 'exp1' or 'exp2' and re-run; the two
experiments share every body/feature parameter except aspect_ratio (plan
§2.4, 2026-07-15: preview confirmed the same 4 profiles/params read as
distinct at Exp2's lower ratio, no recalibration needed) and output naming.
Metadata entries are merged into objects_metadata.json, not overwritten, so
running one experiment does not erase the other's entries.

Design (EXP1_EXP2_IMPLEMENTATION_PLAN.md §2, §5):
  4 surfaces-of-revolution body types (capsule, barrel, spindle,
  ovoid_cylinder), all rotationally symmetric about the long axis (Blender X)
  and front/back symmetric (r(x) = r(-x)) — the bare body carries NO azimuth
  information. Symmetry is carried entirely by attached features, placed in
  cylindrical coordinates (u = position along axis, theta = angle around the
  circumference):
    - Symmetric:  each feature at (u, +theta) is mirrored to (u, -theta),
                  |theta| in [30 deg, 150 deg] so pairs never sit on the
                  mirror plane (Y = 0, i.e. theta = 0 / 180 deg).
    - Asymmetric: the same feature inventory (type/scale, same count) placed
                  at independent, unpaired (u, theta), verified to contain no
                  accidental mirror pair.
  16 yoked pairs (sym+asym) = 32 objects, exemplars split evenly (4,4,4,4)
  across the 4 body types (EXEMPLAR_ALLOC below). ellipsoid was removed
  2026-07-14: its profile overlapped ovoid_cylinder after faceting, and 4
  body types divide 16/condition evenly (no more (4,3,3,3,3) imbalance).

Run inside Blender: Scripting workspace -> Open this file -> Run Script (Alt+P).
Console output: Window -> Toggle System Console.
"""

import bpy        # type: ignore
import bmesh      # type: ignore
import math
import random
import os
import json
import mathutils  # type: ignore
import traceback

print("=== blender_gen_objects.py starting ===", flush=True)

# ──────────────────────────────────────────────────────────────────────
#  CONFIGURATION
# ──────────────────────────────────────────────────────────────────────

OUTPUT_DIR = "C:/Users/lenovo/Documents/GitHub/visual-elongated-object-exploration/public/Objects"

EXPERIMENT = 'exp1'           # 'exp1' | 'exp2' — only the aspect_ratio target
                              # and output naming differ (plan §2.4); all
                              # other body/feature parameters below are
                              # shared unchanged between the two experiments

MINOR_RADIUS     = 0.65       # R — nominal cross-section radius (diameter = 2R)
if EXPERIMENT == 'exp1':
    ASPECT_MIN, ASPECT_MAX = 2.5, 2.8   # elongated, jitter upward only (plan §2.1)
elif EXPERIMENT == 'exp2':
    ASPECT_MIN, ASPECT_MAX = 1.1, 1.3   # non-elongated (plan §2.4, 2026-07-15
                                        # preview: same 4 profiles/params as
                                        # Exp1 read as distinct at this ratio,
                                        # no recalibration needed)
else:
    raise ValueError(f"Unknown EXPERIMENT: {EXPERIMENT}")

ATTACH_SCALE_MIN = 0.15
ATTACH_SCALE_MAX = 0.22
# Attachments keep their original absolute size regardless of MINOR_RADIUS
# (plan §2.2 "端面可读性校准") — a smaller body makes the same-size features
# occupy a bigger share of the silhouette, so symmetry/asymmetry reads more
# clearly. Fixed at the pre-shrink nominal radius (1.0), NOT the live
# MINOR_RADIUS above.
ATTACH_SCALE_REF_RADIUS = 1.0
NUM_FEATURE_PAIRS = 6         # 6 configs -> 6 mirrored pairs = 12 features total

U_RANGE          = (-0.70, 0.70)     # normalized axial position, avoids the tapered tips
THETA_RANGE_DEG  = (30.0, 150.0)     # |theta| range for symmetric pairs (plan §2.2)

PROFILE_FACETS = 12   # longitudinal profile facet count, shared by all 4 body
                      # types (plan §2.1 — replaces the ripple/corrugation
                      # scheme, which risked an anatomical-association
                      # confound; pilot-calibrated coarseness, see §8.2 P3)

NUM_SEGS  = 32    # mesh resolution around the circumference (cross-section
                  # stays a smooth circle — faceting is longitudinal only,
                  # so no new mirror planes are introduced)

BODY_COLOR     = (0.45, 0.28, 0.04, 1.0)
BODY_ROUGHNESS = 0.6

BODY_TYPES = ['capsule', 'barrel', 'spindle', 'ovoid_cylinder']
EXEMPLAR_ALLOC = {'capsule': 4, 'barrel': 4, 'spindle': 4, 'ovoid_cylinder': 4}  # sum = 16

BASE_SEED = 2024 if EXPERIMENT == 'exp1' else 5024  # distinct seed bases so
                                                     # Exp2's feature layouts
                                                     # aren't a copy of Exp1's
                                                     # RNG sequence

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
    if bsdf is None:
        raise RuntimeError(f"No Principled BSDF in '{name}'")
    bsdf.inputs["Base Color"].default_value = BODY_COLOR
    bsdf.inputs["Roughness"].default_value  = BODY_ROUGHNESS
    for key in ("Specular IOR Level", "Specular"):
        if key in bsdf.inputs:
            bsdf.inputs[key].default_value = 0.5
            break
    return mat

# ──────────────────────────────────────────────────────────────────────
#  REVOLUTION-BODY RADIUS PROFILES
#  x in [-half_L, +half_L] along Blender X (the long axis); all profiles
#  are front/back symmetric (r(x) = r(-x)) and reach r = 0 exactly at the
#  two tips, so the lathe mesh below can close each end with a single pole
#  vertex (no separate flat cap needed).
# ──────────────────────────────────────────────────────────────────────

def base_radius(body_type, x, half_L, R):
    t = x / half_L
    at = abs(t)

    if body_type == 'barrel':
        # Flatter across the middle than the ellipsoid (t**4), still convex
        # and rounded at the tips.
        return R * math.sqrt(max(0.0, 1.0 - t ** 4))

    if body_type == 'spindle':
        # Linear taper to a point at each end (bicone) — the one "pointed"
        # profile in the set.
        return R * (1.0 - at)

    if body_type == 'capsule':
        # Straight cylindrical shaft + hemispherical caps (cap depth = R).
        cap_len = R
        straight_half = half_L - cap_len
        ax = abs(x)
        if ax <= straight_half:
            return R
        d = ax - straight_half
        return math.sqrt(max(0.0, R * R - d * d))

    if body_type == 'ovoid_cylinder':
        # Straight cylindrical shaft + flatter ellipsoidal caps (cap depth
        # < R, so the end bulge is shallower than the capsule's hemisphere).
        cap_len = 0.5 * R
        straight_half = half_L - cap_len
        ax = abs(x)
        if ax <= straight_half:
            return R
        d = ax - straight_half
        return R * math.sqrt(max(0.0, 1.0 - (d / cap_len) ** 2))

    raise ValueError(f"Unknown body_type: {body_type}")


def build_profile_facets(body_type, half_L, R, n=PROFILE_FACETS):
    """Sample the smooth analytic radius profile at n+1 evenly spaced axial
    breakpoints, producing a low-poly polyline (faceted) longitudinal
    profile. The cross-section stays a full circle at every breakpoint, so
    rotation about the long axis remains continuous (infinite-fold) —
    faceting adds no new mirror planes (plan §2.1)."""
    xs = [-half_L + i * (2.0 * half_L) / n for i in range(n + 1)]
    rs = [base_radius(body_type, x, half_L, R) for x in xs]
    return xs, rs


def faceted_radius_and_slope(x, facet_xs, facet_rs):
    """Piecewise-linear radius (and its slope) between facet breakpoints —
    matches the straight frustum segments of the lathed mesh exactly."""
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


def surface_point(body_type, u, theta, half_L, R, facets):
    """u in [-1, 1] normalized axial position; theta in radians."""
    x = u * half_L
    r, _ = faceted_radius_and_slope(x, *facets)
    y = r * math.sin(theta)
    z = r * math.cos(theta)
    return (x, y, z)


def surface_normal(body_type, u, theta, half_L, R, facets):
    x = u * half_L
    _, slope = faceted_radius_and_slope(x, *facets)
    n = mathutils.Vector((-slope, math.sin(theta), math.cos(theta)))
    if n.length < 1e-8:
        n = mathutils.Vector((1.0 if x > 0 else -1.0, 0.0, 0.0))
    return n.normalized()

# ──────────────────────────────────────────────────────────────────────
#  REVOLUTION-BODY MESH (lathe: one ring of NUM_SEGS verts per profile
#  facet breakpoint, closed with a single pole vertex at each tip — the
#  straight-line frusta between consecutive rings ARE the facets)
# ──────────────────────────────────────────────────────────────────────

def build_revolution_mesh(body_type, half_L, R, facets, num_segs=NUM_SEGS):
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
        # both None: degenerate, skip (shouldn't happen for these profiles)

    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm

# ──────────────────────────────────────────────────────────────────────
#  CURVED-CYLINDER MESH (attachment shape, unchanged from old script)
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

# ──────────────────────────────────────────────────────────────────────
#  ATTACHMENT PLACEMENT (shape construction unchanged from old script;
#  now driven by cylindrical-coordinate surface_point/surface_normal)
# ──────────────────────────────────────────────────────────────────────

def place_attachment(surface_pos, normal, att_type, scale, mat):
    pos_vec  = mathutils.Vector(surface_pos)
    norm_vec = mathutils.Vector(normal).normalized()
    up       = mathutils.Vector((0.0, 0.0, 1.0))

    if att_type == 'CYLINDER':
        mesh_data = bpy.data.meshes.new("cyl_mesh")
        att = bpy.data.objects.new("cyl_obj", mesh_data)
        bpy.context.collection.objects.link(att)
        bpy.context.view_layer.objects.active = att
        att.select_set(True)
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
        bpy.context.view_layer.objects.active = att
        att.select_set(True)
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
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    return att

# ──────────────────────────────────────────────────────────────────────
#  FEATURE INVENTORY
# ──────────────────────────────────────────────────────────────────────

ATT_TYPES = ['CYLINDER', 'CONE', 'HEMISPHERE', 'OCTAHEDRON']

def generate_feature_configs(rng, n):
    """Generate n (type, scale) pairs — the feature inventory shared by sym & asym."""
    return [
        {
            'type':  rng.choice(ATT_TYPES),
            'scale': rng.uniform(ATTACH_SCALE_MIN, ATTACH_SCALE_MAX) * ATTACH_SCALE_REF_RADIUS,
        }
        for _ in range(n)
    ]

# ──────────────────────────────────────────────────────────────────────
#  CYLINDRICAL-COORDINATE FEATURE LAYOUT
# ──────────────────────────────────────────────────────────────────────

def _u_positions(rng, n, u_range=U_RANGE):
    """n normalized axial positions, one per cell of u_range to avoid clustering."""
    lo, hi = u_range
    positions = []
    for k in range(n):
        cell_lo = lo + (hi - lo) * k / n
        cell_hi = lo + (hi - lo) * (k + 1) / n
        positions.append(rng.uniform(cell_lo, cell_hi))
    rng.shuffle(positions)
    return positions


def _has_mirror_pair(us, thetas, tol_u, tol_theta):
    n = len(us)
    for i in range(n):
        mirrored = (-thetas[i]) % (2.0 * math.pi)
        for j in range(n):
            if i == j:
                continue
            du = abs(us[i] - us[j])
            dth = abs((thetas[j] - mirrored + math.pi) % (2.0 * math.pi) - math.pi)
            if du < tol_u and dth < tol_theta:
                return True
    return False


def place_symmetric_features(configs, body_type, half_L, R, facets, rng, mat):
    """Each config placed at (u, +theta) and mirrored to (u, -theta)."""
    n = len(configs)
    us = _u_positions(rng, n)
    lo, hi = THETA_RANGE_DEG
    thetas = [math.radians(rng.uniform(lo, hi)) for _ in range(n)]

    att_objects = []
    feature_positions = []
    for cfg, u, theta in zip(configs, us, thetas):
        for sign in (+1, -1):
            th = sign * theta
            pos  = surface_point(body_type, u, th, half_L, R, facets)
            norm = surface_normal(body_type, u, th, half_L, R, facets)
            att_objects.append(place_attachment(pos, tuple(norm), cfg['type'], cfg['scale'], mat))
            feature_positions.append({
                'u': round(u, 4),
                'theta_deg': round(math.degrees(th) % 360.0, 2),
                'type': cfg['type'],
                'scale': round(cfg['scale'], 4),
            })
    return att_objects, feature_positions


def place_asymmetric_features(configs, body_type, half_L, R, facets, rng, mat, max_retries=200):
    """Same inventory as the symmetric arrangement, placed unpaired so that
    no mirror plane exists."""
    n = len(configs)
    us, thetas = None, None
    for _ in range(max_retries):
        candidate_us = _u_positions(rng, n)
        candidate_thetas = [rng.uniform(0.0, 2.0 * math.pi) for _ in range(n)]
        if not _has_mirror_pair(candidate_us, candidate_thetas, tol_u=0.05, tol_theta=math.radians(8)):
            us, thetas = candidate_us, candidate_thetas
            break
    if us is None:
        us, thetas = candidate_us, candidate_thetas  # extremely unlikely fallback

    att_objects = []
    feature_positions = []
    for cfg, u, theta in zip(configs, us, thetas):
        pos  = surface_point(body_type, u, theta, half_L, R, facets)
        norm = surface_normal(body_type, u, theta, half_L, R, facets)
        att_objects.append(place_attachment(pos, tuple(norm), cfg['type'], cfg['scale'], mat))
        feature_positions.append({
            'u': round(u, 4),
            'theta_deg': round(math.degrees(theta) % 360.0, 2),
            'type': cfg['type'],
            'scale': round(cfg['scale'], 4),
        })
    return att_objects, feature_positions

# ──────────────────────────────────────────────────────────────────────
#  EXPORT
# ──────────────────────────────────────────────────────────────────────

def export_glb(obj, filepath):
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.export_scene.gltf(
        filepath=filepath,
        use_selection=True,
        export_format='GLB',
    )

# ──────────────────────────────────────────────────────────────────────
#  MAIN LOOP
# ──────────────────────────────────────────────────────────────────────

def run():
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    print(f"Output directory: {OUTPUT_DIR}", flush=True)
    clear_scene()

    meta_path = os.path.join(OUTPUT_DIR, "objects_metadata.json")
    metadata = {}
    if os.path.exists(meta_path):
        with open(meta_path, 'r') as f:
            metadata = json.load(f)
        print(f"Loaded {len(metadata)} existing entries from {meta_path} (merging, not overwriting)", flush=True)

    total = sum(EXEMPLAR_ALLOC.values()) * 2  # 16 pairs x 2 = 32
    done  = 0

    for body_idx, body_type in enumerate(BODY_TYPES):
        n_exemplars = EXEMPLAR_ALLOC[body_type]

        for ex_idx in range(n_exemplars):
            exemplar_num = ex_idx + 1
            seed_base = BASE_SEED + body_idx * 1000 + ex_idx * 13

            body_rng = random.Random(seed_base)
            aspect_ratio = body_rng.uniform(ASPECT_MIN, ASPECT_MAX)
            half_L = MINOR_RADIUS * aspect_ratio
            facets = build_profile_facets(body_type, half_L, MINOR_RADIUS)
            yoked_pair_id = f"{body_type}_{exemplar_num:02d}"

            # Feature inventory shared by sym & asym of this yoked pair
            feature_rng = random.Random(seed_base + 1)
            pair_configs = generate_feature_configs(feature_rng, NUM_FEATURE_PAIRS)

            for arr_label in ['sym', 'asym']:
                object_name = f"{EXPERIMENT}_{body_type}_{arr_label}_{exemplar_num:02d}"
                print(f"[{done+1}/{total}] {object_name} ...", flush=True)

                try:
                    clear_scene()
                    mat = make_grey_material(f"Mat_{object_name}")

                    mesh_data = bpy.data.meshes.new(f"{object_name}_mesh")
                    body = bpy.data.objects.new(object_name, mesh_data)
                    bpy.context.collection.objects.link(body)
                    bm = build_revolution_mesh(body_type, half_L, MINOR_RADIUS, facets)
                    bm.to_mesh(mesh_data)
                    bm.free()
                    body.data.materials.append(mat)

                    pos_seed = seed_base * 10 + (1 if arr_label == 'sym' else 2)
                    pos_rng = random.Random(pos_seed)

                    if arr_label == 'sym':
                        att_objs, feat_positions = place_symmetric_features(
                            pair_configs, body_type, half_L, MINOR_RADIUS, facets, pos_rng, mat)
                    else:
                        configs_doubled = pair_configs + pair_configs  # same inventory, unpaired
                        att_objs, feat_positions = place_asymmetric_features(
                            configs_doubled, body_type, half_L, MINOR_RADIUS, facets, pos_rng, mat)

                    # Join body + attachments into one mesh
                    bpy.ops.object.select_all(action='DESELECT')
                    body.select_set(True)
                    for att in att_objs:
                        att.select_set(True)
                    bpy.context.view_layer.objects.active = body
                    bpy.ops.object.join()

                    filepath = os.path.join(OUTPUT_DIR, f"{object_name}.glb")
                    export_glb(body, filepath)
                    print(f"  -> {filepath}", flush=True)

                    metadata[object_name] = {
                        'experiment':           EXPERIMENT,
                        'body_type':            body_type,
                        'aspect_ratio':          round(aspect_ratio, 4),
                        'major_axis_vector':     [1, 0, 0],
                        'mirror_plane_normal':   [0, 1, 0],
                        'symmetry':              'symmetric' if arr_label == 'sym' else 'asymmetric',
                        'yoked_pair_id':         yoked_pair_id,
                        'feature_positions':     feat_positions,
                    }

                    # Clean up joined object
                    bpy.ops.object.select_all(action='DESELECT')
                    body.select_set(True)
                    bpy.ops.object.delete()

                    done += 1

                except Exception as e:
                    print(f"  ERROR on {object_name}: {e}", flush=True)
                    traceback.print_exc()
                    clear_scene()

    # Write metadata JSON (merged with any pre-existing entries loaded above)
    with open(meta_path, 'w') as f:
        json.dump(metadata, f, indent=2)
    print(f"\nMetadata written to: {meta_path}", flush=True)
    print(f"\n=== Done: {done}/{total} objects exported ===", flush=True)


try:
    run()
except Exception as e:
    print(f"\nFATAL ERROR: {e}", flush=True)
    traceback.print_exc()
