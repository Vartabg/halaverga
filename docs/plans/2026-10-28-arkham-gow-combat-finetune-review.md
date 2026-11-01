# Consolidated EGM Review Report — Batman: Arkham Freeflow & God of War Attacking Overhaul

- **Plan:** `docs/plans/2026-10-28-arkham-gow-combat-finetune.md` (`rev-1` -> `rev-2`)
- **Reviewer Subagent:** `f8364daf-1d8d-4c29-9df5-d60f9b6a4c11`
- **Verdict:** Conditional Pass -> **Resolved in `rev-2`**

## Material Blockers Resolved

1. **MB-1 (Procedural Transform Leak on `bundle.cloned`):**
   - *Resolution:* `GowWarrior.tsx` unconditionally resets `bundle.cloned.position.set(0, -1.04, 0)` and `bundle.cloned.rotation.set(0, Math.PI, 0)` every frame before applying `light1`–`light4`, `heavy`, `counter`, or `rage_slam` procedural offsets, and skips 360° spin / vertical vault offsets when `state.reduced` is `true`.
2. **MB-2 (`actionSeq` Increment on All Triggered Actions):**
   - *Resolution:* `gowRuntime.actionSeq++` is incremented centrally in `startSpecAttack()` as well as in `triggerParry()`, `triggerDodgeRoll()`, and `damagePlayer()` (`'hurt'`), and reset to `0` in `resetGowState()`. `GowWarrior.tsx` resets the clip whenever `activeClip.current !== nextClip || gowRuntime.actionSeq !== lastActionSeq.current`, while guarding `if (prev && prev !== next) prev.crossFadeTo(...)`.
3. **MB-3 (Freeflow Lunge Backwards Pull & `reduced` Motion Mismatch):**
   - *Resolution:* `orientAndLunge()` clamps `const gap = Math.max(0, dist - 2.0)` so close-range strikes never pull the player backwards, drives `combatMotion.vx/vz` along the target direction `(dx / dist, dz / dist)`, updates `runtime.yaw = desiredYaw`, and caps lunge speed when `reduced` is `true`. `resolvePlayerStrike()` always hits `gowRuntime.lockedTargetId` when within `spec.reach + e.scale * 0.55`.
4. **MB-4 (Arkham Counter-Riposte Double-Hit & Threat Prompt Range):**
   - *Resolution:* `triggerParry()` triggers `startSpecAttack('counter', reduced)` when an enemy within `8.5 m` is in `'windup_yellow'` (`!e.hitDealt`) or `'strike'`, sets `gowRuntime.parryWindow = 0.45`, transitions the enemy to `'stagger'` (`e.hitDealt = true`), applies the riposte hit once with `gowRuntime.hitDone = true`, and updates `gowEnemies.ts` so `'PARRY [Q / RIGHT-CLICK]'` triggers at `d <= 8.5`.
5. **MB-5 (4-Step Combo Queueing & Finisher Hitstop):**
   - *Resolution:* `triggerLightAttack()` checks `actionTimer < actionDuration * 0.72` first and queues `queuedLight = true` across `'light1' | 'light2' | 'light3'`, then advances `comboStep` across `1..4` (`'light1' | 'light2' | 'light3' | 'light4'`). `gowEnemies.ts` includes `'light4'` and `'counter'` in finisher hitstop (`0.065s`) and heavy knockback impulses.
6. **MB-6 (Line-Count Ceiling `< 200` Lines & HUD Snapshot Equality):**
   - *Resolution:* All modified/new modules in `src/` are kept strictly `< 200` lines, `GowHud.tsx` includes `comboTimerPct`, `popupText`, and `popupTone` in `HudSnapshot` and `setSnap` equality checks, and zero `zIndex` identifiers appear in `.ts`/`.tsx` files.
