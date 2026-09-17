# Hero facing and limb correction

Goal: the explorer's back stays toward the chase camera in every flight state, the body points along the direction of travel, and elbows and knees bend the way human joints bend.

Owner report: the character "looks backwards with the limbs wrong". Live inspection confirmed three causes. Elbow and knee rotations were applied with inverted signs for the -Z-facing model, so forearms bent toward the camera and shins kicked forward. The body pitched only partially with the climb while the camera boom followed the view pitch fully, so steep climbs showed the chest from below. Banking rotated the leaned body around its own vertical axis, swinging the torso sideways instead of rolling it.

- [x] Measure the exported model's actual facing (nose, eyes, toes, chest seams at negative z; spine lights at positive z) before changing any pose math.
- [x] Track a bounded body pitch in `src/game/presentation.ts`, mirroring the existing yaw bound, so the body follows the travel slope but never drops far enough below the view to expose the chest.
- [x] Move the root orientation into `orientSuit` in `src/world/suitPose.ts`: yaw and pitch from travel, lean as an offset, banking as a roll about the body's long axis scaled by the travel pitch. Correct every joint sign.
- [x] Regression tests: joint flexion direction in every state, world-space hand and heel positions on the real rig, back-to-camera geometry across view pitch, bounded body pitch, bank, speed and yaw lag, and the presentation pitch bound at 30/60/120 Hz.
- [x] Update the pose harness to the game's own chase framing with climb, dive and brake views; record live captures.
- [x] Type check, unit tests, production build, browser and accessibility checks. Record evidence in `docs/hero-facing-review.md`.
- Final handoff gate: finish using task-lifecycle, commit and push the task branch.

No model, texture, collider, camera-ownership or control change. Physical iPhone checks remain separate.
