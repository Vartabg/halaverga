// The angel is knocked back when a blow lands on it (docs/plans/2026-11-16-real-fight.md A3). One owner for the shove: a hit sets it
// away from the attacker (wardenMath.wardenDamage, celestialBattle's darts). The flight model never carries it: Player.tsx takes
// last step's shove out of the model's input (shoveBase, beside gestureBase) and adds this step's after the model (shoveStep), so
// momentum flight cannot keep it, it never compounds and a head-on hit costs only the shove's own distance. A strike under way owns
// the velocity, so the shove is dropped while one runs. It is movement, not decoration: reduced motion keeps it.
// Pure: plain {x,y,z}, no allocation per frame.
import type { Vec3 } from './combat';
import { strike } from './strike';

/** speed: m/s at the hit, along the blow. half: seconds for it to halve. */
export const SHOVE = { speed: 14, half: .15 } as const;
/**
 * x/y/z: the shove still to come. ax/ay/az: what the last step added. sx/sy/sz: the velocity that step sent on to the flight safety,
 * shove included. tx/ty/tz: what shoveBase took out this step. serial: counts hits (the flinch reads it).
 */
export const hurtShove = { x: 0, y: 0, z: 0, ax: 0, ay: 0, az: 0, sx: 0, sy: 0, sz: 0, tx: 0, ty: 0, tz: 0, serial: 0 };

/** A blow travelling along (x, y, z) landed on the angel: shove it that way at SHOVE.speed. */
export function shoveAngel(x: number, y: number, z: number) {
  const l = Math.hypot(x, y, z), h = hurtShove; h.serial++;
  if (l < 1e-6) return;
  h.x = x / l * SHOVE.speed; h.y = y / l * SHOVE.speed; h.z = z / l * SHOVE.speed;
}
/**
 * Drops the shove still to come (resetBattle: regroup and retry). What the last step added still comes out at the next shoveBase,
 * unless `all` (a fresh start: tests) forgets that too. The hit count is kept, so the flinch never replays an old hit.
 */
export function clearShove(all = false) {
  const h = hurtShove; h.x = h.y = h.z = 0;
  if (all) h.ax = h.ay = h.az = h.sx = h.sy = h.sz = h.tx = h.ty = h.tz = 0;
}

/**
 * Start of the step, on the base gestureBase made: takes last step's shove out of the flight model's input in full, less what the
 * flight safety or a collision took off it since (the velocity sent on minus the one `flown` brought back, along the shove).
 * `flown`: runtime.velocity as the last step left it. Returns `base`.
 */
export function shoveBase(flown: Vec3, base: Vec3): Vec3 {
  const h = hurtShove, m2 = h.ax * h.ax + h.ay * h.ay + h.az * h.az;
  h.tx = h.ty = h.tz = 0;
  if (m2 <= 1e-12) return base;
  const taken = ((h.sx - flown.x) * h.ax + (h.sy - flown.y) * h.ay + (h.sz - flown.z) * h.az) / m2;
  const keep = Math.min(1, Math.max(0, 1 - taken));
  h.tx = keep * h.ax; h.ty = keep * h.ay; h.tz = keep * h.az;
  base.x -= h.tx; base.y -= h.ty; base.z -= h.tz;
  return base;
}

/**
 * After the model, the strike and the gesture offset, on the velocity the step sends to the flight safety: adds this step's shove
 * and decays it. `on`: free flight (no landing, not on the ground); off it, or while a strike runs, the shove is dropped.
 */
export function shoveStep(v: Vec3, dt: number, on: boolean) {
  const h = hurtShove;
  if (!on || strike.phase !== 0) { h.x = h.y = h.z = h.ax = h.ay = h.az = 0; return; }
  v.x += h.x; v.y += h.y; v.z += h.z; h.ax = h.x; h.ay = h.y; h.az = h.z; h.sx = v.x; h.sy = v.y; h.sz = v.z;
  const k = Math.pow(.5, Math.max(0, dt) / SHOVE.half);
  h.x *= k; h.y *= k; h.z *= k;
  if (h.x * h.x + h.y * h.y + h.z * h.z < 1e-6) h.x = h.y = h.z = 0;
}

/**
 * `v` less a shove, into `out` (may be `v`): with `taken`, what shoveBase took out this step (for the velocity the step began
 * with); without, what shoveStep added (for the velocity it ends with). The turn sweep reads the travel without the shove.
 */
export function lessShove(v: Vec3, out: Vec3, taken: boolean): Vec3 {
  const h = hurtShove;
  out.x = v.x - (taken ? h.tx : h.ax); out.y = v.y - (taken ? h.ty : h.ay); out.z = v.z - (taken ? h.tz : h.az);
  return out;
}
