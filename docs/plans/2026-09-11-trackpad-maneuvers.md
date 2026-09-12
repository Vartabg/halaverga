# Trackpad-only hero flight: exploration plan

Status: research complete; prototype and physical evaluation pending. User steering on 2026-09-11 requests a deep gesture study and plan before expanding comic-book/anime flight maneuvers. This plan extends the existing flight playtest; it does not replace the district or mobile controls.

Goal: let a person explore with one hand on a trackpad, enjoy steering itself, and express many heroic movements without memorizing a large command set. The character supplies readable anticipation, strong poses and graceful recovery; the horizon remains stable.

Evidence, current code findings, browser limits and the local Chrome capability probe: [research notes](../research/trackpad-gestures.md). All durations, distances and numeric acceptance targets below are proposed starting points, not measured results.

## 1. Core control vocabulary

Start with the existing successful vocabulary and improve its precision before adding gesture recognition.

| Action | Proposed default | Character response |
| --- | --- | --- |
| Take off / resume travel | Primary click released in the scene | Compact lift, chest opens, then settles into cruise. |
| Steer | One-finger movement | Head leads the turn; torso and limbs follow with restrained lag. |
| Change speed | Two-finger vertical scroll | Continuous transition from upright hover to a leading-fist power pose. |
| Brake | Primary press during travel | Immediate braking request; torso rises, arms spread, one knee comes forward. |
| Look around while hovering | Existing press-and-drag | Camera looks without unintended launch; release stays hovering. |
| Land | Aim at a valid surface and click the contextual Land action | Controlled feet-first approach and soft settling. |
| Pause / settings / discovery | Existing semantic controls | Neutralize movement before interface interaction. |

Tap-to-click is an optional OS preference; instructions must also work with a physical click. Do not require a held button during routine travel. Scroll never initiates takeoff by itself. Braking must not wait for a double-click timer.

Keep scroll direction configurable after a short calibration: ask the tester to make their natural “faster” stroke and confirm the result. Do not assume a physical forward stroke always produces a negative wheel delta. Keep a clickable speed control in the collapsed panel for people who cannot scroll precisely.

## 2. Compare complete control profiles

| Prototype | One finger | Two fingers | Key question |
| --- | --- | --- | --- |
| A — Free cursor cruise | Current relative steering with explicit edge behavior | Scroll adjusts speed | Is the existing easy start still best after momentum/edge fixes? |
| B — Captured cruise | Relative steering without cursor hitting screen edges | Same throttle as A | Does uninterrupted turning outweigh capture/release friction? |
| C — Two-finger steering, later trial | Point to inspect; primary click toggles travel | Two-axis scroll steers at a selected cruise speed | Is this more fluid, or does inertia/navigation conflict make it worse? |

A and B are the first comparison. Keep their speeds, assistance, route and animation identical. In B, primary press brakes and unlocks; pointer-lock loss also neutralizes input. A subsequent explicit click may request capture again. Capture failure offers A; no keyboard is required to escape. Wheel delivery while locked needs a physical-browser check.

C is a separate profile, never a silent reinterpretation of A's scroll. It uses the same clickable speed selector instead of vertical-scroll throttle. Do not ship three profiles simply because they were tested; select the clearest default and retain a useful alternative only if it serves a demonstrated need.

For A, compare current sustained edge-turn with continuation that fades after recent pointer activity ends. Neither policy can infer true finger lift. Observe idle-at-edge, finger repositioning, cursor saturation and repeated full turns. If the compromise remains confusing, favor B for direct steering rather than disguising the limitation.

## 3. Gesture candidates to investigate

