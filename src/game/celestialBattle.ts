import { PHASE, type ShooterState, type Vec3 } from './combat';

export const BATTLE = { goal: 8, ward: 3, bolts: 12, speed: 19, windup: .9, cadence: 4.8, range: 65, grace: 2.5 } as const;
type Bolt = { live: boolean; age: number; p: Vec3; v: Vec3 };
export type BattleState = {
  status: 'battle' | 'victory' | 'fallen'; ward: number; banished: number; baseline: number;
  clock: number; nextAttack: number; charging: number; charge: number; invulnerable: number; hurt: number; bolts: Bolt[];
  /** Fiery darts quenched by the shield of faith (Ephesians 6:16), counted for the effects. */ quenched: number;
};
const v = (): Vec3 => ({ x: 0, y: 0, z: 0 });
export function createBattle(kills = 0): BattleState {
  return { status: 'battle', ward: BATTLE.ward, banished: 0, baseline: kills, clock: 0, nextAttack: 5,
    charging: -1, charge: 0, invulnerable: 0, hurt: 0, quenched: 0,
    bolts: Array.from({ length: BATTLE.bolts }, () => ({ live: false, age: 0, p: v(), v: v() })) };
}
export const battle = createBattle();
export function resetBattle(kills = 0) { Object.assign(battle, createBattle(kills)); }
const old = v(), toPlayer = v();
/** Swept sphere test: a long frame cannot let a bolt skip through the player. */
export function segmentDistance(a: Vec3, b: Vec3, p: Vec3) {
  const x = b.x - a.x, y = b.y - a.y, z = b.z - a.z;
  const t = Math.min(1, Math.max(0, ((p.x - a.x) * x + (p.y - a.y) * y + (p.z - a.z) * z) / (x * x + y * y + z * z || 1)));
  return Math.hypot(a.x + x * t - p.x, a.y + y * t - p.y, a.z + z * t - p.z);
}
/** The raised shield faces where the angel looks: a dart arriving from the front half quenches (Ephesians 6:16). */
export function shielded(s: ShooterState, v: Vec3) {
  if (!s.input.shield) return false;
  const d = s.aim.dir, l = Math.hypot(v.x, v.y, v.z) || 1;
  return (v.x * d.x + v.y * d.y + v.z * d.z) / l < -.15;
}
/** Game fiction. This encounter does not assert that Revelation's visions describe these combat rules. */
export function stepBattle(b: BattleState, s: ShooterState, player: Vec3, dt: number, active: boolean,
  lineClear: (a: Vec3, c: Vec3) => boolean, segmentClear = lineClear) {
  if (!active || b.status !== 'battle') return;
  const step = Math.min(.04, Math.max(0, dt));
  b.clock += step; b.invulnerable = Math.max(0, b.invulnerable - step); b.hurt = Math.max(0, b.hurt - step);
  b.banished = Math.max(0, s.stats.kills - b.baseline);
  if (b.banished >= BATTLE.goal) { b.status = 'victory'; b.charging = -1; b.bolts.forEach(o => o.live = false); return; }
  for (const bolt of b.bolts) {
    if (!bolt.live) continue;
    old.x = bolt.p.x; old.y = bolt.p.y; old.z = bolt.p.z;
    bolt.p.x += bolt.v.x * step; bolt.p.y += bolt.v.y * step; bolt.p.z += bolt.v.z * step; bolt.age += step;
    if (!segmentClear(old, bolt.p) || bolt.age > 5) { bolt.live = false; continue; }
    if (segmentDistance(old, bolt.p, player) < 1.35) {
      bolt.live = false;
      if (shielded(s, bolt.v)) { b.quenched++; continue; }
      if (b.invulnerable <= 0) { b.ward--; b.invulnerable = BATTLE.grace; b.hurt = .65; }
      if (b.ward <= 0) { b.status = 'fallen'; b.charging = -1; return; }
    }
  }
  const f = s.drones;
  if (b.charging >= 0) {
    const i = b.charging, p = f.pos[i];
    if (f.phase[i] === PHASE.dead || f.phase[i] === PHASE.dying || f.held[i] || !lineClear(p, player)) {
      b.charging = -1; b.nextAttack = b.clock + 1; return;
    }
    b.charge += step;
    if (b.charge < BATTLE.windup) return;
    const bolt = b.bolts.find(o => !o.live);
    if (bolt) {
      const len = Math.hypot(player.x - p.x, player.y - p.y, player.z - p.z) || 1;
      toPlayer.x = (player.x - p.x) / len; toPlayer.y = (player.y - p.y) / len; toPlayer.z = (player.z - p.z) / len;
      Object.assign(bolt.p, p); bolt.v.x = toPlayer.x * BATTLE.speed; bolt.v.y = toPlayer.y * BATTLE.speed; bolt.v.z = toPlayer.z * BATTLE.speed;
      bolt.live = true; bolt.age = 0;
    }
    b.charging = -1; b.nextAttack = b.clock + BATTLE.cadence; return;
  }
  if (b.clock < b.nextAttack) return;
  let nearest: number = BATTLE.range;
  for (let i = 0; i < f.count; i++) {
    if (f.hp[i] <= 0 || f.held[i] || f.phase[i] === PHASE.arriving || f.phase[i] === PHASE.dying || f.phase[i] === PHASE.dead) continue;
    const p = f.pos[i], d = Math.hypot(p.x - player.x, p.y - player.y, p.z - player.z);
    if (d < nearest && lineClear(p, player)) { b.charging = i; nearest = d; }
  }
  b.charge = 0;
}
