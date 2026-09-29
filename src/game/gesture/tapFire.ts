// Tap a drone to blast it: the pick and the aimed burst the Gesture Lab fires, shared with the classic one thumb on Standard
// (Garo 2026-09-26). Pure, allocation-free after load, touch/scene chunk only: never on the landing first load.
import { runtime } from '../runtime';
import { useGame } from '../store';
import { queueAimedBurst } from './aimedShot';
import { labAimFrame } from './screenRay';
import { pick, tapRay } from './tapBlast';

const dir = { x: 0, y: 0, z: -1 };
/** The drone under a screen point at time t (performance.now ms), or -1. Reads the GestureTrack history (empty: -1). */
export const pickAt = (x: number, y: number, t: number) => pick(x, y, t, runtime.shooter.targets, runtime.shooter.drones.count);
/**
 * The aimed BURST_SHOTS burst (or `n` shots) at `drone` through the published camera frame (aimedShot: the cannon arm, beam, hit
 * marker and choreography follow it); drone -1 is a miss shot along the tap ray. Reads the blaster setting itself and returns false
 * (nothing fired) with the blaster off, so no caller can queue a burst past the setting.
 */
export function blastAt(x: number, y: number, drone: number, n?: number): boolean {
  if (!useGame.getState().shooter) return false;
  const s = runtime.shooter;
  if (labAimFrame.t > 0) tapRay(labAimFrame, x, y, dir); else { dir.x = s.aim.dir.x; dir.y = s.aim.dir.y; dir.z = s.aim.dir.z; }
  queueAimedBurst(s, dir, drone, n);
  return true;
}
