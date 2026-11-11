import { beforeEach, describe, expect, it } from 'vitest';
import { PHASE, createShooter } from '../src/game/combat';
import { COMMAND, requestCommand } from '../src/game/commands';
import { createDroneSim, buildTargets } from '../src/game/drones';
import { FX, MODE, createBanish, resetBanish, stepBanish } from '../src/game/banish';
import { resetBattle } from '../src/game/celestialBattle';
import { flowPaths, flowVisible } from '../src/game/combatFlow';
import { STRIKE, cancelStrike, strike, strikeVelocity } from '../src/game/strike';
import { CUTS, LAST, REEL, STRING, cutFor, powerOf, pressTarget, stepInTime, stringOpen, stringTarget } from '../src/game/swordString';
import { advanceDrones, createDroneContext } from '../src/game/drones';
import { castDuration } from '../src/game/encounter';
import { restingHeight } from '../src/game/wardenElevation';
import { floorAt } from '../src/game/thrown';
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
    landCut(b, s, 0, near); expect(b.mode[0]).toBe(MODE.cast); expect(b.wounds[0]).toBe(0);
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
    landCut(b, s, 0, near); expect(b.vel[0].y).toBeGreaterThan(10); expect(strike.recoil.y).toBeGreaterThan(b.vel[0].y);
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
    strikeVelocity({ x: 0, y: 0, z: 0 }, above, strike.minTime + .01, false); stepBanish(b, s, { ...s.targets[0].c, y: s.targets[0].c.y + 2 }, 1 / 60);
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
  it('gives each cut its own whole-body move: a twirl, a lean back, a flip', () => {
    expect(CUTS[0].twirl).toBe(1); expect(CUTS[0].flip).toBe(0);
    expect(CUTS[1].flip).toBeLessThan(0); expect(Math.abs(CUTS[1].flip)).toBeLessThan(1); // a lean: out and back
    expect(CUTS[2].flip).toBe(1);
    for (const cut of CUTS) { expect(cut.spin).toBeGreaterThan(.25); expect(cut.spin).toBeLessThanOrEqual(.45); }
  });
  // ---- found by independent review, 2026-11-09 ----
  it('replays a buffered press on the demon being cut, not on whichever demon the view favours', () => {
    const { s, b, near } = setup();
    requestCommand(s, COMMAND.sword); stepBanish(b, s, near, 1 / 60); expect(strike.target).toBe(0);
    requestCommand(s, COMMAND.sword); stepBanish(b, s, near, 1 / 60); expect(strike.queued).toBe(true); expect(strike.queueTarget).toBe(-1);
    const at = { ...s.targets[0].c }, on = { x: at.x, y: at.y, z: at.z + 3 };
    strikeVelocity({ x: 0, y: 0, z: 0 }, near, .05, false); stepBanish(b, s, at, 1 / 60); expect(b.wounds[0]).toBe(1);
    // The view now favours demon 1, ahead and off the crosshair, with the wounded demon behind the angel's shoulder.
    Object.assign(s.drones.pos[1], { x: on.x + 6, y: on.y, z: on.z + 30 }); buildTargets(s); for (const t of s.targets) t.los = true;
    s.aim.origin = { ...on }; s.aim.dir = { x: 0, y: 0, z: 1 };
    settle(on); stepBanish(b, s, on, 1 / 60);
    expect(strike.queued).toBe(false); expect(strike.phase).toBe(1); expect(strike.target).toBe(0); expect(strike.lunge).toBe(true);
  });
  it('gives the next cut its wind-up even after the string\'s window has closed, so no cut lands the frame it is pressed', () => {
    const { s, b, near, run } = setup();
    landCut(b, s, 0, near); cancelStrike(); run(STRING.window + .2);
    expect(stringOpen(b, 0)).toBe(false); expect(b.wounds[0]).toBe(1);
    const on = { ...s.targets[0].c, z: s.targets[0].c.z + 2 }; // already inside the blade's reach
    expect(stepInTime(b, 0, 2)).toBe(CUTS[1].windup); expect(stepInTime(b, 0, STRING.reach + 1)).toBe(0); expect(stepInTime(b, 1, 2)).toBe(0);
    requestCommand(s, COMMAND.sword, 0); stepBanish(b, s, on, 1 / 60);
    expect(strike.lunge).toBe(true); stepBanish(b, s, on, 1 / 60); expect(b.wounds[0]).toBe(1); // inside reach, and still not landed
    strikeVelocity({ x: 0, y: 0, z: 0 }, on, CUTS[1].windup + .01, false); stepBanish(b, s, on, 1 / 60); expect(b.wounds[0]).toBe(2);
  });
  it('breaks off at close range when the crosshair is on another demon, and the target ring names the same demon the press hits', () => {
    const { s, b, near } = setup();
    landCut(b, s, 0, near); settle(near);
    const on = { ...s.targets[0].c, z: s.targets[0].c.z + 3 };
    Object.assign(s.drones.pos[1], { x: on.x, y: on.y, z: on.z + 25 }); buildTargets(s); for (const t of s.targets) t.los = true;
    s.aim.origin = { ...on }; s.aim.dir = { x: 0, y: 0, z: -1 };
    expect(stringTarget(b, s, on)).toBe(0); expect(pressTarget(b, s, on)).toBe(0); // the string holds while the view is on it
    s.aim.dir = { x: 0, y: 0, z: 1 }; // the crosshair is now on demon 1
    expect(stringTarget(b, s, on)).toBe(0); expect(pressTarget(b, s, on)).toBe(1);
    requestCommand(s, COMMAND.sword); stepBanish(b, s, on, 1 / 60);
    expect(strike.target).toBe(1); expect(strike.lunge).toBe(false);
  });
  it('keeps a rebuked wounded demon held, and ends its string when it is thrown down', () => {
    const { s, b, near, run } = setup();
    landCut(b, s, 0, near); cancelStrike();
    requestCommand(s, COMMAND.rebuke, 0); stepBanish(b, s, near, 1 / 60);
    expect(s.drones.held[0]).toBe(1); expect(b.wounds[0]).toBe(1);
    for (let n = 0; n < 8 && b.mode[0] !== MODE.down; n++) { run(.6); requestCommand(s, COMMAND.rebuke, 0); stepBanish(b, s, near, 1 / 60); }
    expect(b.mode[0]).toBe(MODE.down); expect(b.wounds[0]).toBe(0); expect(stringOpen(b, 0)).toBe(false);
  });
  it('holds a demon\'s fly-in clock while the string holds the demon, so it does not jump along its path on recovery', () => {
    const s = createShooter(), sim = createDroneSim(s), ctx = createDroneContext(), i = 2;
    s.drones.phase[i] = PHASE.arriving; s.drones.phaseT[i] = .4; s.drones.held[i] = 1;
    for (let n = 0; n < 30; n++) { ctx.dt = 1 / 60; s.clock += 1 / 60; advanceDrones(s, sim, ctx, () => true); }
    expect(s.drones.phaseT[i]).toBeCloseTo(.4, 6);
    s.drones.held[i] = 0; ctx.dt = 1 / 60; advanceDrones(s, sim, ctx, () => true); expect(s.drones.phaseT[i]).toBeGreaterThan(.4);
  });
  it('caps the step-in speed and gives a demon finished out of sequence the dive\'s own speed', () => {
    const { s, b, near } = setup();
    b.wounds[0] = 2; // wounded earlier; the angel has been elsewhere since
    settle(near); requestCommand(s, COMMAND.sword, 0); stepBanish(b, s, { ...near, z: near.z + 40 }, 1 / 60);
    expect(strike.lunge).toBe(false); // too far for a step-in: a dive
    strikeVelocity({ x: 0, y: 0, z: -100 }, near, .05, false); const speed = strike.speed;
    stepBanish(b, s, { ...s.targets[0].c }, 1 / 60); expect(strike.last).toBe(true);
    expect(Math.hypot(b.vel[0].x, b.vel[0].z)).toBeCloseTo(CUTS[LAST].along * powerOf(speed), 0); // thrown by the dive's own speed (one step of air since)
    cancelStrike(); b.wounds[1] = 1; requestCommand(s, COMMAND.sword, 1); const c = s.targets[1].c;
    stepBanish(b, s, { x: c.x, y: c.y, z: c.z + STRING.reach - .5 }, 1 / 60);
    expect(strike.lunge).toBe(true); expect(strike.speed).toBeLessThanOrEqual(STRIKE.maxSpeed);
  });
  it('counts a warden\'s armour as its first two cuts, so its exposed blow is the casting blow', () => {
    const { b } = setup();
    expect(cutFor(b, 5, true, 2)).toBe(0); expect(cutFor(b, 5, true, 1)).toBe(1); expect(cutFor(b, 5, false, 0)).toBe(LAST);
    b.wounds[0] = 1; expect(cutFor(b, 0)).toBe(1); b.wounds[0] = 9; expect(cutFor(b, 0)).toBe(LAST);
  });
});
