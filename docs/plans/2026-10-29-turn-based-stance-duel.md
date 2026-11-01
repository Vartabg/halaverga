# Stage 1 Plan: Turn-Based Cinematic Stance & Telegraph Duel

## 1. Objective & Context
After testing the real-time 2.5D isometric build at Playtest Gate 1, the user identified the core reason real-time action breaks AI-generated 2D character art: AI image generation excels at dramatic keyframe illustrations (stances, mid-air wing hovers, sword swings, portraits), whereas real-time `WASD` locomotion slides static illustrations across the floor.

The user selected the **Cinematic Stance & Telegraph Duel** turn-based structure:
- **2 Action Points (`2 AP`) per turn** with zero real-time enemy attacks while choosing commands.
- **Visible Enemy Intent Telegraphs** above each Watcher (`⚔️ Melee Cleave`, `🌋 Altar Quake (Ground Only)`, `🏹 Sky-Piercer (Anti-Air)`).
- **Ground Stance vs. Elevated Sky Stance (`Take Wing`)**:
  - Elevating into **Sky Stance** (`+4.8 m` altitude) grants immunity to Ground Quakes and swaps Uriel's Command Deck to his **Sky Arsenal**: **Aerial Swoop Strike** (dive-bombing a locked Watcher back to the ground) and **Celestial Sword Beam** (firing golden beams down from the heavens while staying airborne).
- **Choreographed Camera & Pose Exchanges**: Every chosen action plays a `0.48s–0.65s` choreographed lunge/dive/beam sequence with dynamic camera zoom-in, attack keyframe swap, 3D slash/shockwave VFX, and floating combat popups before advancing the turn state machine.

## 2. Reading List (Restricted Context for Independent Review)
- `AGENTS.md`
- `src/game/CameraRig.tsx`
- `src/game/Player.tsx`
- `src/game/motion.ts`
- `src/game/gowTypes.ts`
- `src/game/gowCombat.ts`
- `src/game/gowEnemies.ts`
- `src/game/gowInput.ts`
- `src/world/GowWarrior.tsx`
- `src/world/GowArena.tsx`
- `src/ui/GowHud.tsx`
- `src/ui/GowHud.module.css`
- `tests/gow-combat.test.ts`
- `tests/flight.spec.ts`
- `tests/accessibility.spec.ts`

## 3. Architecture & Module Responsibilities (All `< 200` Lines)

### 3.1 Turn State Machine & Enemy Intents (`src/game/gowTypes.ts`)
- Extend `gowRuntime` with turn-based duel state:
  - `turnPhase: 'PLAYER_TURN' | 'PLAYER_ANIMATING' | 'ENEMY_TURN'` (default `'PLAYER_TURN'`)
  - `turnNumber: number` (default `1`)
  - `ap: number` (default `2`), `maxAp: number` (`2`)
  - `guardWard: boolean` (default `false` — active when Uriel plays **Counter Ward**)
  - `activeEnemyIndex: number` (`-1` during player turn; `0..2` during `ENEMY_TURN`)
  - `enemyTurnTimer: number` (`0`)
  - `homeX: number` (`0`), `homeZ: number` (`64.0`) — Uriel's sanctuary stance anchor so he smoothly returns after melee lunges.
- Extend `GowEnemy` with turn-based telegraph fields:
  - `intent: 'melee_cleave' | 'altar_quake' | 'sky_piercer'`
  - `intentDamage: number`
  - `intentLabel: string`
  - `portrait: string` (`/sprites/semjaza-portrait.jpg` or `/sprites/vanguard-portrait.jpg`)

### 3.2 Turn-Based Player Commands & Choreographed Lunges (`src/game/gowCombat.ts`)
- **Target Cycling & Selection (`selectTarget(id: EnemyId)` / `cycleTarget(delta: number)`)**:
  - Locks `gowRuntime.lockedTargetId` onto any living Watcher (`nephilim-west`, `semjaza-boss`, `nephilim-east`). Defaults to `semjaza-boss` (or nearest living Watcher).
