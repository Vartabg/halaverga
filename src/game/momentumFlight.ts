// Arcade energy flight with weight (Garo 2026-11-11: "the flight mechanics make no sense"; docs/plans/2026-11-11-flight-weight.md).
// Steering turns the travel without lerping away speed, and gravity does work along it. A turn round has an arc and a cost. Letting
// go is a flare over a distance, not a freeze. The character controller, collision slides and bounds remain downstream in Player.
// All rates are per second.
import { advanceVelocity, flightTarget, moving, type Intent, type Vec } from './motion';
/** turnRate: the fastest the travel turns (rad/s). turnG / pullG: the most sideways and up-and-down acceleration (m/s2) a turn may
 * use, so fast flight goes round in a wide arc but still pulls out of a dive. turnCost: speed lost (m/s2) per m/s2 of sideways
 * turn. flare + flareAir x speed^2, brake + brakeAir x speed^2: the stop (m/s2) on release and on Brake: spread wings, a floor
 * plus the air on them. */
export const FLIGHT = { cruise: 22, boost: 34, gravity: 26, thrust: 30, turnRate: 2.8, turnG: 36, pullG: 100, turnCost: .3,
  drag: .016, quadratic: .0006, maxGlide: 72, overspeedDrag: .9, flare: 12, flareAir: .015, brake: 26, brakeAir: .02 } as const;
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const turned: Vec = { x: 0, y: 0, z: 0 }, flat: Vec = { x: 0, y: 0, z: 0 };
/** The sideways acceleration (m/s2) the last steer used. */
let side = 0;
/**
 * Turns the travel toward the demand, its heading and its climb angle each under their own limit, and keeps the speed. Going
 * straight up or down the travel has no heading and takes the demand's; a demand straight up or down leaves the heading alone;
 * with neither, the view's (`yaw`) stands in, never a world axis. The result is reused.
 */
function steer(v: Vec, d: Vec, speed: number, dt: number, yaw: number): Vec {
  side = 0;
  if (speed < .01) return d;
  const x = v.x / speed, y = v.y / speed, z = v.z / speed, own = Math.hypot(x, z), level = speed * own;
  const to = Math.hypot(d.x, d.z) > 1e-4 ? Math.atan2(-d.x, -d.z) : own > 1e-4 ? Math.atan2(-x, -z) : yaw, from = own > 1e-4 ? Math.atan2(-x, -z) : to;
  const round = Math.min(FLIGHT.turnRate, FLIGHT.turnG / Math.max(8, level)) * dt, pull = Math.min(FLIGHT.turnRate, FLIGHT.pullG / Math.max(8, speed)) * dt;
  const turn = clamp(wrap(to - from), -round, round), climb = Math.asin(clamp(y, -1, 1));
  const angle = climb + clamp(Math.asin(clamp(d.y, -1, 1)) - climb, -pull, pull), c = Math.cos(angle);
  if (dt > 0) side = level * Math.abs(turn) / dt;
  turned.x = -Math.sin(from + turn) * c; turned.y = Math.sin(angle); turned.z = -Math.cos(from + turn) * c;
  return turned;
}
/** Fresh velocity; fixed small integration steps keep energy/steering consistent across 30/60/120 Hz and dropped frames. */
export function momentumVelocity(v: Vec, i: Intent, yaw: number, pitch: number, flying: boolean, surge: boolean,
  elapsed: number, brake = false): Vec {
  if (!flying) return advanceVelocity(v, i, yaw, pitch, false, surge, elapsed);
  const result = { ...v }, total = Number.isFinite(elapsed) ? clamp(elapsed, 0, .1) : 0;
  if (total === 0) return result;
  const active = moving(i), target = flightTarget(i, yaw, pitch, true, false), n = Math.hypot(target.x, target.y, target.z);
  const d = n > 1e-6 ? { x: target.x / n, y: target.y / n, z: target.z / n } : { x: 0, y: 0, z: -1 };
  const effort = Math.min(1, Math.hypot(i.forward, i.strafe, i.vertical)), upright = Math.hypot(d.x, d.z) <= 1e-4;
  const cruise = (surge ? FLIGHT.boost : FLIGHT.cruise) * effort;
  const count = Math.max(1, Math.ceil(total * 120)), dt = total / count;
  for (let k = 0; k < count; k++) {
    const speed = Math.hypot(result.x, result.y, result.z);
    if (brake || !active) {
      // The flare: wings spread against the travel. It only ever slows, to exactly nothing, and no gravity is added (nothing falls
      // unasked). Its line levels out as it goes: fully once half its speed is level, not at all close to straight up or down,
      // where it stops on its line, and stops harder (a release there is as hard as Brake: the whole wing is against the air).
      const across = Math.hypot(result.x, result.z), own = speed > 0 ? across / speed : 0, steep = speed > 0 ? (result.y / speed) ** 2 : 0;
      let dir = d;
      if (own > .15) {
        const u = clamp((own - .15) / .35, 0, 1), a = Math.asin(clamp(result.y / speed, -1, 1)) * (1 - u * u * (3 - 2 * u)), c = Math.cos(a);
        flat.x = result.x / across * c; flat.y = Math.sin(a); flat.z = result.z / across * c; dir = steer(result, flat, speed, dt, yaw);
      } else if (speed > 0) { turned.x = result.x / speed; turned.y = result.y / speed; turned.z = result.z / speed; dir = turned; }
      const hard = brake ? 1 : steep, cut = FLIGHT.flare + (FLIGHT.brake - FLIGHT.flare) * hard + (FLIGHT.flareAir + (FLIGHT.brakeAir - FLIGHT.flareAir) * hard) * speed * speed;
      const left = Math.max(0, speed - cut * dt);
      result.x = dir.x * left; result.y = dir.y * left; result.z = dir.z * left;
      continue;
    }
    // Rise against a fall, or Descend against a climb, that is close to straight up or down: there is no level heading worth
    // looping through (that flung the angel sideways), so it stops on its line first, wings and flare together, then goes back.
    if (upright && d.y * result.y < 0 && Math.hypot(result.x, result.z) < .35 * speed) {
      const k = Math.max(0, speed - (FLIGHT.thrust + FLIGHT.brake + FLIGHT.brakeAir * speed * speed) * dt) / speed;
      result.x *= k; result.y *= k; result.z *= k;
      continue;
    }
    const dir = steer(result, d, speed, dt, yaw);
    const thrust = FLIGHT.thrust * Math.max(0, 1 - speed / Math.max(1, cruise)) + FLIGHT.gravity * Math.max(0, i.vertical) * Math.max(0, dir.y);
    // A dive stores height as speed. Pulling up spends that speed; powered lift keeps low-speed flight forgiving.
    const gravity = -FLIGHT.gravity * dir.y * Math.min(1, speed / 8);
    const drag = FLIGHT.drag * speed + FLIGHT.quadratic * speed * speed;
    const overspeed = Math.max(0, speed - FLIGHT.maxGlide) * FLIGHT.overspeedDrag;
    const next = Math.max(0, speed + (thrust + gravity - drag - overspeed - FLIGHT.turnCost * side) * dt);
    result.x = dir.x * next; result.y = dir.y * next; result.z = dir.z * next;
  }
  return result;
}
