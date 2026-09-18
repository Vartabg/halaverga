# Trackpad-only desktop flight

The user explicitly chose trackpad-only operation. Default desktop control will be a click to engage gentle cruise, pointer movement to steer, vertical two-finger scrolling to change speed, and another click to hover. Click-and-drag while hovering looks around without launching, for landing aim. No held button or pointer lock is required for travel. The existing Land, Pause, settings and guide controls remain reachable. Entering interface controls, leaving the scene, zooming, switching inputs, pausing or resizing stops cruise.

- [x] Add bounded scroll-to-throttle logic and a shared trackpad input channel in `src/game/trackpadFlight.ts`, `src/game/runtime.ts`, `src/game/Player.tsx` and `src/game/store.ts`.
- [x] Add `src/ui/useTrackpad.ts`, integrate the scene surface, and expose a persistent Trackpad/Mouse desktop setting plus concise instructions in `src/ui/TouchControls.tsx`, `src/ui/TestPanel.tsx`, `src/ui/FieldGuide.tsx`, `src/ui/Experience.tsx` and its CSS module.
- [x] Verify trackpad-only takeoff, steering, scroll speed, hover, landing, interruption, zoom preservation and optional mouse capture; retain all phone and accessibility regressions.
- [x] Document the controls, source review and physical trackpad validation gap. Run type checks, unit tests, production build and browser checks before completing the isolated branch.

Delivery: use task-lifecycle commit/push, deploy the existing Vercel playtest, and verify hosted controls. Previous rendering/performance evidence remains historical; this task does not establish a new physical-device frame-rate claim.
