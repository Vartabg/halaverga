import type { ShooterState, Vec3 } from './combat';
import type { Wardens } from './wardenState';
import { WARDEN } from './banishState';
import { exposeWarden } from './wardenCounter';
import { wardenPath } from './wardenMath';
import { FAN } from './wardenTactics';
const next: Vec3 = { x: 0, y: 0, z: 0 };
/** The cantor visibly recoils before opening two fans. The clear center corridor is the answer to sideways dodging. */
export function aimWardenFan(w: Wardens, s: ShooterState, i: number, player: Vec3, dt: number) {
  const p = s.drones.pos[i], x = p.x - player.x, y = p.y - player.y, z = p.z - player.z, d = Math.hypot(x, y, z) || 1;
  const step = Math.min(10 * dt, Math.max(0, FAN.retreat - d));
  next.x = p.x + x / d * step; next.y = p.y + y / d * step; next.z = p.z + z / d * step;
  if (wardenPath(p, next)) Object.assign(p, next);
  Object.assign(w.aim[i], player);
}
/** Six committed rays: no center shot and no late tracking. The angle preserves a 3.8m center gap at the locked aim. */
export function stepWardenFan(w: Wardens, s: ShooterState, i: number) {
  if (!w.shots[i]) {
    const p = s.drones.pos[i], to = w.aim[i], x = to.x - p.x, y = to.y - p.y, z = to.z - p.z;
    const length = Math.hypot(x, y, z), horizontal = Math.hypot(x, z) || 1;
    if (length < 4) { exposeWarden(w, i); return; } // Cover blocked the recoil: don't spawn an unavoidable point-blank fan.
    const angle = Math.atan2(FAN.gap, length), speed = WARDEN.boltSpeed + (w.fierce[i] ? 3 : 0);
    for (let n = 0; n < 6; n++) {
      const bolt = w.bolts.find(o => !o.live); if (!bolt) break;
      const a = (n % 2 ? 1 : -1) * (angle + Math.floor(n / 2) * .14), c = Math.cos(a), side = Math.sin(a);
      Object.assign(bolt.p, p); bolt.p.y += .6;
      bolt.v.x = (x / length * c + z / horizontal * side) * speed;
      bolt.v.y = y / length * c * speed;
      bolt.v.z = (z / length * c - x / horizontal * side) * speed;
      bolt.src = i; bolt.age = 0; bolt.live = true; w.shots[i]++;
    }
  }
  if (!w.bolts.some(o => o.live && o.src === i)) exposeWarden(w, i);
}
