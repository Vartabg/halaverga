import { afterEach, expect, it } from 'vitest';
import { wardenSetup } from './warden-support';
import { WA } from '../src/game/banishState';
import { CLEAVE } from '../src/game/wardenTactics';
import { cleaveTouches } from '../src/game/wardenSweep';
import { battle } from '../src/game/celestialBattle';
import { wardenWorld } from '../src/game/wardenMath';
afterEach(() => { wardenWorld.clear = () => true; });
function setup() { const a = wardenSetup(); a.w.turns[5] = 1; a.player.z = 8; a.step(); return a; }
it('answers close with a cleave, locks its sector, and lets retreat escape the blade', () => {
  const a = setup(); expect(a.w.move[5]).toBe(WA.sweep); a.tick(.6); const dir = { ...a.w.dir[5] }; a.player.z = 18;
  a.tick(1.1); expect(a.w.dir[5]).toEqual(dir); expect(a.w.phase[5]).toBe(WA.recover); expect(a.w.open[5]).toBeGreaterThan(0); expect(battle.ward).toBe(3);
});
it.each([1 / 30, 1 / 60, .12])('a cleave hits only once at dt%s, while an early facing shield blocks it', dt => {
  const a = setup(); for (let n = 0; n < 200 && a.w.phase[5] !== WA.recover; n++) a.step(dt);
  expect(battle.ward).toBe(2); expect(a.w.open[5]).toBe(0);
  const b = setup(); b.s.input.shield = 1; for (let n = 0; n < 200 && b.w.phase[5] !== WA.recover; n++) b.step(dt);
  expect(battle.ward).toBe(3); expect(b.w.parries).toBe(0); expect(b.w.open[5]).toBeGreaterThan(0);
});
it('a late shield parries the cleave; facing away fails, and cover blocks its reach', () => {
  const a = setup(); a.tick(CLEAVE.tell - .13); a.s.input.shield = 1; a.tick(.3); expect(a.w.parries).toBe(1); expect(battle.ward).toBe(3);
  const b = setup(); b.s.input.shield = 1; b.s.aim.dir.z = 1; b.tick(1.8); expect(battle.ward).toBe(2);
  const c = setup(); c.tick(.6); wardenWorld.clear = () => false; c.tick(1.2); expect(battle.ward).toBe(3); expect(c.w.open[5]).toBeGreaterThan(0);
});
it('does not strike outside the fixed cone but catches a fast crossing through it', () => {
  const o = { x: 0, y: 0, z: 0 }, dir = { x: 0, y: 0, z: 1 };
  expect(cleaveTouches({ x: 8, y: 0, z: -5 }, { x: 8, y: 0, z: -5 }, o, dir)).toBe(false);
  expect(cleaveTouches({ x: -25, y: 0, z: 7 }, { x: 25, y: 0, z: 7 }, o, dir)).toBe(true);
});
