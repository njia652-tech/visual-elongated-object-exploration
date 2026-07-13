> **这是实验执行先前方案，现在留作备查。**
> 可直接作为单一事实来源,用于实现 / 运行 / 修改 / 撰写 Methods。
> §2 (Fixed design) 是你已确定、不可改动的设计;§3 是必须始终成立的约束;§4 是实现时需要你确认的执行参数(**不属于设计本身**);§6 是 stimulus 的构建指引(数值为建议、原则固定)。旧 source 里若已有这些参数(按键映射、采样率等),直接并进 §4 即可。

# Experiment Specification — Preferred Viewpoint Selection for Novel 3D Objects under Active Exploration

## 0. Purpose and status of this document
This is the complete, authoritative specification for the experiment. It **supersedes all previous experiment-execution sources.** Use it as the single source of truth when implementing, running, modifying, or documenting the study. Section 2 is finalized and must not be altered. Section 3 lists constraints that must always hold. Section 4 lists implementation parameters that are **not** part of the design and must be confirmed before building. Section 6 gives stimulus-construction guidance (recommended values to confirm; the stimulus principles in §2.8 are fixed).

## 1. Study overview
The experiment measures how observers select a preferred viewpoint of novel 3D objects when they can actively rotate them. The research question is whether preferred viewpoints are jointly constrained by **global object geometry** (presence vs. absence of a salient major axis) and **local feature arrangement** (symmetric vs. asymmetric distribution of surface features), and whether these constraints appear in a similar or different form under two task goals. Two parallel viewpoint-selection tasks are run on two independent but structurally matched object sets and analysed separately.

---

## 2. Fixed design (do not modify)

### 2.1 Structural dimensions (manipulated within each task)
- **Global Shape** — two categorical levels: **non-elongated** vs **elongated**. This is a categorical manipulation of whether the object has a salient global / major axis. It is **not** a continuous elongation-magnitude manipulation. (For elongated objects this axis also anchors the symmetry plane — see §2.8.)
- **Feature Arrangement** — two levels: **symmetric** vs **asymmetric**. This manipulates whether the local distribution of surface attachments provides diagnostic asymmetric information. (See §2.8 for the symmetry definition and stimulus-level operationalization.)

Within each task the design is **2 Global Shape × 2 Feature Arrangement**.

### 2.2 Two tasks and object sets

| Task | Instruction goal | Object set |
|---|---|---|
| Representation task | Choose the view that best represents / gives the best impression of the object | Object Set A |
| Memory-oriented task | Choose the view judged most helpful for recalling the object later | Object Set B |

- Set A and Set B are **independent but structurally matched**.
- The two sets are used so that **no object appears in both tasks**, avoiding carry-over / familiarity effects from repeated exposure.
- The two tasks are **collected and analysed separately**. Task is **not** a formal factorial variable and is **not** entered into a formal statistical comparison; the two tasks are related only theoretically (in the Discussion).
- Each participant completes **both** tasks (within-subjects across task): 20 + 20 = **40 trials per participant**. *[Inferred from the carry-over rationale above — confirm in §4.]*

### 2.3 Conditions and trial counts
Each object set contains the four object-structure conditions:
1. Non-elongated symmetric
2. Non-elongated asymmetric
3. Elongated symmetric
4. Elongated asymmetric

- 5 objects per condition → 4 conditions × 5 = **20 objects per set**
- **20 trials per task**, **40 trials total per participant**
- Total distinct objects across the study: 2 sets × 20 = **40 objects**, each seen once

### 2.4 Task instructions (wording intent)
- **Representation task:** participants select the view that best represents the object / gives the best impression of it.
- **Memory-oriented task:** participants select the view they think would best help them recall the object later. This is **viewpoint selection under a memory-oriented instruction** — **not a memory test.** There is no subsequent recognition or recall assessment.

