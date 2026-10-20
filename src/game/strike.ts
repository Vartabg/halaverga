// The sword strike (Garo 2026-10-19: the strike may move the angel). A sword command launches the angel at the demon; the blow
// lands on contact with a short freeze, and the angel carries its speed out the far side before the pilot's flight takes over.
// banish.ts starts and lands strikes; Player.tsx asks strikeVelocity for the step's velocity. Pure: plain {x,y,z}, no allocation.
import type { Vec3 } from './combat';

/** The dive covers any reach in about DIVE seconds (a long one is a zip across the arena), between minSpeed and maxSpeed m/s. */
export const STRIKE = { minSpeed: 55, maxSpeed: 130, dive: .42, maxTime: 1, contact: 3.4, carry: .28, exitSpeed: 34, freeze: .045 } as const;
/** phase 0 idle, 1 diving at the target, 2 carrying through after the blow (or a miss). */
export const strike = { phase: 0, t: 0, primed: false, entry: { x: 0, y: 0, z: 0 }, entrySpeed: 0, target: -1, landed: false, halt: false, freeze: 0, carrySpeed: 34, speed: STRIKE.minSpeed as number, aim: { x: 0, y: 0, z: 0 }, dir: { x: 0, y: 0, z: -1 } };

export function beginStrike(target: number, at: Vec3, distance = 0) {
  strike.phase = 1; strike.t = 0; strike.primed = false; strike.target = target; strike.landed = false; strike.halt = false; strike.freeze = 0;
  strike.speed = Math.min(STRIKE.maxSpeed, Math.max(STRIKE.minSpeed, distance / STRIKE.dive));
  strike.aim.x = at.x; strike.aim.y = at.y; strike.aim.z = at.z;
}
/** Follows a moving target while the dive is under way. */
export function aimStrike(at: Vec3) { strike.aim.x = at.x; strike.aim.y = at.y; strike.aim.z = at.z; }
/** The blow connected: freeze briefly, then carry through; a finishing blow (carry false) stops at the fallen demon instead. */
export function landStrike(carry = true) {
  strike.phase = 2; strike.t = 0; strike.landed = true; strike.halt = !carry; strike.freeze = STRIKE.freeze;
  strike.carrySpeed = Math.max(STRIKE.exitSpeed, Math.min(90, strike.speed * .85));
}
export function cancelStrike() { strike.phase = 0; strike.target = -1; strike.freeze = 0; }

/**
 * Overrides the step's velocity while a strike runs and returns true; false when idle. The flight safety still runs afterwards,
 * so a dive slides along stone instead of passing through it. Reduced motion still strikes, with no freeze.
 */
export function strikeVelocity(v: Vec3, p: Vec3, dt: number, reduced: boolean, steering = false) {
  if (strike.phase === 0) return false;
  if (strike.freeze > 0) { strike.freeze -= dt; if (!reduced) { v.x = v.y = v.z = 0; return true; } }
  strike.t += dt;
  if (strike.phase === 1) {
    const x = strike.aim.x - p.x, y = strike.aim.y - p.y, z = strike.aim.z - p.z, d = Math.hypot(x, y, z) || 1;
    strike.dir.x = x / d; strike.dir.y = y / d; strike.dir.z = z / d;
    // Launch from incoming travel, not from a fixed fraction of dash speed; keep direction continuous into the first .14 s.
    if (!strike.primed) {
      strike.entrySpeed = Math.hypot(v.x, v.y, v.z);
      const n = strike.entrySpeed || 1;
      strike.entry.x = v.x / n; strike.entry.y = v.y / n; strike.entry.z = v.z / n;
      strike.speed = Math.max(strike.speed, Math.min(STRIKE.maxSpeed, strike.entrySpeed)); strike.primed = true;
    }
    const u = Math.min(1, strike.t / .14), blend = u * u * (3 - 2 * u);
    const speed = strike.entrySpeed + (strike.speed - strike.entrySpeed) * blend;
    const x0 = strike.entry.x * (1 - blend) + strike.dir.x * blend;
    const y0 = strike.entry.y * (1 - blend) + strike.dir.y * blend;
    const z0 = strike.entry.z * (1 - blend) + strike.dir.z * blend, n = Math.hypot(x0, y0, z0) || 1;
    v.x = x0 / n * speed; v.y = y0 / n * speed; v.z = z0 / n * speed;
    if (strike.t > STRIKE.maxTime) { strike.phase = 2; strike.t = 0; strike.carrySpeed = Math.min(90, strike.speed * .85); }
    return true;
  }
  // A finishing blow brakes to a hover over the fallen demon, so it stays in view to bind.
  if (strike.halt && !steering) { v.x = v.y = v.z = 0; strike.phase = 0; strike.target = -1; return true; }
  // Carry keeps the energy of the hit instead of blending speed to zero. The pilot bends its direction immediately.
  const u = Math.min(1, strike.t / STRIKE.carry), current = Math.hypot(v.x, v.y, v.z);
  const speed = Math.max(current, strike.carrySpeed * Math.exp(-.55 * strike.t));
  const t = u * u * (3 - 2 * u), n = Math.max(current, 1e-6);
  const x = strike.dir.x * (1 - t) + (current > .1 ? v.x / n : strike.dir.x) * t;
  const y = strike.dir.y * (1 - t) + (current > .1 ? v.y / n : strike.dir.y) * t;
  const z = strike.dir.z * (1 - t) + (current > .1 ? v.z / n : strike.dir.z) * t;
  const length = Math.hypot(x, y, z) || 1;
  v.x = x / length * speed; v.y = y / length * speed; v.z = z / length * speed;
  if (u >= 1) { strike.phase = 0; strike.target = -1; }
  return true;
}
