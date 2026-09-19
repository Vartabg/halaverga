# First-flight verification · 2026-09-11

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
  | Touchdown frame of an assisted landing (3 landings × reduced, 60 Hz): per-frame joint change beyond clips-off | ≤ 3° (3.5° at the shins) | +1.2° (forearm), +3.3° (shin, the absorb onset); 12.7° before the fix |
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
- Pending: the browser suite, including the new `tests/suit-clips.spec.ts`, against a fresh `next start`; the owner review of the strips and a live capture; a physical iPhone check.

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
