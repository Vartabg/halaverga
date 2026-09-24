# Simple-by-default controls

2026-09-23, branch `codex/shooter`. Spec: "Simple-by-default controls: implementation spec, revision 2".

## Owner question and approved answer

Garo asked: "how can we make them so simple that it wont intimidate people?" The approved answer ("yes build it after the cannon and trackpad"):

1. Two verbs at the start: move and shoot. One hand moves; the other aims and shoots, on every device.
2. Touch auto-fire on by default: the suit fires when the crosshair rests on a live drone with line of sight. The Fire button is hidden while auto-fire is on, and a setting brings it back. Trackpad and mouse keep click-to-fire.
3. Advanced controls (Aim, vent timing, tap controls) sit under **More controls**. Aim assist and automatic cooling carry beginners; vent timing still works with a Fire button or C but is not taught. On a touch screen that means Auto-fire off, since auto-fire never presses during a lock and a phone has no C key.
4. Progressive hints, one at a time, replace the one-line wall of instructions. Each hint goes away once its action is done, is saved, and never repeats.
5. At most two play buttons on a phone: Lift/Land, and Fire only when auto-fire is off.

## Design principles

- **Hick's law**: fewer visible choices mean faster decisions. The phone shows one play button by default, and only one hint shows at a time.
- **Fitts's law**: big targets in the thumb zone. When Fire is hidden, Lift/Land goes back to main's large bottom-right thumb spot.
- **Progressive disclosure and cognitive load**: advanced controls sit behind **More controls**, and each hint appears only after the previous action is done.

## Touch auto-fire (`src/game/autoFire.ts`)

Pure and landing-safe: plain numbers, no three.js, React Three or Rapier, no allocation after module load. One module singleton `autoFire` (like `burst`).

| Constant | Value |
| --- | --- |
| `AUTO_FIRE.dwell` | 0.1 s: the crosshair rests on a target this long before the press |
| `AUTO_FIRE.grace` | 0.15 s: a hold survives this much lost acquisition, so it does not stutter |
| `EPS` | 1e-9, so frame sums like 6 × 1/60 reach 0.1 |

It holds the trigger with source `touch` and `input.auto = true` while all of these are true:

- **(a)** the **Auto-fire on touch screens** setting (`store.autoFire`, default on) is on, passed as `ctx.autoFire`;
- **(b)** `s.input.lookSource === 'touch'`. A mouse or trackpad pointer, or the tap pad (`tap`), turns it off at once;
- **(c)** `autoFireTarget(s)`: the camera ray is published (`aim.valid`), `aim.acquired` is true, the real muzzle is not blocked short of the crosshair (`!aim.blocked`), and the weapon is not locked. `acquired` is advanceAssist's cue: magnetize() over live drones with line of sight (device profile, ADS, bloom, 60–100 m falloff), or the drone's body. With Aim assist Off the magnet cone is 0, so only the body counts;
- **(d)** no other source owns the trigger.

Rules:

- One `pressFire` per engagement. The weapon's own 9 Hz automatic fire does the rest.
- Cover: `aim.acquired` uses the camera's line of sight, sampled every 0.2 s. In third person a railing or wall edge can sit between the cannon and a drone the camera sees. `aim.blocked` (the last shot's result, or the HUD's muzzle ray while the arm is up) stops the press, and a blocked hold releases at once instead of spending the 150 ms grace. So one blocked shot per engagement, then a new press only after the arm lowers and the muzzle is checked again. Tested at 60 Hz through `stepShooter` (`tests/auto-fire.test.ts`, "auto-fire into cover": 18 blocked shots in 2 s before the fix, at most 2 after).
- Hybrid devices: a press of an arrow key or C (`shooterKeys.keyDown`) sets `lookSource` to the desktop source, so auto-fire stands down for a keyboard player on an iPad or touch laptop until the next touch re-tags it. Q is left out: it only aims, and a touch player may hold it while dragging.
- Never presses during an overheat lock, so it never vents by accident. A lock drops its hold on that step, and a new 100 ms dwell is needed after the lock.
- Never releases a hold it does not own (`fireSource === 'touch' && input.auto`) and never touches `touchId`. C (`keys`), tap Fire (`tap`), a click and the Fire button take priority.
- `stepShooter` calls `stepAutoFire(s, autoFire, ctx.autoFire, dt)` right after the tap-fire timeout and before the weapon, reading last frame's `acquired`.
- Pause, blur, rotation and resize run `resetShooterInput` (fireSource becomes `none`), so the next step forgets the hold. `Shooter.tsx` also calls `resetAutoFire` every paused frame and on unmount (before `resetShooterFeel`). A new dwell is needed after resume.

