# Plan: Batman: Arkham Freeflow & God of War Attacking Overhaul

- **Version:** `rev-2` (incorporating all 6 EGM review resolutions in `2026-10-28-arkham-gow-combat-finetune-review.md`)
- **Date:** 2026-10-28
- **Worktree:** `/Users/vartny/.codex/worktrees/hades-boss-showdown/halaverga` (`codex/hades-boss-showdown`)

## 1. Problem & Goal

The initial *God of War* (Book of Enoch) overhaul established the 65-bone Quaternius Archangel rig (`public/models/archangel-gow.glb`), over-the-shoulder camera (`CameraRig.tsx`), and Semjaza boss encounter. However, inspecting and playing the attacking segments revealed several limitations that kept combat from feeling as kinetic and responsive as *Batman: Arkham* and *God of War (2018/Ragnarök)*:

1. **Identical Light Combo Clips & Missing Re-Trigger:** `light1`, `light2`, and `light3` all mapped to `'Sword_Attack'`, and `GowWarrior.tsx` only called `action.reset().play()` when `activeClip.current !== nextClip`. Chaining light attacks did not reset the clip or vary the attack choreography.
2. **Short Lunge Range & No Directional Freeflow Vault:** Attacking only lunged `5.2 m/s` for `0.18s` (`~0.9 m`), so if an enemy was `4–12 m` away, the player swung at empty air instead of magnetically vaulting across the arena from enemy to enemy like *Batman: Arkham*'s Freeflow system.
3. **Missing 3D Slash Arcs, Hit Sparks, and Knockback Physics:** Swings lacked visible 3D weapon trail arcs, impacts lacked 3D hit-spark bursts and smooth velocity knockback, and `gowRuntime.popups` were never rendered in the HUD.
4. **Silent Melee Combat:** Swings, meaty blade impacts, Aegis parries, and Winged Rage slams had no Web Audio synthesis.

## 2. Reading List for Independent Review

- `AGENTS.md`
- `src/game/gowTypes.ts`
- `src/game/gowCombat.ts`
- `src/game/gowEnemies.ts`
- `src/game/gowInput.ts`
- `src/world/GowWarrior.tsx`
- `src/world/GowArena.tsx`
- `src/world/gowArenaBuilder.ts`
- `src/ui/GowHud.tsx`
- `src/ui/GowHud.module.css`
- `tests/layout-tokens.test.ts`
- `tests/accessibility.spec.ts`

## 3. Proposed Architecture & Module Changes (`< 200` lines per file)

### 3.1 `src/game/gowTypes.ts` (`< 185` lines)
- Expand `GowAction` with `'light4'` (4-hit Freeflow combo) and `'counter'` (Arkham Counter-Riposte).
- Add `actionSeq: number` to `gowRuntime` (incremented on every triggered action so `GowWarrior.tsx` always resets and plays the clip even when consecutive moves share a base GLB clip).
- Add `slashTilt: number` and `spinTurns: number` to `AttackSpec` so each combo step has distinct 3D slash plane orientation and body choreography:
  - `light1` (`DAWN CLEAVE`): `Sword_Attack`, diagonal right-to-left cleave (`slashTilt: 0.35`, `spinTurns: 0`).
  - `light2` (`AEGIS BACKHAND`): `Punch_Jab`, fast shield-and-hilt cross (`slashTilt: -0.45`, `spinTurns: 0`).
  - `light3` (`WHIRLWIND SLASH`): `Punch_Cross`, 360° Kratos whirlwind spin cleave (`slashTilt: 0.1`, `spinTurns: 1`).
  - `light4` (`HEAVEN'S WRATH`): `Sword_Attack`, airborne rising-wing overhead meteor finisher (`slashTilt: 1.45`, `spinTurns: 0`).
  - `heavy` (`LEVIATHAN SLAM`): `Sword_Attack`, high-stun guard-breaking overhead slam (`slashTilt: 1.55`, `spinTurns: 0`).
  - `counter` (`ARKHAM RIPOSTE`): `Punch_Cross`, magnetic counter-vault + shockwave riposte (`slashTilt: -0.25`, `spinTurns: 0`).
- Add `vx: number; vz: number` knockback velocity to `GowEnemy`, `lockedTargetId: EnemyId | null` to `gowRuntime`, and a fixed-size pool `sparks` (`16` entries) + `slashArc` state in `gowRuntime`.

### 3.2 `src/game/gowAudio.ts` (New, `< 115` lines)
- Pure Web Audio API procedural combat sound synthesizer (zero external audio files, zero landing bundle impact):
  - Checks `useGame.getState().muted` and safely no-ops in headless/SSR environments where `AudioContext` is unavailable or suspended.
  - `playSwingAudio(step: number)`: Pitch-varied noise + triangle whoosh for combo steps 1–4 and heavy slams.
  - `playImpactAudio(heavy: boolean)`: Sub-bass body punch (`115Hz -> 36Hz`) + metallic blade ring (`920Hz`) on enemy hit.
  - `playParryAudio()`: Resonant golden Aegis bell harmonic (`540Hz + 810Hz + 1620Hz`) on Arkham Counter / Parry.
  - `playRageAudio()`: Deep celestial chord + low boom on Winged Rage / Execution.

