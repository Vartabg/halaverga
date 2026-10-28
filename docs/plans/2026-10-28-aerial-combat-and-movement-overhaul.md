# Design Plan: Character Movement Overhaul & Elevated Aerial Lock-On Swoop / Sword-Beam Combat (`rev-1`)

**Date:** 2026-10-28
**Status:** Proposed (`rev-1`)
**Setting:** Mount Hermon at dawn in the days of Jared — the Watchers' descent (*1 Enoch 6*).

---

## 1. Problem Statement & User Feedback

The user playtested the Arkham/God of War combat build and reported two concrete issues:
1. **"ok better but the movements of all characters look bad."**
2. **"i like that I have the ability to push a button and it elevates me, but what I would like to do when in that elevated position is lock on to an enemy and be able to swoop in to strike them or be able to use my sword to shoot them down"**

### Root Causes Identified in Code & GLB Inspection

1. **Truncated Animation Clips (`Sword_Attack` & `Roll` Never Reached Their Active Frames):**
   - Inspection of `public/models/archangel-gow.glb` reveals `Sword_Attack` has a total duration of `1.533s`, where `t = 0.00s..0.62s` is a slow windup and `t = 0.62s..1.35s` is the actual sword slash.
   - `ATTACK_SPECS` played `Sword_Attack` from `t = 0.00s` for `0.44s` at `1.5x` (`0.66s` total clip time), cutting off the animation right before the slash began.
   - Similarly, enemies in `windup_yellow` played `Sword_Attack` from `t = 0.00s` at `0.72x` for `0.82s` (`0.59s` clip time), resetting to `Sword_Idle` before swinging.
   - `Roll` (`1.467s` clip) only played for `0.48s` from `t = 0.00s`, cutting off mid-tuck.
   - `GowWarrior.tsx` applied artificial whole-body procedural spins (`bundle.cloned.rotation.y = Math.PI + prog * Math.PI * 2`) and tilts (`rotation.x / rotation.z`) that made the character look like a rigid spinning statue.
2. **Ground Locomotion Ice-Skating, Moonwalking, and Enemy Jitter:**
   - On the ground (`!state.flying`), `presentation.ts` locks `pose.yaw` to camera yaw (`input.yaw`), so strafing (`A`/`D`) or backing up (`S`) played `Jog_Fwd_Loop` forward while sliding sideways/backward.
   - `orientSuit` applied flight bank/pitch to `bundle.wrapper` even when grounded.
   - In `gowEnemies.ts`, enemies snapped `e.yaw = Math.atan2(dx, dz)` instantaneously without angular smoothing, lacked enemy-to-enemy collision separation (stacking inside each other), and lacked hysteresis at the `chase` $\leftrightarrow$ `idle` distance threshold (`3.2 m`), causing rapid clip resets at the boundary.
3. **Clunky Rigid Cylinder Armor Primitives (`gowMaterials.ts`):**
   - `attachWarArmor` bolted rigid `CylinderGeometry` barrels onto `spine_01` (`girdle`) and `thigh_l`/`thigh_r` (`cuisse`) plus floating neon `OctahedronGeometry`/`TorusGeometry` shapes. During leg and hip animations, those rigid cylinders scissored through the pelvis and legs.
4. **Combat Disabled While Elevated (`gowInput.ts`, `motion.ts`, `GowWarrior.tsx`):**
   - `useGowInput` had `!s.flying` in `canAct()`, disabling all combat keys and mouse clicks whenever the player pressed `Space` / `Lift` to elevate.
   - `combatMotion` in `motion.ts` only had `vx, vz` and was gated by `if (!flying && combatMotion.timer > 0)`.

---

## 2. Supplied Reading List for Independent Review

- `AGENTS.md`
- `src/game/gowTypes.ts`
- `src/game/gowCombat.ts`
- `src/game/gowEnemies.ts`
- `src/game/gowInput.ts`
- `src/game/motion.ts`
- `src/world/GowWarrior.tsx`
- `src/world/GowArena.tsx`
- `src/world/gowArenaBuilder.ts`
- `src/world/gowMaterials.ts`
- `src/ui/GowHud.tsx`
- `tests/gow-combat.test.ts`

---

## 3. Proposed Architecture & Changes

