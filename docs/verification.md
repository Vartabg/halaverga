# First-flight verification · 2026-09-11

## Desktop controls restore · 2026-09-24 (emulation only)

Owner feedback (Garo, on desktop): "oh no this is bad, now its terrible on the desktop", and "I liked the controls much better before they were changed the first time you added the gun". What he chose: bring back the 7945430 desktop controls (click to fly, the pointer steers, click again to stop, drag to look while stopped), with one change for the blaster. While stopped or on the ground, a click fires (on release), holding still fires automatically, and dragging only looks. Space starts flying, and so does W once in the air. The twin-stick phone controls from d15eac5 stay phone-only. Base d15eac5; units A (desktop flight), B (touch isolation) and C (desktop copy) merged in the worktree with no merge-level code fixes needed.

What Garo saw, measured before and after at his exact pane state. System Chrome, viewport 325x928, `hasTouch` false, `isMobile` false. The save was seeded as `{trackpadSteering:'simple', controlsVersion:3, hintProgress:{touch:0,simple:0,mouse:0}}`. Before = `git archive d15eac5` built and served on 127.0.0.1:3392. After = the merged build on 127.0.0.1:3391. Both pages read `navigator.maxTouchPoints` 0, `(pointer: coarse)` false and `html[data-input]` `mouse`, so no touch layer, touch cluster or Fire button was on screen in either build.

