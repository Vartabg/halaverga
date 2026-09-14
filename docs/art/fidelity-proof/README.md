# Fidelity proof — stopped after two correction passes

**Author assessment: the required visual quality has not been demonstrated.**
This is an editable, inspected experiment, not an approved or finished character.
The owner makes the visual acceptance decision. No game replacement follows
from the technical checks below, and no further modeling pass was taken.

## Review the actual result

- Editable file: `art/fidelity-proof/character.blend` (Blender 4.0.2).
- `pass-2/full-body-comparison.png`: front, profile and back; within each pair,
  original concept left, actual gray render right. All three pairs use the
  original pixel-to-meter scale and ground line.
- `pass-2/silhouette-overlays.png`: the rendered mesh's translucent blue
  silhouette over each original view. Blue is the model, not a similarity score.
- `pass-2/bust-views.png`: actual mesh, front / profile / three-quarter.
- `pass-2/head-concept-comparison.png`: original head close-up beside the gray
  three-quarter view. This perspective-art comparison is **not scale-registered**.
- Individual `compare-*`, `overlay-*` and transparent `silhouette-*` PNGs are
  retained alongside the six original RGBA renders in `pass-2/`.

Full-body visual description: a gray anatomical male study with separately
modeled chest, collar, shoulder and rear panels, sculptural swept hair, rough
lower-limb panel blocks and bare feet. The concept is a fitted, armored male
explorer with boots and more characterful facial and hair shapes. The overlays
expose gaps at the shoulders, forearms, hands and feet, as well as differences
in the head/profile. Those mismatches are not hidden by materials or lighting.

## Remaining mismatches

1. **Head:** the jaw, brow and nose received local shape edits, but the face
   still reads as the base scan rather than the reference character. The brow,
   cheek planes, mouth, ears and chin are insufficiently matched. The eyeballs
   are geometry without texture; their presence does not establish likeness.
2. **Hair:** the outline is no longer the first pass's isolated strip arch,
   but the clumps and temple rows remain too uniform, too tidy and cap-like.
   The original's irregular volume, parting and loose locks are not reproduced.
3. **Collar:** lowered in pass 1, yet still a broad continuous band rather than
   the reference's closely fitted, segmented opening and raised side sections.
4. **Chest and back:** angular borders are present, but depth, spacing and
   integration are wrong. Several plates float or intersect; the lower chest
   flanges look stacked. The rear plates are too broad and disconnected from
   the reference's narrower, articulated layout. Smoothing projection artifacts
   did not solve these construction problems.
5. **Shoulders:** the caps now wrap the deltoids, but their coverage and border
   shapes differ. Clavicle/rear tabs still protrude. The relationship between
   collar, shoulder cap and chest is not convincingly resolved.
6. **Body and extremities:** anatomical topology avoids the earlier primitive
   body construction, but matching remains incomplete. Arm/hand pose and
   fingertip deformation are visibly wrong; leg stance and widths differ.
   Feet remain bare anatomical forms instead of the concept's boot envelope,
   with a small sole-height offset. Lower-limb plates are only rough blocks.

## The bounded passes

| Pass | Changes and observed result |
| --- | --- |
| 0 — construction | Imported the Studio male and retained Basis/Multires; added editable proportional fit, traced armor and hair clumps. Review exposed ankle deformation from the arm influence field, crumpled projected borders, narrow stance, high collar and parallel-strip hair. |
| 1 — correction | Restricted arm influence above the legs; adjusted stance, jaw, brow and nose; lowered collar; retained traced X/Z borders; wrapped deltoid caps around the anatomical surface; added a scalp-derived foundation and overlapping asymmetric locks. Ankle artifacts were removed, but projecting borders still produced bad depths, and hair/face likeness remained weak. |
| 2 — final correction | Adjusted lower-arm placement, fitted continuous curved sheets to sampled plate depths, corrected plate winding, removed the malformed lower shoulder overlaps and added irregular forelocks. Jagged surfaces were reduced, but substantial fit, silhouette and likeness problems remain. **Stopped.** |

The pass folders preserve actual rendered evidence, not AI-painted alternatives.
Only the final editable Blender file is delivered. No third correction pass was
made. Technical delivery completion is distinct from visual acceptance.

## Blender contents and use

The anatomy object is named **Studio anatomy - reference fit**. Its shape key
**Reference silhouette - editable fit** holds the proportional changes; Basis
and the source's original topology remain. Multires has three stored levels,
with two used for these renders. Armor thickness/bevel modifiers and individual
hair clumps remain editable; no voxel remesh was used.

The **REFERENCE - original concept, not render geometry** collection contains
the packed original and three precisely scaled crop planes. The crop planes
are hidden in the viewport by default: unhide the desired `REFERENCE ONLY`
object, use Material Preview, and inspect the corresponding orthographic view.
They are always disabled for renders, and image materials occur only there.

Six **Review** cameras and neutral area lights are saved in the file. Each
camera records its render width/height as custom properties. F12 initially
renders the final three-quarter camera. The command below recreates all six
views. Gray materials and neutral lighting are shared across the views.

## Verification and reproducibility

`PROVENANCE.md` records the official CC0 source, author, source hashes, Blender
compatibility and original concept hash. `reference.json` records interpreted
pixel landmarks and inconsistent poses. Measurements are manual estimates;
the landmark table is not an assertion that the final geometry matches them.

`audit.json` records the reopened final file's hash, original polygon-connectivity
digest, packed image, lack of image materials on proof meshes, excluded reference
planes, lack of rig, shared geometry fingerprint for all six cameras and the
unchanged runtime-file hashes. `verify.py` rejects stale artifact audits.
These checks assess file integrity and workflow boundaries, **not visual quality**.

Checks on 2026-09-14: final Blender file reopened with its packed concept and
all six saved cameras; proof integrity checks passed; TypeScript check passed;
54 unit/movement tests passed; production build passed; 32 desktop browser
checks passed, including the automated accessibility check. The disposable
verification server used port 3371 and was stopped after the checks.

Run from the isolated proof worktree after downloading/extracting the pinned
official source bundle documented in `PROVENANCE.md`:

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python-exit-code 1 --python scripts/fidelity_proof/build.py -- --bundle /absolute/path/to/human_base_meshes_bundle.blend --revision 2
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup art/fidelity-proof/character.blend --python-exit-code 1 --python scripts/fidelity_proof/render.py
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python-exit-code 1 --python scripts/fidelity_proof/compare.py -- --revision 2
python3 scripts/fidelity_proof/verify.py
```

There is no rigging, texture finish, game export, runtime/API modification,
deployment or polygon-budget gate. The playable asset and game source remain
unchanged from the starting commit. Physical iPhone checks were not performed;
desktop browser automation must not be described as physical-device validation.