- **AP Spending & Turn Transition (`spendAp(cost: number)`)**:
  - During `PLAYER_TURN`, executing a command deducts `cost` from `gowRuntime.ap` (clamped `>= 0`) and sets `turnPhase = 'PLAYER_ANIMATING'`.
  - When `gowRuntime.action` finishes (`actionTimer >= actionDuration` in `stepGowFrame`), Uriel smoothly returns to `(homeX, homeZ)` on the altar; if `gowRuntime.ap <= 0`, `startEnemyTurn()` automatically begins `ENEMY_TURN`, otherwise `turnPhase` returns to `'PLAYER_TURN'`.
  - Direct function calls in unit tests (or keyboard shortcuts when `ap === 0` in tests) auto-refresh or allow execution so existing unit test calls (`triggerLightAttack()`, `triggerAerialSwoop()`, `triggerSkySwordBeam()`) remain 100% deterministic.
- **Ground & Sky Command Deck Actions**:
  1. **`triggerLightAttack` (`Dawn Cleave` — 1 AP on Ground, or `Aerial Swoop Strike` in Sky)**:
     - Vaults toward the locked target (`lungeDuration`), swaps to Attack Keyframe (`frame 1`), deals `36 DMG + 30% Stun`, and returns to sanctuary stance.
  2. **`triggerParry` (`Counter Ward` — 1 AP on Ground, or `Celestial Sword Beam` in Sky)**:
     - On ground: activates `gowRuntime.guardWard = true` (`parryWindow = 10.0`), granting `+15 Guard` and arming an automatic **Arkham Riposte (`42 DMG + 50% Stun`)** against the next enemy melee strike during `ENEMY_TURN`! (Also immediately ripostes if an enemy is currently in `windup_yellow`.)
  3. **`triggerTakeWing` (`Take Wing / Elevate` — 1 AP on Ground, or `Feather Descent` — 0 AP in Sky)**:
     - Sets `useGame.setState({ flying: true, landing: false })`, `runtime.velocity.y = 8`, lifting Uriel `+4.8 m` into **Sky Stance** (`024 M ELEV • ON WING`) and unlocking **Aerial Swoop Strike** and **Celestial Sword Beam**.
  4. **`triggerAerialSwoop` (`Aerial Swoop Strike` — 1 AP in Sky)**:
     - Dives diagonally from `+4.8 m` onto the locked Watcher (`56 DMG + 45% Stun` + golden shockwave) and lands back in **Ground Stance** (`flying = false`).
  5. **`triggerSkySwordBeam` (`Celestial Sword Beam` — 1 AP in Sky)**:
     - Stays airborne in **Sky Stance** and fires a golden crescent **Sword Beam** projectile downward at the locked Watcher (`38 DMG + 28% Stun`).
  6. **`triggerWingedRage` (`Dawn Judgement` — 1 AP, requires `35+ Rage`)**:
     - Hits all living Watchers with a sanctuary-wide golden shockwave (`52 DMG + 40% Stun`) and heals Uriel `+25 HP`.
  7. **`endPlayerTurn()` (`End Turn [E / Space]`)**:
     - Transitions to `ENEMY_TURN`.

### 3.3 Sequential `ENEMY_TURN` Execution & Intent Resolution (`src/game/gowEnemies.ts`)
- **Zero Uninvited Real-Time Attacks**:
  - During `PLAYER_TURN` and `PLAYER_ANIMATING`, Watchers hold their formation positions `(spawnX, spawnZ)` (damping any knockback velocity back to their formation slot) and display their upcoming `intentLabel`. They never walk into Uriel or attack out of turn.
