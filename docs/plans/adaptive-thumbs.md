# Adaptive thumb controls

Goal: retain one-thumb flight, switch automatically to left movement/right view when a second scene contact arrives, and return to one-thumb steering without a camera jump when either contact lifts.

- [x] Implement a tested input state machine in `src/game/adaptiveThumbs.ts`; extend shared thumb strafe intent in `src/game/runtime.ts` and gate ground takeoff on actual movement in `src/game/Player.tsx`.
- [x] Connect captured pointers and two temporary markers in `src/ui/TouchControls.tsx` and `src/ui/Experience.module.css`. Assign roles by X position on entering dual mode, then retain ownership even if fingers cross. Recenter on transitions; a remaining thumb resumes one-thumb flight by sliding, preventing an unintended launch when the movement thumb lifts.
- [x] Cover both touch arrival/release orders, neutral look-only input, movement/look independence, pointer cancellation, third touches, rotation, pause and held buttons. Keep browser gestures from stealing active steering. Scope gesture ownership to the active flight surface; preserve native zoom in paused UI and guide, and record the physical Safari verification gap.
- [x] Update `src/ui/FieldGuide.tsx`, `src/ui/Experience.tsx`, `README.md`, `docs/DECISIONS.md`, `docs/TECH_DEBT.md` and `docs/verification.md`; prepare the production build and browser/accessibility verification.

Delivery gates: finish the isolated branch through task-lifecycle, deploy the existing Vercel playtest, and check hosted controls.

No movement physics, rendering assets or camera ownership change is planned. The earlier timed rendering sample remains historical; this input revision does not establish a new physical-device performance claim.
