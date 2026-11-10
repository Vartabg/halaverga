import { beforeEach, describe, expect, it } from 'vitest';
import { PHASE, createShooter } from '../src/game/combat';
import { COMMAND, requestCommand } from '../src/game/commands';
import { createDroneSim, buildTargets } from '../src/game/drones';
import { FX, MODE, createBanish, resetBanish, stepBanish } from '../src/game/banish';
import { resetBattle } from '../src/game/celestialBattle';
import { flowPaths, flowVisible } from '../src/game/combatFlow';
import { STRIKE, cancelStrike, strike, strikeVelocity } from '../src/game/strike';
import { CUTS, LAST, STRING, cutFor, stringOpen, stringTarget } from '../src/game/swordString';
import { landCut, settle } from './sword-support';

function setup() {
  const s = createShooter(); createDroneSim(s); buildTargets(s);
  for (const t of s.targets) t.los = true;
  const b = createBanish(); resetBanish(b, s); resetBattle(0);
  const at = s.drones.pos[0], near = { x: at.x, y: at.y, z: at.z + 10 };
  s.aim.valid = true; s.aim.origin = { ...near }; s.aim.dir = { x: 0, y: 0, z: -1 };
  const run = (seconds: number) => { for (let n = 0; n < Math.ceil(seconds * 60); n++) { stepBanish(b, s, near, 1 / 60); buildTargets(s); for (const t of s.targets) t.los = true; } };
  const sword = () => b.fx.filter(e => e.kind === FX.sword && e.serial > 0).sort((x, y) => x.serial - y.serial).map(e => e.n);
  return { s, b, near, run, sword };
}
beforeEach(() => { flowPaths.fill(1); flowVisible.fill(1); cancelStrike(); });

