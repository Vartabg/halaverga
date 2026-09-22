// Combat movement (phase 1): ADS hover-strafe and the hip-fire speed clamp. Pure and landing-safe; motion.ts stays untouched.
import { SPEED, advanceVelocity, moving, safeDelta, type Intent, type Vec } from './motion';

/** ADS: 6 m/s strafe, 4 m/s climb, rate 12 capped at 110 m/s^2; ground walk at 70%; aiming up while moving forward climbs. */
export const AIM_MOVE = { speed: 6, vertical: 4, rate: 12, cap: 110, walk: .7, pitchLift: .5 } as const;
/** Hip fire above the 13 m/s clamp brakes at rate 9 capped at 60 m/s^2 until within `over` of it. */
export const HIP_MOVE = { rate: 9, cap: 60, over: .5 } as const;

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

/**
 * Hip-fire velocity: CLAMPS the flight target to 13 m/s (pointer and thumb cruise encode speed as forward = speed/34 with
 * surge on, so scaling would break them). Below the clamp it is advanceVelocity bit for bit.
 */
export function hipVelocity(v: Vec, i: Intent, yaw: number, pitch: number, flying: boolean, surge: boolean, elapsed: number): Vec {
  if (!flying) return advanceVelocity(v, i, yaw, pitch, flying, surge, elapsed);
  const active = moving(i), speed = surge && active ? SPEED.surge : SPEED.flight, cp = Math.cos(pitch);
  const dx = -Math.sin(yaw) * cp * i.forward + Math.cos(yaw) * i.strafe;
  const dy = Math.sin(pitch) * i.forward + i.vertical;
  const dz = -Math.cos(yaw) * cp * i.forward - Math.sin(yaw) * i.strafe;
  let k = active ? speed / Math.max(1, Math.hypot(dx, dy, dz)) : 0;
  const target = Math.hypot(dx, dy, dz) * k, current = Math.hypot(v.x, v.y, v.z), over = current > SPEED.flight + HIP_MOVE.over;
  if (target <= SPEED.flight && !over) return advanceVelocity(v, i, yaw, pitch, flying, surge, elapsed);
  if (target > SPEED.flight) k *= SPEED.flight / target;
  const dt = safeDelta(elapsed);
  const gain = 1 - Math.exp(-(over ? HIP_MOVE.rate : active ? 4 : 9) * dt);
  const next = { x: v.x + (dx * k - v.x) * gain, y: v.y + (dy * k - v.y) * gain, z: v.z + (dz * k - v.z) * gain };
  return limit(v, next, (over ? HIP_MOVE.cap : active ? 42 : 110) * dt);
}
