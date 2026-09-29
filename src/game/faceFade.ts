import { smooth } from './limitLatch';
import type { LimitCue } from './limitCue';
// How visible each of the six district faces is (limits plan S4, limits review F3 + F10). Pure numbers: world/BoundaryFaces.tsx draws them.
//  - A wall fades in over `faceRange` (30 m at cruise, 60 m at surge: about 3.7 s and 1.8 s out) and is at full strength inside half of
//    that (15 m cruise, 30 m surge), so the nearest face is plainly there at 25 m surge and 15 m cruise. The review measured 0-2% of
//    pixels visibly changed at those distances with the old curve (20/40 m, smoothstep of the whole range).
//  - The floor and the sky face show only while the limit cue for them is on (closing on them by time, or the ceiling near): the
//    floor plane is the flying floor at 1.7 m, so a skim of the flooded boulevard at 3 m used to wash the whole street in grid.
//  - The nearest face is brightest; the others stay at 45%.
export type FaceKind = 'wall' | 'ceiling' | 'floor';
export const FACE_MAX = .8, OTHER = .45, EASE_S = .3;
export const faceRange = (speed: number) => 30 + 30 * smooth((speed - 8) / 26);
/** Target strength 0..FACE_MAX of one face: gap m from the suit, `speed` m/s, whether it is the nearest face, and the current limit cue. */
export function faceTarget(kind: FaceKind, gap: number, speed: number, nearest: boolean, cue: LimitCue): number {
  if (kind !== 'wall' && cue !== kind) return 0;
  const range = faceRange(speed);
  return smooth((range - gap) / (range / 2)) * (nearest ? 1 : OTHER) * FACE_MAX;
}
/** One frame of easing toward the target (a cue that flickers must not flicker the picture). */
export const easeFace = (level: number, target: number, dt: number) => level + Math.max(-dt / EASE_S, Math.min(dt / EASE_S, target - level));
