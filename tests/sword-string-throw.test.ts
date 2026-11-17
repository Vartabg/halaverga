import { beforeEach, describe, expect, it } from 'vitest';
import { COMMAND, requestCommand } from '../src/game/commands';
import { FX, MODE, stepBanish } from '../src/game/banish';
import { flowPaths, flowVisible } from '../src/game/combatFlow';
import { cancelStrike, strike, strikeVelocity } from '../src/game/strike';
import { BLADE, BODY, contactAt } from '../src/game/bladeReach';
import { CUTS, LAST, REEL, STRING, powerOf } from '../src/game/swordString';
import { floorAt } from '../src/game/thrown';
import { landCut, settle, setup } from './sword-support';

beforeEach(() => { flowPaths.fill(1); flowVisible.fill(1); cancelStrike(); });

describe('the sword string: the casting blow and the thrown demon', () => {
  it('releases the angel over the casting blow, at rest: the string ends where it hit, however fast the opener came in', () => {
    const { s, b, near } = setup();
    settle(near); requestCommand(s, COMMAND.sword, 0); stepBanish(b, s, near, 1 / 60);
    strikeVelocity({ x: 0, y: 0, z: -110 }, near, .05, false); // a fast dive in
    expect(strike.speed).toBeGreaterThan(100);
    stepBanish(b, s, { ...s.targets[0].c }, 1 / 60); expect(b.string.speed).toBeGreaterThan(100);
    landCut(b, s, 0, near); s.aim.dir = { x: 1, y: 0, z: 0 };
    landCut(b, s, 0, near);
    // The arrival speed goes into the demon, not into the angel.
    expect(Math.hypot(b.vel[0].x, b.vel[0].z)).toBeCloseTo(CUTS[LAST].along * powerOf(b.string.speed || 110), 0);
    // It hangs over the blow for a beat, held even against flight input, then is released there with no speed at all.
    expect(strike.hold).toBe(STRING.finish); expect(strike.last).toBe(true);
    const v = { x: 0, y: 0, z: 0 }; strikeVelocity(v, near, .2, false, true); strikeVelocity(v, near, STRING.finish - .05, false, true);
    expect(strike.phase).toBe(2); expect(Math.hypot(v.x, v.y, v.z)).toBeLessThan(4);
    strikeVelocity(v, near, .1, false, true);
    expect(strike.phase).toBe(0); expect(strike.hold).toBe(0); expect(strike.last).toBe(false); expect(Math.hypot(v.x, v.y, v.z)).toBe(0);
    expect(strikeVelocity(v, near, 1 / 60, false, true)).toBe(false);
  });
  it('drives the demon into the ground with the casting blow: it flies there, strikes, lies a moment and is gone', () => {
    const { s, b, near, run } = setup();
    landCut(b, s, 0, near); landCut(b, s, 0, near); landCut(b, s, 0, near);
    expect(b.mode[0]).toBe(MODE.cast); expect(b.vel[0].y).toBeLessThan(-20); expect(Math.hypot(b.vel[0].x, b.vel[0].z)).toBeGreaterThan(35); // thrown, not lowered
    const from = { ...s.drones.pos[0] };
    s.camFx.trauma = 0; run(.25); expect(s.stats.kills).toBe(0); expect(s.drones.pos[0].y).toBeLessThan(from.y - 5); // on its way
    run(1.4);
    expect(s.stats.kills).toBe(1); expect(s.camFx.trauma).toBeGreaterThan(0);
    const hit = b.fx.find(e => e.kind === FX.impact && e.serial > 0)!, seal = b.fx.find(e => e.kind === FX.seal && e.serial > 0)!;
    expect(hit.n).toBeGreaterThan(30); // it struck hard
    expect(hit.to.y).toBeCloseTo(floorAt(hit.to.x, hit.to.z), 0); // on the ground or the water, where the terrain is
    expect(seal.to.y - floorAt(seal.to.x, seal.to.z)).toBeLessThan(4); // and it ends near where it struck, not in the air
  });
  it('throws the finished demon the way the angel is looking, even when the blow comes from straight above it', () => {
    const { s, b, near } = setup();
    landCut(b, s, 0, near); landCut(b, s, 0, near);
    const above = { ...s.targets[0].c, y: s.targets[0].c.y + 6 }; s.aim.dir = { x: 1, y: -.6, z: 0 }; // looking east and down at it
    settle(above); requestCommand(s, COMMAND.sword, 0); stepBanish(b, s, above, 1 / 60);
    // The blow lands from just inside the blade's reach over the top of the body's capsule.
    const over = BODY.lesser.y + BODY.lesser.half + contactAt(0) - BLADE.chest - .1;
    strikeVelocity({ x: 0, y: 0, z: 0 }, above, strike.minTime + .01, false); stepBanish(b, s, { ...s.targets[0].c, y: s.targets[0].c.y + over }, 1 / 60);
    expect(b.mode[0]).toBe(MODE.cast); expect(b.vel[0].x).toBeGreaterThan(35); expect(Math.abs(b.vel[0].z)).toBeLessThan(1e-6); expect(b.vel[0].y).toBeLessThan(-20);
  });
  // ---- found by the second independent review, 2026-11-10 ----
  it('does not count a cliff face as landing: a demon thrown into the summit wall falls on and dies on the ground, not in the air', () => {
    const { s, b, run } = setup(), f = s.drones;
    Object.assign(f.pos[0], { x: 0, y: 30, z: -40 }); f.held[0] = 1; b.mode[0] = MODE.cast; b.timer[0] = 0; b.hit[0] = 0;
    Object.assign(b.vel[0], { x: 70, y: 0, z: 0 }); // straight at the 61 m terrace wall
    run(.3);
    const wall = b.fx.find(e => e.kind === FX.impact && e.serial > 0)!;
    expect(wall).toBeDefined(); expect(Math.abs(wall.from.y - wall.to.y)).toBeLessThan(.01); // an upright surface
    expect(b.hit[0]).toBe(0); expect(s.stats.kills).toBe(0); // struck, thrown back, still falling
    run(2.4);
    expect(s.stats.kills).toBe(1);
    const seal = b.fx.find(e => e.kind === FX.seal && e.serial > 0)!;
    expect(seal.to.y - floorAt(seal.to.x, seal.to.z)).toBeLessThan(2.5); // it ended on the ground
  });
  it('lies where it landed: most of its speed is spent on the ground, and the landing clock is cleared for the next demon in that place', () => {
    const { s, b, near, run } = setup();
    landCut(b, s, 0, near); landCut(b, s, 0, near); landCut(b, s, 0, near);
    run(1.8); expect(s.stats.kills).toBe(1); expect(b.hit[0]).toBe(0);
    const seal = b.fx.find(e => e.kind === FX.seal && e.serial > 0)!;
    expect(seal.to.y - floorAt(seal.to.x, seal.to.z)).toBeLessThan(2);
  });
  it('does not finish a demon cast by the rite the instant it starts, even where an earlier one landed', () => {
    const { s, b, near } = setup();
    b.hit[0] = 99; b.mode[0] = MODE.bound; b.timer[0] = 0; s.drones.held[0] = 1; // a stale landing clock from an earlier demon
    requestCommand(s, COMMAND.cast, 0); stepBanish(b, s, near, 1 / 60);
    expect(b.mode[0]).toBe(MODE.cast); expect(b.hit[0]).toBe(0);
    stepBanish(b, s, near, 1 / 60); expect(b.mode[0]).toBe(MODE.cast); expect(s.stats.kills).toBe(0);
  });
  it('marks a shove between demons as its own, dimmer effect: no dust, no shake', () => {
    const { s, b, run } = setup(), f = s.drones;
    Object.assign(f.pos[0], { x: 0, y: 60, z: 0 }); Object.assign(f.pos[1], { x: 0, y: 59.5, z: -1.3 });
    b.wounds[0] = 1; b.mode[0] = MODE.staggered; b.timer[0] = 2; f.held[0] = 1; Object.assign(b.vel[0], { x: 0, y: 0, z: -30 });
    s.camFx.trauma = 0; run(.1);
    expect(b.fx.some(e => e.kind === FX.shove && e.serial > 0)).toBe(true); expect(b.fx.some(e => e.kind === FX.impact && e.serial > 0)).toBe(false);
    expect(s.camFx.trauma).toBe(0);
  });
  it('makes the demon carry each wound differently, and straightens it when it recovers', () => {
    const { s, b, near, run } = setup();
    landCut(b, s, 0, near); run(.4);
    expect(Math.abs(s.drones.tiltZ[0])).toBeGreaterThan(.5); expect(s.drones.tiltX[0]).toBeGreaterThan(.3); // knocked askew
    landCut(b, s, 0, near); run(.4);
    expect(s.drones.tiltX[0]).toBeLessThan(-.9); // thrown onto its back
    expect(REEL[1].x).not.toBe(REEL[2].x);
    run(STRING.recover + .2); expect(s.drones.tiltX[0]).toBe(0); expect(s.drones.tiltZ[0]).toBe(0);
  });
});