Thumbs:

- **One thumb**: the drag flies and steers the view, which is the aim. Auto-fire shoots at the resting crosshair; thumb roles never change.
- **Two thumbs**: left moves, right looks and aims.
- **No thumb**: it still fires if the crosshair rests on a drone. Heat and the lock cap it.

### Auto-fire never brakes flight (Garo confirmed, 2026-09-23)

`ShooterInput.auto` marks a trigger hold owned by auto-fire. Any manual press (`pressFire`, `tapShot`) clears it; `releaseFire` and `resetShooterInput` keep it, so the trailing HIP_HOLD/ENGAGED_HOLD window after an auto-fire hold is exempt too; `resetShooterFeel` clears it.

- `moveMode(s)` returns 1 (the 13 m/s hip clamp) only for a manual hold: `aimHeld ? 2 : !auto && (fire || sinceShot < HIP_HOLD) ? 1 : 0`. An auto-fire flyby keeps main's cruise speed.
- `engaged(s)` (assist friction, arrow finesse) is false for auto-fire alone, so `frictionNow` is 0 and `lookGain` is exact identity when not aiming.
- `threat(s)` = `aimHeld || fire || sinceShot < ENGAGED_HOLD` still counts auto-fire, so drones still notice, telegraph and dodge (`droneContext.threat = threat(s)`).
- The arm pose and `aim.combat` are unchanged: the suit still raises the cannon when it fires.

Why: a flyby must not steal flight. Auto-fire presses whenever the crosshair crosses a drone, so obeying the hip cap would brake the player at every pass without them asking to shoot. Rejected alternative: auto-fire obeys the hip cap and friction like a manual hold (brakes flybys to 13 m/s). Unit tests prove the no-brake rule at 25 m/s (`tests/auto-fire.test.ts`).

## More controls (`src/ui/MoreControls.tsx`, Unit B)

Blaster on: a `<details>` in the test panel, open at first only if one of its settings is already off its default. It holds Show tap controls · no dragging; Show Aim button on touch screens; Hold to aim / Toggle aim; Aim assist Off / Standard / Strong; and a short note on Q, right click, the Aim button and cooling (on a touch screen venting needs Auto-fire off).

Blaster off: no disclosure. The tap checkbox renders in main's place with main's text, and the TrackpadSettings and Field guide copy keep main's wording, so the panel matches main.

Q still aims on every device. Vent timing still works with a Fire button or C but is not taught.

On a touch screen (`pointer: coarse`) the Suit blaster section (with Auto-fire) comes first in Flight settings, above main's desktop and trackpad sections, with a one-line caption: "The suit fires when the crosshair rests on a drone. Turn off for a Fire button." Fine pointers keep the mouse and trackpad caption.

## Progressive hints (`src/ui/hintSteps.ts`, `ControlsHint`, Unit C)

Track: blaster off → none; tap controls → `tap`; coarse pointer → `touch`; mouse mode → `mouse`; One finger + keyboard → `simple`; other trackpad profiles → `line`.

| Track | Steps (every string ≤ 30 characters) |
| --- | --- |
| touch | "Drag to fly" → "Point at a drone to fire" (auto-fire off: "Point at a drone, hold Fire") |
| simple | "Click the scene to start" → "Slide to look" → "Click to shoot" → "WASD to fly · Space lifts" |
| mouse | "Click the scene to start" → "Move the mouse to look" → "Click to shoot" → "WASD to fly · Space lifts" |
| tap | one line, 6 s, once per page load: "Tap pad: Fire and Aim toggle" |
| line | one line, 6 s, once per page load: "Hold C to fire" |

Progress is `store.hintProgress` (`HINT_STEPS = { touch: 2, simple: 4, mouse: 4 }`; progress equal to the step count means done), saved through `PERSISTED_KEYS` and validated by `validHintProgress`.

Display: nothing at or past the last step. simple/mouse step 0 while captured shows step 1's text (covers the poll gap); the look and shoot steps while not captured show step 0's text (display only). The keys step needs no capture, so after Esc it keeps "WASD to fly · Space lifts".

Advance (MIN_VISIBLE = 1 s on every step except simple/mouse step 0). Actions count in any order: `since` is the observation when the series first showed in this page load, `look` is captured look travel since then, and `moved` latches a move key or a flying change seen at any poll since then:

