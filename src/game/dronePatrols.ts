import type { Vec3 } from './combat';
import { WORLD } from './motion';
// Patrol loops for the rogue 2033 security drones: a figure-eight wobble (y at twice the rate) on a horizontal ellipse.
// Every path clears the city solids by >= 5.7 m and the building route by >= 5 m (tests/drone-patrol.test.ts).
export type Patrol = { id: string; c: Vec3; r: Vec3; omega: number; phase: number };
export const PATROLS: readonly Patrol[] = [
  // Tutorial drone: c moved (-3, 0, -3) to stay inside the 25 deg spawn cone (23.3 deg) and 5.7 m off the departure route.
  { id: 'terrace-greeter', c: { x: 4, y: 25, z: 33 }, r: { x: 6, y: 1.2, z: 4 }, omega: .5, phase: 0 },
  // Starting values: 13.4 m from solids, 7.2 m from the route, 3.0 m/s peak.
  { id: 'terrace-wing', c: { x: -9, y: 28, z: 40 }, r: { x: 5, y: 1, z: 4 }, omega: .55, phase: 1.7 },
  // Starting values: 12.0 m from solids, 6.8 m from the route, 3.4 m/s peak.
  { id: 'canal-mid', c: { x: -6, y: 16, z: 24 }, r: { x: 4, y: 1.5, z: 6 }, omega: .5, phase: 3.1 },
  // omega .7 -> .75 lifts the peak from 2.52 to 2.70 m/s; 8.4 m from solids.
  { id: 'viaduct-gap', c: { x: 0, y: 21, z: -1 }, r: { x: 3, y: 1, z: 2.5 }, omega: .75, phase: .6 },
  // c.y 70 -> 75: the route's ascent -> roof leg runs at y 69 through the ring (1 m at y 70); now 12.7-14.7 m above the roof.
  { id: 'tower-orbit', c: { x: 36, y: 75, z: -38 }, r: { x: 18, y: 1, z: 18 }, omega: .18, phase: 2.2 },
];
export function patrolPosition(p: Patrol, t: number, out: Vec3): Vec3 {
  const a = p.omega * t + p.phase;
  out.x = p.c.x + p.r.x * Math.cos(a); out.y = p.c.y + p.r.y * Math.sin(2 * a); out.z = p.c.z + p.r.z * Math.sin(a);
  return out;
}
/** Numeric peak speed (m/s) of the analytic velocity over one period. */
export function patrolPeakSpeed(p: Patrol): number {
  let peak = 0;
  for (let n = 0; n < 2048; n++) {
    const a = n / 2048 * 2 * Math.PI, w = p.omega;
    peak = Math.max(peak, Math.hypot(p.r.x * w * Math.sin(a), 2 * p.r.y * w * Math.cos(2 * a), p.r.z * w * Math.cos(a)));
  }
  return peak;
}
const FLY_OUT = 50, FLY_UP = 10, FLY_MARGIN = 6, FLY_CEILING = 95;
/** Respawn fly-in start for candidate k (0..7): 50 m out from the arrival point, away from the player, turned 0, +45, -45, +90... deg. */
export function flyInStart(arrival: Vec3, player: Vec3, k: number, out: Vec3): Vec3 {
  let dx = arrival.x - player.x, dz = arrival.z - player.z;
  const len = Math.hypot(dx, dz);
  if (len > 1e-6) { dx /= len; dz /= len; } else { dx = 0; dz = -1; }
  const step = Math.ceil(k / 2), turn = step * Math.PI / 4 * (k % 2 ? 1 : -1);
  const c = Math.cos(turn), s = Math.sin(turn), rx = dx * c + dz * s, rz = -dx * s + dz * c;
  out.x = Math.min(WORLD.maxX - FLY_MARGIN, Math.max(WORLD.minX + FLY_MARGIN, arrival.x + rx * FLY_OUT));
  out.y = Math.min(FLY_CEILING, WORLD.ceiling - FLY_MARGIN, arrival.y + FLY_UP);
  out.z = Math.min(WORLD.maxZ - FLY_MARGIN, Math.max(WORLD.minZ + FLY_MARGIN, arrival.z + rz * FLY_OUT));
  return out;
}
