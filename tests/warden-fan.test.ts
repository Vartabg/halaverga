import { afterEach, expect, it } from 'vitest';
import { wardenSetup } from './warden-support';
import { WA } from '../src/game/banishState';
import { battle } from '../src/game/celestialBattle';
import { wardenWorld } from '../src/game/wardenMath';
afterEach(() => { wardenWorld.clear = () => true; });
function setup() { const a = wardenSetup(7); a.w.turns[7] = 1; a.step(); return a; }
it('opens six committed rays with a safe center instead of tracking a moving angel', () => {
  const a = setup(); expect(a.w.move[7]).toBe(WA.fan); a.tick(.6); const aim = { ...a.w.aim[7] };
  a.tick(1.1); expect(a.w.shots[7]).toBe(6); expect(a.w.bolts.filter(o => o.live).length).toBe(6);
  a.tick(1.5); expect(battle.ward).toBe(3); expect(a.w.phase[7]).toBe(WA.recover); expect(a.w.open[7]).toBeGreaterThan(0); expect(a.w.aim[7]).toEqual(aim);
});
it('sidestepping into a marked bank can hit, but facing shield still protects it', () => {
  const a = setup(); a.tick(.6); a.player.x = 4; a.tick(2.3); expect(battle.ward).toBe(2);
  const b = setup(); b.tick(.6); b.player.x = 4; b.s.input.shield = 1; b.tick(2.3); expect(battle.ward).toBe(3);
});
it('recoils visibly before splitting at close range, and does not move through cover', () => {
  const a = wardenSetup(7); a.player.z = 2; a.w.turns[7] = 1; a.step(); a.tick(.5); expect(a.s.drones.pos[7].z).toBeLessThan(-4);
  a.tick(2); expect(battle.ward).toBe(3); expect(a.w.shots[7]).toBe(6);
  const b = wardenSetup(7); b.player.z = 2; b.w.turns[7] = 1; b.step(); wardenWorld.clear = () => false; b.tick(2);
  expect(b.s.drones.pos[7].z).toBe(0); expect(battle.ward).toBe(3); expect(b.w.phase[7]).toBe(WA.recover);
});