| Step (325x928) | Before (d15eac5) | After (merged) |
|---|---|---|
| After Begin | `html[data-playing]` set (fixed page, gesture blockers, zoom pause armed). The simple profile's hint series showed "Click the scene to start", hidden behind the header buttons, which wrap into a row of three 44 px boxes at this width. Round ↑ Lift button. | No `data-playing`. No hint series and no SimpleTrackpadHud. Pill "SPACE TO FLY · CLICK TO FIRE · DRAG TO LOOK" (wraps to 2 lines). `data-hover-fire` true (cursor hidden over the scene). ↑ Lift button. |
| One scene click | Pointer lock taken (`pointerLockElement` DIV, Chrome's "Press Esc" bubble), 0 shots, hint "Slide to look". | No pointer lock, exactly 1 shot, still on foot. |
| W held 0.9 s | Flew (↓ Land), lock kept. | Walks on the ground, as W did at 7945430 (only Space takes off; see the open question below). |
| Save | stays `simple`/3 | `free`/4 |

The same held at 1440x900: before, the hint series and a pointer lock after the click; after, the pill, no lock and 1 shot. Page errors: none in any run.

What read as "phone buttons" before: the header's Field guide / ⚙ / Ⅱ boxes, which wrap under the brand at 325 px (the narrow layout, `max-width:600px`); the round Lift/Land `.action` button; the simple profile's centred hint pill series; and the pointer-lock takeover with Chrome's bubble. The d15eac5 fixed page and gesture blockers also ran on this desktop. What is still on screen after: the header buttons and the Lift/Land button, both exactly as at 7945430 (the pane is narrow, so the narrow layout still applies). The simple series, the lock and the fixed page are gone.

Commands and results (merged tree, 2026-09-24):

- `pnpm verify`: typecheck 0 errors; vitest 82 files, 838 tests pass; `next build` passes; `node scripts/check-first-load.mjs` 9 scripts, 627.4 KB (budget 636 KB; d15eac5 was 625.4 KB, so +2.0 KB for the pill and press modules on the landing path). No scene, blaster or touch markers.
- `pnpm exec next start --hostname 127.0.0.1 --port 3391`, then `PLAYTEST_URL=http://127.0.0.1:3391 pnpm test:browser`: 206 passed, 1 skipped (`webkit-gesture`, Playwright's WebKit build is not cached), 0 failed, 15.7 min. That includes the new `tests/desktop-restore.spec.ts` (2/2) and the unedited phone proof: twin-stick, twin-fit, simple-controls-touch, shooter-touch, adaptive-thumbs, thumb-flight, touch-zoom, landscape-camera, the play-guard touch tests, recovery's touch test and trackpad's touch handover. The only edits in play-guard.spec and recovery.spec are to their desktop tests.
- `tests/desktop-restore.spec.ts` runs at 1440x900 and at 325x928 with `hasTouch` false and Garo's live save. After Begin: the ground pill, no controls-hint, no SimpleTrackpadHud, no `data-playing`, and `data-hover-fire` true. A click gives exactly 1 shot with no pointer lock. Space lifts and cruises (the cruise pill, `data-hover-fire` false). A pointer move steers (heading down more than .2). A click brakes to hover with 0 shots (the hover pill). A cursor move while hovering does not look; W then cruises, and the first 2 px move changes the heading by less than .05, while the pre-fix jump would have been a 100 px look. The cruise stays on after W is released. Flight settings shows "Classic · Free cursor"; after closing it, Space does not reopen a dialog. There is no touch-layer, fire-button, rise-button or touch-stick, and no "Blaster sound is off". Escape pauses and Resume brings back the right pill. After a reload the save reads `free`/4.
- Manual probe (system Chrome, scratchpad script): landing, ground, cruise, hover, a 0.7 s still hold (6 shots at 1440, 5 at 325), Flight settings and the Field guide at 1440x900 and 325x928, all read. Phone context 852x393 (`isMobile`, `hasTouch`): the twin-stick UI is unchanged (touch-layer, ghost, Rise, Descend, Aim, Fire, the "Left thumb: move" hint, `html[data-input]` touch, `data-playing` set). Both servers were stopped afterwards.

Note for the lead: the Trackpad settings text says "Blaster sound starts off; turn on Suit and wind audio below" instead of the spec's "turn it on under Blaster". It is unit C's wording and is left as is.

Review fixes (same day, after a desktop review against a 7945430 build):

- The pointer no longer hides over the scene while stopped (the `cursor:none` rule is gone; `data-hover-fire` stays as a test marker). 7945430 never hid it.
- No hold-to-fire: a press that never drags 6 px fires exactly once on release, however long it is held, so "press, pause, then drag to look" never shoots. Hold C for sustained fire. `holdBegins` (tested but never called) is removed.
- The W or Space press that starts the cruise is the old click: W is not added to the held keys and its auto-repeats are ignored until release, so a held W takes off at the saved cruise speed (under 10 m/s measured, previously 26-31 m/s). A fresh W press while cruising still adds thrust, as at 7945430.
- Space while cruising (no surface in reach, no landing, no focused button) brakes to hover, so a keyboard-only player can always stop. With a surface in reach Space lands, as before.
- The hover pill reads "W TO FLY · SPACE TO LAND · CLICK TO FIRE · DRAG TO LOOK" while a surface is in reach.
- The key auto-repeat guard from a6c34b5 now applies only to One finger + keyboard, Flow and touch; the classic desktop profiles re-add a key held through a pause, as at 7945430.
- Touch-capable devices driven by a mouse or trackpad (touch laptops, iPad with a trackpad): the selection/context-menu blockers and the zoom pause follow the live pointer (`touchMode()`), so they apply only while a finger drives. The fixed page (`html[data-playing]`) and the zoomed-Begin check still follow capability.
- Not changed: W on the ground still walks (only Space takes off; open question for Garo). With Mouse + keyboard saved, a left click fires once the mouse is captured (from e9de2cb, documented).
- New `tests/desktop-keyboard.spec.ts`: keys-only default profile (walk, Space lift and cruise, Space brake, strafe), W held with auto-repeat from hover (peak under 10 m/s, cruise kept after release), and the touch-laptop guard.

All of this is Chrome emulation. **Emulation is not device validation.** Still to do:

- Garo on a physical Mac trackpad in Chrome, and in the Claude pane at its desktop preset and at a wider width. The pane's mobile preset emulates a touch phone by design, so it will show the phone controls.
- A physical iPhone Safari check that the twin-stick controls are unchanged.
- Open question for Garo: W takes off from the ground too? (`HOVER_KEYS.wLiftsFromGround`, false for now.)

## Industry-grade touch controls and browser protection · 2026-09-24 (emulation only)

Owner request (Garo, after playing the Vercel preview on his iPhone): "Oh wow the game is terrible controls. Redo them so that they are at industry grade standards and movements/gestures dont exit the browser and/or pause the game unintentionally". Spec: twin-stick touch (floating left stick, right-thumb look, Fire / Aim / Rise / Descend cluster), level stick flight by default, a play guard (page pinned, scroll and zoom gestures swallowed only while playing), pause only on leaving the page, and a "Leave the game?" card for the back swipe.

Integration (unit E): `Experience.tsx` loads `TouchControls` with a dynamic `import()` right after hydration (and warms `FireControls`), holds the loaded component in state, and Begin and Resume wait for it. `usePlayGuard()` runs always. Begin and Resume go through `onPlayGesture()`, which refuses to start while pinch-zoomed and shows "Pinch out to normal size, then tap Resume." The pause card moved into `PauseCard.tsx` (the Leave card, the zoom note, the "Screen too short" note, the Home Screen tip, a portrait-only "Best played sideways." line). `scripts/check-first-load.mjs` adds TOUCH markers (`TouchControls-module`, `rise-button`, `touch-stick`); the budget stays 636 KB.

Specs added: `tests/twin-stick.spec.ts`, `tests/twin-fit.spec.ts`, `tests/play-guard.spec.ts`, `tests/webkit-gesture.spec.ts` (skips unless Playwright's own WebKit build is already cached; on this Mac only an older `webkit-2215` is cached while Playwright 1.63 expects `webkit-2359`, so it skips; nothing is installed). The legacy touch specs run the classic scheme through a seeded save (`CLASSIC` in `tests/shooter-browser.ts`); classic rotation now keeps playing with input released. `tests/accessibility.spec.ts` adds axe (WCAG 2 A and AA) on twin play in both orientations, the pause card with the tip, touch settings with the screen diagnostics, the Leave card, the zoom note, and twin play with tap controls.

Merge gate (integration, 2026-09-24):

- `pnpm typecheck`: 0 errors. `pnpm test`: 78 files, 806 tests pass. `pnpm build`: passes; the prerendered head has the manifest link and the Apple web-app tags, and the viewport has no zoom limit. `node scripts/check-first-load.mjs`: 9 scripts, 625.4 KB (budget 636 KB).
- Playwright, system Chrome against `next start` on 127.0.0.1:3391: the full run gave 180 passed, 4 failed, 1 skipped (`webkit-gesture`, WebKit not cached). The 4 were `tests/simple-controls-touch.spec.ts` assertions on More controls folding (the classic seed turns Aim off, a non-default choice since controls version 3); after the fix that file passes 19/19. `play-guard`: 9 passed; the safe-area override applied, and in Chrome the zoom guard reset the zoom to 1 and showed the note.
- Found and fixed at integration: (1) desktop trackpad regressions (13 failures across flow, flow-recovery, shooter-desktop, simple-trackpad, trackpad-comparison and simple-hints; the same 63 tests pass on a HEAD build): the touch layer again remounts per pause state, as on main, so the desktop hooks' per-session refs reset on resume; and it is held in state once loaded instead of `next/dynamic`, whose React.lazy suspended on the first mount after Begin and dropped an immediate first click. After both, the 63 pass. (2) The twin touch hint series now also mounts with the blaster off. (3) Hold Descend from about 10 m lands after about 3.35 s at 61 fps (coast-up after Rise, 9.1 m/s descent, then main's eased landing approach); the spec allows 4.5 s.

All automated results above are system Chrome emulation (CDP touch). **Emulation is not iPhone validation.**

NOT VALIDATED until Garo checks on his iPhone, in both orientations:

- a left-edge back swipe during a stick drag (should show the Leave card, not exit);
- a portrait stick drag near Safari's bottom bar (should not switch tabs or open the tab overview);
- a home swipe and return (should come back paused);
- a Control Center or Notification Center pull (should release input without pausing);
- a two-thumb pinch in play (should not zoom) and a pinch on the pause card (should zoom);
- zooming on the pause card, then tapping Resume (should reset the zoom or show the zoom note);
- the toolbar showing or hiding mid-drag (should keep the stick);
- rotation mid-drag (should keep playing, controls re-anchored);
- a 3 s Fire hold (no loupe or callout);
- 5 fingers held (all kept) and a sixth finger (clean cancel, no pause);
- hold Descend to land;
- how level flight feels;
- tapping the edge of Pause;
- two minutes of cruise with no auto-lock;
- Add to Home Screen (should open full screen);
- the Screen diagnostics values in Flight settings;
- thumb reach and button sizes.

## Whole-body turn roll · 2026-09-19

- `src/game/turnSweep.ts` (new) gathers the travel's lateral velocity change per physics step in `Player.tsx` (`runtime.turn`), clamped to 45 m/s² per step and closed for .2 s after any step in which the flight safety turned the travel; `src/world/suitRoll.ts` (new) drains it each frame and turns it into a roll; `orientSuit` applies it about the line of sight to the chase camera, weighted by t̂·ĉ; `Suit.tsx` advances it after the flight mix and writes `presentation.suitRoll`, which the telemetry samples every 350 ms as `data-suit-roll`. `CHASE_HEAD` (.65 m) is shared by `CameraRig.tsx` and the roll. The long-axis bank term is removed.
- Peak roll (rad, hero; `tests/suit-roll.test.ts`, input devices flown through 60 Hz physics in `tests/flight-drive.ts`):

  | Turn | Measured | Floor | Classic / hero |
  |---|---|---|---|
  | keyboard, 13 m/s | .544 | .5 | .688 |
  | keyboard, 34 m/s | .765 | .7 | .688 |
  | edge held, 8 m/s | .376 | .3 | .687 |
  | thumb drag (150 px over .4 s), 13 m/s | .453 | .35 | .687 |
  | trackpad swipe (300 px over .5 s), 13 m/s | .505 | .45 | .688 |
  | one look tap | .188 | .12 | .688 |

  Right turns are the exact negative of left turns frame by frame. Classic/hero is checked against .69 ± .05. The roll never exceeds its reach on the device grid; it is exactly 0 in straight flight and .001 two seconds after the travel straightens (limit .04). Keyboard at 13 m/s reaches .3 rad .35 s into the turn.
- Refresh rate, 30, 45, 90, 120, 144 and 165 Hz against 60 Hz: peak spread at most .005 (limit .01), roll rate at most 2.82 rad/s (limit 6), largest frame-to-frame change in roll rate .947 rad/s (limit 1.5), steady-turn ripple .005 or less (limit .01). A one-step turn of the travel (a landing approach setting the velocity toward a goal 10 m aside and 20 m ahead at 13 m/s) peaks at .099 at 60 Hz and .099–.100 at 30, 40 and 144 Hz (limits: within .01 of 60 Hz, under .15).
- No roll: hovering while the view spins 0, strafing from a hover 0, flying backward while turning 0 (limit .05), setting off after a hover spin under .02, a slow drift turn at 3 m/s under .05, on foot exactly 0. Reduced motion: exactly 0 from a fresh epoch; switched on mid-turn at 34 m/s it is under .02 within 1 s with no step in the roll rate. A teleport or reset restarts at 0, pause holds the value and resume restarts at 0. A 45° one-step controller deflection at 34 m/s stays under .25 at 30, 60 and 144 Hz (0, since the safety turn is not counted). Touchdown mid-turn at 13 m/s: under .05 within .4 s, with the lower sole on the ground within the existing .15 s plant blend. During a landing flare the roll never exceeds (1 − flare) × reach.
- Visible tilt of the chest's right axis in the chase image over the same frame without the roll, view pitch −.12: 24.7° left / 28.4° right at 13 m/s (floor 20°), 37.2° / 40.8° at 34 m/s (floor 25°). On-screen roll for .8 rad at 13 m/s: .734 rad with the view level, .468 with the camera overhead (view pitch −1.3), ratio .639 (limit .75).
- Facing: the roll moves the chest and face measures by at most 2.3e-9 on the device grid (keyboard, edge, thumb, trackpad, S-turns and taps × 8/13/34 m/s × seven view pitches × both directions × hero × reduced) and the root by 5.0e-16 on the static grid (limit 1e-6). Device grid: chest at least .237 (floor .1), face at most −.395, chest yaw within .1, 0 clamped joints, hinges intact. Eased boom and a boom shortened 40%: chest at least .255 (floor .05). The #8 static grid with roll {−.8, 0, .8} and the hover tilt faded by the horizontal speed as `Suit.tsx` fades it: chest at least .0652 (floor .05), straight .112 (floor .1), face at most −.056, the same as main; the worst cells are at 0 m/s, where the removed long-axis term was already 0. No floor was lowered.
- Mutation checks: each of these edits makes at least one new test fail: no roll; no forward-only gate; reduced motion not dropping the signal; no per-step clamp; the sweep counting the flight safety's turns, or closed only on the step itself (hold 0) or for one step (.017 s); the frame budget of the first version in place of the sweep; horizontal speed for the signal, or for the fade; the view weight without the body pitch (`elevation = 0`); lateral per frame instead of per second; no epoch or resume reset; no clamp to the reach; no flare factor; rolling on foot; no speed fade; classic reach equal to hero; the roll about the body's long axis; the roll about the flight axis; the roll ignored by `orientSuit`; the roll sign flipped; the hover tilt not faded; the hover tilt faded on foot; the sight line without the head height; no view weighting.
- Review strips (`scripts/review-flight-motion.mjs`, 15 rows with a right turn and an S-turn at 34 m/s, a climbing turn with the camera below, a diving turn with the camera above and a thumb turn at 8 m/s; `SUIT_TURN_ROLL=0` renders the no-roll baseline): chase, side, classic, reduced and phone strips were inspected. From the chase camera the turns read as the body banking into the turn; without the roll the 13 m/s left turn leans outward. The roll is smaller from steep views by design; after the review fixes the diving turn with the camera above shows a visible bank into the turn, which it did not before. The strips were re-rendered after the fixes (chase, no-roll baseline, phone and the pose sheet). `review-flight-poses.mjs` gives the bank case a .6 rad roll.
- Browser suite: 35/35 passed against `next start` on 127.0.0.1:3368, whose HTML carried `BUILD_ID 6rxe6NsOpFx36CCNRVfYP`. That includes the roll checks added to `tests/suit-clips.spec.ts`, which also passed 12 of 12 repeats with four parallel workers. A before/after capture of keyboard turns went to the owner.
- Limits: the owner's verdict on the capture and the iPhone Safari playtest are pending. Circling while strafing banks into the curve: .319 rad hero / .219 classic at 13 m/s, .699 / .480 at surge and .699 with the two-thumb move stick (`tests/suit-roll.test.ts`). While the flight safety steers, and for .2 s after, the roll drops its signal and eases out, so a player turn along a wall starts banking .2 s after the wall lets go. The roll follows the travel, which trails the view: at 34 m/s it stays above 90% for .433 s after the key is released, and an S-turn crosses zero .400 s after the reversal, of which about .2 s is the travel still curving; a command lead was not added (it failed three existing tests) and the lag is left to the device playtest. In a diving turn at 8 m/s with the view at −1.1 or steeper the view weight keeps the roll's on-screen bank small, and the net chest tilt stays slightly outward (−1.3° / +1.0° left/right at −1.1, −3.4° / −1.3° at −1.2). After a wall slide ends the controls swing the travel back to the view heading, and the body banks into that curve (up to .667 rad at 34 m/s); while the safety is steering the roll rises at most .017. The flight mix still derives its own lateral signal with a ±60 clamp before the settle.
- Review fixes (a second review of the branch):
  - Wall contact. Flown with real Rapier through the flight safety in `Player.tsx` order (`tests/suit-roll-world.test.ts`), the first version banked away from a facade met at 30° or 45° by up to .745 rad at 34 m/s and .564 at 13 m/s, and .75 at the district edge, while the safety bent the travel along it. Now: 0.000 at 13 and 34 m/s, 30, 60 and 144 Hz, facade and district edge (limit .05), with the travel turned 30°, 45° and 45°. A keyboard turn away from the facade after the slide still peaks at .765.
  - Diving and climbing turns. Net chest tilt into the turn against straight flight, 1.8 s into a held turn, left / right: climb .9 at 13 m/s 42.1° / 45.2° (was 33.7° / 35.9°, floor 30°), at 8 m/s 32.0° / 34.5° (was 23.2° / 24.4°, floor 15°); dive −.9 at 13 m/s 13.9° / 17.1° (was 7.2° / 9.4°, floor 10°), at 8 m/s 2.8° / 5.3° (was −3.3° / −2.1°, outward; floor 1°).
  - View weight: the on-screen roll over a level view matches the ratio of t̂·ĉ computed apart from `orientSuit` within .01 for dives with the camera above and climbs with the camera below, body pitch off the view (limit .03). Across the reachable facing bounds t̂·ĉ stays at or above .0758.
  - The static facing grid runs about 2.5 s alone and now carries a 30 s timeout like the device grid.
- `pnpm verify` green: TypeScript, 218 unit tests in 27 files, the production build and the first-load check (8 scripts, 601.6 KB, no three.js).

## Flight states read apart in the chase image · round 3 · 2026-09-19

- A third visual review found the legs breaking the flight line in turns (at 34 m/s the outside thigh kicked back with the knee folded and the inside knee folded too, reading as kneeling; at 13 m/s the toes split to .39 m instead of swinging together); the hero trailing arm held about 28° off the body; cruise and climb with nearly the same silhouette from the chase camera; the brake's right arm out near horizontal; a stop out of a slow drift under a camera above holding the outside arm straight out; and the arms flung from the cruise sweep to about 50° within .13 s of an unassisted touchdown.
- Data and mechanism changes:
  - Turns (`flightAccents.ts`): both thighs swing together to the outside of the turn (z .18 each); the thigh back-kick, the inside knee fold and the foot accents are gone. In `flightPose.ts` the bank accent's legs fade out by the power weight, so at 34 m/s the legs keep the straight-flight line and the whole-body roll of the next change carries the turn.
  - Hero power: the trailing arm lies along the body (clavicle z .06, upper arm x −.28 to −.3 and z .11–.12, forearm .04–.07).
  - Cruise: a narrow delta, the hands a hand's width out from the hips (upper arm z .07–.11, hand z .1); the thighs trail back (x −.16 to −.3) with softer knees (shin −.3 to −.6).
  - Climb: shoulders drawn back (clavicle y −.2), the arms straight behind with the hands brought in together behind the hips (upper arm x −.42 to −.44, z −.17 to −.19, hand z −.3).
  - Brake: the right hand reaches forward at chest height (upper arm x 1.26–1.43, z −.07 to −.03; forearm .9–1.06); the left elbow bends further (forearm .85–.95) with the upper arm less wide (z −.34 to −.4). The arms' reach is weighted by `smooth(2, 8, pace)`, where `pace` (new in `flightMix.ts`) is the speed or a decay of a higher recent speed at 1/s, so a brake from 34 m/s holds its reach as the explorer comes to rest and a stop out of a 4 m/s drift keeps the hover arms.
  - Touchdown: `armAuthority` (`suitAnimation.ts`) keeps the clips' authority over the arms after touchdown and eases it out over .45 s; `flightPose.ts` uses it for the arm bones and the living layer scales the idle arms and the impact reaction by it. It is 0 whenever the clips are off.
- Reads (clips on, clips off):

  | State | Arms R/L (°) | Toes across (m) |
  |---|---|---|
  | hover | 40/32 (26/17) | .274 (.302) |
  | cruise 8 | 4/12 (33/15) | .199 (.285) |
  | cruise 13 | 5/12 (45/14) | .145 (.269) |
  | power hero 34 | 168/6 (162/25) | .145 (.220) |
  | power classic 34 | 3/8 (11/−1) | .175 (.220) |
  | left / right turn 13 | −3/17, 15/7 | .146, .145 |
  | left / right turn 34 hero | −171/−1, 148/−5 | .145, .145 |
  | left / right turn 34 classic | 0/2, 9/9 | .175, .175 |
  | climb 13 | −32/−20 (34/16) | .142 (.269) |
  | dive 13 | 43/2 (95/15) | .267 (.269) |
  | brake from 34 (peak) | 72/35 (85/69) | .294 (.477) |
  | landing flare (last flying frame) | 37/−9 (29/22) | .220 (.310) |

  Toe spread in turns was .391–.451 m. Unassisted touchdown from cruise at 8 m/s: widest arm step 3.73° a frame, peak 37.0° (clips off 112.0°); held to at most 4° a frame and under clips off. Stop out of a 4 m/s drift, turning, view pitched down .5: widest arm 49.0° (was about 78°; clips off 173.6°); held to at most 55°. Assisted landings, widest arm around touchdown: 38.2, 38.4 and 39.4°. Hero fist in a left turn at 34 m/s: at least 2.14 head radii from the head centre (floor 2).
- Silhouette against clips off (m, hands/feet): hover .161/.153, cruise 8 .419/.197, cruise 13 .474/.178, power hero .336/.280, power classic .203/.178, left turn 13 .640/.183, right turn 13 .508/.186, left turn 34 .404/.264, right turn 34 .420/.282, classic left turn 34 .244/.200, classic right turn 34 .263/.153, brake .386/.239, dive .545/.186, climb .639/.151, flare .347/.081. No floor was lowered.
- Distinctness, max tip distance (mean of four) in m: hover/cruise 13 .461 (.280), cruise 13/climb 13 .331 (.318), cruise 13/dive 13 .529 (.420), hover/flare .400 (.289), classic/hero power .652 (.260). The floor is now .3 m (was .2).
- New tests in `tests/flight-read.test.ts`: the hero trailing arm within 10° of the body, the toe spread of all six turn states within .22 m, the unassisted touchdown arm step and the slow-drift stop above.
- Interpenetration: torso .213, thigh .127, crown .551, knees .203 m (floors .15, .10, .30, .11).
- Frame-rate trace: 1.685e-3 between 30 and 120 Hz and 5.80e-4 between 60 and 120 Hz, against the 2.5e-3 bound.
- Clamps: 0 on every grid, including the wider grid's 4–6 m/s corner with full brake, full bank and descent.
- Limits of this pass: braking out of a hero turn at 34 m/s, the stowing fist passes the right arm through about 90–100° in the image for about .1 s; from a camera above, the hover arms read about 45–50° out, so a slow stop there still shows both arms wide (symmetric, not one-sided); the hero bent knee still foreshortens the left lower leg from the chase camera in straight flight and turns; cruise still reads close to upright at 8 m/s, where the lean is small.
- Review strips: chase, side and phone strips with clips and the clips-off baseline, plus a custom chase sheet of the straight states, power, turns at 13 and 34 m/s, both brakes, the slow drift stop and the unassisted touchdown, were inspected for the reads above and for limbs through the body: none seen.
- `pnpm verify` green: TypeScript, 200 unit tests in 25 files, the production build and the first-load check (601.5 KB).

## Flight states read apart in the chase image · round 2 · 2026-09-19

- A second visual review found cruise 8 and 13 still reading as standing with the arms at the sides (the arm sweep ran along the sight line; legs .381 m apart across the toes); the dive and climb looking like cruise because they were accents capped at .35 rad; the outside arm in turns at 34 m/s swinging out 53–60° in the image; the arms flapping out to near-horizontal within about 50 ms of touchdown (the living layer's impact reaction stacked on the flare); the hero fist touching the head outline in a left turn; the hover a stiff mirrored A-pose as wide as cruise 8; the flare arms reading elbows-out; the classic brake close to the hover arms; the classic power hands beside the hips.
- New measure (`readOf` in `tests/flight-silhouette.ts`): each arm's angle in the chase image, shoulder to fingertip against the neck-to-pelvis axis, outward positive; the lateral toe and knee spread in the root frame; the hero wrist's distance from the head centre in the image, in head radii of .11 m. The chase camera sits .85 m right of the explorer, so the right arm reads a few degrees further out than the left in the same pose. `tests/flight-read.test.ts` holds the reads below.
- Data and mechanism changes:
  - Hover: arms out (upper arm z .37–.47), elbows at .42–.55, wrists loose, the left arm .35 of a loop behind the right; stance at hip width (thigh z .02–.03).
  - Cruise: chest arch, shoulders drawn back (clavicle y −.2), arms swept back behind the hips toward the midline (upper arm x −.41 to −.45, z −.14 to −.18), legs together (thigh z −.035) with the knees at −.5 to −.85. In `flightPose.ts` the arms reach cruise by P = .2 (8 m/s), the rest of the body by P = .35 as before.
  - Climb and dive are now full clips in `flightClips.ts` (2 s loops), mixed over the limbs (the dive also over the spine and chest) by the slope, full at a slope of .7; the fist chain stays out of both. Climb: legs together and straight (thigh z −.035, shin −.05 to −.18), feet pointed, arms low and back (upper arm x −.30 to −.33). Dive: a tuck, knees drawn up (thigh x 1.0–1.05, z .04, shin −1.5 to −1.55), elbows folded (forearm 1.45–1.5), hands toward the shoulders.
  - Classic power: arms in along the body (upper arm z −.07 to −.08, clavicles retracted).
  - Turns: the outside arm draws in (upper arm z −.15) against the side-bend, the inside arm bends and stays back and a little out, the outside leg kicks out and back (thigh x −.16, z .35), the inside leg follows (z .1), the head counter-roll is halved. With the fist up, the trailing arm skips the inside-arm shape in a left turn and takes the outside-arm pull-in in a right turn.
  - Hero fist: upper arm z .175–.185 (was .09–.10).
  - Brake: the right arm high and well bent (forearm 1.1–1.26), the left lower and wider with the elbow softer; the right knee folds further (shin −1.55 to −1.75) and a little out (thigh z .15–.16).
  - Flare: arms low and forward (upper arm x .55, z .03, forearm .7).
  - `suitAnimation.ts`: the touchdown arm reaction is scaled by 1 − clip authority, so it adds nothing while the flare holds the arms and is unchanged with clips off.
  - `flightPose.ts`: while the legs hand back after touchdown, each foot lifts by what its thigh and shin still pitch back beyond the ground pose (smoothstep from .1 to .2 rad, capped at the foot limit .35, the rest up to .5 on the toe), so a knee folded in flight does not tip the toes into the ground.
- Reads (clips on, clips off):

  | State | Arms R/L (°) | Toes across (m) |
  |---|---|---|
  | hover | 40/32 (26/17) | .274 (.302) |
  | cruise 8 | −13/−6 (33/15) | .200 (.285) |
  | cruise 13 | −12/−4 (45/14) | .148 (.269) |
  | power classic 34 | 3/8 (11/−1) | .175 (.220) |
  | climb 13 | −1/13 (34/16) | .142 (.269) |
  | dive 13 | 43/2 (95/15) | .267 (.269) |
  | brake from 34 (peak) | 86/38 (85/69) | .293 (.477) |
  | landing flare (last flying frame) | 38/−9 (29/22) | .220 (.310) |

  Outside arm at 34 m/s against straight flight: classic left turn 0° (straight 3°), classic right turn 9° (8°), hero right turn 33° (28°); held to at most +6°. Touchdown, widest arm over .25 s before to .6 s after contact on the three assisted landings: 41.4, 40.1 and 41.7° (clips off 55.4, 54.6, 58.8°); held under 45° and under clips off. Hero fist in a left turn at 34 m/s: at least 2.14 head radii from the head centre at every frame (was 1.61; straight flight 2.71); held to at least 2.
- Silhouette against clips off (m, max over the two tips): hover .161/.153, cruise 8 .592/.177, cruise 13 .622/.151, power hero .157/.280, power classic .203/.178, left turn 13 .843/.156, right turn 13 .521/.302, left turn 34 .374/.480, right turn 34 .226/.663, classic left turn 34 .244/.528, classic right turn 34 .263/.606, brake .549/.234, dive .545/.186, climb .381/.151, flare .346/.081 (hands/feet). No floor was lowered; the two classic turns at 34 m/s were added as states.
- Distinctness, max tip distance (mean of four) in m: hover/cruise 13 .648 (.346), cruise 13/climb 13 .248 (.195), cruise 13/dive 13 .612 (.432), hover/flare .398 (.289), classic/hero power .652 (.254). The floor is now .2 m (was .1).
- Interpenetration (same grid): torso .247, thigh .104, crown .551, knees .203 m (floors .15, .10, .30, .11).
- Frame-rate trace: 1.789e-3 between 30 and 120 Hz and 6.21e-4 between 60 and 120 Hz, against the 2.5e-3 bound.
- Clamps: 0, now also held by a test on a wider grid (12 speeds from 0 to 34 m/s including 4, 5 and 6, 5 banks, 4 brake weights to 1 at every speed, 5 slopes, 7 phases, both styles, reduced motion, the flare below 3 m/s and the fist from 15 m/s). Setting the classic brake's right thigh z to .3 makes it fail.
- Limits of this pass: the cruise knee fold stays at −.5 to −.85 because a deeper fold (−1 to −1.35) tipped the toes up to 5.2 cm below the sole on a touchdown at 8 m/s even with the foot lift; the thigh clearance (.104 against .10) and the left-turn-13 feet (.156 against .15) sit close to their floors; the dive tuck's knees are hidden by the body from the chase camera, so it reads through the folded arms and shortened legs.
- Review strips: `scripts/review-flight-motion.mjs` gains `SUIT_REVIEW_SCALE` (screenshot device pixel ratio; the renderer follows it). Chase, side and phone strips with clips, and the clips-off baseline, were inspected for the reads above and for limbs through the body: none seen.
- `pnpm verify` green: TypeScript, 197 unit tests in 25 files, the production build and the first-load check (601.5 KB).

## Flight states told apart from the chase camera · 2026-09-19

- A visual review of the first enlargement found that most states had met the silhouette floor by spreading arms and legs sideways, so hover, cruise 8 and 13, dive, climb and the landing approach read as one A-arms, wide-legs figure; classic power lifted the arms about 22° above the back; the climb splayed the legs with T-arms and crumpled the right shoulder (upper arm x about −.69); the flare stance put the toes .63 m apart and they closed to .26 m within about .12 s of touchdown; in a hero left turn the fist sat against the side of the head.
- Data changes (`flightClips.ts`, `flightAccents.ts`): hover hangs the arms down and out (upper arm z .36–.45, elbows soft) with a gentle antiphase tread; cruise sweeps the arms back close to the sides and trails the legs nearly together with a 1 Hz flutter; classic power is an arrow, arms along the body, legs together, toes pointed; the hero trailing arm lies along the body; the dive folds the arms back behind the hips and brings the trailing legs into line; the climb holds the legs together and the arms low and back; the brake reaches the right arm forward and up and the left arm wider and lower, both elbows bent, the right knee driven higher than the left and the thighs under the hips; the landing flare brings the legs forward at hip width with the feet flat and the arms forward and out with the elbows bent. Turns keep the torso side-bend and the leg swing; the inside arm tucks toward the chest and the outside arm eases out, leaving the read to the whole-body roll of the next change. The fist sits .09 rad further right and steers in by .1 rad (was .25) in `flightPose.ts`.
- Silhouette against the clips-off pose (m at the explorer's depth, max over the two tips):

  | State | Hands | Feet |
  |---|---|---|
  | hover | 0.180 | 0.169 |
  | cruise 8 | 0.334 | 0.181 |
  | cruise 13 | 0.483 | 0.154 |
  | power hero 34 | 0.157 | 0.280 |
  | power classic 34 | 0.227 | 0.178 |
  | left turn 13 | 0.298 | 0.230 |
  | right turn 13 | 0.553 | 0.347 |
  | left turn 34 | 0.464 | 0.393 |
  | right turn 34 | 0.292 | 0.398 |
  | brake from 34 (peak) | 0.396 | 0.223 |
  | dive 13 | 0.887 | 0.165 |
  | climb 13 | 0.389 | 0.161 |
  | landing flare (last flying frame) | 0.426 | 0.081 |

  One floor changed: the landing-flare feet floor is .075 m (was .15). The flare now keeps the grounded stance so touchdown does not scissor the toes, and clips off the approach already stands that way; the read of the flare is the arms and the head looking down.
- Distinctness (`apart` in `tests/flight-silhouette.ts`): per tip, the image-plane distance between two states' clip-on poses, each pose seen under both states' root and chase camera and the two averaged, so it measures the pose and not the change of lean or camera. The test holds the largest tip distance of five pairs to at least .1 m, about a hand's width (about 14 px at the chase frame's 140 px/m).

  | Pair | Max (m) | Mean of four tips (m) |
  |---|---|---|
  | hover / cruise 13 | 0.348 | 0.175 |
  | cruise 13 / climb 13 | 0.133 | 0.090 |
  | cruise 13 / dive 13 | 0.109 | 0.066 |
  | hover / landing flare | 0.476 | 0.343 |
  | power classic 34 / power hero 34 | 0.612 | 0.229 |

  Climb and dive are held accents on cruise, capped at .35 rad a component, and the thigh clearance and the shoulder limit hold them back further, so they differ from cruise by about a hand's width. Measured on `b6e82e7` the same pairs gave max .233, .193, .223, .231 and .288 m: the spread-out poses there differed from each other in distance as much or more, so this metric shows that states differ, not that they read well; the strips are the check on the read.
- Touchdown: the toes are .220 m apart on the last flying frame of the assisted landing and .231–.265 m over the next .5 s (was .63 m closing to .26 m).
- Hero fist: clear of the head in the chase view by at least .190 m between the fist and the head centre in a left turn at 34 m/s (was .071 m), .272 m in straight flight; it stays .217–.244 m right of the head at 16 and 34 m/s and slopes 0 and ±.3 (bound .12–.30), and a full steer swings the wrist .062 m toward the inside (floor .05).
- Skinning limits: the widest upper-arm abduction with a nearly straight forearm is hover's .45 rad (forearm .30); the brake and flare abduct further only with the elbows bent. The lowest upper-arm x is −.46 in the dive and −.40 in the climb (was −.71).
- Frame-rate trace: 1.814e-3 between 30 and 120 Hz and 6.24e-4 between 60 and 120 Hz, against the 2.5e-3 bound (was 2.093e-3).
- Clamps: 0 on the facing grid, the stop-and-turn runs and the launch; also 0 on a wider grid of 12 speeds from 0 to 34 m/s (including 4, 5 and 6), 5 banks from −1 to 1, 4 brake weights to 1, 5 slopes from −1 to 1, 7 loop phases, both styles, reduced motion, the flare and the fist, which covers the 4–6 m/s brake, bank and descent corner where `thigh_l` had clamped by .042 rad.
- Interpenetration (same static grid as before): worst clearance from the torso core .225 m, from either thigh axis .122 m, from the crown .531 m; knee to knee .164 m.
- Review strips in chase and side views, with the clips-off baseline and a contact sheet of clips off, `b6e82e7` and this change, were inspected for the reads above and for limbs through the body: none seen.
- `pnpm verify` green: TypeScript, 188 unit tests in 24 files, the production build and the first-load check (601.5 KB).

## Flight poses sized to the chase-camera silhouette · 2026-09-19

- The owner found the flight clips too subtle from the chase camera. `tests/flight-silhouette.ts` measures, per flight state, how far the clip layer moves each fingertip (18 cm past the wrist) and each toe tip against the clips-off pose that is live today, projected along the chase camera's rays (boom from the head, view rotation) onto the plane through the chest, so in metres at the explorer's depth perpendicular to the sight line. Steady states average over the loop (a whole hover tread, or 4 s); the brake takes the frame of peak mean brake weight after releasing at 34 m/s, the flare the last flying frame of an assisted landing. At the game's field of view (65° + speed/17) one metre there is 133–152 px of a 1000 px tall frame. `tests/flight-silhouette.test.ts` holds every state to at least .15 m for the hands and .15 m for the feet (no foot floor needed relaxing).

  | State (m, max over the two tips) | Hands before | Feet before | Hands after | Feet after |
  |---|---|---|---|---|
  | hover | 0.120 | 0.152 | 0.185 | 0.245 |
  | cruise 8 | 0.291 | 0.134 | 0.294 | 0.245 |
  | cruise 13 | 0.413 | 0.116 | 0.334 | 0.216 |
  | power hero 34 | 0.151 | 0.183 | 0.315 | 0.280 |
  | power classic 34 | 0.409 | 0.118 | 0.554 | 0.200 |
  | left turn 13 | 0.229 | 0.132 | 0.240 | 0.288 |
  | right turn 13 | 0.488 | 0.163 | 0.780 | 0.400 |
  | left turn 34 | 0.444 | 0.175 | 0.556 | 0.339 |
  | right turn 34 | 0.202 | 0.204 | 0.513 | 0.368 |
  | brake from 34 (peak) | 0.423 | 0.097 | 0.446 | 0.185 |
  | dive 13 | 0.848 | 0.168 | 0.733 | 0.235 |
  | climb 13 | 0.371 | 0.076 | 0.720 | 0.344 |
  | landing flare (last flying frame) | 0.096 | 0.044 | 0.380 | 0.190 |

  "Before" is `2463cd0`; 8 of the 13 states missed a floor there (the brake, climb and flare feet worst).
- Data changes (`flightClips.ts`, `flightAccents.ts`): hover arms in a wider A-shape that drift out and back together, legs in a wider stance with a larger antiphase tread; cruise arms swept further back and out, legs spread with a 1 Hz alternating knee flutter; classic power arms swept back along the body and legs pressed together; hero power trailing arm held back and clear of the body with the left knee bent; brake arms flung wider and both knees driven up; bank torso side-bend tripled with the inside arm tucked, outside arm out and legs swinging wide; climb arms low and back with legs together; landing flare arms out to .7 rad and legs forward in a wider stance. The flare now carries full weight on the arms (`flightPose.ts`, was .7). No joint limit was widened.
- Constraints that shaped the sizes: the joint-limit clamp count stays 0 across the facing grid, the stop-and-turn runs and the takeoff launch; the toes stay within 2 cm of the legacy foot through a touchdown blend (which caps knee fold against hip flex in the hover tread and cruise flutter); the soles stay within 6 cm of the hips after a caught touchdown; the classic power arm stays above −.4 rad through the hero crossfade; the arms of the hover tread stay symmetric so the fist-led launch is hero-only; held accents stay at or under .35 rad; the frame-rate trace stays under 2.5e-3.
- Interpenetration check (same test file, clips on, a static grid of 5 speeds × 3 banks × style × 3 brakes × 3 slopes × 4 phases, flare at hover): worst clearance of the fingertips and wrists from the torso core (pelvis to neck) .228 m (floor .15), from either thigh axis .129 m (floor .10), from the crown .496 m (floor .30); knee to knee .124 m (floor .11). Clips off: .293, .195, .572, .238. The first enlargement put a tucked inside hand .081 m from the thigh in a hero left turn at 34 m/s; the trailing arm and the bank tuck were opened until it cleared.
- Review strips: `scripts/review-flight-motion.mjs` gains `SUIT_FLIGHT_VIEW=chase`, which renders every row from the chase camera. Rendered clips, `SUIT_FLIGHT_CLIPS=0`, classic, reduced and chase-only; a chase-only contact sheet shows live, `2463cd0` and this change side by side for the owner. Inspected for limbs through the body and knees crossing: none seen.
- `pnpm verify` green: TypeScript, 183 unit tests in 24 files, the production build and the first-load check.

## Authored flight clips · 2026-09-18

- In flight the explorer plays original hand-authored clips on the 21-bone skeleton: hover, cruise, power (classic and hero), the hero fist, brake, bank, climb, dive, sink, a takeoff snap and a landing flare. `src/world/clipSampler.ts` compiles and samples them; `flightMix.ts` advances the blend weights; `flightPose.ts` blends them over the pose targets. The telemetry element carries the clip on show as `data-suit-clip`.
- Measured in unit tests (Node, the real modules on the 21-bone rig):

  | Invariant | Floor in the test | Measured |
  |---|---|---|
  | Chest back toward the chase camera, static grid (7 view pitches × 3 body offsets × 3 banks × 5 speeds × 3 yaws × style × brake × 4 phases × reduced) | > .05 (> .1 with bank = yaw = 0) | .065 (.112) |
  | Same, hard stops and turns through the full stack (5 view pitches × 3 drags × 3 turns × style × 2 speeds × reduced, 4 s each) | > .1 | .109 |
  | Same, a 40 s hover turn under the overhead camera (2 view pitches × 2 turns × style × reduced), reaching every hover phase | > .1 | .1047 |
  | Face direction · camera | < 0 | ≤ −.056 static, ≤ −.0986 dynamic |
  | Pelvis + spine + chest yaw | ≤ .1 | .075 |
  | Joint-limit clamps in normal play, and through the takeoff launch over the hover tread (hero, reduced, climbing or not) | 0 | 0 |
  | Ground output with the flight weight at zero | bit-identical | bit-identical; within 1.250 s of an unassisted touchdown |
  | Toe tip against the legacy foot while planted | ≥ −.005 m (hold, after), ≥ −.02 m (.15 s blend) | +.0003 m, −.0001 m, −.0133 m |
  | 30 or 60 Hz against 120 Hz | < 5e-3 rad at the end of a 6 s route; layer trace < 2.5e-3 per component every .5 s | 9.3e-4 / 6.2e-4 rad; 1.2e-3 / 4.1e-4 |
  | Hero fist, 16–34 m/s at pitch 0 and ±.3 | 2–12° above travel, .12–.30 m right of the head | 5.2–6.4°, .188–.220 m |
  | Head look below the travel axis at fist speeds | 0–25° | 3.0–21.7° |
  | Keyboard turn, chest carve weight at 13 / 34 m/s | > .8 | .933 / 1.0 |
  | Fist steer leads the carve (crossing .5) | ≥ .1 s | .200 s / .117 s |
  | Touchdown frame of an assisted landing (3 landings × reduced, 60 Hz): per-frame joint change beyond clips-off | ≤ 3° (3.5° at the shins) | up to +2.3° (thigh) outside the shins, +3.3° at the shins (the absorb onset); 12.7° (forearm) before the fix |
  | Setting off after a hover and a 90° or 180° view turn: peak chest carve weight at 30/60/120/144 Hz | < .02 | ≤ .0017; .36 at 30 Hz before |
  | Surge turn and reversal, wrist velocity change per frame beyond clips-off (.36 cm/frame²) | ≤ 1 cm/frame² | +.69 (1.05); 4.0 before |
  | Hero fist deploy / stow, wrist velocity change per frame beyond clips-off (.35 / .07 cm/frame²) | ≤ 2 cm/frame² | 1.59 / .51 total; 11.8 / 2.8 before |
  | Descent at 13 m/s, pitch −.9, against level flight: wrists / toe tips | ≥ 15 cm / ≥ 5 cm, in the dive direction | 19.9 cm / 7.2 cm (cosine to the full-power dive ≥ .99); 4.6 cm / 2.5 cm against the dive before |

- `applyFlightClips` takes 12.1–12.7 µs per call in Node on an Apple M2 Max (three runs of 200,000 calls). Its buffers are preallocated; what remains is V8 number boxing of 8.8–10.4 B per call (27–29 B on `ab17ed4`). `advanceFlightMix` grows the heap by 1.3 B per call on the ground and 0.3–7.6 B per call in flight, varying between processes (1.3 B on `ab17ed4`, three runs of 1,000,000 calls).
- The living-motion tests (`suit-animation`, `suit-transitions`) run three times: clips off; clips on, with the clip layer at full authority whenever the drive flies; and clips on with the flight weight settling as in the game for every layer. The harness advances the mix with the drive's reduced-motion and landing flags and throws if a frame is posed with a different reduced flag. Of 19,271 `posed()` calls per clip mode, 7,400 (clips on, 10 of 16 tests) and 7,655 (settling, 11 of 16 tests) have clip authority; the rest are ground-only states (stride, gait, side-step, pause), where the layer correctly stays out. All pass.
- Mutation checks: each mechanism was broken on purpose and the named test failed. Brake arch instead of hunch, no look budget, pelvis keeping its legacy yaw, bank yaw past the limits, a backward elbow, a fist past the joint limit, no blend pivot, no flight-weight threshold, feet without the plant release, legs without the touchdown hand-back, blending from a stale pose, a per-frame clock, per-frame settling, per-frame lateral acceleration, no pause hold, no resume reset, no NaN guard, no fist hysteresis, a speed-proportional fist, no fist re-aim, carve from `pose.bank`, steer from the travel, equal settle rates, reduced motion damping poses, reduced motion not damping loops, reduced motion keeping the carve, undamped hover drift, the brake label from `pose.brake`, no side-slip lean, no backward-flight brace and slope from the view pitch. Added after review, each also failing its named test: the flare gated off on touchdown, the flare hold dropped, the idle arms not giving way, the launch added to the tread instead of reaching (clamps), the hover sampled on the shared clock, the reduced launch at full weight, no flare, no launch, no climb, no dive, no sink, the cruise sink kept (`down·(1−P)`), the dive at `down·P`, no fist steer rotation, the steer hard-clamped, the power loop without speed scaling, a linear fist raise, and lateral acceleration from a stale travel heading. Loosening the joint limits alone and removing the hinge or limit guards change nothing, because no authored pose reaches them.
- Landing first load (`scripts/check-first-load.mjs`, now part of `pnpm verify`): 8 scripts, 601.5 KB, no three.js or clip markers. With a clip table imported into the landing telemetry on purpose, the check failed on five markers. The clip modules sit in the lazy scene chunks.
- `suit.glb` is unchanged by this slice.
- Review fixes (2026-09-18, after two independent reviews and an audit): the landing flare and look-down carry through touchdown and ease out over .45 s (smoothstep) instead of dropping in one frame, and the idle arms give way to the flare while the layer has authority; the launch points the feet toward an absolute −1.08 rad reach by its keyed weight instead of adding −.9 rad to the tread, so takeoffs no longer clamp (23 clamped frames on a 60 Hz takeoff before, 0 after; the foot peaks at .40 s and relaxes); setting off after a hold re-seeds the travel heading; the fist steer is `tanh(command / 20)` settled at rate 30; the fist deploys and stows through a linear .6 s raise fed to smoothstep, with the same 20/15 m/s hysteresis; the sink accent is gone by P = .25 and the dive stoop is full from P = .4. `tests/suit-clips.spec.ts` now holds each turn key a fixed .9 s while polling the label every 50 ms, and starts the first surge from the terrace.
- Review strips, rendered without a server: `scripts/review-flight-motion.mjs` (ten rows; chase rows are crops of the 1440 × 1000 frame at the game's field of view) with `SUIT_FLIGHT_CLIPS=0` as the baseline, plus reduced/classic and phone variants; `review-suit-motion.mjs` and `review-flight-poses.mjs` now apply the flight layer. Inspected for limbs through the body, arms passing behind the head, feet below the ground plane and the chest toward the chase camera: none seen. The carve in turns is subtle from the chase camera, and at phone size the power-flight silhouette is small. Re-rendered after the review fixes (clips, `SUIT_FLIGHT_CLIPS=0`, classic, reduced and phone): the −0.1 s column of the takeoff/touchdown row now shows the approach before touchdown (the script checks every column renders its labelled instant to within a frame), and each row's classic tag follows the hero value that row renders with. Mid-deploy (.24 s) the fist arm passes low in front of the body on its way up.
- `pnpm verify` green: TypeScript, 169 unit tests in 23 files, the production build and the first-load check.
- Browser suite: 35/35 passed against `next start` on 127.0.0.1:3368, whose HTML carried `BUILD_ID GKXd8Mq8iBxslaFmvOzct`. That includes the new `tests/suit-clips.spec.ts`, which also passed 12 of 12 repeats with four parallel workers.
- A live before/after capture (the live site against this build, the same keyboard flight, zoomed 2× on the explorer) went to the owner for review.
- Owner verdict on that capture (2026-09-19): the poses were too subtle from the chase camera. They were enlarged and then reworked for distinct silhouettes (sections above).
- After the art pass: 35/35 browser checks passed against `next start` on 127.0.0.1:3368, whose HTML carried `BUILD_ID a04dqtF6NRqwWQSFZfdxE`. A new before/after capture went to the owner.
- Pending: the owner's verdict on the new capture; a physical iPhone check.

## 21-bone skeleton · 2026-09-18

- The explorer is built on 21 bones. The ten legacy joints keep their indices and exact pivots. A spine, chest, neck, clavicles, hands, feet and toes are added at identity rest. The runtime maps skin indices by bone name and still binds the old `suit_joint_N` names.
- `scripts/hero_skin.py` carves each added bone's weights from the legacy joint it grew out of. The build fails unless every vertex keeps its legacy shares within 5e-5 and has at most four influences.
  - The undersuit bends smoothly across the added bones.
  - Every other piece (plates, seams, the collar, the face and hair) rides the single added bone that covers most of it at its centre, so it stays rigid.
  - `SUIT_SKIP_BLEND=1 SUIT_OUT=<path>` makes a trial build that leaves the committed files untouched.
- Rebuild gates, measured on the committed GLB against the previous one (`f9a82a4`):
  - Positions, normals, UVs, materials, non-bone nodes and both atlases are byte-identical. The armor's weight values are unchanged; only their bone indices differ.
  - Triangle sets and winding match; one primitive only reorders its triangles.
  - The GLB has no animations, and no bone has a rotation or scale.
  - Posed skinned vertices differ by at most 0.0035 mm across 24 pose and hero states: rest, hover, cruise, power, both banks, brake, climb, walk, run, strafe and takeoff.
- Rigid armor under the added bones. Each added bone was turned on its own and the largest change in distance between two points of any of the 62 plates and seams was measured (per-vertex bands → final weights):

  | Move | Per-vertex bands | Final weights |
  |---|---|---|
  | Neck yaw 30° | 28.4 mm | 0 mm |
  | Neck pitch −30° | 15.9 mm | 0 mm |
  | Spine pitch 25° | 30.4 mm | 0 mm |
  | Chest pitch 20° | 35.0 mm | 4.5 mm |
  | Chest side bend 12° | 41.6 mm | 8.4 mm |
  | Clavicle shrug 20° | 42.9 mm | 15.2 mm |
  | Clavicle protraction 20° | 37.2 mm | 11.0 mm |
  | Foot point 40° | 26.8 mm | 0 mm |
  | Toe flex 30° | 21.2 mm | 0 mm |
  | Wrist flex 45° | 7.7 mm | 0 mm |

  What still bends is the oblique side plates, the elbow ribs and the outer pectoral corner. Their legacy weights already span the torso and an arm, so they flex under today's arm poses too. Changing that would change the current look, which is out of scope.
- The GLB is 751,448 bytes (+2,000), with 19,514 triangles and eight material batches.
- Tests:
  - The GLB's bone hierarchy must equal the runtime table, bone for bone.
  - Every added bone must descend from the legacy joint it was carved from.
  - With only legacy joints posed, every skinned vertex must match its weights collapsed onto the ten legacy joints within 1e-6 m.
  - Five single-digit parent mutations each fail at least one of these tests.
- `pnpm verify`: TypeScript, 89 unit tests (5 new skeleton tests) and the production build.
- Browser suite: 34/34 passed against `next start` on 127.0.0.1:3368, whose HTML carried `BUILD_ID 3qvvWOPHkUAznCA-vw3_t` and whose `suit.glb` matched the worktree (`79b8313a…`).
- Review scripts: `review-flight-poses.mjs` (against that server) and `review-suit-motion.mjs` render the rig normally.
- No visual change is intended. Not validated on a physical iPhone.

## Living motion · 2026-09-18

- A time-based layer in `src/world/suitAnimation.ts` animates the ten-joint rig on top of the pose targets. It adds a distance-driven gait along the body-frame travel direction: run, walk, backpedal, and a sideways step that opens and closes without crossing. The gait follows a smoothed velocity, so walls and cleared input never snap the legs.
- The lower sole's height is kept at ground level, measured through the model's own rotation and the joint chain. A caught fall or a touchdown switches that plant in one frame, so the height change is blended out over .15 s. It adds breathing and weight shift at rest, and a hover bob that settles during landing approaches.
- The takeoff push-off holds the last grounded height while the anchor rises. It adds a landing absorb, and follow-through springs kicked by changes of velocity, with the kick capped so an instant stop from 34 m/s spreads over several frames. It moves only the model; the anchor shared by physics and camera, the controls and the collider are unchanged.
- Pausing freezes the pose and resuming restarts the layer. Reduced motion keeps the gait, softens breathing, bob, crouch and absorb, and removes the springs, the pelvis twist and the takeoff hold. Turning off hero poses removes the fist-led launch.
- Known limitation: only the sole's height is held, not its position on the ground. At every gait speed and direction the grounded foot slides most of the body's travel: about 70–90%, and sideways most of all. The main cause is that the still-swinging foot becomes the lowest one before it finishes its forward swing. True foot planting (inverse kinematics against authored clips) is deferred to the fuller skeleton.
- Review: a multi-agent review of the first version (five reviewers, each finding checked by three independent lenses) confirmed 20 issues and rejected 2. A second pass rechecked each finding against the revision: 17 resolved, the foot slide deferred and documented above, and 10 regressions raised. Every regression is fixed: the takeoff height read after physics moved, gait snaps on instant velocity changes, pause not freezing, the reduced-motion takeoff lurch, catch-time-dependent pops, uncapped spring kicks, loose tests and narrow docs. The new motion tests were checked by mutation: removing the plant blend, the pause freeze, the reduced-motion hold exemption or the grounded takeoff height each fails them.
- Gates: `pnpm verify` green — TypeScript, 84 unit tests (69 plus 15 motion tests) and the production build. The Mac browser suite runs in system Chrome against `next start` on 127.0.0.1:3366, whose HTML carried the current `BUILD_ID`. 34 of 34 checks passed on the first version; the re-run on this revision is recorded in the commit.
- Visual review: `scripts/review-suit-motion.mjs` frame strips of the actual rig with and without the layer, plus live chase-camera captures of the same keyboard route on the deployed site (before) and the task build (after): [living-motion-game.png](images/living-motion-game.png). The stills were inspected for stride and knee direction, sideways spacing, sole height, and push-off and landing timing.
- Not validated: physical iPhone. Touch and trackpad input lift straight into flight, so the gait shows mainly with the keyboard and tap controls.

## Playtest enablers · 2026-09-18

- `v0.1-playtest` is deployed at https://halaverga-flight.vercel.app (Vercel production via CLI; the project is not Git-connected, so deploys are explicit). Every build now carries a stamp — build date plus commit — computed in `next.config.ts` and shown in the Field guide footer and in every `halaverga-playtest.json` download, so a report can be traced to the exact code. This gate build's stamp: `2026-09-18 · af74249`.
- The Field guide ends with a QR handoff that opens the deployment on a phone. The SVG is generated by the `qrcode` CLI through `pnpm make:qr` — no runtime dependency.
- Persistence drift guard: `PERSISTED_KEYS` is now the single authoritative list of saved fields. `persistGame` writes exactly those keys; `tests/persistence.test.ts` proves the written key set equals the list, that `hydrateGame` restores every key while ignoring runtime-only keys, and that a full settings state round-trips.
- The municipal terminal left its hardcoded proximity check in `Player.tsx` and moved to a `TERMINALS` table in `navigation.ts` — id, position, radius, location label and the record it hands the player. `tests/terminals.test.ts` pins the five-metre boundary (4.9 metres inside, 5.1 metres outside) and table shape. Adding a terminal is now a content change.
- Gates: `pnpm verify` green in the task worktree — TypeScript, 67 unit tests (61 plus six new), production build. Mac browser suite: 33 of 34 checks pass. The single failure is the already-documented `flight.spec` pause-drift budget (5.41 m against 3 m; 5.64 m on a warm targeted rerun) — the same deterministic warmup-jitter sensitivity recorded earlier today, not a flight regression; the check passes on ubuntu CI and no assertion changed.
- While this task ran, `main` advanced twice (PR #2 climb-braking fix, PR #3 landing three.js deferral); the branch merged both and re-ran gates on the merged state: `pnpm verify` green with 69 unit tests, Mac browser suite again 33 of 34 with only the same pause-drift boundary (5.43 m). The merged hard-coded terminal check from PR #2 was resolved in favour of the `TERMINALS` table — same boundary, same label, no allocation.

## CI split gates and landing audit · 2026-09-18

- The chain landing on `main` (PR #1) exposed that GitHub Actions had never actually run: every earlier push failed within seconds on an account billing/spending-limit block before any step started. The repository was made public with owner approval after a tracked-file secret scan; Actions then ran the full workflow for the first time.
- First ubuntu run: `pnpm verify` passed completely — TypeScript, all 61 unit/physics/model tests and the production build. 28 of 34 browser checks also passed, including the pause/drift recovery case. Six failed only because ubuntu has no GPU and renders WebGL through SwiftShader: at software frame rates the simulation advances too few steps per wall-clock second for thresholds calibrated to real-GPU timing. `data-lean` reached −0.44 against < −1 after 2.1 s of surge; steep-climb view pitch reached 0.97 against > 1; pinch zoom and two captured-trackpad steering predicates timed out after 5 s; cursor-only takeoff missed its settling bound. All six pass on the physical Apple M2 Max in system Chrome.
- Decision, with owner approval: CI keeps `pnpm verify` as the ubuntu merge gate, and the 34 browser and accessibility checks remain developer-Mac evidence recorded in this file, because their thresholds are calibrated to real-GPU frame timing. No assertion was loosened. A GPU-hosted CI runner remains a possible later hardening experiment.
- A same-day Mac rerun surfaced the mirror case: the `flight.spec.ts` pause-drift guard failed deterministically (5.43 m against the 3 m budget) in system Chrome 153.0.8010.47 after previously passing in Chrome 153. First-second warmup work delays the registered release of held keys by roughly 0.4 s, so the suit cruises past the budget before the brake settles; a timeline probe verified the pause path itself is clean, and the same check passes on ubuntu. Assertions are unchanged; hardening this guard against warmup jitter is follow-up work, not a flight regression.
## Fitted suit revision · 2026-09-11

- Replaced the playable model with a fitted pressure layer, smooth ceramic plates, a continuous visor, tapered limbs and an integrated power spine. Six animation sections remain; their pivots follow the new anatomy. The shared player/camera movement and collider are unchanged.
- The final asset is 253,040 bytes, 11,770 triangles, six materials and 27 articulated material batches, with no texture files. `performance/suit-asset.json` records bounds and exact source hashes. The previous GLB was 232,676 bytes. Material differences and emission now survive runtime batching.
- TypeScript, the production build and 38 unit/physics checks pass. Asset tests verify proportions and budgets, front armor visibility, articulation, repeated assembly and disposal, missing-part failure and preservation of shared source resources. Existing browser checks cover flight composition, both perspectives, landing, trackpad, thumbs, pause/rotation, graphics recovery and automated AA.
- Close-up inspection uses the actual GLB from front, profile and rear. In-game views cover full-detail flight and a lighter-quality phone viewport in both orientations. `images/suit-study.png` is the model under studio lighting, not a concept rendering or an in-game lighting claim.
- `performance/sleek-suit-mac-chrome.json` records a **93-second desktop spot check**: physical Apple M2 Max, system Chrome 152 headless/ANGLE Metal, 1440×1000, DPR 1, full detail, third person, repeated route with Surge enabled. Across 5,561 active intervals: median 16.7 ms, p95 17.4 ms, zero intervals over 50 ms and zero browser/shader errors. Observed main-render peaks: 33 draw calls, 90,056 triangles, 32 geometries and four renderer textures. No simultaneous build or browser test ran during the sample. This is not a five-minute iPhone test or a controlled comparison with earlier reports.
- Source and visual review is recorded in `suit-review.md`. Physical iPhone performance, VoiceOver and subjective appearance/comfort remain open.

## Trackpad-only desktop revision · 2026-09-11

- TypeScript, production build, 36 unit/physics cases and 25 system-Chrome browser cases pass locally. Automated AA scans cover entry, the selectable field guide, settings and the active UI, including the desktop control selector and hint. Existing one-/two-thumb, orientation, long-press, keyboard, camera, collision, pause and graphics recovery regressions remain included.
- Six desktop cases cover click-to-cruise, pointer steering, scroll speed, click-to-hover and no pointer lock in both perspectives; a complete cursor-only takeoff/look/landing sequence; continued edge turns; HUD entry, resize, pause/resume and blur; touch handover; cancelled pointers; saved optional mouse capture; and rejection recovery. Four new unit cases cover bounded wheel deltas, shared intent, interruption and gentle restart speed.
- Control-wheel and Safari gesture-start event contracts are checked for cruise cancellation; the Control-wheel event remains uncancelled. These synthetic checks do not establish native Safari pinch behavior. Existing native Chrome touch pinch checks still cover active/paused phone gesture ownership.
- Rendered inspection covers the desktop cruise hint and settings at 1440×1000 plus a narrow 393×852 desktop viewport. The settings dialog has no horizontal overflow; the narrow hint was moved clear of the telemetry and rechecked. These are layout checks, not physical trackpad or mobile validation.
- `trackpad-review.md` documents the browser input contract and three-pass source review. The navigation audit was regenerated for the input-only Player change, with unchanged geometry/results. No new sustained-performance or physical-device claim is made. Physical Mac trackpad feel, Safari, iPhone and VoiceOver checks remain open in `TECH_DEBT.md`.

## Adaptive thumb revision · 2026-09-11

- TypeScript, production build and 32 unit/physics cases pass. The browser coverage now contains 19 cases, including automated AA checks and the previous flight, camera, landing, recovery and long-press regressions.
- Six state-machine cases cover arrival/release order, recentered handoffs, fixed ownership across finger crossing, a neutral deadzone, bounded reverse/diagonal intent, extra-contact blocking and cancellation. Movement input is shared with the existing physics controller; camera ownership stays unchanged.
- Native Chrome touch sequences cover all four first-thumb/released-thumb combinations in portrait and landscape, independent left movement/right view, hovering while looking, no launch from neutral dual contacts, resuming single-thumb control with the remaining contact, third-contact interruption, pause/resume and rotation. The initial browser-test failure was traced to the test listing the remaining contact in CDP `touchEnd`; Chrome interprets those points as the contacts to release. The corrected test confirms that no new pointer is introduced during handoff.
- A real Chrome pinch-gesture test confirms the active surface keeps dual gestures in the game and the paused page permits native zoom. There is no viewport zoom limit. Pinch during active flight now requires pausing or opening the guide; this scoped change and the physical Safari/VoiceOver verification gap are recorded in `TECH_DEBT.md`.
- The navigation audit was regenerated after the input-only takeoff guard changed. Geometry and navigation results are unchanged. Earlier five-minute performance reports below belong to their recorded source hashes; no new iPhone or sustained-performance claim is made for this input revision.

## Flight composition and navigation revision · 2026-09-11

The user reported visible shaking during fast flight and getting trapped in geometry. The phone browser is Safari, correcting the earlier Chrome identification.

- TypeScript and production build pass; 26 unit/integration cases and 13 system-Chrome browser cases pass locally.
- The camera and suit share an interpolated Rapier anchor, with ordered frame callbacks. Banking follows velocity rather than pointer-event frequency. Tests cover 30/60/120 Hz pose convergence, signed banking, angle wrapping, reduced motion, and the rendered camera/suit relationship during fast flight and hover recovery.
- Real Rapier tests sweep the planned route through the authored city, probe broken upper stories, check full-speed facade contact and immediate departure, preserve tangential sliding, reject unsupported/inside-building checkpoints, and enforce district limits. The seeded stress run covers 145 valid approaches and 8,700 physics steps without detected body overlap. `navigation-audit.json` records geometry counts, route coordinates, clearances and source hashes. These are finite regression cases, not a proof covering every trajectory.
- Browser checks recover an old saved position inside a building, stop at the north perimeter and move away again. All prior keyboard, one-thumb, touch cancellation/rotation, landing, pause/resume, graphics recovery, selectable guide and automated AA checks remain passing.
- Rendered inspection covers the streamlined pose, braking brace, settled hover and the Field guide map at a 393×852 viewport without horizontal overflow. Viewport checks do not replace physical Safari or VoiceOver testing.
- Muse and Gemini supplied independent reviews. Accepted findings and verified corrections to their advice are documented in `flight-safety-review.md`.

`performance/flight-safety-mac-chrome.json` records this revision's five-minute sample, source hashes and workload. On the physical Apple M2 Max, system Chrome 152 headless with ANGLE Metal, at 1440×1000/DPR 1/full detail/third person, the active sample retained 18,000 intervals over 300 seconds: median 16.7 ms, 95th percentile 17.2 ms, zero intervals over 50 ms and zero browser/shader errors. Surge was enabled after each reset (34 m/s maximum; clearance may reduce it). Observed main-render peaks: 12 draw calls, 81,526 triangles, 11 geometries and 3 textures. This is a Mac frame-loop sample, not GPU timings or physical iPhone evidence. No simultaneous test/build browser ran during the sample.

## Thumb-control revision · 2026-09-11

User playtest feedback: the separate Surge action was awkward, steering required two thumbs, and held touches near buttons invoked selection on the user’s phone. The browser was initially identified as Chrome and subsequently corrected to Safari.

- TypeScript, production build, 13 unit/integration cases and 10 system-Chrome browser cases pass locally.
- New real Chrome touch sequences cover left-thumb/third-person and right-thumb/first-person flight without pressing Lift, quick-tap rejection, steering in both axes, increasing speed with drag distance, continued edge turns, release braking, second-touch cancellation, and rotation during an active gesture.
- Held touches cover a button centre, edge and the surrounding scene. No game text is selected. Context-menu cancellation is checked on the HUD; field-guide text remains selectable and its native context menu remains enabled. Native iPhone Chrome long-press UI still requires confirmation on the actual phone.
- Existing keyboard, accessible tap controls, automated AA, reduced-motion, successful/cancelled landing, pause/resume and graphics recovery regressions pass.
- The game still permits pinch zoom. No viewport zoom restriction or global touch-event cancellation was added. Touch targets in landscape retain a 44px minimum.
- Source review covered cancellation before a takeoff physics step, pointer ownership, timer cleanup, camera ownership and the absence of per-move React state updates.

This is the next playtest candidate. The original five-minute performance sample below belongs to the first-flight source hashes, not this control revision; no new iPhone performance claim is made.

## First build: verified locally

- TypeScript and Next.js production build pass.
- Ten unit/integration cases cover smooth acceleration, diagonal speed limits, hover braking, pitch-based touch ascent/descent, walking gravity, world/water clearance, landing convergence, checkpoint validation, elapsed-time bounds, and real Rapier shape sweeps against thin walls and roofs.
- Six browser cases cover keyboard flight, pause/resume, perspective persistence, reset, portrait/landscape resize, the text discovery, successful/cancelled landing, graphics-context loss/reload, genuine Chrome touch events and touch cancellation, reduced motion, optional non-drag controls, and automated AA checks on representative states.
- Browser runtime and shader console errors are checked. The dependency audit reports no known production vulnerabilities as of this date.
- Visual inspection covered desktop, portrait, landscape, a 360×250 guide viewport, and forced-colors emulation. The guide scrolls vertically without horizontal overflow. These are viewport/media checks, not claims of native mobile-browser zoom or VoiceOver testing.

## Recorded performance

`performance/mac-chrome.json` contains a five-minute repeated route on the physical Apple M2 Max using system Chrome 152, headless, with ANGLE Metal. The route resets each cycle to stay among the buildings. Resolution: 1440×1000, DPR 1, full-detail graphics, third-person camera.

- Active sample: 300 seconds; latest 18,000 frame intervals retained.
- Median interval: 16.7 ms. 95th percentile: 17.4 ms.
- Frames over 50 ms: zero. Browser/shader errors: zero.
- Peak main-render statistics observed: 5 draw calls, 81,462 triangles, 5 geometries, 3 textures. These Three.js counters are not GPU timings or total device-memory measurements.
- First frames after resume are excluded. Controller-source hashes accompany the result. This measures the game frame loop on this Mac; it does not prove physical iPhone performance.

## Required physical review

Still open: iPhone Safari performance and heat over five minutes, thumb comfort, real rotation, VoiceOver, native browser zoom, and whether the travel feels enjoyable. The owner should open the hosted test on the actual phone, fly the route, and download the measurement report from Flight settings. See `TECH_DEBT.md` for owners and release gates.

The deliverable is a playable candidate for that review. Do not present all device/accessibility gates as complete.
