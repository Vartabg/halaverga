# Living motion

Goal: the explorer moves like a game character on the existing ten-joint rig. On foot the legs cycle with the distance travelled in the direction of travel. The body breathes at rest and bobs while hovering. Takeoff pushes off from a crouch, landing absorbs the touchdown, and limbs lag and overshoot when speed or direction changes.

Owner report: after the hero-facing fixes the character "looks like not much changed"; movement should relate to direction, speed and angle, like a video game character.

- [x] Add a time-based motion layer in `src/world/suitAnimation.ts`, composed after `applySuitPose` in `src/world/Suit.tsx`. It covers a distance-driven directional gait, idle breathing and weight shift, hover bob, takeoff push-off, landing absorption and spring follow-through. It reads the existing presentation values, the anchor position, physics velocity, and the store's flight, landing and pause flags. It writes only joint rotations and a visual root offset. `applySuitPose` now writes every rotation component each frame, so the layer never accumulates.
- [x] Sideways steps open and close on each side without crossing. Sole height is measured through the model's own rotation. The torso lean is cancelled at the hips. The gait follows a smoothed velocity, so walls and cleared input never snap the legs.
- [x] The push-off crouch holds the last grounded height while the anchor rises; reduced motion rides with the anchor. Plant switches at a caught fall or a touchdown blend their height change out over .15 s. Follow-through springs are kicked by velocity changes, with a capped kick. Pausing freezes the pose and resuming restarts the layer. The stride uses real frame time.
- [x] Reduced motion keeps the gait, softens breathing, bob, crouch and absorb, and removes the springs, pelvis twist and takeoff hold. Turning off hero poses removes the fist-led launch. Teleports and resets restart the layer. The hover bob settles during a landing approach.
- [x] Tests in `tests/suit-animation.test.ts` and `tests/suit-transitions.test.ts`, sharing `tests/suit-motion-harness.ts`. They are measured in world space on a rig posed the way the game poses it:
  - the gait phase follows distance at 10 to 120 Hz;
  - legs swing along the travel direction, and sideways steps never cross;
  - the lower sole stays at ground height through walking, turning rolls, idling and landing, off only by what remains of a touchdown blend;
  - the takeoff hold uses the grounded height although physics has already raised the anchor, at 60 and 30 Hz;
  - the feet stay under the body through the crouch and absorb;
  - joints stay bounded, elbows flexed while running, and the hinge guards hold (the guards only keep a regression out; nothing in normal play reaches them);
  - a caught fall at any stride phase and a touchdown at 60 or 30 Hz never jump;
  - a hard stop swings the arms forward and back over several frames, identically across refresh rates, and setting off makes the limbs trail;
  - pausing freezes the pose and resume replays no stale swing;
  - reduced motion and hero-pose behaviour hold, a teleport restarts the layer, and posing the same rig again never accumulates.

  Mutation checks confirm the tests fail without the plant blend, the pause freeze, the reduced-motion hold exemption or the grounded takeoff height.
- [x] Inspect rendered frame strips of the real rig (`scripts/review-suit-motion.mjs`) and live before/after captures; record the existing browser and accessibility checks.
- [x] Multi-agent review of the first version, re-verification of every finding against the revision, and fixes for the regressions it raised.
- Final handoff gate: finish using task-lifecycle, commit and push the task branch.

The layer is visual only: player, physics, camera and controls stay authoritative and unchanged. No model, texture or collider change.

Known limitation: only the sole's height is held. At every speed and direction the grounded foot slides most of the body's travel, mainly because the still-swinging foot becomes the lowest before it lands. A fuller skeleton with authored clips and foot inverse kinematics is the next step and must solve this. Physical iPhone checks remain separate.
