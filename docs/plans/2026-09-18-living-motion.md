# Living motion

Goal: the explorer moves like a game character on the existing ten-joint rig. On foot the legs cycle with the distance travelled in the direction of travel, the body breathes at rest and bobs while hovering, takeoff pushes off from a crouch, landing absorbs the touchdown, and limbs lag and overshoot when speed or direction changes.

Owner report: after the hero-facing fixes the character "looks like not much changed"; movement should relate to direction, speed and angle, like a video game character.

- [x] Add a time-based motion layer in `src/world/suitAnimation.ts`, composed after `applySuitPose` in `src/world/Suit.tsx`: distance-driven directional gait with planted feet, idle breathing and weight shift, hover bob, takeoff push-off, landing absorption and spring follow-through. It reads the existing presentation values, physics velocity and the store's flight and landing flags, and writes only joint rotations and a visual root offset. `applySuitPose` now writes every rotation component each frame so the layer never accumulates.
- [x] Reduced motion keeps the gait but softens the extra motion and removes twists; teleports and resets restart the layer. The hover bob settles during a landing approach, so touchdown neither pops nor lifts the planted feet.
- [x] Tests: gait phase follows distance at 30/60/120 Hz, legs swing along the travel direction (forward, backward, sideways), soles stay on the ground through walking, idling, push-off and landing, elbows and knees keep their flexion directions in every state, takeoff and landing trigger only on real transitions, springs overshoot and settle identically across refresh rates.
- [x] Inspect rendered frame strips of the real rig (`scripts/review-suit-motion.mjs`) and live before/after captures; record the existing browser and accessibility checks.
- Final handoff gate: finish using task-lifecycle, commit and push the task branch.

The layer is visual only: player, physics, camera and controls stay authoritative and unchanged. Physics lifts the instant lift is pressed, so the push-off crouch overlaps the first tenth of a second of the climb instead of delaying control. No model, texture or collider change. A fuller skeleton and authored animation clips remain a later step. Physical iPhone checks remain separate.
