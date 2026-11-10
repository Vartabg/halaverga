import type { ShooterState, Vec3 } from './combat';
import { NAV, type Wardens } from './wardenState';
import { findWardenRoute, moveWarden, PURSUIT } from './wardenSteering';
import { clearOfGround, wardenElevation } from './wardenElevation';
const goal: Vec3 = { x: 0, y: 0, z: 0 };
export function stopWardenNavigation(w: Wardens, i: number) {
  w.navMode[i] = NAV.none; const v = w.navVelocity[i]; v.x = v.y = v.z = 0;
}
export function beginWardenNavigation(w: Wardens, s: ShooterState, i: number) {
  if (!w.navSet[i]) { w.navSet[i] = 1; Object.assign(w.navHome[i], s.drones.pos[i]); }
}
/** Existing held ownership disables the patrol motor. Tells and earned recovery never call this movement step. */
export function stepWardenNavigation(w: Wardens, s: ShooterState, i: number, player: Vec3, dt: number) {
  const p = s.drones.pos[i], x = p.x - player.x, z = p.z - player.z, d = Math.hypot(x, z) || 1;
  beginWardenNavigation(w, s, i); s.drones.held[i] = 1;
  w.relocate[i] = Math.max(0, w.relocate[i] - dt); w.navTime[i] -= dt;
  if (w.navTime[i] <= 0) {
    const mode = i === 5 ? d > 17 ? NAV.chase : d < 6 ? NAV.retreat : NAV.flank : d < 22 ? NAV.retreat : d > 36 ? NAV.chase : NAV.flank;
    const side = w.turns[i] % 2 ? 1 : -1, turn = mode === NAV.flank ? side * .65 : mode === NAV.retreat ? side * .3 : side * .12;
    const c = Math.cos(turn), sn = Math.sin(turn), radius = i === 5 ? 10 : 27;
    const leadX = i === 5 ? Math.max(-6, Math.min(6, (player.x - w.previous.x) / dt * .25)) : 0;
    const leadZ = i === 5 ? Math.max(-6, Math.min(6, (player.z - w.previous.z) / dt * .25)) : 0;
    goal.x = player.x + leadX + (x * c + z * sn) / d * radius;
    goal.z = player.z + leadZ + (z * c - x * sn) / d * radius;
    goal.y = clearOfGround(goal.x, wardenElevation(i, w.turns[i], player.y), goal.z);
    w.navMode[i] = findWardenRoute(p, goal, w.navHome[i], player, side, w.navGoal[i]) ? mode : NAV.blocked;
    w.navTime[i] = PURSUIT.replan;
  }
  const speed = (i === 5 ? 12 : 10) + (w.fierce[i] ? 1 : 0);
  const ox = p.x, oy = p.y, oz = p.z;
  const moved = moveWarden(p, w.navGoal[i], w.navVelocity[i], w.navHome[i], speed, dt, player);
  const target = s.targets[i];
  target.c.x += p.x - ox; target.c.y += p.y - oy; target.c.z += p.z - oz;
  target.eye.x += p.x - ox; target.eye.y += p.y - oy; target.eye.z += p.z - oz;
  if (moved < 0) { w.navTime[i] = .1; w.navMode[i] = NAV.blocked; } else w.navDistance[i] += moved;
  const yaw = Math.atan2(p.x - player.x, p.z - player.z), delta = Math.atan2(Math.sin(yaw - s.drones.yaw[i]), Math.cos(yaw - s.drones.yaw[i]));
  s.drones.yaw[i] += delta * (1 - Math.exp(-8 * dt));
}
