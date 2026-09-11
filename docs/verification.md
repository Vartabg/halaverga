# First-flight verification · 2026-09-11

## Thumb-control revision · 2026-09-11

User playtest feedback: the separate Surge action was awkward, steering required two thumbs, and held touches near buttons invoked selection in Chrome on the user’s phone.

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

Still open: iPhone Chrome performance and heat over five minutes, thumb comfort, real rotation, VoiceOver, native browser zoom, and whether the travel feels enjoyable. The owner should open the hosted test on the actual phone, fly the route, and download the measurement report from Flight settings. See `TECH_DEBT.md` for owners and release gates.

The deliverable is a playable candidate for that review. Do not present all device/accessibility gates as complete.