### 3.3 `src/game/gowCombat.ts` (`< 195` lines)
- **Directional Arkham Freeflow Targeting (`findFreeflowTarget`):**
  - Scores live enemies within `14.0 m` using distance and alignment with the player's movement intent (`readIntent()`) or facing vector (`runtime.yaw`).
  - Updates `gowRuntime.lockedTargetId`.
- **Magnetic Freeflow Vault (`orientAndLunge`):**
  - Rotates `runtime.yaw` toward the Freeflow target and computes `combatMotion` velocity (`up to 22 m/s`) so the player vaults across the gap and stops `2.0 m` in front of the target (`dist - 2.0` divided by `lungeDuration`), clamping so the player never overshoots through the enemy.
- **4-Step Combo & Arkham Counter:**
  - `triggerLightAttack`: Cycles `1 -> 2 -> 3 -> 4`, increments `gowRuntime.actionSeq`, triggers `playSwingAudio`, and activates `gowRuntime.slashArc`.
  - `triggerParry`: If any enemy within `8.5 m` is in `'windup_yellow'` or `'strike'`, performs an **Arkham Counter-Riposte** (`action = 'counter'`), magnetically vaulting to the attacker, staggering them (`+55` Stun), triggering a golden shockwave, and playing `playParryAudio()`.
- **Knockback & Spark Emission (`applyHitToEnemy`):**
  - Applies physical knockback impulse (`e.vx, e.vz`) away from the player, spawns 3D hit sparks at the enemy's chest in `gowRuntime.sparks`, and triggers `playImpactAudio`.

### 3.4 `src/game/gowEnemies.ts` (`< 195` lines)
- Integrates enemy knockback velocity (`e.x += e.vx * dt; e.z += e.vz * dt; e.vx *= Math.exp(-10 * dt)`), keeping enemies outside a `1.85 m` personal-space radius from the player so they never clip inside the camera.
- Steps `gowRuntime.sparks` and `gowRuntime.slashArc` timers and updates `gowRuntime.lockedTargetId`.

### 3.5 `src/world/GowWarrior.tsx` (`< 195` lines)
- Tracks `lastActionSeq = useRef(-1)` alongside `activeClip` so every new attack (`gowRuntime.actionSeq !== lastActionSeq.current`) immediately calls `next.reset().play()` and crossfades cleanly.
- Layers procedural combat choreography after `bundle.mixer.update(mixerDt)`:
  - During `light3` (`WHIRLWIND SLASH`), spins `bundle.cloned.rotation.y = Math.PI + progress * Math.PI * 2`.
  - During `light4` (`HEAVEN'S WRATH`) and `rage_slam`, vaults `bundle.cloned.position.y = -1.04 + Math.sin(progress * Math.PI) * 0.72` with wings unfurled.
  - During `light1` / `light2` / `heavy`, adds dynamic shoulder/spine follow-through lean.

### 3.6 `src/world/gowArenaBuilder.ts` (`< 190` lines) & `src/world/GowArena.tsx` (`< 160` lines)
- Adds:
  - **3D Crescent Blade Slash Mesh (`slashMesh`):** A luminous golden crescent (`RingGeometry(1.1, 1.95, 24, 1, -1.1, 2.2)`) that attaches around the player's strike height, tilted by `slashTilt` and swept across the swing arc during active attacks.
  - **Target Lock Ring (`lockRing`):** Subtle golden reticle on the ground beneath `gowRuntime.lockedTargetId`.
  - **Arkham Counter Lightning Crown (`counterCrown`):** Overhead golden-cyan warning halo above enemies in `'windup_yellow'` so the player can read counter windows instantly in 3D space.
  - **3D Hit Spark Pool (`sparkMeshes`):** 16 octahedron spark meshes driven by `gowRuntime.sparks`.

### 3.7 `src/ui/GowHud.tsx` (`< 185` lines) & `src/ui/GowHud.module.css` (`< 60` lines)
- Displays the **Arkham Freeflow Combo Banner** (`x8 FREEFLOW • WHIRLWIND SLASH`) with a decaying combo timer bar and latest combat callout from `gowRuntime.popups`.
- Keeps `pointer-events: none`, `z-index: var(--z-hud)`, and `#0d131af2` high-contrast plates so `tests/layout-tokens.test.ts` and `tests/accessibility.spec.ts` pass without regression.

## 4. Verification & Acceptance Checks

1. `pnpm typecheck` (`0` TypeScript errors) and `wc -l` verification that every modified/new file in `src/` is `< 200` lines.
2. `pnpm test` (`200+` Vitest suites including expanded `tests/gow-combat.test.ts` verifying 4-step combo progression, `actionSeq` increments, directional Freeflow vault clamping, Arkham Counter-Riposte single-hit stagger, knockback velocity, and spark/slash activation).
3. `pnpm build && node scripts/check-first-load.mjs && node scripts/check-vote-build.mjs` (First Load JS `<= 629.0 KB`).
4. `PLAYTEST_URL=http://127.0.0.1:3000 npx playwright test tests/flight.spec.ts tests/accessibility.spec.ts` (`9/9` pass).
5. Visual inspection of rendered combat screenshots across desktop (`1440x900`) and mobile (`393x852`, `852x393`) via `read_file`.
