import { describe, expect, it } from 'vitest';
import { advanceVelocity, boundMovement, landingVelocity, moving, safeDelta, SPEED, START, validCheckpoint } from '../src/game/motion';
const neutral = { forward: 0, strafe: 0, vertical: 0 };
describe('assisted flight', () => {
  it('accelerates smoothly and limits diagonal speed', () => {
    let v = { x: 0, y: 0, z: 0 };
    for (let i = 0; i < 180; i++) v = advanceVelocity(v, { ...neutral, forward: 1, strafe: 1 }, 0, 0, true, true, 1 / 60);
    expect(Math.hypot(v.x, v.y, v.z)).toBeLessThanOrEqual(SPEED.surge);
    expect(Math.hypot(v.x, v.y, v.z)).toBeGreaterThan(33);
  });
  it('brakes to hover after release even with surge enabled', () => {
    let v = { x: 0, y: 0, z: -34 };
    for (let i = 0; i < 60; i++) v = advanceVelocity(v, neutral, 0, 0, true, true, 1 / 60);
    expect(Math.hypot(v.x, v.y, v.z)).toBeLessThan(.01);
  });
  it('uses camera pitch for touch ascent and descent', () => {
    const up = advanceVelocity({ x: 0, y: 0, z: 0 }, { ...neutral, forward: 1 }, 0, .8, true, false, 1 / 60);
    const down = advanceVelocity({ x: 0, y: 0, z: 0 }, { ...neutral, forward: 1 }, 0, -.8, true, false, 1 / 60);
    expect(up.y).toBeGreaterThan(0); expect(down.y).toBeLessThan(0);
  });
  it('keeps walking horizontal while allowing gravity', () => {
    const v = advanceVelocity({ x: 0, y: 0, z: 0 }, { ...neutral, forward: 1 }, 0, 1, false, true, 1 / 60);
    expect(v.y).toBeLessThan(0); expect(Math.abs(v.z)).toBeLessThan(SPEED.walk);
  });
  it('keeps skimming above water and within the district', () => {
    const move = boundMovement({ x: 204, y: 2, z: -239 }, { x: 4, y: -5, z: -8 }, true);
    expect(move.x).toBe(1); expect(move.y).toBeCloseTo(-.3); expect(move.z).toBe(-1);
  });
  it('approaches a landing without overshoot and permits intent cancellation', () => {
    const p = { x: 0, y: 5, z: 0 }, target = { x: 0, y: 2, z: 0 };
    for (let i = 0; i < 240; i++) { const v = landingVelocity(p, target); p.y += v.y / 60; expect(p.y).toBeGreaterThanOrEqual(target.y); }
    expect(Math.abs(p.y - 2)).toBeLessThan(.002);
    expect(moving(neutral)).toBe(false); expect(moving({ ...neutral, strafe: .3 })).toBe(true);
  });
  it('rejects non-finite and out-of-world saves', () => {
    expect(validCheckpoint(START)).toBe(true);
    for (const bad of [null, {}, { x: NaN, y: 5, z: 2 }, { x: 9999, y: 4, z: 0 }, { x: 0, y: -6, z: 0 }]) expect(validCheckpoint(bad)).toBe(false);
  });
  it('bounds elapsed time after interruption', () => {
    expect(safeDelta(12)).toBe(1 / 30); expect(safeDelta(NaN)).toBe(0); expect(safeDelta(-1)).toBe(0);
  });
});
