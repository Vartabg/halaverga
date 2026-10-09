import type { ShooterState, Vec3 } from './combat';
import { settleAngle } from './presentation';
import { DRONE } from './droneDodge';
// Steering limits for the drone brain (drones.ts): how fast an eye may turn and how hard a followed drone may accelerate.
export function face(s: ShooterState, i: number, x: number, y: number, z: number, dt: number) {
  const f = s.drones, h = Math.hypot(x, z);
  if (h + Math.abs(y) < 1e-6) return;
  f.yaw[i] = slew(f.yaw[i], settleAngle(f.yaw[i], Math.atan2(-x, -z), DRONE.eyeRate, dt), dt);
  f.pitch[i] = slew(f.pitch[i], settleAngle(f.pitch[i], Math.atan2(y, h), DRONE.eyeRate, dt), dt);
}
/** The eye turns at most DRONE.eyeSlew rad/s: a drone flown through no longer whips its eye about (16 rad/s before). */
const slew = (from: number, to: number, dt: number) => { const m = DRONE.eyeSlew * Math.min(dt, .05); return from + Math.max(-m, Math.min(m, to - from)); };
/** Caps the frame velocity change of a followed drone at DRONE.accelMax (m/s^2) by shortening this frame's step (p was moved from q). */
export function limitAccel(prev: Vec3, p: Vec3, qx: number, qy: number, qz: number, dt: number) {
  const dx = (p.x - qx) / dt - prev.x, dy = (p.y - qy) / dt - prev.y, dz = (p.z - qz) / dt - prev.z, change = Math.hypot(dx, dy, dz), max = DRONE.accelMax * dt;
  if (change <= max) return;
  const k = max / change;
  p.x = qx + (prev.x + dx * k) * dt; p.y = qy + (prev.y + dy * k) * dt; p.z = qz + (prev.z + dz * k) * dt;
}

/**
 * Pushes goal away from whatever the drone must clear: the hero, or the chase camera 1.5 m behind it (the nearer of the two). The push starts
 * at DRONE.avoid plus DRONE.avoidLead seconds of the camera's speed, so a fast fly-through is met earlier. `near` is the staggered PUNISH
 * drone: a fixed target, so it keeps the old hero-only 4 m reach at full gain (the camera is not its concern for the .7 s it holds).
 */
export function avoid(goal: Vec3, p: Vec3, player: Vec3, camera: Vec3, speed: number, near: boolean) {
  const toPlayer = Math.hypot(p.x - player.x, p.y - player.y, p.z - player.z), toCamera = Math.hypot(p.x - camera.x, p.y - camera.y, p.z - camera.z);
  const viaCamera = !near && toCamera - 1.5 < toPlayer, from = viaCamera ? camera : player, d = viaCamera ? toCamera : toPlayer, reach = viaCamera ? d - 1.5 : d;
  const radius = near ? DRONE.avoidNear : DRONE.avoid + DRONE.avoidLead * speed;
  if (reach >= radius || d <= 1e-6) return;
  const push = (near ? 1 : DRONE.avoidGain) * (radius - reach) / d;
  goal.x += (p.x - from.x) * push; goal.y += (p.y - from.y) * push; goal.z += (p.z - from.z) * push;
}
