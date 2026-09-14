# Character from a generated reference

Goal: replace the comical anatomy with a credible human explorer matching the generated front/profile/back character sheet. Deliver the editable Blender source, the game GLB, and actual model/gameplay captures.

- [x] Save the generated reference and generation prompt in `docs/art/`; embed the reference in the Blender authoring file.
- [x] Add proportion regressions in `tests/human-suit.test.ts` for shoulder/hip/knee placement, balanced limbs, head size, and foot size.
- [x] Rebuild `scripts/hero_anatomy.py`; add focused face and armor modules. Update `scripts/hero_skin.py` and runtime joint pivots to the new anatomy, retaining ten joints and existing flight controls.
- [x] Export `public/models/suit.glb` and `art/halaverga-explorer.blend` through `scripts/build-suit.py`. Inspect actual front, profile, back and flight poses against the generated reference; iterate on visible defects.
- [x] Run type checks, unit tests, production build, browser/accessibility checks and a desktop rendering sample. Record evidence and limitations in `docs/reference-hero-review.md`.
- Final handoff gate: finish using task-lifecycle, commit and push the task branch, and leave the updated preview open. Completion is reported from the lifecycle result, not pre-asserted in this document.

The reference establishes material placement and proportions; it is concept art, not a screenshot of the shipped mesh. Preserve the eight material batches, fewer than 20,000 triangles and reusable loader-cache ownership. After reviewing the mannequin-like uncolored face and rejecting a visibly smeared vertex-color attempt, use embedded skin/hair atlases within an 850 KB cap (formerly 600 KB untextured). This adds texture decoding but no external texture requests. Record the measured artifact size and rendering sample. Physical iPhone checks remain unverified.