| Candidate | Possible use | Decision for first build |
| --- | --- | --- |
| Small one-finger strokes | Fine heading changes, targeting a gap | Core. |
| Broad one-finger arcs | Sweeping banks around towers | Core continuous steering; no hidden shape command. |
| Alternating left/right arcs | S-curves between buildings | Core; expressive alternating body poses. |
| Upward/downward steering | Climb, dive, pull out | Core with pitch and clearance bounds. |
| Gentle vertical scroll | Precise speed selection | Core; normalize and ignore verified inertia. |
| Brisk vertical scroll | Rapid acceleration into a power pose | Test capped throttle response; never unbounded extra speed. |
| Reverse scroll | Controlled slowdown | Core; click remains the dependable full stop. |
| Single click | Flight/hover | Core; retain immediate braking. |
| Primary drag in hover | Free look | Preserve existing behavior. |
| Press-drag-release in explicit Precision mode | Bounded side/vertical movement | Trial after A/B; visible direction preview, release to commit, neutral zone cancels. |
| Horizontal two-finger stroke | Sidestep or lateral drift | Laboratory only until real browser history-swipe tests pass. |
| Diagonal two-finger stroke | Climbing lateral drift | Later; must separate intentional diagonal input from axis leakage. |
| Secondary click | Open an optional maneuver/context menu while stopped | Optional shortcut, with an ordinary clickable alternative. |
| Double click / rapid tap chains | Burst or roll | Exclude initially: conflicts with fast braking and click preferences. |
| Draw a circle / half-circle | Explicit roll or turn-around request | Only in an armed practice mode; never recognize it from ordinary steering. |
| Hold without moving | Charge pose or command preview | Optional experiment with a toggle alternative; never necessary for flight. |
| Pinch / two-finger double tap | Browser zoom | Preserve native behavior. |
| Rotation / Force click | Browser-specific flourish or pressure experiment | Defer; not portable and not present in the tested Chrome runtime. |
| Three/four-finger / trackpad-edge gestures | System navigation | Exclude from game vocabulary. |

## 4. Maneuver library

The first eight are the initial visual/assistance scope. Later moves need deliberate activation and independent safety tests. A pose changes appearance; a maneuver that changes position must go through the movement controller.

| Movement | Player intent / context | Visual treatment and path rule |
| --- | --- | --- |
| Lift into hover | Click from a valid landing | Brief poised lift; no long launch cutscene or mandatory crouch delay. |
| Power flight | Increasing speed while steering ahead | Leading fist, bent trailing elbow, close legs; no oscillating shake. |
| Sweeping bank | Sustained left/right steering | Shoulder leads, outside arm extends, torso rolls modestly; camera roll stays zero. |
| S-carve | Alternating turns | Continuous weighted transition between sides, never alternating poses from input noise. |
| Rising arc | Steer upward during forward flight | Head and leading hand lift, hips follow; preserve chosen heading. |
| Dive and pull-out | Steer down, then up | Compact dive, open chest through the pull-out; respect water/building clearance. |
| Water skim | Deliberately descend near open water | Stable low flight with subtle wake; approach height smoothly, never snap downward. |
| Air brake / soft landing | Click to hover / request valid landing | Broad braking silhouette; then feet under hips and quiet contact. No forced knee impact. |
| Precision sidestep | Explicit Precision command | Bounded lateral translation while maintaining view; path swept for collision. |
| Vertical hover rise/drop | Explicit Precision command | Upright suit, palm/foot thrust cue; no forward drift. |
| Hook turn / reversal | Deliberate turn-around command | Brake, pivot, accelerate only after direction commits; no instantaneous 180° velocity flip. |
| Orbit a landmark | Select a point, then explicitly enable orbit | Cancellable assisted arc with a minimum safe radius; no automatic lock-on. |
| Axial roll | Deliberately armed roll command | One cosmetic body rotation about travel direction, with unchanged camera roll and physical path. |
| Corkscrew / loop | Advanced practice-only request | Real curved trajectory needs swept clearance, pitch/orientation work and large open space; defer beyond first prototype. |

An axial roll is not a corkscrew. The latter displaces the player around a curve. Do not fake path movement by moving the visible suit away from its collider. True inverted loops also exceed the present pitch controller; they are future physics/control work.

