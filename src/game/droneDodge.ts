import { PHASE, SNAP, pushEvent, type DroneField, type ShooterState, type Vec3 } from './combat';
import { settle } from './presentation';
import type { DroneContext, DroneSim } from './drones';
// Drone dodge: side selection, TELEGRAPH (.22 s), DODGE (.35 s smootherstep) and PUNISH (.7 s). drones.ts owns the other phases.
export const DRONE = { alertRange: 70, loseRange: 85, loseAfter: 3, losInterval: .2, maxAlert: 3, orbitR: 3, orbitSpeed: 2.5, bobAmp: .15, bobHz: .8, eyeRate: 6, followRate: 4, homeReturn: 1.5, coneHip: 2.5, coneAds: 1.5, dwellMouse: .35, dwellTouch: .55, dwellTap: .8, nearMiss: 1.5, nearMissDwell: .15, telegraph: .22, dodgeDist: 4, dodgeTime: .35, punish: .7, cooldown: 3.5, cooldownJitter: .5, cooldownTouch: 4.5, tiltMax: .6, tiltRate: 12, breakAt: 3, weakDamage: 2, bodyDamage: 1, hitStop: .08, respawn: 8, flySpeed: 12, knockPeak: .25, knockW: 18, knockZ: .5, wobbleDeg: 8, wobbleW: 14, wobbleZ: .35, flashDecay: 25, tint: .35, tintHold: .3, tintDecay: 4, avoid: 4 } as const;
const G = 9.81, PRE_TILT = Math.tan(.5 * DRONE.tiltMax) * G;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
/** Exponential blend (dt clamped by settle) that lands exactly on the target inside SNAP. */
export function ease(v: number, target: number, rate: number, dt: number) {
  const r = settle(v, target, rate, dt);
  return Math.abs(target - r) < SNAP ? target : r;
}
/**
 * Leans drone i into a world-space horizontal acceleration (m/s^2), in its own yaw frame, as the renderer composes
 * Euler(tiltX, yaw, tiltZ, 'YXZ'): tiltX > 0 lifts the nose (so forward acceleration dips it), tiltZ > 0 rolls left.
 */
export function lean(f: DroneField, i: number, ax: number, az: number, dt: number) {
  const c = Math.cos(f.yaw[i]), s = Math.sin(f.yaw[i]), m = DRONE.tiltMax;
  const forward = -s * ax - c * az, right = c * ax - s * az;
  f.tiltX[i] = ease(f.tiltX[i], -clamp(Math.atan(forward / G), -m, m), DRONE.tiltRate, dt);
  f.tiltZ[i] = ease(f.tiltZ[i], -clamp(Math.atan(right / G), -m, m), DRONE.tiltRate, dt);
}
export const dodgeDwell = (ctx: DroneContext) => ctx.tier === 'tap' ? DRONE.dwellTap : ctx.tier === 'touch' ? DRONE.dwellTouch : DRONE.dwellMouse;
const probe: Vec3 = { x: 0, y: 0, z: 0 };
function tryDodge(f: DroneField, i: number, dx: number, dy: number, dz: number, clear: (a: Vec3, b: Vec3) => boolean) {
  const p = f.pos[i], d = DRONE.dodgeDist;
  // The probe runs 1 m past the landing point so the drone never ends flush against a wall.
  probe.x = p.x + dx * (d + 1); probe.y = p.y + dy * (d + 1); probe.z = p.z + dz * (d + 1);
  if (!clear(p, probe)) return false;
  const from = f.from[i], to = f.to[i];
  from.x = p.x; from.y = p.y; from.z = p.z; to.x = p.x + dx * d; to.y = p.y + dy * d; to.z = p.z + dz * d;
  return true;
}
/**
 * Chooses the dodge: 4 m along right = normalize(cross(aimDir, up)), on the side the drone already sits off the aim ray,
 * then the other side, then up, then down (only while that stays above 6 m). side[i] records 1/-1 along right, 2 up, -2 down.
 * All blocked: the drone stays ALERT with a 1 s cooldown and returns false.
 */
export function startTelegraph(s: ShooterState, sim: DroneSim, ctx: DroneContext, i: number, clear: (a: Vec3, b: Vec3) => boolean) {
  const f = s.drones, p = f.pos[i], a = ctx.aimDir, c = ctx.camera;
  let rx = -a.z, rz = a.x;
  const rl = Math.hypot(rx, rz);
  if (rl > 1e-9) { rx /= rl; rz /= rl; } else { rx = 1; rz = 0; }
  const px = p.x - c.x, py = p.y - c.y, pz = p.z - c.z, along = px * a.x + py * a.y + pz * a.z;
  const side = Math.sign((px - a.x * along) * rx + (pz - a.z * along) * rz) || (sim.rng() < .5 ? -1 : 1);
  let chosen = 0;
  if (tryDodge(f, i, rx * side, 0, rz * side, clear)) chosen = side;
  else if (tryDodge(f, i, -rx * side, 0, -rz * side, clear)) chosen = -side;
  else if (tryDodge(f, i, 0, 1, 0, clear)) chosen = 2;
  else if (p.y - DRONE.dodgeDist > 6 && tryDodge(f, i, 0, -1, 0, clear)) chosen = -2;
  if (!chosen) { f.cooldown[i] = 1; return false; }
  f.side[i] = chosen; f.phase[i] = PHASE.telegraph; f.phaseT[i] = 0; sim.dodger = i;
  pushEvent(s, 'telegraph', p, f.to[i], null, i);
  return true;
}
/** TELEGRAPH, DODGE and PUNISH for drone i (phaseT already advanced). Position is exact in DODGE, so frame rate never moves the end point. */
export function advanceDodge(s: ShooterState, sim: DroneSim, ctx: DroneContext, i: number, dt: number) {
  const f = s.drones, t = f.phaseT[i], from = f.from[i], to = f.to[i], p = f.pos[i];
  const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
  if (f.phase[i] === PHASE.telegraph) {
    // Pre-tilt: half the maximum lean toward the coming dodge (vertical dodges have no horizontal lean).
    const k = PRE_TILT / DRONE.dodgeDist;
    lean(f, i, dx * k, dz * k, dt);
    if (t >= DRONE.telegraph) { f.phase[i] = PHASE.dodge; f.phaseT[i] = 0; }
  } else if (f.phase[i] === PHASE.dodge) {
    const T = DRONE.dodgeTime, u = Math.min(1, t / T);
    if (u >= 1) {
      p.x = to.x; p.y = to.y; p.z = to.z;
      const h = f.home[i]; h.x += dx; h.y += dy; h.z += dz;
      f.phase[i] = PHASE.punish; f.phaseT[i] = 0;
      lean(f, i, 0, 0, dt);
      return;
    }
    const sm = u * u * u * (u * (u * 6 - 15) + 10), acc = (120 * u ** 3 - 180 * u * u + 60 * u) / (T * T);
    p.x = from.x + dx * sm; p.y = from.y + dy * sm; p.z = from.z + dz * sm;
    lean(f, i, dx * acc, dz * acc, dt);
  } else if (f.phase[i] === PHASE.punish && t >= DRONE.punish) {
    const touch = ctx.tier === 'touch' || ctx.tier === 'tap';
    f.phase[i] = PHASE.alert; f.phaseT[i] = 0; f.dwell[i] = 0;
    f.cooldown[i] = (touch ? DRONE.cooldownTouch : DRONE.cooldown) + (sim.rng() * 2 - 1) * DRONE.cooldownJitter;
    if (sim.dodger === i) sim.dodger = -1;
  }
}
