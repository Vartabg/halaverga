import type { Vec3 } from './combat';
import { WORLD } from './motion';
// Combat approaches through the same airspace the player can explore, in world metres.
export const PATROL_SITES = [
  { id: 'threshold', name: 'Threshold', approach: { x: 0, y: 29, z: 38 } },
  { id: 'gorge', name: 'Watcher Gorge', approach: { x: -18, y: 44, z: -81 } },
  { id: 'sanctuary', name: 'High Sanctuary', approach: { x: 43, y: 82, z: -42 } },
] as const;
export type PatrolSite = typeof PATROL_SITES[number];
export type WatcherRole = 'scout' | 'dart' | 'lancer' | 'cantor';
// A figure-eight wobble on a horizontal ellipse. Indices identify the same Watcher for the life of the encounter.
export type Patrol = { id: string; site: PatrolSite['id']; role: WatcherRole; c: Vec3; r: Vec3; omega: number; phase: number };
export const PATROLS: readonly Patrol[] = [
  { id: 'terrace-greeter', site: 'threshold', role: 'dart', c: { x: 4, y: 25, z: 33 }, r: { x: 6, y: 1.2, z: 4 }, omega: .5, phase: 0 },
  { id: 'terrace-wing', site: 'threshold', role: 'scout', c: { x: -9, y: 28, z: 40 }, r: { x: 5, y: 1, z: 4 }, omega: .55, phase: 1.7 },
  { id: 'canal-mid', site: 'threshold', role: 'dart', c: { x: -6, y: 26, z: 24 }, r: { x: 4, y: 1.5, z: 6 }, omega: .5, phase: 3.1 },
  { id: 'viaduct-gap', site: 'threshold', role: 'scout', c: { x: 0, y: 30, z: -1 }, r: { x: 3, y: 1, z: 2.5 }, omega: .75, phase: .6 },
  { id: 'tower-orbit', site: 'sanctuary', role: 'dart', c: { x: 39, y: 82, z: -57 }, r: { x: 8, y: 1, z: 8 }, omega: .34, phase: 2.2 },
  { id: 'north-avenue', site: 'gorge', role: 'lancer', c: { x: 0, y: 42, z: -85 }, r: { x: 12, y: 1.5, z: 14 }, omega: .24, phase: .9 },
  { id: 'west-basin', site: 'sanctuary', role: 'scout', c: { x: 52, y: 81, z: -25 }, r: { x: 4, y: 1.4, z: 10 }, omega: .26, phase: 2.6 },
  { id: 'east-basin', site: 'gorge', role: 'cantor', c: { x: -34, y: 45, z: -98 }, r: { x: 4, y: 1.4, z: 10 }, omega: .25, phase: 4.1 },
];

export function sealedCount(mask: number) {
  let count = 0;
  for (let i = 0; i < PATROLS.length; i++) count += (mask >>> i) & 1;
  return count;
}
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
