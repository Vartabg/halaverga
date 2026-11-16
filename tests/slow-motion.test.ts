import { describe, expect, it } from 'vitest';
import { createShooter, type Vec3 } from '../src/game/combat';
import { createAssistMemory } from '../src/game/aimAssist';
import { CAM, addTrauma } from '../src/game/cameraFx';
import { createDroneSim } from '../src/game/drones';
import { createStepContext, stepShooter } from '../src/game/shooterStep';
import { SLOW, gameDt, resetSlowMotion, startSlowMotion, stepSlowMotion, timeScale } from '../src/game/slowMotion';
import { beginStrike, cancelStrike, landStrike, strike, strikeVelocity } from '../src/game/strike';

// What slow motion must not touch (docs/plans/2026-11-16-hermon-counters.md, D4, D5, D7).
const STEP = 1 / 60;

describe('slow motion fail safe', () => {
  it('readers see normal time again once the stepper has stopped; a paused stepper keeps it', () => {
    resetSlowMotion(); startSlowMotion();
    stepSlowMotion(SLOW.attack + .1, false, false, 1000);
    expect(timeScale(1000)).toBeCloseTo(SLOW.scale, 5); expect(timeScale(1000 + SLOW.stale)).toBeCloseTo(SLOW.scale, 5);
    expect(timeScale(1001 + SLOW.stale)).toBe(1); expect(gameDt(STEP, 5000)).toBe(STEP);
    stepSlowMotion(1, true, false, 6000); // paused: the scale is held and still counts as fresh
    expect(timeScale(6100)).toBeCloseTo(SLOW.scale, 5); expect(gameDt(STEP, 6100)).toBeCloseTo(STEP * SLOW.scale, 8);
    resetSlowMotion(); expect(timeScale(6100)).toBe(1);
  });
});

describe('hit-stop under slow motion', () => {
  const at: Vec3 = { x: 0, y: 0, z: -10 }, p: Vec3 = { x: 0, y: 0, z: 0 }, v: Vec3 = { x: 0, y: 0, z: 0 };
  const frozenSteps = (real?: number) => {
    cancelStrike(); beginStrike(0, at, 10); landStrike(true, .055);
    let steps = 0;
    while (strike.freeze > 0 && steps < 100) { strikeVelocity(v, p, STEP * SLOW.scale, false, false, real); steps++; }
    cancelStrike(); return steps;
  };
  it('lasts its own length in real time, not five times longer', () => {
    expect(frozenSteps(STEP)).toBe(4); // .055 s at 60 steps a second
    expect(frozenSteps()).toBe(17);    // without the real step it would follow the slowed game clock
  });
});

describe('camera effects under slow motion', () => {
  it('shake decays in real time while the game step is scaled', () => {
    const s = createShooter(), sim = createDroneSim(s), ctx = createStepContext(); s.drones.count = 0;
    const world = { castShot: () => false, lineClear: () => true };
    ctx.dt = STEP * SLOW.scale; ctx.realDt = STEP; ctx.flying = true;
    addTrauma(s.camFx, .5);
    stepShooter(s, sim, createAssistMemory(), world, ctx, () => {});
    expect(s.camFx.trauma).toBeCloseTo(.5 - CAM.traumaDecay * STEP, 6);
  });
  it('the shake keeps its own real clock, so it does not turn into a slow sway', () => {
    const s = createShooter(), sim = createDroneSim(s), ctx = createStepContext(), mem = createAssistMemory(); s.drones.count = 0;
    const world = { castShot: () => false, lineClear: () => true };
    ctx.dt = STEP * SLOW.scale; ctx.realDt = STEP; ctx.flying = true; addTrauma(s.camFx, .5);
    stepShooter(s, sim, mem, world, ctx, () => {}); // the first step starts the shake's clock from the game clock
    const game = s.clock, shake = ctx.shakeT!;
    for (let i = 0; i < 10; i++) stepShooter(s, sim, mem, world, ctx, () => {});
    expect(s.clock - game).toBeCloseTo(10 * STEP * SLOW.scale, 8); expect(ctx.shakeT! - shake).toBeCloseTo(10 * STEP, 8);
  });
  it('without a real step the shake follows the game clock exactly, as before', () => {
    const s = createShooter(), sim = createDroneSim(s), ctx = createStepContext(); s.drones.count = 0;
    ctx.dt = STEP; ctx.flying = true; addTrauma(s.camFx, .5);
    stepShooter(s, sim, createAssistMemory(), { castShot: () => false, lineClear: () => true }, ctx, () => {});
    expect(ctx.shakeT).toBeUndefined(); expect(s.camFx.trauma).toBeCloseTo(.5 - CAM.traumaDecay * STEP, 6);
  });
});
