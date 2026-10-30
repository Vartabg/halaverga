# EGM Design Review Resolution: Three-Mode Prototype Lab

**Reviewer Subagent:** `2fdab670-4ffc-48a7-92ba-2c680130b33a`
**Date:** 2026-10-29

## Resolved Material Blockers

1. **Blocker 1 (Integration Contracts & `< 200` Line Headroom):**
   - Export `stepPrototypeLab(dt, reduced)` from `src/game/gowPrototypeLab.ts` and invoke it from `stepGowFrame` in `src/game/gowEnemies.ts`.
   - Wire Semjaza's Oath Aegis damage reduction (`0.35x` while tethered in `sigil` mode) in `applyHitToEnemy` (`src/game/gowCombat.ts`) and Enochian Prism 100% reflection (`45 DMG` reflected back at attacker) in `damagePlayer` (`src/game/gowEnemies.ts`).
   - Compact `gowCombat.ts`, `gowEnemies.ts`, and `gowArenaBuilder.ts` so every file stays strictly `< 195` lines.
2. **Blocker 2 (Scale-Aware Knockback Chain Collision Radius):**
   - Use `const hitDist = Math.max(2.6, (a.scale + b.scale) * 0.98)` (`~3.26 m` for Vanguard-to-Semjaza) inside `stepKnockbackCollisions` and run it before enemy separation pushes them apart.
3. **Blocker 3 (`dive` Overlook Altitude vs `CameraRig.tsx`, `stepIsoShooterVelocity`, and `poseEpoch`):**
   - Pin and spline-interpolate `runtime.position` and `presentation.position` inside `stepPrototypeLab` when `divePhase !== 'NONE'`, bypass the `22.8 m` `head.y` clamp in `CameraRig.tsx` during `divePhase !== 'NONE'`, and avoid incrementing `runtime.poseEpoch` on mode switch.
4. **Blocker 4 (12 FPS Eco Cadence Safety & Telemetry):**
   - Keep `isBurst = true` whenever any projectile is active, any spark is active, or any enemy has knockback velocity (`Math.hypot(e.vx, e.vz) > 0.1`) or `flashTimer > 0`.
   - Set `runtime.skipSample = true` on Eco timer wakeups and clear the timeout on unmount.
5. **Blocker 5 (WCAG `aria-hidden-focus` & Viewport Layout):**
   - Render the Prototype Lab Switcher (`data-testid="gow-demo-switcher"`) inside `.bossPlate` within `{showDeck ? ... : null}` with `aria-pressed`, and mark `data-testid="gow-cutin-banner"` with `aria-hidden="true"` and `pointer-events: none`.
6. **Blocker 6 (`sigil` 3D Pointer Swipe vs Immediate Click Attack):**
   - Track `pointerdown` $\rightarrow$ `pointermove` $\rightarrow$ `pointerup` in `src/game/gowInput.ts` during `sigil` mode so dragging $\ge 1.2\text{ m}$ across the sanctuary floor slices Oath-Tethers via `handleSigilSwipe`, while reusing `kbLineMesh` for the golden floor swipe beam and `prismMesh` for the 3-sided Enochian Prism barrier.