For Precision, first test explicit mode selection while hovering and drag-to-preview short translations. Map screen-horizontal to camera-right and screen-vertical to world-up. Preserve the current hover-look drag outside that mode. Provide direction buttons and click-start/click-end alternatives; a canceled preview leaves position and orientation unchanged. Land approach remains cancellable by fresh movement, not by incidental pointer hover.

## 5. Recognition and movement rules

1. Priority: pause/hidden/context loss → collision and boundary safety → explicit brake → landing cancellation/new movement → routine steering → optional maneuver → cosmetic accents.
2. Separate raw input, normalized intent, collision-resolved motion and character pose. Animation reads the result and intent; it never writes the player's world position or camera.
3. For supported browsers, ignore `WheelEvent.momentum === true` for throttle and gesture recognition. On other browsers use conservative capped changes and explicit cancellation; heuristic “end of stroke” is not physical finger-up.
4. Normalize wheel units before accumulation. Base changes on total accepted delta with time-based response, not event count. Lock a selected axis across a candidate stroke, with hysteresis; test browsers that send diagonal axes in separate events.
5. Clear pending gestures, held buttons, throttle transients and edge steering on stop, pause, blur, resize, zoom, input handover, lost capture and reset. After restart, reject the old wheel tail; a fallback quiet-window gate must not silently eat fresh deliberate commands.
6. Direction changes and brake input interrupt maneuvers immediately at the intent layer. The character may finish blending visually, but may not force the player to finish a trick.
7. A risky/unsupported gesture never becomes another command by accident. A failed roll preview stays hover; a rejected path gives a small readable “Path blocked” response.
8. Expand the suit with elbows/knees and parented joints. Use bounded poses with brief anticipation, a readable main shape, and damped recovery. Starting blend range: 100–180 ms, adjusted by movement. Do not delay physical steering to wait for animation.
9. Use actual resolved acceleration/turn rate and stable state transitions. Reset pose history after teleports/pause; avoid false brake/launch poses on resume. Distinguish collision stopping from a deliberate flourish.
10. Reduced motion retains controls and navigation but removes rolls, exaggerated body banking, extra zoom, flashes and trails. Keep one camera writer and a stable horizon in both perspectives.

## 6. Testing sequence and deliverables

### Phase 1 — Record the real input

- [ ] Add a local gesture recorder inside the testing panel. Capture event time, deltas/units, button state, modifiers, momentum presence/value, cancellation, scene ownership and resulting intent. Export locally; no remote behavioral telemetry.
- [ ] Record gentle/brisk/diagonal/reversed scrolling, finger repositioning, pauses during a gesture, click/drag cancellation, pinch, secondary click and attempted browser navigation. Use actual MacBook and, if available, Magic Trackpad hardware in Chrome and Safari; record exact versions and natural-scroll/tap/drag settings.
- [ ] Validate momentum tagging with trusted gestures. Mark unavailable hardware/browser cells untested. Synthetic events are fixtures, not ergonomic evidence.

### Phase 2 — A/B steering and stopping

- [ ] Keep the baseline accessible; add A/B only in the collapsed testing panel. Begin each comparison at the same checkpoint with speed reset.
- [ ] Teach three actions: click to fly/hover, slide to steer, scroll to change speed. Test two minutes of free exploration before explaining advanced moves.
- [ ] Alternate A→B and B→A across sessions/testers. Keep the scene and avatar poses identical to avoid attributing animation improvements to controls.
- [ ] Compare an arcade precision course and a relaxed scenic route. Each has takeoff, a 180° turn, slalom, water skim, climb, braking and landing. No mandatory time pressure.

### Phase 3 — Expressive suit and advanced experiments

