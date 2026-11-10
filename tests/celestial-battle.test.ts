import { describe, expect, it } from 'vitest';
import { createShooter, PHASE } from '../src/game/combat';
import { BATTLE, createBattle, segmentDistance, stepBattle } from '../src/game/celestialBattle';

const player = { x: 0, y: 20, z: 0 }, clear = () => true;
function encounter() {
  const b = createBattle(), s = createShooter();
  s.drones.count = 1; s.drones.hp[0] = 6; s.drones.phase[0] = PHASE.alert;
  Object.assign(s.drones.pos[0], { x: 0, y: 20, z: -20 });
  return { b, s };
}
const advance = (b: ReturnType<typeof createBattle>, s: ReturnType<typeof createShooter>, seconds: number, los = clear) => {
  for (let i = 0; i < Math.ceil(seconds * 60); i++) stepBattle(b, s, player, 1 / 60, true, los);
};
describe('the breach encounter', () => {
  it('telegraphs a visible attacker before releasing an aimed, finite projectile', () => {
    const { b, s } = encounter(); advance(b, s, 5.1);
    expect(b.charging).toBe(0); expect(b.bolts.some(o => o.live)).toBe(false);
    advance(b, s, BATTLE.windup);
    const bolt = b.bolts.find(o => o.live)!;
    expect(bolt).toBeDefined(); expect(bolt.v.z).toBeGreaterThan(0);
    expect(Math.hypot(bolt.v.x, bolt.v.y, bolt.v.z)).toBeCloseTo(BATTLE.speed);
  });
  it('pauses the encounter without consuming its grace or attack clock', () => {
    const { b, s } = encounter(); b.hurt = .6; b.invulnerable = 2;
    stepBattle(b, s, player, 1, false, clear);
    expect(b.clock).toBe(0); expect(b.hurt).toBe(.6); expect(b.invulnerable).toBe(2);
  });
  it('never starts a charge through stone, and a kill interrupts the charge', () => {
    const { b, s } = encounter(); advance(b, s, 6, () => false); expect(b.charging).toBe(-1);
    advance(b, s, .1); expect(b.charging).toBe(0);
    s.drones.phase[0] = PHASE.dying; advance(b, s, 1); expect(b.bolts.some(o => o.live)).toBe(false);
  });
  it('stone blocks the projectile before it can damage the ward', () => {
    const { b, s } = encounter(); const bolt = b.bolts[0]; bolt.live = true;
    Object.assign(bolt.p, player); stepBattle(b, s, player, .02, true, () => false);
    expect(b.ward).toBe(3); expect(bolt.live).toBe(false);
  });
  it('simultaneous hits consume one ward segment and grant a grace window', () => {
    const { b, s } = encounter();
    for (const o of b.bolts.slice(0, 3)) { o.live = true; Object.assign(o.p, player); }
    stepBattle(b, s, player, .02, true, clear);
    expect(b.ward).toBe(2); expect(b.invulnerable).toBe(BATTLE.grace);
  });
  it('ends in defeat at zero ward, and in victory after eight fresh banishments', () => {
    const { b, s } = encounter(); b.ward = 1; b.bolts[0].live = true; Object.assign(b.bolts[0].p, player);
    stepBattle(b, s, player, .02, true, clear); expect(b.status).toBe('fallen');
    const won = createBattle(12); s.stats.kills = 20; stepBattle(won, s, player, .02, true, clear);
    expect(won.status).toBe('victory'); expect(won.bolts.some(o => o.live)).toBe(false);
  });
  it('uses a swept segment so projectiles cannot tunnel through the player', () => {
    expect(segmentDistance({ x: 0, y: 20, z: -10 }, { x: 0, y: 20, z: 10 }, player)).toBe(0);
    expect(segmentDistance({ x: 4, y: 20, z: -10 }, { x: 4, y: 20, z: 10 }, player)).toBe(4);
  });
});
