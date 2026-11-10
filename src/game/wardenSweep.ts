import type { ShooterState, Vec3 } from './combat';
import type { Wardens } from './wardenState';
import { battle, shielded } from './celestialBattle';
import { WARDEN, WA } from './banishState';
import { exposeWarden } from './wardenCounter';
import { wardenDamage, wardenSegment } from './wardenMath';
import { CLEAVE } from './wardenTactics';
const point: Vec3 = { x: 0, y: 0, z: 0 };
/** A fixed facing sector, not a homing blade. Sample the swept angel path to cover a dropped physics frame. */
export function cleaveTouches(from: Vec3, to: Vec3, origin: Vec3, direction: Vec3) {
  const count = Math.min(128, Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z) / 1.2)));
  for (let n = 0; n <= count; n++) {
    const u = n / count, x = from.x + (to.x - from.x) * u - origin.x;
    const y = from.y + (to.y - from.y) * u - origin.y, z = from.z + (to.z - from.z) * u - origin.z, d = Math.hypot(x, y, z);
    if (d > CLEAVE.range + 1 || d > 1 && (x * direction.x + y * direction.y + z * direction.z) / d < CLEAVE.cosine) continue;
    point.x = origin.x + x; point.y = origin.y + y; point.z = origin.z + z;
    if (wardenSegment(origin, point)) return true;
  }
  return false;
}
export function stepWardenSweep(w: Wardens, s: ShooterState, i: number, player: Vec3) {
  if (!w.hit[i] && cleaveTouches(w.previous, player, s.drones.pos[i], w.dir[i])) {
    if (shielded(s, w.dir[i])) {
      battle.quenched++; w.hit[i] = 2;
      if (w.shieldAge <= WARDEN.parry) { w.hit[i] = 0; exposeWarden(w, i, true); return; }
    } else { w.hit[i] = 1; wardenDamage(s); w.last = i; w.result = 'hit'; w.serial++; }
  }
  if (w.phase[i] === WA.sweep && w.time[i] >= CLEAVE.duration) {
    if (w.hit[i] === 2) w.hit[i] = 0;
    exposeWarden(w, i);
  }
}
