// Tap to Blast target pick (spec 3.3): which drone a tap at (px, py, t) means, if any. The finger aims, so the pick is generous
// (R_eff = max(silhouette + R_EFF_PAD, R_EFF_MIN)) and it also tests where each drone was GHOST_MS ago, so a tap that trails a
// moving drone still lands. Pure, allocation-free; reads the GestureTrack history (screenRay.ts).
import type { DroneTarget } from '../combat';
import type { Vec } from '../motion';
import { droneTrack, trackAt, unproject, type DroneTrack, type TrackSample } from './screenRay';
import { GHOST_MS, R_EFF_MIN, R_EFF_PAD, TRACK_DRONES } from './tuning';
import type { AimFrame } from './types';

/** Effective tap radius (px) for a projected silhouette radius (px). */
export const rEff = (silhouettePx: number) => Math.max(silhouettePx + R_EFF_PAD, R_EFF_MIN);

/** Details of the last pick, for the hit marker and telemetry: drone (-1 on a miss), score d/R_eff, ghost = won by the 80 ms position. */
export const lastPick = { drone: -1, score: Infinity, ghost: false };
const now: TrackSample = { x: 0, y: 0, r: 0 }, past: TrackSample = { x: 0, y: 0, r: 0 };

/** d / R_eff of a tap against one track sample. */
const scoreOf = (s: TrackSample, px: number, py: number) => Math.hypot(px - s.x, py - s.y) / rEff(s.r);

/**
 * The drone the tap picks, or -1. Candidates are targets with alive && los right now; each is scored at time t and at
 * t - GHOST_MS, and the smallest d / R_eff that is <= 1 wins.
 */
export function pick(px: number, py: number, t: number, targets: readonly DroneTarget[], count: number, tr: DroneTrack = droneTrack): number {
  let best = -1, bestScore = Infinity, ghost = false;
  const n = Math.min(count, targets.length, TRACK_DRONES);
  for (let i = 0; i < n; i++) {
    const g = targets[i];
    if (!g.alive || !g.los) continue;
    const a = trackAt(tr, i, t, now) ? scoreOf(now, px, py) : Infinity;
    const b = trackAt(tr, i, t - GHOST_MS, past) ? scoreOf(past, px, py) : Infinity;
    const s = Math.min(a, b);
    if (s <= 1 && s < bestScore) { best = i; bestScore = s; ghost = b < a; }
  }
  lastPick.drone = best; lastPick.score = bestScore; lastPick.ghost = best >= 0 && ghost;
  return best;
}
/** True when (px, py) is inside some candidate's R_eff at t (the arbiter's arm test on down). */
export const onDrone = (px: number, py: number, t: number, targets: readonly DroneTarget[], count: number, tr: DroneTrack = droneTrack) =>
  pick(px, py, t, targets, count, tr) >= 0;
/** The miss-shot direction for a tap: the unit camera ray through (px, py). */
export const tapRay = (f: AimFrame, px: number, py: number, out: Vec) => unproject(f, px, py, out);
