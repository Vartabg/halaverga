# Plan: Three-Mode Genre-Redefining Prototype Lab (`Diorama Clash`, `Sigil Weaver`, `Dive-to-Duel`) + Battery-Smart Burst Engine

**Date:** 2026-10-29
**Repo:** `/Users/vartny/code/halaverga` (worktree `/Users/vartny/.codex/worktrees/hades-boss-showdown/halaverga`)
**Branch:** `codex/hades-boss-showdown`

---

## 1. Context & Purpose

The user requested live playable demos of all three genre-redefining browser gameplay concepts on the Mount Hermon Sanctuary stage (`1 Enoch 6`), engineered to push browser visual presentation while saving battery:

1. **Mode 1 — `💥 DIORAMA CLASH` (`demoMode = 'clash'`):**
   - Frozen 3D diorama with a visible **3D Knockback Trajectory Line** on the sanctuary floor.
   - Directional **Vector Ram** and **Pillar/Watcher Chain Collisions**: launching a Watcher into another Watcher or into the Sanctuary Rim Pillars triggers a **Chain Collision Shockwave (`+38 Bonus DMG + 50 Stun`)**.
   - **Diagonal Graphic-Novel Cut-In Panel:** High-impact attacks, counters, and chain collisions slice a stylized illustrated comic panel across the viewport (`URIEL • VECTOR RAM`, `CHAIN COLLISION • OATH SHATTERED!`) using GPU-composited `transform` and `opacity` (and respecting `prefers-reduced-motion`).
