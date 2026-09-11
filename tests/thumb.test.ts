import { afterEach, describe, expect, it } from 'vitest';
import { advanceVelocity, SPEED } from '../src/game/motion';
import { clearInput, readIntent, releaseThumb, runtime } from '../src/game/runtime';
import { thumbEdge, thumbThrottle } from '../src/game/thumbFlight';
afterEach(() => clearInput(true));
describe('one-thumb flight', () => {
  it('keeps small aiming corrections at a gentle cruise and increases speed smoothly', () => {
    expect(thumbThrottle(0) * SPEED.surge).toBe(8);
    expect(thumbThrottle(24)).toBe(thumbThrottle(0));
    const speeds = [0, 24, 36, 60, 90, 120, 900].map(thumbThrottle);
    expect(speeds).toEqual([...speeds].sort((a, b) => a - b));
    expect(thumbThrottle(900)).toBe(1);
    expect(thumbThrottle(25) - thumbThrottle(24)).toBeLessThan(.001);
  });
  it('can keep turning in both directions at any screen size', () => {
    for (const width of [320, 393, 852, 1024]) {
      expect(thumbEdge(0, width)).toBe(-1);
      expect(thumbEdge(width, width)).toBe(1);
      expect(thumbEdge(width / 2, width)).toBe(0);
    }
  });
  it('feeds the shared controller and clears all thumb intent on release', () => {
    runtime.thumb = { active: true, throttle: 1, edgeTurn: 1, edgePitch: .5, bank: 1 };
    expect(readIntent()).toEqual({ forward: 1, strafe: 0, vertical: 0 });
    releaseThumb();
    expect(readIntent()).toEqual({ forward: 0, strafe: 0, vertical: 0 });
    expect(runtime.thumb).toEqual({ active: false, throttle: 0, edgeTurn: 0, edgePitch: 0, bank: 0 });
    let velocity = { x: 0, y: 0, z: -34 };
    for (let frame = 0; frame < 60; frame++) velocity = advanceVelocity(velocity, readIntent(), 0, 0, true, false, 1 / 60);
    expect(Math.abs(velocity.z)).toBeLessThan(.01);
  });
});