### 3.1 Animation Clip Windowing (`clipStart`) & Natural Skeletal Poses (`src/game/gowTypes.ts`, `src/world/GowWarrior.tsx`, `src/world/gowArenaBuilder.ts`, `src/world/GowArena.tsx`)
- Add `clipStart: number` to `AttackSpec` in `src/game/gowTypes.ts`:
  - `light1` (`DAWN CLEAVE`): `clip: 'Sword_Attack'`, `clipStart: 0.58`, `duration: 0.44`, `timeScale: 1.65` (plays `t = 0.58s..1.31s`, capturing the full diagonal slash).
  - `light2` (`AEGIS BACKHAND`): `clip: 'Punch_Jab'`, `clipStart: 0.08`, `duration: 0.40`, `timeScale: 1.75` (plays `t = 0.08s..0.78s`).
  - `light3` (`WHIRLWIND CLEAVE`): `clip: 'Punch_Cross'`, `clipStart: 0.12`, `duration: 0.46`, `timeScale: 1.65` (plays `t = 0.12s..0.88s`, with zero rigid-statue 360° spin).
  - `light4` (`HEAVENS WRATH`): `clip: 'Sword_Attack'`, `clipStart: 0.42`, `duration: 0.56`, `timeScale: 1.65` (plays `t = 0.42s..1.34s`).
  - `heavy` (`LEVIATHAN SLAM`): `clip: 'Sword_Attack'`, `clipStart: 0.45`, `duration: 0.54`, `timeScale: 1.65`.
  - `swoop` (`ARCHANGEL SWOOP` — new aerial dive-strike): `clip: 'Sword_Attack'`, `clipStart: 0.45`, `duration: 0.52`, `hitTime: 0.22`, `damage: 56`, `stun: 42`, `reach: 5.5`, `timeScale: 1.65`.
  - `sky_beam` (`CELESTIAL SWORD BEAM` — new aerial sword projectile): `clip: 'Sword_Attack'`, `clipStart: 0.58`, `duration: 0.38`, `hitTime: 0.12`, `damage: 38`, `stun: 24`, `reach: 28.0`, `timeScale: 1.85`.
- For `Roll` (`act === 'dodge'`), start at `next.time = 0.12` with `timeScale = 2.35` over `0.48s` (`t = 0.12s..1.25s`).
- For enemies in `GowArena.tsx`:
  - When transitioning into `Sword_Attack` (`windup_yellow`), set `next.time = 0.38` and `speed = 1.22` over `stateDuration = 0.82s` (`t = 0.38s..1.38s`) so the Watcher visibly winds up and swings through the player at `0.62 * stateDuration`.
  - When transitioning into `Punch_Cross` (`windup_red`), set `next.time = 0.10` and `speed = 1.05` over `stateDuration = 0.88s`.

### 3.2 Ground Movement Facing, Stride Matching & Enemy Separation (`src/world/GowWarrior.tsx`, `src/game/gowEnemies.ts`)
- **Player (`src/world/GowWarrior.tsx`):**
  - When grounded (`!state.flying`), set `bundle.wrapper.rotation.set(0, pose.yaw, 0)` (upright, no flight bank/pitch on ankles); when `state.flying` is true, use `orientSuit` as before.
  - Track a smoothed `groundFacingOffset` ref on `GowWarrior`: when grounded, `act === 'idle'`, and horizontal speed `Math.hypot(v.x, v.z) > 0.35`, smoothly interpolate `groundFacingOffset` toward `angleDelta(pose.yaw, Math.atan2(-v.x, -v.z))` so the character turns their body toward the movement direction (eliminating sideways/backward moonwalking). When attacking or standing still, smoothly settle `groundFacingOffset` to `0`.
  - Scale locomotion clip `timeScale` proportionally to `pose.speed` (`Walk_Loop`, `Jog_Fwd_Loop`, `Sprint_Loop`) so foot speed matches ground travel speed.
- **Enemies (`src/game/gowEnemies.ts`):**
  - Smooth enemy `e.yaw` using angular interpolation (`e.yaw + Math.atan2(Math.sin(targetYaw - e.yaw), Math.cos(targetYaw - e.yaw)) * Math.min(1, dt * 10)`).
  - Add enemy-to-enemy separation in `stepGowFrame`: any two live enemies closer than `(a.scale + b.scale) * 0.95` push apart horizontally so Watchers never overlap or walk inside each other.
  - Add hysteresis to enemy chase state: if `e.state === 'chase'`, keep chasing until `dist <= (e.isBoss ? 3.8 : 2.7)`; if `e.state === 'idle'`, start chasing only when `dist > (e.isBoss ? 4.8 : 3.5)`.

### 3.3 Clean Anatomical Character Silhouette (`src/world/gowMaterials.ts`)
- Remove the rigid hip girdle (`spine_01`) and thigh cylinders (`thigh_l`, `thigh_r`) and floating neon octahedrons/neck rings that scissored through the body during animations.
- Retain sleek metallic forearm bracers (`lowerarm_l`, `lowerarm_r`), the Aegis shield on the hero's left forearm (`lowerarm_l`), a subtle golden/bronze crown on Watcher heads (`Head`), and well-proportioned greatswords on `hand_r`.

