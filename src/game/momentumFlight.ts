// Arcade energy flight. Steering rotates travel without lerping away speed; gravity does work along that travel.
// The character controller, collision slides and bounds remain downstream in Player. All rates are per second.
import { advanceVelocity, flightTarget, moving, type Intent, type Vec } from './motion';
export const FLIGHT = { cruise: 22, boost: 34, gravity: 26, thrust: 30, turnRate: 2.8, lateral: 100,
  drag: .016, quadratic: .0006, hover: 12, maxGlide: 72, overspeedDrag: .9, brake: 16 } as const;
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
/** Rotate toward demand on the unit sphere, preserving speed even in a broad turn. Opposite headings have a stable turn axis. */
function steer(v: Vec, d: Vec, speed: number, dt: number) {
  if (speed < .01) return d;
  const x = v.x / speed, y = v.y / speed, z = v.z / speed;
  const dot = clamp(x * d.x + y * d.y + z * d.z, -1, 1), angle = Math.acos(dot);
  const turn = Math.min(angle, FLIGHT.turnRate * dt, FLIGHT.lateral * dt / Math.max(8, speed));
  if (angle < 1e-6) return { x, y, z };
  let tx = d.x - x * dot, ty = d.y - y * dot, tz = d.z - z * dot, l = Math.hypot(tx, ty, tz);
  if (l < 1e-6) { tx = -z; ty = 0; tz = x; l = Math.hypot(tx, tz); if (l < 1e-6) { tx = 1; l = 1; } }
  const c = Math.cos(turn), s = Math.sin(turn) / l;
  return { x: x * c + tx * s, y: y * c + ty * s, z: z * c + tz * s };
}
/** Fresh velocity; fixed small integration steps keep energy/steering consistent across 30/60/120 Hz and dropped frames. */
export function momentumVelocity(v: Vec, i: Intent, yaw: number, pitch: number, flying: boolean, surge: boolean,
  elapsed: number, brake = false): Vec {
  if (!flying) return advanceVelocity(v, i, yaw, pitch, false, surge, elapsed);
  const result = { ...v }, total = Number.isFinite(elapsed) ? clamp(elapsed, 0, .1) : 0;
  const active = moving(i), target = flightTarget(i, yaw, pitch, true, false), n = Math.hypot(target.x, target.y, target.z);
  const d = n > 1e-6 ? { x: target.x / n, y: target.y / n, z: target.z / n } : { x: 0, y: 0, z: -1 };
  const effort = Math.min(1, Math.hypot(i.forward, i.strafe, i.vertical));
  const cruise = (surge ? FLIGHT.boost : FLIGHT.cruise) * effort;
  const count = Math.max(1, Math.ceil(total * 120)), dt = total / count;
  for (let k = 0; k < count; k++) {
    const speed = Math.hypot(result.x, result.y, result.z);
    if (brake || !active) {
      const factor = Math.exp(-(brake ? FLIGHT.brake : FLIGHT.hover) * dt);
      result.x *= factor; result.y *= factor; result.z *= factor;
      if (Math.hypot(result.x, result.y, result.z) < .04) result.x = result.y = result.z = 0;
      continue;
    }
    const dir = active ? steer(result, d, speed, dt) : speed > 0 ? { x: result.x / speed, y: result.y / speed, z: result.z / speed } : d;
    const thrust = active ? FLIGHT.thrust * Math.max(0, 1 - speed / Math.max(1, cruise))
      + FLIGHT.gravity * Math.max(0, i.vertical) * Math.max(0, dir.y) : 0;
    // A dive stores height as speed. Pulling up spends that speed; powered lift keeps low-speed flight forgiving.
    const gravity = -FLIGHT.gravity * dir.y * Math.min(1, speed / 8);
    const drag = FLIGHT.drag * speed + FLIGHT.quadratic * speed * speed;
    const overspeed = Math.max(0, speed - FLIGHT.maxGlide) * FLIGHT.overspeedDrag;
    const next = Math.max(0, speed + (thrust + gravity - drag - overspeed) * dt);
    result.x = dir.x * next; result.y = dir.y * next; result.z = dir.z * next;
  }
  return result;
}
