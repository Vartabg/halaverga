// The sword strike (Garo 2026-10-19: the strike may move the angel). A sword command launches the angel at the demon; the blow
// lands on contact with a short freeze, and the angel carries its speed out the far side before the pilot's flight takes over.
// banish.ts starts and lands strikes; Player.tsx asks strikeVelocity for the step's velocity. Pure: plain {x,y,z}, no allocation.
import type { Vec3 } from './combat';

/** The dive covers any reach in about DIVE seconds (a long one is a zip across the arena), between minSpeed and maxSpeed m/s. */
export const STRIKE = { minSpeed: 55, maxSpeed: 85, dive: .42, maxTime: 1, contact: 3.4, carry: .28, exitSpeed: 34, freeze: .07 } as const;
/** phase 0 idle, 1 diving at the target, 2 carrying through after the blow (or a miss). */
export const strike = { phase: 0, t: 0, target: -1, landed: false, halt: false, freeze: 0, speed: STRIKE.minSpeed as number, aim: { x: 0, y: 0, z: 0 }, dir: { x: 0, y: 0, z: -1 } };

export function beginStrike(target: number, at: Vec3, distance = 0) {
  strike.phase = 1; strike.t = 0; strike.target = target; strike.landed = false; strike.halt = false; strike.freeze = 0;
  strike.speed = Math.min(STRIKE.maxSpeed, Math.max(STRIKE.minSpeed, distance / STRIKE.dive));
  strike.aim.x = at.x; strike.aim.y = at.y; strike.aim.z = at.z;
}
/** Follows a moving target while the dive is under way. */
export function aimStrike(at: Vec3) { strike.aim.x = at.x; strike.aim.y = at.y; strike.aim.z = at.z; }
/** The blow connected: freeze briefly, then carry through; a finishing blow (carry false) stops at the fallen demon instead. */
export function landStrike(carry = true) {
  strike.phase = 2; strike.t = 0; strike.landed = true; strike.halt = !carry; strike.freeze = STRIKE.freeze;
}
export function cancelStrike() { strike.phase = 0; strike.target = -1; strike.freeze = 0; }

/**
 * Overrides the step's velocity while a strike runs and returns true; false when idle. The flight safety still runs afterwards,
 * so a dive slides along stone instead of passing through it. Reduced motion still strikes, with no freeze.
 */
export function strikeVelocity(v: Vec3, p: Vec3, dt: number, reduced: boolean) {
  if (strike.phase === 0) return false;
  if (strike.freeze > 0) { strike.freeze -= dt; if (!reduced) { v.x = v.y = v.z = 0; return true; } }
  strike.t += dt;
  if (strike.phase === 1) {
    const x = strike.aim.x - p.x, y = strike.aim.y - p.y, z = strike.aim.z - p.z, d = Math.hypot(x, y, z) || 1;
    strike.dir.x = x / d; strike.dir.y = y / d; strike.dir.z = z / d;
    // Ease into the dive over the first tenth of a second, so the launch reads as a push, not a teleport.
    const s = strike.speed * Math.min(1, .35 + strike.t * 6.5);
    v.x = strike.dir.x * s; v.y = strike.dir.y * s; v.z = strike.dir.z * s;
    if (strike.t > STRIKE.maxTime) { strike.phase = 2; strike.t = 0; }
    return true;
  }
  // A finishing blow brakes to a hover over the fallen demon, so it stays in view to bind.
  if (strike.halt) { v.x = v.y = v.z = 0; strike.phase = 0; strike.target = -1; return true; }
  // Carry: momentum out the far side, blending back toward the pilot's flight.
  const u = Math.min(1, strike.t / STRIKE.carry), s = STRIKE.exitSpeed * (1 - u * u);
  v.x = v.x * u + strike.dir.x * s; v.y = v.y * u + strike.dir.y * s; v.z = v.z * u + strike.dir.z * s;
  if (u >= 1) { strike.phase = 0; strike.target = -1; }
  return true;
}
