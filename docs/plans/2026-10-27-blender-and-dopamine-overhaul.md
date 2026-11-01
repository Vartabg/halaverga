# Plan: High-Fidelity Web-First Overhaul — Blender 3D Pipeline & Dopamine Engine

**Approved Setting**: Mount Hermon at dawn in the days of Jared (*1 Enoch 6*).
**Directive (User, 2026-10-27)**: Stay browser-first (zero-install URL on desktop and mobile), but elevate quality dramatically: eliminate procedural programmer-art primitives in favor of a headless Blender 3D asset pipeline (`.glb` models) and build the kinetic "game juice" (hitstop, dynamic speed FOV, camera punches, visceral impact particles, boss stagger) that makes combat genuinely addictive.
**Revision**: 1.1 (Post-EGM Review Resolution — All 6 Blockers Addressed)
**Status**: Ready for Implementation

---

## 1. Problem Statement & Root Cause

The user directly critiqued the current game:
- **Visuals Look Like Cheap Placeholders**: Semjaza, the Spear of Dawn, and the environment were composed of code-generated Three.js primitives (cylinders, boxes, cones in `semjazaMesh.ts`, `spearMesh.ts`) and flat faceted terrain with basic toon ramps.
- **Zero "Dopamine Hits" & Unnatural Feel**: Strikes lack physical impact because there is no hitstop (micro-freeze on contact), flight lacks aerodynamic speed sensation (fixed 65° FOV, no speed compression, floaty momentum), and the boss does not flinch or react when struck.

The solution is not to abandon the browser for a 50GB desktop engine, but to bring **professional action-game engineering** and **real 3D authored assets** into the browser-first stack.

---

## 2. Core Enhancements & Architecture

### Part A: The Dopamine Engine (Combat Juice & Kinetic Flight)

1. **Hitstop Micro-Freeze (`src/game/hitstop.ts`)**:
   - Calibrated to wall-clock seconds (`HITSTOP_DURATION = 0.08`s), not frame counts, ensuring consistent feel across 120Hz ProMotion and 30Hz mobile screens.
   - When active, animation and combat logic $\Delta t = 0$, while Rapier physics displacement accumulation is paused to prevent clock or integration glitches.
   - Hitstop countdown decrements only when `!state.paused`, preventing pause-menu timer leaks.

2. **Authoritative Camera FX Tuning (`src/game/cameraFx.ts`)**:
   - Respects single authoritative camera writer pattern in `CameraRig.tsx`. No new `flightDynamics.ts` or raw runtime camera writes.
   - Extends existing `speedFovTarget(speed, reduced, hip)`: widens FOV from 65° up to 85° based on velocity magnitude $\sqrt{v_x^2 + v_y^2 + v_z^2}$, clamped by `hipFovFor` to protect mobile portrait/landscape aspect ratios, and bypassed when `state.reduced` is true.
   - Feeds strike punches into existing `punchFov(camFx, 'shot', peakDeg)` and trauma shakes into `addTrauma(camFx, amount)`.

3. **Melee Combat Loop & Hit Resolution (`src/game/spearMelee.ts`)**:
   - Implements authoritative melee check (< 200 lines):
     - Evaluates player-to-boss distance (< 4.5m) and facing angle during combo attack active frames.
     - On hit: applies escalating damage (45 / 65 / 110), triggers `applyHitstop(0.08)`, punches camera, and increments Semjaza's stagger bar.
   - Input Bindings in `useInput.ts` / `useShooterInput.ts` and `TouchControls.tsx`:
     - Primary Click / Tap = `triggerAttack` (3-hit combo).
     - Shift / Space / Tap = `triggerDash` (0.35s i-frames).
     - Downward attack while airborne = `triggerDiveSmite`.

4. **Boss Stagger & Posture Break (`src/game/semjazaBoss.ts`)**:
   - Boss posture bar (max 100): Combo 1 (+15), Combo 2 (+25), Combo 3 / Smite (+50).
   - At 100 stagger: Semjaza reels back into a 2.5s kneeling posture-broken vulnerability state (+50% damage taken, interrupted attacks).
   - Stagger drains if player stops attacking for > 4.0s.

5. **Instanced Impact FX (`src/world/ImpactFx.tsx`, `src/world/fxImpacts.ts`)**:
   - Extends existing GPU-instanced particle pools with celestial spark bursts and obsidian armor shards on hit. Zero extra draw calls or geometry allocations.

---

### Part B: Headless Blender 3D Asset Pipeline (`.glb`)

Blender 4.0.2 is executed offline on macOS via `/Applications/Blender.app/Contents/MacOS/Blender -b -P <script>` to generate optimized `.glb` assets committed to `public/models/`. Blender is **never** a dependency of `pnpm build` or CI.

1. **Semjaza Model (`scripts/build_semjaza_model.py` $\to$ `public/models/semjaza.glb`)**:
   - Explicit Armature bone hierarchy: `Root`, `Spine`, `Head`, `Crown`, `Wing_L1..3`, `Wing_R1..3`, `Hand_R`, `Staff_Socket`, `Staff`.
   - Budget: < 25,000 triangles, max 1024x1024 textures, total file size < 2.5 MB.
   - Sculpted obsidian cuirass, horned crown, torn mantle, and articulated wings.

2. **Spear of Dawn Model (`scripts/build_spear_model.py` $\to$ `public/models/spear.glb`)**:
   - Double-edged celestial polearm with Enochian sun crossguard and radiant blade tip.
   - Budget: < 2,000 triangles, file size < 150 KB.

3. **Loading & Resilience (`src/world/SemjazaGLB.tsx`, `src/world/SpearGLB.tsx`)**:
   - Lazy-loaded via `useLoader(GLTFLoader, ...)` inside `BossEncounter.tsx`.
   - Error-boundary guarded with procedural fallback if load fails.
   - `clearWorldCache()` in `Suit.tsx` updated to clear `SEMJAZA_URL` and `SPEAR_URL` on retry.

---

### Part C: Reactive Boss HUD

`src/ui/BossHud.tsx` updated to use a decoupled RAF DOM-ref subscriber pattern (matching `ShooterHud.tsx` and `Telemetry.tsx`), updating boss health and the new stagger posture bar directly on DOM elements without React state reconciliation overhead.

---

## 3. Module Boundaries & Repository Invariants

- **Line Counts**: Every file strictly $< 200$ lines.
- **Single Camera Authority**: `CameraRig.tsx` retains sole authority; speed FOV and camera punches operate via `cameraFx.ts`.
- **First Load JS Budget**: Landing JS must remain $\le 629.0\text{ KB}$. New models (`semjaza.glb`, `spear.glb`) load only in lazy chunks post-start.
- **Verification**: Verified via `pnpm typecheck`, `pnpm test`, `check-first-load.mjs`, `check-vote-build.mjs`, and committed via `agent-task finish`.
