import { afterEach, describe, expect, it } from 'vitest';
import { cruiseThrottle } from '../src/game/trackpadFlight';
import { clearInput, readIntent, runtime, startTrackpad, stopTrackpad } from '../src/game/runtime';
import { SPEED } from '../src/game/motion';
import { useGame } from '../src/game/store';
afterEach(() => clearInput(true));
describe('trackpad cruise', () => {
  it('increases speed on upward scrolling and reduces it on downward scrolling', () => {
    const gentle = 8 / SPEED.surge;
    expect(cruiseThrottle(gentle, -40, 0, 1000)).toBeGreaterThan(gentle);
    expect(cruiseThrottle(gentle, 40, 0, 1000)).toBeLessThan(gentle);
    expect(cruiseThrottle(gentle, 0, 0, 1000)).toBe(gentle);
  });
  it('normalizes line/page units and limits extreme scroll events and speed', () => {
    expect(cruiseThrottle(.4, -2, 1, 1000)).toBe(cruiseThrottle(.4, -32, 0, 1000));
    expect(cruiseThrottle(.4, -.03, 2, 1000)).toBe(cruiseThrottle(.4, -30, 0, 1000));
    expect(cruiseThrottle(.4, -9999, 0, 1000) - .4).toBeCloseTo(.2);
    expect(cruiseThrottle(1, -9999, 0, 1000)).toBe(1);
    expect(cruiseThrottle(0, 9999, 0, 1000)).toBe(3 / SPEED.surge);
    expect(cruiseThrottle(.4, NaN, 0, 1000)).toBe(.4);
  });
  it('starts gently, feeds the shared movement interface, and clears steering on hover', () => {
    startTrackpad(); expect(readIntent().forward * SPEED.surge).toBe(8);
    expect(useGame.getState().trackpadFlying).toBe(true);
    runtime.trackpad.edgeTurn = 1; runtime.trackpad.edgePitch = 1;
    stopTrackpad(); expect(readIntent()).toEqual({ forward: 0, strafe: 0, vertical: 0 });
    expect(runtime.trackpad.edgeTurn).toBe(0); expect(runtime.trackpad.edgePitch).toBe(0);
    expect(useGame.getState().trackpadFlying).toBe(false);
  });
  it('clears cruise on global interruption and starts the next flight at gentle speed', () => {
    startTrackpad(); runtime.trackpad.throttle = 1; clearInput(true);
    expect(runtime.trackpad.active).toBe(false); expect(readIntent().forward).toBe(0);
    startTrackpad(); expect(runtime.trackpad.throttle * SPEED.surge).toBe(8);
  });
});
