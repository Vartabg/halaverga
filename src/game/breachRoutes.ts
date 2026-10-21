import type { Vec3 } from './combat';
/** Shared authored corridors: geometry and feedback describe places, never invisible buffs or scripted travel. */
export const BREACH = {
  low: { x: -49, y: 15, entry: 12, exit: -106, wallX: -36, wallZ: -57, wallLength: 64 },
  high: { x: 43, y: 70, entry: 5, exit: -68 },
  center: { x: 0, y: 38, z: -58 },
} as const;
export type BreachRoute = 'low' | 'high' | 'nave';
export function breachRoute(p: Vec3): BreachRoute {
  if (p.x < -37 && p.x > -65 && p.y >= 7 && p.y < 24 && p.z < 20 && p.z > -113) return 'low';
  if (p.x > 22 && p.x < 66 && p.y >= 63 && p.y < 93 && p.z < 20 && p.z > -85) return 'high';
  return 'nave';
}
export const ROUTE_COPY = {
  low: ['LOW PASSAGE', 'Stone breaks the volley · emerge to counter'],
  high: ['HIGH APPROACH', 'Dive into an opening · release to aim'],
  nave: ['THE BREACH', 'Low left: cover · high right: dive'],
} as const;
/** Inter-exchange repositioning changes elevation. Existing swept navigation remains the sole enemy translation owner. */
export function wardenElevation(i: number, turn: number, playerY: number) {
  return i === 5 ? Math.max(18, Math.min(78, playerY + .5)) : Math.max(30, Math.min(72, playerY + (turn % 2 ? 12 : -8)));
}
