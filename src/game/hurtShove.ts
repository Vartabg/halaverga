// The angel is knocked back when a blow lands on it (docs/plans/2026-11-16-real-fight.md A3). One owner for the shove: a hit sets it
// away from the attacker (wardenMath.wardenDamage, celestialBattle's darts); Player.tsx adds it to the step's velocity right after
// strikeStep, so the flight safety and the limits see it as they see a strike dash. A strike under way owns the velocity, so the
// shove is dropped while one runs. It is movement, not decoration: reduced motion keeps it.
// Pure: plain {x,y,z}, no allocation per frame.
import type { Vec3 } from './combat';
import { strike } from './strike';

/** speed: m/s at the hit, along the blow. half: seconds for it to halve. */
export const SHOVE = { speed: 14, half: .15 } as const;
/** x/y/z: the shove now. ax/ay/az: what the last step added, still riding in the velocity. serial: counts hits (the flinch reads it). */
export const hurtShove = { x: 0, y: 0, z: 0, ax: 0, ay: 0, az: 0, serial: 0 };

/** A blow travelling along (x, y, z) landed on the angel: shove it that way at SHOVE.speed. */
export function shoveAngel(x: number, y: number, z: number) {
  const l = Math.hypot(x, y, z), h = hurtShove; h.serial++;
  if (l < 1e-6) return;
  h.x = x / l * SHOVE.speed; h.y = y / l * SHOVE.speed; h.z = z / l * SHOVE.speed;
}
/** Forget the shove (regroup, reset). The hit count is kept, so the flinch never replays an old hit. */
export function clearShove() { const h = hurtShove; h.x = h.y = h.z = h.ax = h.ay = h.az = 0; }

/**
 * One physics step, after strikeStep: takes out what is left of last step's shove (the flight model carried it into this
 * velocity), adds this step's, then decays it. `on`: the angel is in free flight (no landing, not on the ground). A running strike
 * or a step that is not in free flight drops it.
 */
export function shoveStep(v: Vec3, dt: number, on: boolean) {
  const h = hurtShove;
  if (!on || strike.phase !== 0) { clearShove(); return; }
  // Like the gesture offset (applyGesture.gestureBase): only the part of last step's shove still in the velocity comes out, so the
  // shove never compounds and never pushes the angel back against where it was going.
  const m2 = h.ax * h.ax + h.ay * h.ay + h.az * h.az;
  if (m2 > 1e-12) {
    const keep = Math.min(1, Math.max(0, (v.x * h.ax + v.y * h.ay + v.z * h.az) / m2));
    v.x -= keep * h.ax; v.y -= keep * h.ay; v.z -= keep * h.az;
  }
  v.x += h.x; v.y += h.y; v.z += h.z; h.ax = h.x; h.ay = h.y; h.az = h.z;
  const k = Math.pow(.5, Math.max(0, dt) / SHOVE.half);
  h.x *= k; h.y *= k; h.z *= k;
  if (h.x * h.x + h.y * h.y + h.z * h.z < 1e-6) h.x = h.y = h.z = 0;
}