### 2.5 Trial procedure and timing
Per trial:
1. Object is presented and can be freely rotated.
2. **Exploration period: 50 s.** Participant rotates the object via keyboard, exploring freely across the full range of azimuth and elevation.
3. **Confirmation period: 10 s.** Participant confirms the selected view by pressing **Enter**.
4. If Enter is not pressed, the view displayed at the **end of the confirmation period** is recorded automatically.

**No practice trials.**

### 2.6 Controls and interaction
- Rotation is controlled via the **keyboard**.
- Both rotation dimensions are available: **full-range azimuth and elevation**.
- **Enter** confirms the selected view.

### 2.7 Dependent variables
- **Final selected viewpoint:** final azimuth and elevation.
- **Final viewpoint category:** axis-based bins and feature-revealing bins, where appropriate.
- **Dwell time** in different viewpoint regions during exploration.
- **Confirmation latency.**
- **Rotation behaviour / exploration trajectory** (secondary measures).

### 2.8 Stimulus structure: symmetry definition and feature arrangement

**Symmetry type.** "Symmetric" means **bilateral symmetry** — reflective symmetry across a **single mirror plane** (one and only one plane of reflection maps the object onto itself). This is distinct from rotational, radial, or multiple-plane symmetry, which must be avoided.

**Locus of the manipulation.** The Feature Arrangement factor is realised through the placement of **local surface features (attachments)**, not through the global body shape. The body is built to be **bilaterally symmetric in all four cells**, so it contributes no asymmetry and only instantiates the Global Shape factor.
- **Symmetric condition:** local features are placed in **mirror-image pairs** across the reference plane → the whole object is bilaterally symmetric.
- **Asymmetric condition:** the **same** features are placed so that **no plane** maps the object onto itself → the whole object is asymmetric, with the asymmetry arising **solely from feature arrangement.**

**Mirror-plane convention.**
- **Elongated objects:** the reference (mirror) plane **contains the major axis.** Left and right flanks mirror each other; the two ends along the axis may differ. This keeps symmetry (flank mirror) **independent of** elongation (axis), so the 2×2 stays orthogonal.
- **Non-elongated objects:** there is no major axis to anchor to; use a **fixed object-centered median plane.** The symmetric / asymmetric contrast is otherwise identical.

**Stimulus requirements (must hold).**
- Within each elongation level, the symmetric and asymmetric versions share the **same body** and the **same feature inventory** (same number, sizes, and types of features); only the spatial **arrangement** differs.
- Across elongation levels, bodies are matched as closely as possible on volume / surface area / overall scale and visual complexity.
- Asymmetry must be **clearly suprathreshold** — not a near-symmetric small displacement.
- Diagnostic (asymmetric) features are positioned so that **revealing them depends on viewpoint** (visible from some views, occluded / foreshortened from others), so that a "feature-revealing viewpoint" is measurable.
- Symmetric objects are **exactly** bilaterally symmetric (a single mirror plane), with no accidental rotational or multiple-plane symmetry.

**Exemplars and sets.**
- **5 exemplars per cell**, sharing the cell's defining properties (elongation level + symmetry status) while varying incidental shape, so each is a distinct novel object.
- Object Set A and Set B follow **identical** construction rules; corresponding cells are matched on the controlled properties but consist of **different objects** (no object appears in both sets / tasks).

---

## 3. Constraints that must always hold
1. Elongation is **categorical** (salient global axis present vs absent), never a continuous magnitude.
2. The Memory-oriented task is always described as **memory-oriented viewpoint selection**, never as a memory test.
3. The two tasks are **analysed separately**; there is **no formal statistical task-effect comparison.** Cross-task relationships are discussed only theoretically.
4. Within each task, the formal manipulation is **Global Shape × Feature Arrangement**.
5. Object Set A ↔ Representation task; Object Set B ↔ Memory-oriented task; the sets are independent but matched, and no object crosses tasks.
6. "Symmetric" = **exactly bilateral** symmetry (one and only one mirror plane); asymmetric objects have **no** mirror plane.
7. Asymmetry is realised through **feature arrangement only**; the body remains bilaterally symmetric across all four cells, keeping Feature Arrangement and Global Shape orthogonal.

