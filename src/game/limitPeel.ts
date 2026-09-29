import { FLIGHT_FLOOR, WORLD } from './motion';
import { S, STEER, wallGap, type SteerIn } from './limitLatch';
/**
 * Pitch peel: nosed into the ceiling, the water or a roof or street, the suit levels off and rises away; the latch holds until it
 * points clear. A steep dive (over 0.35 rad) inside 4 m of the ceiling or water starts it at once; a shallow one (over 0.03 rad, the
 * default pitch of -0.12 sinks onto the water) starts after the suit has pushed against the surface for 0.25 s, so a quick skim stays.
 * `tp` is the pitch the suit is travelling at (from the commanded velocity, so backing up does not count as diving). Once the peel is
 * done and the suit has gained settleRise (20 m: 2 s of a 13 m/s climb) from where it finished, clear of every surface and latch, the
 * view levels back to 0 (settle): it used to stay at +/-0.8 rad, which climbed to the sky limit and dived to the water in a loop.
 */
export function peelPitch(rt: { pitch: number }, c: SteerIn, tp: number) {
  const n = c.contact, ceil = WORLD.ceiling - c.p.y, floor = c.p.y - FLIGHT_FLOOR, pitch = rt.pitch;
  const steep = ceil < STEER.peelZone && tp > STEER.peelInto ? 1 : floor < STEER.peelZone && tp < -STEER.peelInto ? -1 : 0;
  const stuck = S.wall || S.face, down = tp < -STEER.touchInto || stuck, upward = tp > STEER.touchInto || stuck;
  const touch = ceil < STEER.touch && upward ? 1 : floor < STEER.touch && down ? -1
    : n.active && n.normal.y < -.5 && upward ? 1 : n.active && n.normal.y > .5 && down ? -1
    // A face beside the suit and a district wall within a few metres (the hill and perimeter slot): the only way out is up.
    : n.active && Math.abs(n.normal.y) < .5 && Math.min(...wallGap(c.p)) < STEER.zone + 2 ? -1 : 0;
  S.leaveT = Math.max(0, S.leaveT - c.dt);
  S.touchGap = touch && c.commanded > .5 ? 0 : S.touchGap + c.dt; S.touchT = S.touchGap > STEER.gap ? 0 : S.touchT + c.dt;
  // A face latched beside the suit inside the perimeter zone is the slot between a hill and the district wall: yaw alone only bounces
  // between the two, so the peel starts at once (the face latch already means it pressed for 0.3 s).
  const slot = S.face && Math.abs(S.fy) < .5 && Math.min(...wallGap(c.p)) < STEER.zone + 2 ? -1 : 0;
  const up = steep || slot || (S.touchT > STEER.touchS ? touch : 0);
  // Under an overhang the suit only levels off (never dives back down at the street it just left); the ceiling and water dive away.
  const district = ceil < STEER.touch || floor < STEER.touch || ceil < STEER.peelZone || floor < STEER.peelZone;
  if (up) { S.peel = up; S.peelLost = 0; S.shallow = up > 0 && !district; S.settle = false; } else if (S.peel) S.peelLost += c.dt;
  if (S.peel && S.peelLost > .6) { S.peel = 0; S.settle = true; S.y0 = c.p.y; }
  if (S.peel) {
    const target = S.shallow ? 0 : -S.peel * STEER.peelTarget, step = STEER.pitch * c.dt;
    if ((S.peel > 0 && pitch <= target) || (S.peel < 0 && pitch >= target)) { S.leave = S.peel; S.leaveT = 1.2; S.peel = 0; S.settle = true; S.y0 = c.p.y; return; }
    rt.pitch += Math.sign(target - pitch) * Math.min(step, Math.abs(target - pitch));
    return;
  }
  if (!S.settle) return;
  if (Math.abs(c.p.y - S.y0) < STEER.settleRise || ceil < STEER.settleClear || floor < STEER.settleClear || n.active || S.wall || S.face) return;
  const step = STEER.settle * c.dt;
  if (Math.abs(pitch) <= step) { rt.pitch = 0; S.settle = false; } else rt.pitch -= Math.sign(pitch) * step;
}
