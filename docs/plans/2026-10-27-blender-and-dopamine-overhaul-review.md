# EGM Design Review Synthesis: Blender 3D Pipeline & Dopamine Engine

**Document Reviewed**: `docs/plans/2026-10-27-blender-and-dopamine-overhaul.md` (Revision 1.0)
**Setting**: Mount Hermon at dawn in the days of Jared (*1 Enoch 6*)
**Evaluator**: Independent EGM Architectural Reviewer (Subagent `f0b9220b-d625-474f-91d6-ea04604aa538`)
**Lead Synthesizer**: Antigravity Assistant
**Date**: 2026-10-27
**Disposition**: **REVISED & RESOLVED (Revision 1.1)**

---

## Synthesis of Review Findings & Resolutions

The independent reviewer approved the intent to transition to authored 3D models and visceral action-game feel, but raised 6 material blockers regarding repository contracts and data flow:

| # | Material Blocker | Root Cause in Revision 1.0 | Architectural Resolution in Revision 1.1 |
| :--- | :--- | :--- | :--- |
| **1** | **Orphaned Combat Loop** | `triggerAttack`, `triggerDash`, `triggerDiveSmite` were uncalled stubs with no inputs; `SpearCombat.tsx` lacked melee hit detection against Semjaza. | Added dedicated `src/game/spearMelee.ts` (<200 lines) with player-to-boss distance (<4.5m) and strike angle evaluation. Wired primary click/tap to `triggerAttack` and space/dash to `triggerDash` in `useInput.ts` and `TouchControls.tsx`. |
| **2** | **Camera Authority Duplication** | Proposed `flightDynamics.ts` and writing to `runtime.fov` / `runtime.cameraShake`, bypassing `CameraRig.tsx` and `cameraFx.ts`. | Eliminated `flightDynamics.ts`. Extended existing `speedFovTarget` in `cameraFx.ts` to scale from 65° to 85° based on velocity magnitude while respecting `reduced` and `hipFovFor`. Fed combat punches directly into existing `punchFov` and `addTrauma`. |
| **3** | **Hitstop Timer Calibration** | Frame-counting (5 frames) fails on 120Hz ProMotion vs 30Hz mobile screens and risks Rapier physics clock anomalies. | Calibrated hitstop to explicit time in seconds (`HITSTOP_DURATION = 0.08`s) in `src/game/hitstop.ts`. During hitstop, clamps animation $\Delta t = 0$ while skipping physics displacement accumulation. Timer decrements only when `!state.paused`. |
| **4** | **Undefined Armature Contract** | `semjaza.glb` lacked an explicit bone/node hierarchy contract for Blender export vs Three.js querying. | Defined exact Armature contract: `Root`, `Spine`, `Head`, `Crown`, `Wing_L1..3`, `Wing_R1..3`, `Hand_R`, `Staff_Socket`, `Staff`. Documented exact Object3D query interface for `SemjazaGLB.tsx`. |
| **5** | **Unreactive Boss HUD** | `BossHud.tsx` read runtime singletons directly during render without a reactive bridge, leaving stagger bar frozen. | Adopted RAF/DOM ref subscriber pattern (matching `ShooterHud.tsx` and `Telemetry.tsx`), updating stagger and health widths directly on DOM elements without React reconciliation overhead. |
| **6** | **Missing Cache Invalidation** | `clearWorldCache()` in `Suit.tsx` only cleared `SUIT_URL`. Network failures on mobile would permanently cache rejection. | Added `SEMJAZA_URL` and `SPEAR_URL` to `clearWorldCache()`. Wrapped GLB loaders in individual `<Boundary fallback={<... />}>` blocks. |

---

## Offline Blender Tooling Policy

Blender scripts (`scripts/build_semjaza_model.py`, `scripts/build_spear_model.py`) are developer-time macOS offline tools executed via `/Applications/Blender.app/Contents/MacOS/Blender -b -P <script>`. The resulting binary `.glb` files are committed to `public/models/`. Blender is **never** invoked during `pnpm build`, `check-first-load.mjs`, or CI verification, protecting production deployment builds.
