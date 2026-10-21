import type { ShooterState, Vec3 } from './combat';
import { segmentDistance } from './celestialBattle';
import { WARDEN } from './banishState';
import { type Wardens } from './wardenState';
import { exposeWarden } from './wardenCounter';
import { wardenDamage, wardenPath } from './wardenMath';
const old: Vec3 = { x: 0, y: 0, z: 0 }, next: Vec3 = { x: 0, y: 0, z: 0 };
const relativeA: Vec3 = { x: 0, y: 0, z: 0 }, relativeB: Vec3 = { x: 0, y: 0, z: 0 }, zero = { x: 0, y: 0, z: 0 };
/** Locks a lane before moving. It never homes after the tell, and checks the same world rays as player strikes. */
export function aimWardenRush(w: Wardens, s: ShooterState, i: number, target: Vec3) {
  const p = s.drones.pos[i], d = w.dir[i], a = w.aim[i];
  const len = Math.hypot(target.x - p.x, target.y - p.y, target.z - p.z) || 1;
  d.x = (target.x - p.x) / len; d.y = (target.y - p.y) / len; d.z = (target.z - p.z) / len;
  const reach = Math.min(WARDEN.range, len + 3);
  a.x = p.x + d.x * reach; a.y = p.y + d.y * reach; a.z = p.z + d.z * reach;
  Object.assign(w.start[i], p); w.duration[i] = reach / WARDEN.rushSpeed;
}
/** Relative swept contact catches a fast angel or a dropped frame; a held shield does not stop the marked red lunge. */
export function stepWardenRush(w: Wardens, s: ShooterState, i: number, player: Vec3, dt: number) {
  const f = s.drones, p = f.pos[i], a = w.start[i], to = w.aim[i];
  Object.assign(old, p); const u = Math.min(1, w.time[i] / w.duration[i]);
  next.x = a.x + (to.x - a.x) * u; next.y = a.y + (to.y - a.y) * u; next.z = a.z + (to.z - a.z) * u;
  if (!wardenPath(old, next)) { exposeWarden(w, i); return; }
  Object.assign(p, next);
  relativeA.x = old.x - w.previous.x; relativeA.y = old.y - w.previous.y; relativeA.z = old.z - w.previous.z;
  relativeB.x = p.x - player.x; relativeB.y = p.y - player.y; relativeB.z = p.z - player.z;
  if (!w.hit[i] && dt > 0 && segmentDistance(relativeA, relativeB, zero) < WARDEN.radius) {
    w.hit[i] = 1; wardenDamage(s); w.last = i; w.result = 'hit'; w.serial++;
  }
  if (u === 1) exposeWarden(w, i);
}
