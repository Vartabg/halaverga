import { expect, it } from 'vitest';
import { wardenSetup } from './warden-support';
import { WA, WARDEN } from '../src/game/banishState';
import { battle } from '../src/game/celestialBattle';
import { wardenWorld } from '../src/game/wardenMath';
it('commits three separate darts to a fixed aim, so sideways movement clears the whole volley', () => {
  const { w, i, player, step, tick } = wardenSetup(7); step(); tick(WARDEN.lock + .02); const aim = { ...w.aim[i] };
  player.x = 10; tick(4); expect(w.aim[i]).toEqual(aim); expect(w.shots[i]).toBe(3);
  expect(battle.ward).toBe(3); expect(w.phase[i]).toBe(WA.recover); expect(w.open[i]).toBeGreaterThan(0);
});
it('a timed facing shield on actual projectile contact interrupts the volley and exposes armor', () => {
  const { s, w, i, step } = wardenSetup(7); step();
  for (let n = 0; n < 180; n++) { const incoming = w.bolts.find(o => o.live && o.p.z > 15); if (incoming) break; step(); }
  s.input.shield = 1; for (let n = 0; n < 30 && w.parries === 0; n++) step();
  expect(w.parries).toBe(1); expect(w.phase[i]).toBe(WA.recover); expect(w.open[i]).toBeGreaterThan(2);
  expect(w.bolts.some(o => o.live)).toBe(false); expect(battle.ward).toBe(3); expect(battle.quenched).toBeGreaterThan(0);
});
it('holding the shield early blocks ordinary darts but grants no timed parry; facing away does not block', () => {
  const a = wardenSetup(7); a.s.input.shield = 1; a.step(); a.tick(3.5);
  expect(a.w.parries).toBe(0); expect(battle.ward).toBe(3); expect(battle.quenched).toBe(3);
  const b = wardenSetup(7); b.step(); b.tick(1); b.s.input.shield = 1; b.s.aim.dir.z = 1; b.tick(2.5);
  expect(battle.ward).toBe(2); expect(b.w.parries).toBe(0); expect(b.w.open[7]).toBe(0);
});
it('world cover stops darts and the volley eventually releases its held enemy', () => {
  const { s, w, i, step, tick } = wardenSetup(7); step(); tick(WARDEN.volleyTell + .05);
  wardenWorld.clear = (a, b) => !(a.z < 5 && b.z >= 5); tick(6);
  expect(battle.ward).toBe(3); expect(w.phase[i]).toBe(WA.idle); expect(s.drones.held[i]).toBe(0);
});
