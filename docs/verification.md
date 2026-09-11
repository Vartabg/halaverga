# First-flight verification · 2026-09-11

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
