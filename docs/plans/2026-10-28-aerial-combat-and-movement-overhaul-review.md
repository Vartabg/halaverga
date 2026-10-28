# EGM Review Resolution: Character Movement Overhaul & Elevated Aerial Lock-On Swoop / Sword-Beam Combat (`rev-2`)

**Reviewer Subagent:** `5f4f0580-6c3b-44bf-a098-4c800db4cb2d`
**Plan:** `docs/plans/2026-10-28-aerial-combat-and-movement-overhaul.md`

---

## Resolution of Material Blockers

1. **MB-1 (`GowWarrior.tsx` aerial animation priority & `clipStart` assignment):**
   - **Resolution:** Evaluate `if (act !== 'idle')` before `else if (state.flying)` in `src/world/GowWarrior.tsx`, assign `next.time = clipStart` immediately after `next.reset()`, and include `act === 'swoop' || act === 'sky_beam'` in `unfurlWings` and `striking`.
2. **MB-2 (`swoop` hit timing, dive completion & `combatMotion.vy` cleanup):**
   - **Resolution:** Set `swoop` dive duration and `hitTime` to `0.34s` (`duration: 0.50, hitTime: 0.34, reach: 6.5`). When `act === 'swoop'` reaches `actionTimer >= spec.hitTime` in `resolvePlayerStrike`, transition `useGame.setState({ flying: false, landing: false })`, zero `combatMotion.vy = 0`, trigger the golden shockwave at the landing point, and resolve damage against the locked target and any enemy within `spec.reach`. In `motion.ts` and `gowCombat.ts`, always reset `combatMotion.vy = 0` when `combatMotion.timer <= 0` or during ground lunges/rolls.
3. **MB-3 (`gowInput.ts` preserving flight Surge `Shift` and Descend `C` / `descend-button`):**
   - **Resolution:** In `src/game/gowInput.ts`, branch on `s.flying`: when `s.flying === true`, bind `KeyJ`, Left-Click, and `[data-testid="fire-button"]` to `triggerAerialSwoop(reduced)`, bind `KeyK`, `KeyQ`, `KeyG`, Right-Click, and `[data-testid="aim-button"]` to `triggerSkySwordBeam(reduced)`, and leave `KeyC`, `ShiftLeft`, `ShiftRight`, and `[data-testid="descend-button"]` untouched for flight controls.
4. **MB-4 (`28.0 m` aerial lock-on preservation in `stepGowFrame` & `startSpecAttack`):**
   - **Resolution:** In `stepGowFrame`, use `const lockRange = useGame.getState().flying ? 28.0 : 13.5;` when `gowRuntime.action === 'idle'`. In `startSpecAttack`, skip `orientAndLunge` when `key === 'swoop' || key === 'sky_beam'`.
5. **MB-5 (`< 200` line-count budget across `gowTypes.ts`, `gowCombat.ts`, `gowEnemies.ts`):**
   - **Resolution:** Compact `gowTypes.ts`, `gowCombat.ts`, and `gowEnemies.ts` (removing dead `e.clip` / `e.clipSpeed` mutations in `gowEnemies.ts`) so every file in `src/` remains strictly `< 195` lines.
