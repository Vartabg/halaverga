import type { ShooterState, Vec3 } from './combat';
import { battle, segmentDistance, shielded } from './celestialBattle';
import { WA, WARDEN } from './banishState';
import { type Wardens } from './wardenState';
import { exposeWarden } from './wardenCounter';
import { wardenDamage, wardenSegment } from './wardenMath';
const old: Vec3 = { x: 0, y: 0, z: 0 }, a: Vec3 = { x: 0, y: 0, z: 0 }, c: Vec3 = { x: 0, y: 0, z: 0 }, zero = { x: 0, y: 0, z: 0 };
export function fireWardenBolt(w: Wardens, s: ShooterState, i: number) {
  const bolt = w.bolts.find(o => !o.live); if (!bolt) return;
  const p = s.drones.pos[i], to = w.aim[i], n = w.shots[i];
  Object.assign(bolt.p, p); bolt.p.y += .6; bolt.p.x += n % 2 ? .7 : -.7;
  const len = Math.hypot(to.x - bolt.p.x, to.y - bolt.p.y, to.z - bolt.p.z) || 1;
  bolt.v.x = (to.x - bolt.p.x) / len * WARDEN.boltSpeed;
  bolt.v.y = (to.y - bolt.p.y) / len * WARDEN.boltSpeed;
  bolt.v.z = (to.z - bolt.p.z) / len * WARDEN.boltSpeed;
  bolt.src = i; bolt.age = 0; bolt.live = true; w.shots[i]++;
}
/** Three committed darts. A shield raised within280ms of actual contact turns the whole volley into a punish opening. */
export function stepWardenBolts(w: Wardens, s: ShooterState, player: Vec3, dt: number) {
  for (const o of w.bolts) {
    if (!o.live) continue;
    Object.assign(old, o.p); o.p.x += o.v.x * dt; o.p.y += o.v.y * dt; o.p.z += o.v.z * dt; o.age += dt;
    if (!wardenSegment(old, o.p) || o.age > 3) { o.live = false; continue; }
    a.x = old.x - w.previous.x; a.y = old.y - w.previous.y; a.z = old.z - w.previous.z;
    c.x = o.p.x - player.x; c.y = o.p.y - player.y; c.z = o.p.z - player.z;
    if (segmentDistance(a, c, zero) >= 1.6) {
      if (o.age > .1 && (player.x - o.p.x) * o.v.x + (player.y - o.p.y) * o.v.y + (player.z - o.p.z) * o.v.z < 0) o.live = false;
      continue;
    }
    o.live = false;
    if (shielded(s, o.v)) {
      battle.quenched++;
      if (w.shieldAge <= WARDEN.parry) { w.hit[o.src] = 0; exposeWarden(w, o.src, true); }
    } else { w.hit[o.src] = 1; wardenDamage(s); w.last = o.src; w.result = 'hit'; w.serial++; }
  }
}
export function stepWardenVolley(w: Wardens, s: ShooterState, i: number) {
  if (w.phase[i] !== WA.volley) return;
  if (w.shots[i] < 3 && w.time[i] >= w.shots[i] * WARDEN.boltGap) fireWardenBolt(w, s, i);
  if (w.shots[i] === 3 && !w.bolts.some(o => o.live && o.src === i)) exposeWarden(w, i);
}
