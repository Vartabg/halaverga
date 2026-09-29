// Combat movement (phase 1): the ADS hover-strafe only. The hip-fire speed clamp is gone (Garo 2026-09-26: firing never brakes
// flight). Pure and landing-safe; motion.ts stays untouched.
import { SPEED, safeDelta, type Intent, type Vec } from './motion';

/** ADS: 6 m/s strafe, 4 m/s climb, rate 12 capped at 110 m/s^2; ground walk at 70%; aiming up while moving forward climbs. */
export const AIM_MOVE = { speed: 6, vertical: 4, rate: 12, cap: 110, walk: .7, pitchLift: .5 } as const;

/** ADS velocity. Same contract as advanceVelocity (fresh object). Half a stick throw is full ADS speed: a precision hover. */
export function aimVelocity(v: Vec, i: Intent, yaw: number, pitch: number, flying: boolean, elapsed: number): Vec {
  const dt = safeDelta(elapsed), f = i.forward, s = i.strafe, sy = Math.sin(yaw), cy = Math.cos(yaw);
  let hx = -sy * f + cy * s, hz = -cy * f - sy * s;
  const mag = Math.hypot(hx, hz);
  const gain = 1 - Math.exp(-AIM_MOVE.rate * dt);
  if (!flying) {
    const k = mag > 1 ? SPEED.walk * AIM_MOVE.walk / mag : SPEED.walk * AIM_MOVE.walk;
    return { x: v.x + (hx * k - v.x) * gain, y: Math.max(-20, v.y - 22 * dt), z: v.z + (hz * k - v.z) * gain };
  }
  if (mag > 1e-6) { const k = Math.min(1, 2 * mag) / mag; hx *= k; hz *= k; }
  const up = Math.max(-1, Math.min(1, i.vertical + AIM_MOVE.pitchLift * Math.sin(pitch) * f));
  const next = {
    x: v.x + (hx * AIM_MOVE.speed - v.x) * gain,
    y: v.y + (up * AIM_MOVE.vertical - v.y) * gain,
    z: v.z + (hz * AIM_MOVE.speed - v.z) * gain,
  };
  return limit(v, next, AIM_MOVE.cap * dt);
}

/** Scales next - v down to at most `max` in length (in place). */
function limit(v: Vec, next: Vec, max: number) {
  const change = Math.hypot(next.x - v.x, next.y - v.y, next.z - v.z);
  if (change > max) {
    const r = max / change;
    next.x = v.x + (next.x - v.x) * r; next.y = v.y + (next.y - v.y) * r; next.z = v.z + (next.z - v.z) * r;
  }
  return next;
}
