import { S, STEER, type SteerIn } from './limitLatch';
/**
 * Wedge fallback (limits plan S1): the suit presses on a solid, commands a heading, and does not move at all: a slab over a facade,
 * two faces whose normals flip step to step. The face nudge cannot pick a side there, so after wedgeS (0.6 s) of not moving it looks for
 * the way out itself: it probes the 16 compass directions for free space (`free`, up to 20 m), turns toward the most open one at the face
 * rate and levels the pitch (a wedge under a slab is not left upward), until it moves again or wedgeMaxS passes. Runs once per
 * wedge (one ring of probes), touches nothing when the suit moves.
 */
const TURN = Math.PI * 2 / 16, wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
/** True while the wedge owns yaw and pitch this step (the caller then skips the wall, face and peel nudges). */
export function wedgeSteer(rt: { yaw: number; pitch: number }, c: SteerIn, pitchFree: boolean): boolean {
  const touching = c.scrape.active || c.contact.active;
  const stuck = c.commanded > .5 && touching && c.speed < Math.max(.3, .08 * c.commanded);
  S.stuckGap = stuck ? 0 : S.stuckGap + c.dt; S.stuckT = S.stuckGap > STEER.gap ? 0 : S.stuckT + c.dt;
  if (S.wedge) { S.wedgeT += c.dt; if (c.speed > .4 * c.commanded || S.wedgeT > STEER.wedgeMaxS) { S.wedge = false; S.stuckT = 0; } }
  else if (S.stuckT > STEER.wedgeS && c.free) {
    // Compass directions, not offsets from the nose: the city's corridors are axis-aligned and a capsule only fits straight down one.
    let best = -1, bestAt = rt.yaw, bestOff = Infinity;
    for (let k = 0; k < 16; k++) {
      const yaw = k * TURN, off = Math.abs(wrap(yaw - rt.yaw)), d = c.free(-Math.sin(yaw), -Math.cos(yaw));
      if (d > best + .5 || (d > best - .5 && off < bestOff)) { best = Math.max(best, d); bestAt = yaw; bestOff = off; }
    }
    if (best >= STEER.wedgeFree) { S.wedge = true; S.wedgeT = 0; S.wedgeYaw = bestAt; }
  }
  if (!S.wedge) return false;
  const turn = wrap(S.wedgeYaw - rt.yaw), step = STEER.face * c.dt;
  rt.yaw += Math.sign(turn) * Math.min(Math.abs(turn), step);
  if (pitchFree) rt.pitch -= Math.sign(rt.pitch) * Math.min(Math.abs(rt.pitch), STEER.pitch * c.dt);
  return true;
}
