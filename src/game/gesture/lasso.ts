// Motion-compensated lasso (spec 3.5). Each stroke sample is measured relative to where each candidate drone was on screen at the
// sample's own time (GestureTrack history), so a loop drawn around a drone that drifts during the stroke still winds around it.
// A drone locks when |winding| >= LASSO_DEG, or, when the stroke closes, if it sits within LASSO_NEAR_PX of the stroke (in the
// drone's own frame). At most LOCK_MAX locks, in lock order. Fixed typed arrays; nothing allocates per sample.
import type { DroneTarget } from '../combat';
import { droneTrack, trackAt, type DroneTrack, type TrackSample } from './screenRay';
import { LASSO_DEG, LASSO_NEAR_PX, LOCK_MAX, TRACK_DRONES, WINDING_SEG } from './tuning';

export type Lasso = {
  /** Signed winding per drone, degrees (+ = clockwise on screen). */
  winding: Float32Array;
  /** Last angle (rad) and last relative point per drone; has = 1 once the drone has a reference sample. */
  angle: Float32Array; relX: Float32Array; relY: Float32Array; firstX: Float32Array; firstY: Float32Array; has: Uint8Array;
  /** Smallest distance (px) from the drone to the stroke, in the drone's frame. */
  near: Float32Array;
  locked: Uint8Array;
  /** Locked drone indices in lock order; count of them. */
  locks: Int8Array; count: number;
};
export function createLasso(): Lasso {
  const f = () => new Float32Array(TRACK_DRONES);
  return { winding: f(), angle: f(), relX: f(), relY: f(), firstX: f(), firstY: f(), has: new Uint8Array(TRACK_DRONES),
    near: f().fill(Infinity), locked: new Uint8Array(TRACK_DRONES), locks: new Int8Array(LOCK_MAX).fill(-1), count: 0 };
}
/** Starts a new stroke. */
export function lassoBegin(L: Lasso) {
  L.winding.fill(0); L.has.fill(0); L.near.fill(Infinity); L.locked.fill(0); L.locks.fill(-1); L.count = 0;
}
function lock(L: Lasso, i: number) {
  if (L.locked[i] || L.count >= LOCK_MAX) return;
  L.locked[i] = 1; L.locks[L.count++] = i;
}
/** Distance from the origin to segment a-b. */
function segDist(ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  const u = l2 > 0 ? Math.min(1, Math.max(0, -(ax * dx + ay * dy) / l2)) : 0;
  return Math.hypot(ax + dx * u, ay + dy * u);
}
const pos: TrackSample = { x: 0, y: 0, r: 0 };

/**
 * One stroke sample at (x, y, t). For each candidate (alive && los now, visible at t) accumulates the signed angle change of
 * (sample - drone(t)); samples within WINDING_SEG px of the drone keep the previous angle. Returns the lock count.
 */
export function lassoSample(L: Lasso, x: number, y: number, t: number, targets: readonly DroneTarget[], count: number,
  tr: DroneTrack = droneTrack): number {
  const n = Math.min(count, targets.length, TRACK_DRONES);
  for (let i = 0; i < n; i++) {
    const g = targets[i];
    if (!g.alive || !g.los || !trackAt(tr, i, t, pos)) continue;
    const rx = x - pos.x, ry = y - pos.y;
    if (!L.has[i]) {
      L.has[i] = 1; L.firstX[i] = L.relX[i] = rx; L.firstY[i] = L.relY[i] = ry;
      L.angle[i] = Math.atan2(ry, rx); L.near[i] = Math.hypot(rx, ry);
      continue;
    }
    L.near[i] = Math.min(L.near[i], segDist(L.relX[i], L.relY[i], rx, ry));
    L.relX[i] = rx; L.relY[i] = ry;
    if (Math.hypot(rx, ry) < WINDING_SEG) continue;
    const a = Math.atan2(ry, rx);
    let d = a - L.angle[i];
    if (d > Math.PI) d -= 2 * Math.PI; else if (d < -Math.PI) d += 2 * Math.PI;
    L.angle[i] = a; L.winding[i] += d * 180 / Math.PI;
    if (Math.abs(L.winding[i]) >= LASSO_DEG) lock(L, i);
  }
  return L.count;
}
/**
 * Ends the stroke. When `closed` (the recogniser's closure test passed), every drone that has samples and sits within
 * LASSO_NEAR_PX of the stroke, including its closing segment, locks too (after the winding locks, nearest-first order is not
 * promised). Returns the lock count.
 */
export function lassoClose(L: Lasso, closed: boolean): number {
  if (!closed) return L.count;
  for (let i = 0; i < TRACK_DRONES; i++) {
    if (!L.has[i] || L.locked[i]) continue;
    const d = Math.min(L.near[i], segDist(L.relX[i], L.relY[i], L.firstX[i], L.firstY[i]));
    if (d <= LASSO_NEAR_PX) lock(L, i);
  }
  return L.count;
}