- touch 0: a thumb is down, or the player started flying.
- touch 1 and simple/mouse 2: a hit, or 5 shots (SHOTS_FALLBACK), since the series began.
- simple/mouse 0: the pointer is captured, with no minimum (the capture exemption), re-checked on `pointerlockchange`.
- simple/mouse 1: 0.2 rad of captured look travel (LOOK_TRAVEL, about 67 px at 0.003 rad/px), or a hit.
- simple/mouse 3: moved.
- When a step is done, `nextStep` skips every later step whose action is already done, without showing it. Example: W and six clicks during "Slide to look", then an 80 px glance, finishes the series.
- STEP_TIMEOUT: the shoot steps and the keys step end after 20 s shown (the clock stops while paused). A timeout hides the step for this page load only and is never saved (`progressToSave`): saved progress never passes the first step that timed out, so the phone's "Point at a drone to fire" lesson comes back on the next visit.
- While a hint shows (`store.hintVisible`, runtime only), the blaster sound notice waits (it is retried on the next shot) and the one-finger panel steps aside, so only one message is on screen.

The 5-shot fallback and the 20 s timeout are deviations from the approved plan that Garo confirmed on 2026-09-23. Hints have no transition or animation, sit above the crosshair band, and are announced once each through a polite live region.

## Buttons and blaster-off identity

- Phone default: Lift/Land only. Auto-fire off: Lift/Land + Fire. The Aim button only after opting in under More controls. Header buttons and the Municipal record button are not play controls.
- `.actions[data-fire]` moves Lift/Land aside only when Fire shows; otherwise it sits in main's bottom-right spot.
- Blaster off (the setting, or `?shooter=0`): no Fire controls, Lift/Land in main's spot, main's touch hint unchanged (also with tap controls), SimpleTrackpadHud's blaster-off branch rendering main's exact output, `Shooter.tsx` unmounted (auto-fire never runs), no controls hint.

## Accepted exception

In the free and captured trackpad profiles, main's bottom flight legend stays next to the 6 s "Hold C to fire" line. Those profiles are opt-in, and the legend is main's flight UI.

## Owner decisions (Garo confirmed all five on 2026-09-23)

1. Auto-fire never slows flight: no hip cap and no friction from auto-fire alone.
2. The 5-shot fallback, and the 20 s timeout on the shoot and keys steps (a timeout is never saved).
3. With Aim assist Off, auto-fire is body-only.
4. Tap controls sit under More controls with the blaster on. With it off they stay where main has them, because blaster off must match main.
5. The free and captured profiles keep main's bottom legend next to the 6 s line.

## Verification

- Unit A: `pnpm typecheck`; `tests/auto-fire.test.ts` (dwell at 30/60/120/165 Hz, grace, overheat, gating, ownership, external reset, flight identity at 25 m/s, stepShooter integration at 60 and 120 Hz); `tests/persistence.test.ts` (new keys, defaults, `validHintProgress`); full `pnpm test`; `combat.ts` ≤ 199 lines.
- Merge gate (after A+B+C): `pnpm build && node scripts/check-first-load.mjs` within 636 KB with no markers; the browser set against a production server on a free port (never 3368 or 3380), with axe wcag2a/wcag2aa and emulated 393×852 and 852×393; `thumb-flight.spec.ts` and `adaptive-thumbs.spec.ts` unmodified with auto-fire on.

Merge gate result (2026-09-23, integration): `pnpm typecheck`, `pnpm test` (67 files, 711 tests), `pnpm build` and `check-first-load` passed; the landing first load is 8 scripts, 629.8 KB of the 636 KB budget. The whole Playwright suite (127 checks, including simple-controls-touch, simple-hints, accessibility, thumb-flight, adaptive-thumbs and touch-zoom unmodified) passed against a production `next start` on port 3391 in headless system Chrome with Metal, using emulated 393×852 and 852×393 touch viewports. This is emulation, not device validation.

Review fixes (2026-09-23): auto-fire respects a blocked muzzle and stands down for keyboard look; hints credit actions done out of order, keep the keys step's text after Esc, and never save a timeout; one message at a time; blaster-off settings match main; touch settings lead with Auto-fire. New browser checks: `simple-controls-touch.spec.ts` hunts the terrace greeter with two thumbs in a closed-loop raster and asserts auto-fire fires within 700 ms of the crosshair settling, does not fire while paused, and never fires with Auto-fire off (portrait and landscape); `simple-hints.spec.ts` adds the out-of-order and Esc-on-the-last-step sequences and the delayed sound notice.

## Device checks: NOT VALIDATED

Emulation is not device validation. Until Garo checks the preview link:

- iPhone Safari, both orientations: dwell and grace feel on the terrace greeter; a flyby while auto-firing keeps speed and steering; Lift/Land back bottom-right; hint legibility and placement; VoiceOver announces each hint.
- Mac trackpad: the full hint sequence, including Escape mid-sequence.
