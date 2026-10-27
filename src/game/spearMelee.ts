/** Authoritative melee hit resolution between player spear and Semjaza.
 * Evaluates active combo frames, range, and facing angle to trigger damage, hitstop, and posture stagger. */

import { applyHitstop } from './hitstop';
import { applyStagger, damageSemjaza } from './semjazaBoss';
import { bossRuntime } from './bossRuntime';
import { runtime } from './runtime';

export const MELEE_RANGE = 5.2; // Metres
export const SMITE_RADIUS = 7.5; // Radius of aerial dive smite shockwave

export interface MeleeHitResult {
  hit: boolean;
  damage: number;
  postureBroken: boolean;
  smite: boolean;
}

/** Check if player's active melee attack connects with Semjaza.
 * Called authoritatively in the 60 FPS loop outside React state. */
export function resolveMeleeHit(): MeleeHitResult {
  const { boss, combat } = bossRuntime;
  const none: MeleeHitResult = { hit: false, damage: 0, postureBroken: false, smite: false };

  if (boss.state === 'intro' || boss.state === 'defeated') return none;

  // Melee attack must be in active damage window
  const isMeleeActive = combat.attacking && combat.attackTimer > 0.05 && combat.attackTimer < 0.28;
  const isSmiteActive = combat.diveSmiting;

  if (!isMeleeActive && !isSmiteActive) return none;

  const dx = boss.x - runtime.position.x;
  const dy = boss.y - runtime.position.y;
  const dz = boss.z - runtime.position.z;
  const dist = Math.hypot(dx, dz);
  const vDist = Math.abs(dy);

  if (isSmiteActive) {
    if (dist <= SMITE_RADIUS && vDist <= 4.0) {
      const damage = 140;
      const broken = applyStagger(boss, 50);
      damageSemjaza(boss, damage);
      applyHitstop(0.10); // 100ms crunch on dive smite
      combat.diveSmiting = false; // Consumed
      return { hit: true, damage, postureBroken: broken, smite: true };
    }
    return none;
  }

  // Melee combo check
  if (dist <= MELEE_RANGE && vDist <= 3.5) {
    // Facing check: angle between player velocity/orientation and boss
    const toBossX = dx / Math.max(0.001, dist);
    const toBossZ = dz / Math.max(0.001, dist);
    const forwardX = Math.sin(runtime.yaw);
    const forwardZ = -Math.cos(runtime.yaw);
    const dot = toBossX * forwardX + toBossZ * forwardZ;

    // Must be facing roughly toward boss (> -0.2 dot allows sweeping arcs)
    if (dot > -0.2) {
      const damage = combat.combo === 3 ? 110 : combat.combo === 2 ? 65 : 45;
      const staggerAmount = combat.combo === 3 ? 40 : combat.combo === 2 ? 25 : 15;
      const broken = applyStagger(boss, staggerAmount);
      damageSemjaza(boss, damage);
      applyHitstop(0.08); // 80ms hitstop
      combat.attacking = false; // Consume attack so it only registers once per swing
      return { hit: true, damage, postureBroken: broken, smite: false };
    }
  }

  return none;
}