describe('the sword string', () => {
  it('casts a lesser demon down with three different cuts, each marked on its effect', () => {
    const { s, b, near, run, sword } = setup();
    landCut(b, s, 0, near); expect(b.wounds[0]).toBe(1); expect(b.mode[0]).toBe(MODE.staggered); expect(s.drones.held[0]).toBe(1);
    landCut(b, s, 0, near); expect(b.wounds[0]).toBe(2); expect(s.stats.kills).toBe(0);
    landCut(b, s, 0, near); expect(b.mode[0]).toBe(MODE.bound); expect(b.wounds[0]).toBe(0);
    expect(sword()).toEqual([0, 1, 2]); expect(b.combo).toBe(3);
    run(1.6); expect(s.stats.kills).toBe(1); expect(s.drones.phase[0]).toBe(PHASE.dying);
  });
  it('makes each cut heavier than the one before: longer hit-stop, harder jolt, bigger arc', () => {
    for (let n = 1; n < CUTS.length; n++) {
      expect(CUTS[n].freeze).toBeGreaterThan(CUTS[n - 1].freeze); expect(CUTS[n].trauma).toBeGreaterThan(CUTS[n - 1].trauma);
      expect(CUTS[n].arcScale).toBeGreaterThan(CUTS[n - 1].arcScale);
    }
    expect(new Set(CUTS.map(c => c.arc.toFixed(2))).size).toBe(CUTS.length); // three different slash directions
    expect(CUTS[LAST].freeze).toBeLessThanOrEqual(.16); // still a beat, not a stall
  });
  it('gives every cut after the opener a wind-up: the step-in cannot land before its beat', () => {
    const { s, b, near } = setup();
    landCut(b, s, 0, near); settle(near);
    requestCommand(s, COMMAND.sword, 0); stepBanish(b, s, near, 1 / 60);
    expect(strike.phase).toBe(1); expect(strike.lunge).toBe(true); expect(strike.minTime).toBe(CUTS[1].windup);
    stepBanish(b, s, { ...s.targets[0].c }, 1 / 60); // already inside reach, but too early
    expect(b.wounds[0]).toBe(1);
    strikeVelocity({ x: 0, y: 0, z: 0 }, near, CUTS[1].windup + .01, false); stepBanish(b, s, { ...s.targets[0].c }, 1 / 60);
    expect(b.wounds[0]).toBe(2);
  });
  it('holds the angel on the demon between cuts and lifts both on the rising cut', () => {
    const { s, b, near, run } = setup();
    landCut(b, s, 0, near);
    expect(strike.phase).toBe(2); expect(strike.hold).toBe(STRING.window);
    const v = { x: 0, y: 0, z: -80 }; settle(near); strikeVelocity(v, near, 1 / 60, false, true);
    expect(Math.hypot(v.x, v.y, v.z)).toBeLessThan(6); // held, even with flight input, until the cut has had its moment
    const before = s.drones.pos[0].y;
    landCut(b, s, 0, near); expect(b.pop[0].y).toBeGreaterThan(10); expect(strike.recoil.y).toBeGreaterThan(b.pop[0].y);
    run(.6); expect(s.drones.pos[0].y - before).toBeGreaterThan(1.5); // the demon hangs above where it was
  });
  it('lets steering break away once the cut has landed, and a demon left alone shakes its wounds off', () => {
    const { s, b, near, run } = setup();
    landCut(b, s, 0, near);
    const v = { x: 0, y: 0, z: 0 }; strikeVelocity(v, near, .1, false, true); strikeVelocity(v, near, .3, false, true);
    expect(strike.phase).toBe(0);
    expect(stringOpen(b, 0)).toBe(true); run(STRING.window + .1); expect(stringOpen(b, 0)).toBe(false);
    run(STRING.recover); expect(b.wounds[0]).toBe(0); expect(b.mode[0]).toBe(MODE.free); expect(s.drones.held[0]).toBe(0);
  });
  it('continues on the wounded demon when no demon is chosen, unless the view has turned to another', () => {
    const { s, b, near } = setup();
    landCut(b, s, 0, near); settle(near);
    expect(stringTarget(b, s, near)).toBe(0);
    requestCommand(s, COMMAND.sword); stepBanish(b, s, near, 1 / 60); expect(strike.target).toBe(0); expect(strike.lunge).toBe(true);
    cancelStrike();
    const far = { x: near.x, y: near.y, z: near.z + 30 }; s.aim.origin = { ...far }; s.aim.dir = { x: 0, y: 0, z: 1 }; // looking away
    expect(stringTarget(b, s, far)).toBe(-1);
  });
  it('gives back on the casting blow the speed the opener arrived with, leaving the way the angel looks', () => {
    const { s, b, near } = setup();
    settle(near); requestCommand(s, COMMAND.sword, 0); stepBanish(b, s, near, 1 / 60);
    strikeVelocity({ x: 0, y: 0, z: -110 }, near, .05, false); // a fast dive in
    expect(strike.speed).toBeGreaterThan(100);
    stepBanish(b, s, { ...s.targets[0].c }, 1 / 60); expect(b.string.speed).toBeGreaterThan(100);
    landCut(b, s, 0, near); s.aim.dir = { x: 1, y: 0, z: 0 };
    landCut(b, s, 0, near);
    expect(strike.hold).toBe(0); expect(strike.carrySpeed).toBeGreaterThan(80); expect(strike.carrySpeed).toBeLessThanOrEqual(90);
    expect(strike.dir.x).toBeCloseTo(1, 5); expect(STRIKE.exitSpeed).toBeLessThan(strike.carrySpeed);
  });
  it('counts a warden\'s armour as its first two cuts, so its exposed blow is the casting blow', () => {
    const { b } = setup();
    expect(cutFor(b, 5, true, 2)).toBe(0); expect(cutFor(b, 5, true, 1)).toBe(1); expect(cutFor(b, 5, false, 0)).toBe(LAST);
    b.wounds[0] = 1; expect(cutFor(b, 0)).toBe(1); b.wounds[0] = 9; expect(cutFor(b, 0)).toBe(LAST);
  });
});