---

## 4. Execution parameters to confirm before building (not part of the fixed design)
Implementation details not specified by the design. Confirm or adjust; these do **not** change the design.

- **Runtime / platform:** the real-time engine that loads and rotates the (Blender-authored) objects and logs data — e.g., PsychoPy, web (jsPsych + Three.js), Unity, or other.
- **Participant structure / order:** confirm within-subjects; counterbalance task order (Representation-first vs Memory-first) across participants; randomize trial order within each task.
- **Rotation during the 10 s confirmation period:** whether participants may keep rotating, or the view is locked after the 50 s exploration.
- **Initial object orientation** at trial onset: fixed, random, or condition-controlled.
- **Key mapping and rotation step / speed:** e.g., Left/Right = azimuth, Up/Down = elevation; per-press step size or continuous-hold rate.
- **Precise operational definitions:**
  - *Confirmation latency* — proposed: time from confirmation-period onset to Enter press (0–10 s); coded as auto-recorded if no press.
  - *Viewpoint-region / dwell binning* — requires a defined grid or object-relative regions over azimuth × elevation.
  - *Axis-based / feature-revealing categories* — require **per-object metadata** (major-axis orientation; locations of asymmetric / diagnostic features) so each final viewpoint can be classified. Ensure this metadata is exported with each object (see §6).
- **Sampling rate** for the trajectory log (per input event or fixed Hz).
- **Display settings:** rendering style, background, lighting, object scale, screen resolution.

---

## 5. Recommended data output (configurable)
- **Per-trial record:** participant_id, task, object_set, object_id, condition (global_shape, feature_arrangement), trial_index, task_order, final_azimuth, final_elevation, axis_category, feature_category, confirmation_latency, enter_pressed.
- **Per-sample log (for dwell time and trajectory):** participant_id, task, object_id, trial_index, timestamp, azimuth, elevation.

---

## 6. Stimulus construction (build guidance — Blender)
Recommended workflow for building the objects. **Numeric values are starting recommendations to confirm;** the stimulus principles in §2.8 and the constraints in §3 are fixed.

1. **Body.** Non-elongated ≈ roughly equidimensional (low aspect ratio, ~1:1:1); elongated ≈ stretched along one axis (~2.5–3:1) with a roughly constant cross-section. Build the body itself symmetric about the reference plane so it contributes no asymmetry.
2. **Feature inventory.** Define a small set of distinct local feature shapes (bumps, fins, knobs, notches) that read as separate from the body and from each other.
3. **Symmetric version.** Place features with the **Mirror modifier** across the reference plane — this guarantees exact bilateral symmetry.
4. **Asymmetric version.** Place the **same** features (same count / size / type) manually at **non-mirror** positions; do **not** use the Mirror modifier. Verify that no reflection plane maps the object onto itself.
5. **Equating.** Within an elongation level, the symmetric and asymmetric versions use the same body and the same feature count / volume / type / complexity; match bodies across elongation levels on volume / surface area.
6. **View-dependence.** Position diagnostic (asymmetric) features so they are visible from some viewpoints and occluded / foreshortened from others (e.g. on one flank only).
7. **Exemplars and sets.** Build 5 exemplars per cell; build Sets A and B by the same rules with distinct objects.
8. **Rendering.** Uniform matte material, neutral lighting, no surface texture that reveals orientation independently of shape.
9. **Per-object metadata (export with each object).** Major-axis orientation vector; the reference / mirror plane; and the locations of the distinctive (asymmetric) features. This metadata is required to classify each final viewpoint into the **axis-based** and **feature-revealing** bins (see §2.7 and §4).
