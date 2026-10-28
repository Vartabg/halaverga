# EGM Design Review Report: God of War (2018 / Ragnarök) + Winged Rage Combat Overhaul

- **Reviewed Plan:** `docs/plans/2026-10-28-god-of-war-enoch-overhaul.md` (`rev-1` $\to$ `rev-2`)
- **Independent Reviewer:** Subagent `2995adf1-e192-4041-96e2-c5d279f1b34f` (`research` / `EGM Design Reviewer`)
- **Source Baseline:** `e8999ca` (`codex/hades-boss-showdown`)
- **Completion Status:** Completed with 7 material findings identified in `rev-1`, all verified against source and resolved in `rev-2`.

---

## Findings & Dispositions

| ID | Finding Summary | Source Location | Disposition | Resolution in `rev-2` |
| :--- | :--- | :--- | :--- | :--- |
| **B1** | `tests/layout-tokens.test.ts` scans all `.css` and `.tsx` files and fails on any numeric `z-index` or inline `zIndex`. | `tests/layout-tokens.test.ts:118-133` | **Accepted** | `GowHud.module.css` uses only `var(--z-hud)` and `var(--z-play)`; `GowHud.tsx` uses zero inline `zIndex`. |
| **B2** | Keybinding collisions between combat keys (`R`, `F`, `Q`, `C`, `Shift`, `E`) and flight/shooter controls. | `src/game/runtime.ts:57`, `src/ui/useInput.ts:59-61`, `src/ui/shooterKeys.ts` | **Accepted** | Grounded combat keys only activate when `!state.flying && state.shooter`; Runic uses `KeyG`, Winged Rage/Slam uses `KeyV`, `Space` stays Lift/Land, and `KeyE` yields to `state.nearTerminal`. |
| **B3** | Combat root motion (Dodge Roll `9.5 m/s` burst & attack lunges) must go through Rapier's `CharacterController` without exceeding `Player.tsx`'s 200-line ceiling. | `src/game/Player.tsx:117-148`, `src/game/motion.ts:44` | **Accepted** | Added `runtime.combatMotion = { vx: 0, vz: 0, timer: 0 }` consumed in `motion.ts` (`advanceVelocity`) when `!flying`, adding 0 lines to `Player.tsx`. |
| **B4** | Hard-switching `hip` FOV between grounded (`54°`) and flying (`65°`) causes an instant 11° snap in `baseFovStep`, and soft-lock must update `runtime.yaw`. | `src/game/CameraRig.tsx:58-60`, `src/game/cameraFx.ts:94-113` | **Accepted** | Weighted the over-the-shoulder boom (`[0.58, -0.14, 2.75]`) and `-9°` combat FOV offset by `(1 - pose.flight)` inside `boomFor` and `fovFor` when `state.shooter` is active; soft-lock nudges `runtime.yaw` during active melee swings. |
| **B5** | Static imports into `Experience.tsx` would push landing first-load JS over the `629.0 KB` ceiling (`1.9 KB` headroom). | `scripts/check-first-load.mjs`, `src/ui/Experience.tsx` | **Accepted** | `useGowInput()` is mounted inside `GowArena.tsx` (in lazy `Scene.tsx`) and `GowHud.tsx` is loaded via `dynamic(..., { ssr: false })` inside `<Optional>`. |
| **B6** | Touch combat buttons could overlap bottom-right `Lift` / `TouchCluster` or fail WCAG AA contrast/target checks in `tests/accessibility.spec.ts`. | `tests/accessibility.spec.ts:31-59`, `src/ui/TouchCluster.tsx` | **Accepted** | Touch combat buttons render only when `!state.flying && !state.tapControls`, placed in a bottom-left/center-left cluster clear of bottom-right `Lift`/`TouchCluster`, with `#0d131ae6` plates (`>12:1` contrast) and `>= 44×44 px` targets. |
| **B7** | Unwrapped `useLoader(GLTFLoader, '/models/archangel-gow.glb')` inside `<Physics>` would suspend `Player.tsx` (`ready: true`). | `src/world/Scene.tsx:71-76`, `src/world/Suit.tsx` | **Accepted** | Wrapped `<GowWarrior />` in `Suit.tsx` and `<GowArena />` in `Scene.tsx` in independent `<Boundary fallback={null}><Suspense fallback={null}>` boundaries. |
