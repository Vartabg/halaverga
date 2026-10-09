import { FLIGHT_FLOOR, WORLD, type Vec } from './motion';
// Which limit the suit is about to meet, decided by time as well as distance (limits plan S3). The old cue was a fixed 12 m: at surge
// that is 0.35 s from the wall, and the floor and every solid had none. Now a limit cues when it is under NEAR_M away, or when the
// closing speed reaches it inside CUE_S seconds; a solid ahead cues from LOOK_S seconds out (FlightSafety.anticipate's long sweep).
// Pure numbers: Player feeds it every step, the headless harness (tests/lim/harness.ts) calls the same function.
export const NEAR_M = 12, NEAR_STILL_M = 4, CUE_S = 2.5, FLOOR_CUE_S = 3, LOOK_S = 2.5, MIN_CLOSING = .5, MIN_INCIDENCE = .35;
export type LimitCue = '' | 'wall' | 'ceiling' | 'floor' | 'solid';
export interface Ahead { time: number; incidence: number }
/** Score: below 1 means the cue is on; the smaller, the sooner the suit reaches it (the nearest limit names itself). */
const urgency = (distance: number, closing: number, near: boolean, horizon = CUE_S) => {
  const on = closing > MIN_CLOSING, byTime = on ? distance / closing / horizon : Infinity, byDistance = near ? distance / (on ? NEAR_M : NEAR_STILL_M) : Infinity;
  return Math.min(byTime, byDistance);
};
/**
 * p: position, v: last step's velocity. ahead: the solid sweep's nearest hit (null for none). limiting: the clearance assist changed
 * the velocity this step. Walls and the ceiling also cue when merely near (as the old hint did): under 12 m while closing on them, under
 * 4 m otherwise (pinned or scraping), so a suit already turned away, or running along an edge, is not told the edge is ahead. The floor
 * only when the suit closes on it (3 s ahead, not 2.5: the sink builds up as the velocity eases to the command, and the review measured 1.77 s
 * from cue to contact at cruise), or a low cruise over the water would show it all the time.
 */
export function limitCue(p: Vec, v: Vec, ahead: Ahead | null, limiting: boolean): LimitCue {
  let best = 1, cue: LimitCue = '';
  const take = (kind: LimitCue, score: number) => { if (score < best) { best = score; cue = kind; } };
  take('wall', urgency(p.x - WORLD.minX, -v.x, true)); take('wall', urgency(WORLD.maxX - p.x, v.x, true));
  take('wall', urgency(p.z - WORLD.minZ, -v.z, true)); take('wall', urgency(WORLD.maxZ - p.z, v.z, true));
  take('ceiling', urgency(WORLD.ceiling - p.y, v.y, true)); take('floor', urgency(p.y - FLIGHT_FLOOR, -v.y, false, FLOOR_CUE_S));
  if (cue) return cue;
  return limiting || (ahead && ahead.incidence > MIN_INCIDENCE && ahead.time < LOOK_S) ? 'solid' : '';
}