- [ ] Add the eight initial movements; compare the same controls with and without expressive poses. Check silhouettes from the normal chase camera, first person and mobile views.
- [ ] Trial Precision translations separately. Then evaluate horizontal wheel or armed stroke gestures one at a time; discard commands that fight browser navigation or require explanation repeatedly.
- [ ] Make rolls opt-in. Use open-space previews before testing any physical curved maneuver. Run C only if A/B reveal a clear unmet need.

### Phase 4 — Decide from actual play

- [ ] Proposed acceptance: complete takeoff, two turns, hover and landing using only the trackpad after a short explanation; zero forced keyboard escapes or uncommanded launch/rolls in scripted interruption cases.
- [ ] Complete at least 9 of 10 deliberate landings on a 6 m-wide test pad from fixed starts after practice. Record misses and overshoot distance; do not hide failed approaches by teleporting.
- [ ] Measure input-to-intent latency, stop time/distance by starting speed, unwanted commands per gesture, corrective strokes, canceled approaches and accidental page/app exits. Aim for intent changes by the next physics tick; measure end-to-end visible latency separately with a physical recording.
- [ ] Ask for control confidence, wrist/finger effort, motion comfort and desire to repeat the route after five-minute sessions. Treat one person's preference as personal tuning, not a population result.
- [ ] Run automated replay at 30/60/120 Hz, collision tests, pause/resume and rapid stop/restart during wheel inertia. Test 200%/400% zoom, keyboard alternatives, VoiceOver and reduced motion. Retain phone portrait/landscape and adaptive-thumb regressions.
- [ ] Record five-minute performance under the final chosen profile with exact device/browser/settings, p50/p95/p99 frame time, stalls and resources. Physical iPhone validation remains separate from desktop trackpad results.

## 7. Implementation boundaries

Likely existing files: `src/ui/useTrackpad.ts`, `src/ui/useInput.ts`, `src/ui/TestPanel.tsx`, `src/ui/FieldGuide.tsx`, `src/ui/TouchControls.tsx`, `src/game/trackpadFlight.ts`, `src/game/runtime.ts`, `src/game/store.ts`, `src/game/Player.tsx`, `src/game/presentation.ts`, `src/game/FlightPresentation.tsx`, `src/world/Suit.tsx`, `src/world/suitGeometry.ts`, `scripts/build-suit.py`, `scripts/suit_mesh.py`, `public/models/suit.glb`.

Proposed focused additions as needed: `src/game/trackpadGestures.ts` (pure reducer), `src/game/maneuvers.ts` (bounded optional movement requests), `src/world/suitPose.ts` (joint targets), `src/ui/GestureRecorder.tsx` (local diagnostics). Keep modules below 200 lines and avoid changing `CameraRig.tsx` unless a verified camera issue requires it.

Extend `tests/trackpad.test.ts`, `tests/trackpad.spec.ts`, `tests/presentation.test.ts`, `tests/composition.spec.ts`, `tests/suit.test.ts`; add focused gesture replay and maneuver collision cases only for implemented behavior. Meaningful tests cover interruption, repeatability, wrong-gesture rejection and cleanup, not copies of implementation formulas.

Each implementation increment uses a clean linked worktree, required checks and lifecycle commit/push. Publish immutable Vercel comparison builds with a small control guide; choose the preferred behavior from the user's playtest before changing the default. Keep the current test URL and earlier builds available. No new domain, globe, combat system, native app or dependency is necessary for this study.

## Research delivery review

- [x] Inspected the current controller, animation boundaries and existing tests.
- [x] Reviewed primary browser/platform documentation and recorded the installed Chrome capability probe.
- [x] Distinguished source facts, code findings, proposed mappings and untested physical behavior.
- [x] Pass 0: documentation only; no new API, credential, renderer or input ownership changes.
- [x] Pass 1: covers trackpad-only operation and the requested comic-book/anime maneuvers; prototype tasks intentionally remain unchecked.
- [x] Pass 2: scoped files, clear experiment priorities, cancellation/accessibility requirements and preserved baseline.