2. **Mode 2 — `📐 SIGIL WEAVER` (`demoMode = 'sigil'`):**
   - Glowing crimson **3D Oath-Tethers** physically connect `Semjaza` to `Azazel Vanguard` and `Baraqel Vanguard`, granting Semjaza an Oath Aegis until severed.
   - Players can **swipe/drag across the 3D Sanctuary floor** (mouse or touch) to slice Oath-Tethers with a golden blade ribbon, or trigger geometric sigils directly from the Command Deck:
     - **✂️ Sever Oath (`1 AP` or 3D swipe across tether):** Slices an active Watcher Oath-Tether (`42 DMG + Stun`, strips Semjaza's Oath Aegis).
     - **⭐ Star-Fall Vector (`1 AP`):** Links overhead Dawn Star node $\rightarrow$ Uriel $\rightarrow$ target Watcher for an orbital beam (`48 DMG + 35 Stun`).
     - **🔺 Enochian Prism (`1 AP`):** Raises a 3D golden triangle ward on the altar that **reflects 100% of the next Watcher strike (`45 Reflective DMG`)**.
3. **Mode 3 — `🦅 DIVE-TO-DUEL` (`demoMode = 'dive'`):**
   - Starts (and can re-ascend via `🦅 Re-Ascend Overlook`) at a high-altitude tactical hover above Mount Hermon (`y = 33.5 m, z = 75.0 m`, `divePhase = 'BREACH_AIM'`).
   - Players choose one of **3 Spline Breach Trajectories** (`☄️ Meteor Breach Dive`, `⚡ Winged Flank Glide`, `☀️ Solar Halo Drop`).
   - Executing the breach flies Uriel along a smooth 3D spline into the Sanctuary (`divePhase = 'DIVING'`) and applies the entry tactical payoff on Turn 1 (e.g., AoE shield shatter + stun, Sky Stance + 3 AP + Ward, or 100% Rage + Solar burn) before seamlessly continuing the turn-based duel.
4. **Shared Battery-Smart Burst Renderer (`CameraRig.tsx`):**
   - While waiting in `PLAYER_TURN` with no active animations, projectiles, cut-ins, or movement, `CameraRig.tsx` switches from 60Hz continuous `invalidate()` to a **12 FPS Eco Cadence (`80ms` scheduled invalidation)**, cutting idle WebGL GPU power by ~80% while instantly unlocking **60 FPS Burst Mode** during any player attack, sigil slash, spline dive, or enemy turn.

---

## 2. Reading List for Independent Review

- `AGENTS.md`
- `src/game/CameraRig.tsx`
- `src/game/gowTypes.ts`
- `src/game/gowCombat.ts`
- `src/game/gowEnemies.ts`
- `src/game/gowInput.ts`
- `src/world/GowArena.tsx`
- `src/world/gowArenaBuilder.ts`
- `src/ui/GowHud.tsx`
- `src/ui/GowHud.module.css`
- `tests/gow-combat.test.ts`
- `tests/flight.spec.ts`
- `tests/accessibility.spec.ts`

---

## 3. Proposed File Changes (< 200 Lines Per Module)

### A. `src/game/gowTypes.ts` (< 165 lines)
- Add `export type DemoMode = 'clash' | 'sigil' | 'dive';` and `export type DivePhase = 'NONE' | 'BREACH_AIM' | 'DIVING';`.
- Extend `gowRuntime` with:
  - `demoMode: 'clash' as DemoMode`
  - `ecoMode: true` (true when in 12 FPS eco diorama state, false during 60 FPS burst)
  - `cutInTimer: 0`, `cutInTitle: ''`, `cutInSub: ''`, `cutInPortrait: '/sprites/uriel-portrait.jpg'`
  - `oathTethers: [true, true] as [boolean, boolean]` (West & East Vanguard links to Semjaza)
  - `sigilPrism: false`, `sigilSwipeActive: false`, `sigilStartX: 0`, `sigilStartZ: 0`, `sigilEndX: 0`, `sigilEndZ: 0`, `sigilRibbonTimer: 0`
  - `divePhase: 'NONE' as DivePhase`, `diveTimer: 0`, `diveDuration: 0.65`, `diveStyle: 'meteor' as 'meteor' | 'flank' | 'solar'`

### B. `src/game/gowPrototypeLab.ts` (New file, < 185 lines)
- `switchDemoMode(mode: DemoMode)`:
  - Resets encounter state cleanly for the chosen demo mode.
  - In `'clash'`, locks onto `nephilim-west` and sets prompt `'💥 DIORAMA CLASH • AIM KNOCKBACK INTO WATCHERS OR PILLARS'`.
  - In `'sigil'`, activates both `oathTethers: [true, true]` and sets prompt `'📐 SIGIL WEAVER • SWIPE ACROSS CRIMSON TETHERS OR CAST SIGILS'`.
  - In `'dive'`, positions Uriel at the high overlook (`x = 0, y = 33.5, z = 75.0`), sets `useGame.setState({ flying: true, landing: false })`, and enters `divePhase = 'BREACH_AIM'`.
- `triggerCutIn(title: string, sub: string, portrait: string)`:
  - Sets `cutInTimer = 1.35`, `cutInTitle`, `cutInSub`, `cutInPortrait`.
- `stepKnockbackCollisions(reduced: boolean)`:
  - During `clash` mode (or whenever an enemy has knockback velocity `Math.hypot(e.vx, e.vz) > 1.2`), checks:
    1. **Enemy-to-Enemy Collision:** If a moving enemy comes within `2.6 m` of another living enemy, deals `+38 Bonus DMG + 45 Stun` to both, zeroes knockback velocity, spawns a golden shockwave, and fires `triggerCutIn('CHAIN COLLISION!', `${e.name} -> ${other.name} (-38 DMG)`, '/sprites/semjaza-portrait.jpg')`.
    2. **Sanctuary Rim Pillar Slam:** If a moving enemy hits the outer pillar ring (`Math.hypot(e.x, e.z - 55) >= 17.6`), deals `+34 Bonus DMG + 50 Stun` and fires `triggerCutIn('PILLAR SLAM!', `${e.name} CRASHED INTO ALTAR PILLAR`, '/sprites/uriel-portrait.jpg')`.
- `handleSigilSwipe(x0: number, z0: number, x1: number, z1: number, reduced: boolean)`:
  - Tests 2D line segment intersection between `(x0, z0) -> (x1, z1)` and the active crimson Oath-Tethers (`Semjaza <-> West Vanguard` and `Semjaza <-> East Vanguard`).
  - If intersected during `PLAYER_TURN` with `ap >= 1`, severs that tether (`oathTethers[idx] = false`), spends `1 AP`, deals `42 DMG + 55 Stun` to the Vanguard and `28 Oath-Shock DMG` to Semjaza, and triggers a cut-in `'OATH TETHER SEVERED!'`.
- `executeModeCommand(slot: 1 | 2 | 3 | 4 | 5, reduced: boolean)`:
  - Routes the 5 Command Deck buttons dynamically based on `gowRuntime.demoMode` and `gowRuntime.divePhase`.

### C. `src/world/gowArenaBuilder.ts` (< 195 lines) & `src/world/GowArena.tsx` (< 190 lines)
- Add lightweight 3D meshes to `createGowArena()` (all properly disposed in `dispose()`):
  - `kbLineMesh`: Golden knockback trajectory beam projecting behind the locked target in `clash` mode.
  - `tetherMeshes: [Mesh, Mesh]`: Two crimson glowing energy beams linking Semjaza to West and East Vanguards in `sigil` mode.
  - `prismMesh`: 3-sided `RingGeometry(2.2, 2.6, 3)` golden triangle barrier around Uriel when `sigilPrism` is active, or green/gold sigil swipe ribbon when `sigilRibbonTimer > 0`.
- Update `GowArena.tsx` `useFrame` to position and toggle visibility of `kbLineMesh`, `tetherMeshes`, and `prismMesh`.

### D. `src/game/CameraRig.tsx` (< 105 lines)
- **High-Altitude Breach Framing:** When `iso && gowRuntime.divePhase !== 'NONE'`, smoothly frame the overlook and spline dive toward the Sanctuary center `(0, 20, 55)`.
- **Battery-Smart Burst Cadence:**
  - Compute `const isBurst = !iso || gowRuntime.action !== 'idle' || gowRuntime.turnPhase !== 'PLAYER_TURN' || gowRuntime.cutInTimer > 0 || gowRuntime.divePhase === 'DIVING' || gowRuntime.shockwaveTimer > 0 || gowRuntime.slashTimer > 0 || gowRuntime.sigilRibbonTimer > 0 || Math.hypot(runtime.velocity.x, runtime.velocity.z) > 0.15;`.
  - Update `gowRuntime.ecoMode = !isBurst`.
  - When `isBurst` is true, call `invalidate()` immediately (60 FPS). When `isBurst` is false (frozen planning diorama), schedule a throttled `window.setTimeout(() => invalidate(), 80)` (~12 FPS eco mode) if one isn't already pending.

### E. `src/ui/GowHud.tsx` (< 195 lines) & `src/ui/GowHud.module.css` (< 90 lines)
- Add the **Prototype Lab Bar** (`data-testid="gow-demo-switcher"`) with 3 mode buttons (`💥 1 · Diorama Clash`, `📐 2 · Sigil Weaver`, `🦅 3 · Dive-to-Duel`) and the live **Power Telemetry Pill** (`⚡ ECO 12FPS` vs `🔥 BURST 60FPS`).
- Support `?demo=clash|sigil|dive` URL query parameter on initial load.
- Render the **Diagonal Graphic-Novel Cut-In Banner** (`data-testid="gow-cutin-banner"`) when `snap.cutInTimer > 0`.
- Update the 5 Command Deck buttons to display mode-specific actions and descriptions for `clash`, `sigil`, and `dive`.

---

## 4. Verification & Acceptance Gates

1. **Line-Count Gate:** All touched `src/` files strictly `< 200` lines.
2. **Unit Tests (`tests/gow-combat.test.ts`):**
   - Test switching across all 3 demo modes (`clash`, `sigil`, `dive`).
   - Test `clash` knockback chain collision (launching Azazel into Semjaza / pillar deals bonus collision damage and triggers Cut-In).
   - Test `sigil` oath-tether severing (via command and via 3D line-segment swipe) and Enochian Prism reflection.
   - Test `dive` breach trajectories (`meteor`, `flank`, `solar`) descending from `y = 33.5` to `y = 20` and applying Turn 1 breach effects.
3. **Full Suite & Bundle Budget:**
   - `pnpm typecheck`, `pnpm test`, `pnpm build && node scripts/check-first-load.mjs && node scripts/check-vote-build.mjs` (`<= 629 KB`).
4. **Playwright E2E & Accessibility (`tests/flight.spec.ts`, `tests/accessibility.spec.ts`):**
   - Zero axe-core WCAG violations across all 3 demo tabs.
   - Capture and inspect screenshots of all 3 live demos (`demo-1-diorama-clash.png`, `demo-2-sigil-weaver.png`, `demo-3-dive-to-duel.png`).