### 3.4 Elevated Lock-On, Aerial Swoop Strike & Sky Sword Beams (`src/game/gowInput.ts`, `src/game/gowCombat.ts`, `src/game/gowEnemies.ts`, `src/game/motion.ts`, `src/ui/GowHud.tsx`)
- **Input (`src/game/gowInput.ts`):**
  - Remove `!s.flying` from `canAct()`.
  - When `s.flying` is `true`:
    - `KeyJ` / Left-Click / Touch `Fire` (`[data-testid="fire-button"]`) calls `triggerAerialSwoop(reduced)` (or `triggerLightAttack(reduced)` which delegates to `triggerAerialSwoop` when `useGame.getState().flying` is true).
    - `KeyK` / `KeyG` / `KeyQ` / Right-Click / Touch `Aim` (`[data-testid="aim-button"]`) calls `triggerSkySwordBeam(reduced)` when `useGame.getState().flying` is true!
- **3D Combat Motion (`src/game/motion.ts`):**
  - Extend `combatMotion` to `{ vx: 0, vy: 0, vz: 0, timer: 0 }`.
  - In `advanceVelocity`: when `combatMotion.timer > 0` (whether `flying` is true or false), decrement `combatMotion.timer` and apply `next.x = combatMotion.vx`, `next.z = combatMotion.vz`, and if `combatMotion.vy !== 0`, `next.y = combatMotion.vy`.
- **Aerial Swoop Strike (`triggerAerialSwoop` in `src/game/gowCombat.ts` & `stepGowFrame` in `src/game/gowEnemies.ts`):**
  - Finds the best Freeflow target within `28.0 m` (`findFreeflowTarget(px, pz, 28.0)`).
  - Sets `action = 'swoop'`, faces the target, and computes a 3D dive velocity vector `(vx, vy, vz)` over `0.38s` that carries the player from their elevated position `(px, py, pz)` down to `1.8 m` in front of the target at ground height (`target.y + FOOT`).
  - When `stepGowFrame` resolves `swoop` (or when the player reaches ground height `py <= target.y + FOOT + 0.45` during `swoop`), it automatically transitions `useGame.setState({ flying: false, landing: false })`, triggers a golden ground shockwave (`shockwaveTimer = 0.50`), and cleaves the target for `56 DMG` + `42 STUN`!
- **Sky Sword Beam (`triggerSkySwordBeam` in `src/game/gowCombat.ts` & `resolvePlayerStrike` in `src/game/gowEnemies.ts`):**
  - While elevated (`flying === true`), locks onto the best target within `28.0 m`, turns `runtime.yaw` toward them, plays `sky_beam` (`Sword_Attack` slash in mid-air), and spawns a fast golden sword energy projectile (`28 m/s`, `38 DMG`, `24 STUN`) aimed 3D-directly at `(target.x, target.y + 1.1 * target.scale, target.z)`.
  - In `stepGowFrame`, player projectiles use 3D distance (`Math.hypot(e.x - p.x, (e.y + 1.0 * e.scale) - p.y, e.z - p.z) <= 2.0 * e.scale`) or ground impact (`p.y <= 20.3`) to detonate with hit sparks and shockwaves!
- **HUD Prompt While Elevated (`src/game/gowEnemies.ts`, `src/ui/GowHud.tsx`):**
  - When `useGame.getState().flying` is true and a Watcher is locked, `gowRuntime.threatPrompt` displays:
    `🦅 AERIAL LOCK • [CLICK/J] SWOOP STRIKE • [R-CLICK/K/G] SWORD BEAM`
    so the player immediately sees both elevated combat actions!

---

## 4. Verification & Acceptance Criteria

1. All `src/` files strictly `< 200` lines (`tests/layout-tokens.test.ts`).
2. Unit tests in `tests/gow-combat.test.ts` verify:
   - `clipStart` offsets on `ATTACK_SPECS` so `Sword_Attack` plays through the actual slash window (`t >= 0.58s`).
   - Elevated lock-on (`28 m`), `triggerAerialSwoop` 3D dive velocity (`combatMotion.vy < 0`) and automatic ground landing + cleave impact.
   - `triggerSkySwordBeam` mid-air sword projectile aimed 3D downward (`p.vy < 0`) at the locked ground enemy.
   - Enemy-to-enemy separation and smooth yaw interpolation.
3. Full `pnpm typecheck`, `pnpm test` (`199` test suites), `pnpm build` (`<= 629.0 KB`), and Playwright `tests/flight.spec.ts` + `tests/accessibility.spec.ts` pass.
