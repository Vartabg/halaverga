# Hero facing and limb correction · 2026-09-16

Owner report: the character "looks backwards with the limbs wrong" and should point the way it travels with its back to the camera.

## What was actually wrong

The exported model was measured before any change: nose tip z −0.113, eyes z −0.079, toe box z −0.206, heel z +0.082, chest seams at negative z, spinal lights at positive z. The model faces −Z, and body yaw already followed velocity with the camera boom behind. The reversal was not a model or yaw error. Three things made it read backwards:

1. Elbows were flexed with negative x and knees with positive x. Every limb hangs along −Y at rest, so for this model a positive x rotation swings it forward. Forearms therefore bent toward the camera and shins kicked forward, which is what a viewer reads as a chest-on figure. The lead fist reached forward by rotating 2.72 rad backward over the shoulder.
2. The camera boom follows the view pitch, but the body pitched only by `lean + 0.65·slope`. In a steep climb the camera sat about five metres below and behind while the body stayed 40° from vertical, so the chest was visible from below. Live telemetry: view pitch 1.25, lean −1.35, no body pitch term.
3. Banking rotated the leaned body around its own Z axis. With the body horizontal that axis is vertical, so a turn swung the torso up to 29° sideways in the horizontal plane, on top of a 0.4 rad yaw lag.

## Change

- `src/game/presentation.ts` tracks a body pitch from the travel slope, settled like yaw and bounded to the view pitch: at most 0.15 rad below and 0.4 rad above. The yaw bound tightens from 0.4 to 0.3 rad. Both bounds are exported as `FACING`; the third-person boom is exported as `CHASE_BOOM` and used by the camera rig, the tests and the harness. The lean and the body pitch that offsets it both scale with one settled `power` value, so they fade together when the explorer slows.
- `src/world/suitPose.ts` owns the root orientation in `orientSuit`: yaw and pitch from travel, the streamline lean as an offset, and banking as a roll about the body's long axis, scaled by the cosine of the travel pitch and capped near 20°. Joint signs are corrected: hover floats the arms slightly forward and out with forearms forward, power flight leads with the right fist along the travel axis and trails the left arm at the hip, braking flares both arms forward and lifts the left knee with the heel behind.
- `src/world/Suit.tsx` calls `orientSuit`; the separate climb blend is gone. Telemetry exposes the suit and view pitch for browser checks.
- The pose harness now places its camera with the game's chase boom and view direction (at a narrower field of view so the figure stays legible) and adds climb, dive and brake views.

Movement, collision, camera behavior, controls, the model and its textures are unchanged; the camera rig only reads its boom from the shared constant.

## Evidence

- [Nine actual playable-rig views](images/hero-facing-poses.png) from the harness. [Level power flight](images/hero-facing-flight.png), [steep climb](images/hero-facing-climb.png) and [banked left turn](images/hero-facing-bank.png) are system-Chrome captures of the real game at 1440×1000, taken with keyboard flight. In the climb the camera trails below and behind, so it sees the boot soles and the back at a grazing angle; that is the honest chase view rather than a chest.
- Live in-app-browser inspection before and after covered standing, hover, power flight, climb, dive, left and right turns, braking and looking up and down while hovering.
- Unit tests: joint flexion direction across eight states × classic/hero × reduced; world-space hands in front of elbows and heels behind knees on the real rig; back-to-camera geometry across seven view pitches, three body-pitch offsets, three banks, four speeds, three yaw lags and both pose modes (minimum cosine +0.08, at a hover viewed from straight above); the presentation pitch bound at 30/60/120 Hz; alignment with climbing and diving velocity; roll direction.
- A new browser check flies a steep climb and asserts the suit pitch stays near the view pitch. Its envelope is looser than the unit bound to absorb frame timing; the unit tests hold the exact bound.

## Review follow-up · 2026-09-17

A four-lens review of the committed branch found one defect in the facing work and one regression from the separate review-fix commit. Both are fixed here.

- **Hard braking out of a climb could show the chest.** The lean faded at one rate while the pitch that offsets it faded with raw speed. With the camera below the explorer and speed dropping fast, the two came apart and the body turned edge-on or past it. A 60 Hz run of the real pose loop over 144 climb, brake, turn and reduced-motion cases measured it:

  | | Worst back-to-camera cosine | Cases at or below zero |
  |---|---|---|
  | Before | −0.038 | 12 |
  | After | +0.222 | 0 |

  Both now scale with one settled value. A new unit test runs the same deceleration through the real pose loop.
- **Test gaps closed.** New assertions check that the body heading follows travel, that hovering stays upright wherever the player looks, and that braking flares both arms forward in hero and classic poses. Each bug was reintroduced on purpose to confirm its test fails. The original back-to-camera sweep caught none of the three.
- **First-load regression.** The retry fix imported the 3D loader at the top of the page module, which put a 912 KB three.js and React Three Fiber chunk into the landing page's first load. The retry now loads it only when the player presses Reload scene. Initial scripts dropped from 1504 KB to 969 KB.

## Verification

- `pnpm verify`: TypeScript, all 63 unit/physics/model tests and the production build passed. Ten tests are new or rewritten for this change; one unit test and one browser check come from a separate review-fix commit made by another session on the same branch (loader-cache clear on scene retry, uv retention in the rigid assembly path, a shared joint parents table, removal of a write-only store flag and an unused dev dependency).
- `pnpm test:browser` against a managed production preview on port 3366: all 34 browser and accessibility checks passed in system Chrome 153 on Apple M2 Max, including the new steep-climb facing check, the existing rapid-turn facing check, both cameras, touch, trackpad, recovery, orientation and automated AA scans.
- Live in-app-browser checks on the production build covered hero poses, classic poses (hero flourishes off) and reduced motion: cruise, climb, dive, left and right turns, braking, hover, and looking up and down while hovering. These are desktop viewport checks, not physical iPhone validation.
- Before the fix, eight independent verifier agents each tried to refute one of the three diagnosis claims with their own Node measurements of the GLB and the runtime formulas. None refuted any claim; their verdicts are recorded verbatim in [hero-facing-verification.json](hero-facing-verification.json).

## Limits

The chase camera still follows the view pitch fully, so a near-vertical climb or dive shows the back at a grazing angle rather than squarely. A 368 KB three.js chunk still loads with the landing page because the shared runtime module holds three.js vectors; that predates this branch. A camera-height change was not made because the owner did not ask for a framing change. Physical iPhone Safari, VoiceOver and subjective approval remain open in [TECH_DEBT.md](TECH_DEBT.md).
