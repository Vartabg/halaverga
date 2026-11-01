# EGM Design Review Resolution — Turn-Based Cinematic Stance & Telegraph Duel

- **Reviewer Subagent:** `80ee320f-7aff-4feb-96f4-8faef362593a`
- **Verdict:** Conditional Pass (4 Material Blockers resolved below)

## Resolution of Material Blockers

1. **Blocker 1 (Stationary Formation Reach & Target Lock Preservation):**
   - `resolvePlayerStrike` in `src/game/gowEnemies.ts` now always connects with `e.id === gowRuntime.lockedTargetId` on single-target strikes and hits all living Watchers on `act === 'rage_slam'` (`Dawn Judgement`).
   - `findFreeflowTarget` in `src/game/gowCombat.ts` preserves `gowRuntime.lockedTargetId` when `explicitLock` is set and uses a `28.0 m` sanctuary lock radius so `semjaza-boss` and both Vanguards are always reachable from stance.

2. **Blocker 2 (`combatMotion` Return-to-Home Authority & Test Compatibility):**
   - `stepIsoShooterVelocity` in `src/game/motion.ts` remains untouched.
   - When `executeTurnCommand` initiates a melee lunge (`returnAfterStrike = true`), `orientAndLunge` vaults Uriel toward the target via `combatMotion`, and when `resolvePlayerStrike` fires at `spec.hitTime`, `combatMotion` reverses to vault Uriel smoothly back to `(homeX, homeZ)` over `0.22s`.
   - Direct `trigger*` calls in unit tests execute deterministically without blocking on `turnPhase`, and `PLAYER_ANIMATING` only transitions to `ENEMY_TURN` when `gowRuntime.turnPhase === 'PLAYER_ANIMATING' && !gowRuntime.queuedLight && gowRuntime.ap <= 0`.

3. **Blocker 3 (Axe-Core WCAG 2.1/2.2 AA & Keyboard Focus Preservation):**
   - Buttons in `src/ui/GowHud.tsx` omit redundant `aria-label` attributes so visible text directly defines the accessible name (preventing `label-content-name-mismatch`), use solid `#0d131a` / `#141d29` backgrounds for deterministic `> 10:1` contrast, and use `onMouseDown={(e) => e.preventDefault()}` so clicking HUD buttons never steals keyboard focus.
   - Interactive command buttons are gated on `!tapControls && controlLab === 'standard'` and positioned cleanly clear of twin-touch zones on both `393×852` and `852×393`.

4. **Blocker 4 (`< 200` Line-Count Budget):**
   - `rollNextEnemyIntents()` is placed in `src/game/gowTypes.ts`, and retired real-time chase/cooldown logic is replaced by `stepEnemyTurn()` in `src/game/gowEnemies.ts`, keeping every module under `src/` strictly `< 195` lines.