- **Sequential `ENEMY_TURN` Step (`stepEnemyTurn(dt, reduced)`)**:
  - Iterates through `gowRuntime.enemies` one at a time (`enemyTurnTimer`, `0.68s` per acting Watcher):
    - Dead Watchers ticks down `respawnTimer` per round and are skipped.
    - `stunned` Watchers flash `⚡ STUNNED — TURN SKIPPED!`, reset `state = 'idle'`, `stun = 0`, and advance to the next Watcher.
    - Active Watcher sets `state = 'windup_yellow'` / `'windup_red'` / `'windup_spell'` (which displays their Attack Keyframe `frame 1` in `GowArena.tsx`!) and lunges `1.8 m` toward Uriel:
      - **`altar_quake` (`🌋 Ground Only`)**: If `useGame.getState().flying` is `true`, Uriel completely evades it in mid-air (`pushPopup('EVADED IN SKY STANCE! +15 RAGE', 'parry', ...)`), gaining `+15 Rage` and taking `0 DMG`!
      - **`melee_cleave` (`⚔️ Counterable`)**: If `gowRuntime.guardWard` (or `parryWindow > 0`) is active, Uriel parries and counter-slashes the attacker (`applyHitToEnemy(e, 42, 50, reduced, 'COUNTER RIPOSTE')`), consuming `guardWard` and taking `0 DMG`!
      - **`sky_piercer` (`🏹 Anti-Air`)**: Fires a fast dark bolt at Uriel (`20 DMG` if airborne, `10 DMG` if grounded).
  - After all Watchers act, `rollNextEnemyIntents()` updates each Watcher's next telegraph, increments `turnNumber`, restores `ap = 2`, and sets `turnPhase = 'PLAYER_TURN'`.

### 3.4 Dynamic Turn Camera Framing (`src/game/CameraRig.tsx`)
- Keeps single camera authority in `CameraRig.tsx`.
- In `PLAYER_TURN`, frames the entire circular Sanctuary altar (`dist = 15.2 m` grounded, `18.8 m` in Sky Stance, pitch `-0.68 rad`).
- During `PLAYER_ANIMATING` or `ENEMY_TURN`, smoothly pulls `dist` closer by `2.2 m` so every attack lunge, swoop dive, and enemy counter-riposte feels punchy and cinematic.

### 3.5 Accessible Turn-Based Command Deck & Target Strip (`src/ui/GowHud.tsx`, `src/ui/GowHud.module.css`)
- **Semantic & Accessible Overlay (`tests/accessibility.spec.ts` Safe)**:
  - Root `.hud` does **not** set `aria-hidden="true"` so interactive `<button>` elements never trigger `axe-core` `aria-hidden-focus`.
  - Interactive Target Strip and Command Deck buttons render only when `!tapControls && controlLab === 'standard'`, and hide in `@media (max-height: 500px) and (orientation: landscape)` so phone twin-touch and tap-control accessibility tests have zero overlap.
  - Every `<button>` has `min-height: 38px` (`>= 24x24px` WCAG 2.2 AA target-size), high contrast (`#f7f2e8` and `#ffd166` on `#0d131af5`, contrast `> 10:1`), and distinct accessible labels (`Target Azazel Vanguard`, `Target Semjaza`, `Target Baraqel Vanguard`, `Dawn Cleave`, `Counter Ward`, `Take Wing`, `Swoop Strike`, `Sword Beam`, `Feather Descent`, `Dawn Judgement`, `End Turn`) that never collide with existing flight buttons (`Lift`, `Land`, `Move forward`, `Stop movement`, `Controls`, `Pause expedition`).

## 4. Verification & Acceptance Gates
1. `pnpm typecheck` passes with 0 errors.
2. `pnpm test` passes all 199 Vitest files (including updated turn-based tests in `tests/gow-combat.test.ts`).
3. `pnpm build && node scripts/check-first-load.mjs && node scripts/check-vote-build.mjs` succeeds within the `<= 629.0 KB` first-load budget.
4. All modified files under `src/` remain strictly `< 200` lines.
5. Playwright `tests/flight.spec.ts` and `tests/accessibility.spec.ts` pass (`9/9`).
6. Capture and visually inspect 5 screenshots showing:
   - **Player Turn Standoff**: Visible Enemy Intents (`⚔️`, `🌋`, `🏹`), Target Selector Strip with illustrated portraits, and Ground Command Deck (`2/2 AP`).
   - **Choreographed Dawn Cleave / Counter Riposte**: Uriel lunging into a Watcher with golden slash VFX.
   - **Elevated Sky Stance (`ON WING`) & Sky Arsenal**: Uriel hovering `+4.8 m` above the altar with **Aerial Swoop Strike** and **Celestial Sword Beam** cards active.
   - **Mobile Portrait (`393×852`) & Landscape (`852×393`)** layouts.
