import type { Vec3 } from './combat';
import { WORLD } from './motion';
import { wardenPath, wardenSegment } from './wardenMath';
import { segmentDistance } from './celestialBattle';
export const PURSUIT = { leash: 100, disengage: 95, lost: 5, acceleration: 22, replan: .7, beat: 1.6 } as const;
const candidate: Vec3 = { x: 0, y: 0, z: 0 };
const distance = (a: Vec3, b: Vec3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const avoidsAngel = (from: Vec3, to: Vec3, player: Vec3) => distance(from, player) < 5
  ? distance(to, player) >= distance(from, player) : segmentDistance(from, to, player) >= 5;
const outside = (p: Vec3, home: Vec3) => Math.max(0, WORLD.minX + 8 - p.x, p.x - WORLD.maxX + 8)
  + Math.max(0, WORLD.minZ + 8 - p.z, p.z - WORLD.maxZ + 8) + Math.max(0, 16 - p.y, p.y - WORLD.ceiling + 10)
  + Math.max(0, distance(p, home) - PURSUIT.leash);
const bounded = (p: Vec3, home: Vec3) => {
  p.x = Math.max(WORLD.minX + 8, Math.min(WORLD.maxX - 8, p.x)); p.z = Math.max(WORLD.minZ + 8, Math.min(WORLD.maxZ - 8, p.z));
  p.y = Math.max(16, Math.min(WORLD.ceiling - 10, p.y));
  const x = p.x - home.x, y = p.y - home.y, z = p.z - home.z, d = Math.hypot(x, y, z);
  if (d > PURSUIT.leash) { p.x = home.x + x / d * PURSUIT.leash; p.y = home.y + y / d * PURSUIT.leash; p.z = home.z + z / d * PURSUIT.leash; }
};
/** Seek an entire clear body corridor first. A short lateral/vertical waypoint can get around cover without crossing it. */
export function findWardenRoute(from: Vec3, desired: Vec3, home: Vec3, player: Vec3, side: number, out: Vec3) {
  const x = desired.x - from.x, z = desired.z - from.z, length = Math.hypot(x, z) || 1, rx = z / length, rz = -x / length;
  for (let n = 0; n < 9; n++) {
    const turn = n === 0 ? 0 : n % 2 ? side : -side, extent = n < 3 ? 8 : n < 5 ? 15 : 8;
    const short = n >= 5;
    candidate.x = (short ? from.x + x / length * Math.min(5, length) : desired.x) + rx * turn * (n ? extent : 0);
    candidate.z = (short ? from.z + z / length * Math.min(5, length) : desired.z) + rz * turn * (n ? extent : 0);
    candidate.y = short ? from.y + (n < 7 ? 6 : -6) : desired.y;
    bounded(candidate, home);
    if (!avoidsAngel(from, candidate, player) || !wardenPath(from, candidate) || !short && !wardenSegment(candidate, player)) continue;
    Object.assign(out, candidate); return true;
  }
  Object.assign(out, from); return false;
}
/** Acceleration-limited travel, swept every physics step. Newly introduced cover immediately stops translation. */
export function moveWarden(from: Vec3, goal: Vec3, velocity: Vec3, home: Vec3, speed: number, dt: number, player: Vec3) {
  const x = goal.x - from.x, y = goal.y - from.y, z = goal.z - from.z, d = Math.hypot(x, y, z);
  const k = d > 1e-6 ? Math.min(speed, d * 4) / d : 0;
  const ax = x * k - velocity.x, ay = y * k - velocity.y, az = z * k - velocity.z, delta = Math.hypot(ax, ay, az);
  const u = delta > 0 ? Math.min(1, PURSUIT.acceleration * dt / delta) : 0;
  velocity.x += ax * u; velocity.y += ay * u; velocity.z += az * u;
  candidate.x = from.x + velocity.x * dt; candidate.y = from.y + velocity.y * dt; candidate.z = from.z + velocity.z * dt;
  // A rush may have ended below the preferred flight band: return gradually, never clamp/teleport the body into it.
  if (outside(candidate, home) > outside(from, home) + 1e-6 || !avoidsAngel(from, candidate, player) || !wardenPath(from, candidate)) {
    velocity.x = velocity.y = velocity.z = 0; return -1;
  }
  const moved = Math.hypot(candidate.x - from.x, candidate.y - from.y, candidate.z - from.z); Object.assign(from, candidate); return moved;
}
