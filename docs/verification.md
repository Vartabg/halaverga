# First-flight verification · 2026-09-11

## Verified locally

- TypeScript and Next.js production build pass.
- Ten unit/integration cases cover smooth acceleration, diagonal speed limits, hover braking, pitch-based touch ascent/descent, walking gravity, world/water clearance, landing convergence, checkpoint validation, elapsed-time bounds, and real Rapier shape sweeps against thin walls and roofs.
- Six browser cases cover keyboard flight, pause/resume, perspective persistence, reset, portrait/landscape resize, the text discovery, successful/cancelled landing, graphics-context loss/reload, genuine Chrome touch events and touch cancellation, reduced motion, optional non-drag controls, and automated AA checks on representative states.
- Browser runtime and shader console errors are checked. The dependency audit reports no known production vulnerabilities as of this date.
- Visual inspection covered desktop, portrait, landscape, a 360×250 guide viewport, and forced-colors emulation. The guide scrolls vertically without horizontal overflow. These are viewport/media checks, not claims of native Safari zoom or VoiceOver testing.

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
