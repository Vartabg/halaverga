# Human hero and readable flight direction

Goal: an athletic human in a continuous fitted suit, clearly facing away from the chase camera during forward travel.

The live standing/forward-flight captures show the existing model's back, but its rear plates resemble a chest and the helmet obscures the human silhouette. Rapid camera turns can also outrun velocity-driven body yaw. Preserve the forward -Z asset convention; do not apply an arbitrary 180-degree model reversal.

- [x] Reproduce sharp-turn facing in `tests/presentation.test.ts`; bound body yaw relative to the shared view heading in `src/game/presentation.ts`.
- [x] Replace the plated mannequin in `scripts/build-suit.py` with a continuous anatomically shaped skinned surface. Put authoring helpers in `scripts/hero_anatomy.py` and `scripts/hero_skin.py`; regenerate `public/models/suit.glb`.
- [x] Extend `src/world/suitRig.ts` through `src/world/skinnedSuit.ts` to bind the ten existing joint controls to weighted geometry; retain source-cache ownership and bounded poses in `src/world/suitPose.ts`.
- [x] Verify anatomical landmarks, normalized weights, facing, deformation, disposal and budgets in focused tests. Inspect front/profile/back and the actual chase camera at desktop and phone sizes.
- [x] Run the required unit, build, browser/accessibility checks and desktop rendering sample. Record evidence in `docs/human-hero-review.md`.

Delivery gates follow this verified source record: lifecycle commit/push, Vercel publication and hosted smoke checks.

No input changes, new camera writer, combat, flames or licensed character assets. References inform original anatomy and posture. Physical iPhone validation remains separate.
