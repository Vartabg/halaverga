# Athletic adult anatomy proof

The owner's direction is adult Peter Parker from Insomniac's Spider-Man games,
applied to Halaverga's original explorer. This deliverable isolates the body:
an editable Blender file and actual renders in a simple fitted undersuit.
The game asset and all runtime source files remain unchanged.

Open [the review page](index.html) for the four views, a comparison with the
playable character, the physique reference, a torso close-up, and an approximate
gameplay-scale rear view. The source is [character.blend](../../../art/parker-anatomy/character.blend).

## Visual assessment

The new body has a developed shoulder/chest envelope, a tapered waist, anatomical
upper arms/forearms, shaped thighs/calves, and articulated hand and foot forms.
It provides a substantially stronger anatomical foundation than the procedural
playable model. This is an author assessment, not owner acceptance or an AAA claim.

The silhouette broadly follows the requested mature athletic direction. The
reference has sharper muscle/suit-plane definition; this study's pectorals and
thighs still read fuller and softer. The study uses relaxed open hands and an
A-stance; the reference's fists, pose and perspective differ. These views do not
support an exact likeness score or pixel-registered anatomical measurements.

The face, eyes and bare hands/feet are neutral anatomical studies. The head is
the source base's head, not a finished Halaverga identity or a Peter Parker face.
Hair, boots, armor, final surface textures, rigging and motion deformation have
not been developed in this phase. Approval of the build precedes those stages.

## What changed

The previous fidelity experiment retained the original Blender Studio anatomy
under its shape keys. This proof imports that body, resets its unsuccessful
reference fit, and preserves the original Basis, symmetry key and Multires data.
It makes no changes to the earlier experiment or playable GLB.

- `Athletic adult - proportions and volume`: editable changes to height,
  shoulder/deltoid width, chest depth, lat silhouette, waist taper and thighs.
  The regional edits preserve the source's existing anatomical topology.
- `Undersuit - smooth fitted envelope`: a separate garment contour across the
  front pelvis, avoiding the earlier proof's central hollow.
- A derived cloth mesh has planar neck, wrist and ankle openings, selective
  smoothing over skin details, and 1.8 mm thickness. Exposed head, hands and feet
  are separate geometry. There are no painted portrait or muscle images.

The hidden anatomical master retains its shape controls. The visible skin and
garment are editable derived meshes; they do not automatically update when the
master's shape keys change. Regenerate them with `build_garment(master)` after
removing the two prior derived objects, or edit the derived surfaces directly.
Running the full build regenerates the proof and overwrites manual changes to it.

## Sources and scope

**Anatomy asset:** Body Male – Realistic by Dan Ulrich, Blender Studio Human Base
Meshes v1.1, CC0. Reused from the project's earlier [provenance-checked
experiment](../fidelity-proof/PROVENANCE.md), not sculpted from scratch for this
task. Its original 10,582 vertices and 10,590 faces remain in the hidden master.
The audit compares both topology and Basis coordinates with the imported source.
The original asset bundle and licensing are linked in that provenance record.

**Physique reference:** [The Art of Marvel's Spider-Man 2, official publisher
preview](https://insight.randomhouse.com/widget/v4/?isbn=9781506743004&author=Written+by+Insomniac+Games&title=The+Art+of+Marvel%27s+Spider-Man+2),
printed page 018, Peter's Advanced Suit front/back concept. This is concept art,
not a neutral orthographic capture of the shipped game. The review page embeds
the publisher's public preview; it is not packaged as a project texture or
copied game mesh. No Spider-Man costume or insignia was built.

**Rendering guidance:** the Research Vault's [reviewed 3D web guidance](/Users/vartny/Research-Vault/domains/04-product-3d-web/guidance/CURRENT_GUIDANCE.md)
informed source/runtime boundaries and evidence reporting. That guidance
explicitly does not cover character sculpting. The product-3d skill is likewise
not used as offline-modeling authority.

## Evidence

- The six study PNGs are direct Blender 4.0.2 Cycles renders, 64 samples with
  denoising, AgX, neutral area lighting. No image-generation or retouching pass.
- `renders.json` records cameras, file hashes, and identical evaluated geometry
  fingerprints across views. `audit.json` comes from reopening the saved file.
- `previous-front.png` reimports the current game GLB and uses the same studio
  lighting/camera, normalized to the proof's nominal 1.85 m height. Material
  differences remain. `comparison.json` records the source hash and scale.
- `gameplay-scale.png` is a studio rear view at approximately 294 pixels tall
  in a 1440 × 1000 image. It is not an in-game capture or device-performance test.
- This offline master is not runtime-budgeted, rigged, or integrated. No physical
  iPhone, Safari, VoiceOver, thermal, or animation validation is claimed.

## Verification · 2026-09-19

TypeScript, all 200 existing unit/movement/asset tests, the production build,
and the landing-first-load check passed in the isolated worktree. The six
existing browser checks in `flight.spec.ts`, `composition.spec.ts`, and
`accessibility.spec.ts` all passed against the production preview in system
Chrome on this Mac. One initial steep-climb assertion failed while Cycles was
rendering; it passed alone and again in the complete six-test rerun after the
rendering workload ended. No movement or camera code was changed to obtain a pass.

The saved Blender file was reopened and audited, and the final renders and
local review page were visually inspected. This is a bounded browser regression
sample, not a claim that the entire browser suite or a physical device was tested.

## Reproduce

From the linked worktree, with Blender 4.0.2 installed:

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python-exit-code 1 --python scripts/anatomy_proof/build.py
ANATOMY_SAMPLES=64 /Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup art/parker-anatomy/character.blend --python-exit-code 1 --python scripts/anatomy_proof/render.py
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup art/parker-anatomy/character.blend --python-exit-code 1 --python scripts/anatomy_proof/before.py
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup art/parker-anatomy/character.blend --python-exit-code 1 --python scripts/anatomy_proof/audit.py
python3 scripts/anatomy_proof/verify.py
```

Serve this worktree with `preview run --cwd "$PWD" --port 3473 -- python3 -m http.server 3473 --bind 127.0.0.1`,
then open `/docs/art/parker-anatomy/`. The managed preview expires after inactivity.
