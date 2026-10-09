import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AdaptiveThumbs } from '../src/game/adaptiveThumbs';
import { thumbTurn, THUMB } from '../src/game/edgeTurn';
import { thumbEdge, thumbThrottle } from '../src/game/thumbFlight';
import { clearInput, look, runtime } from '../src/game/runtime';
import { SPEED, advanceVelocity } from '../src/game/motion';
import { createShooter, moveMode, pressFire } from '../src/game/combat';
import { readFileSync } from 'node:fs';
// The classic one thumb is main 7945430 again (Garo 2026-09-26): rate control with one finger, shooting layered on top through
// tap-a-drone and never inside the flight path. Node math on the real modules; none of it is iPhone validation.
const DT = 1 / 60, W = 852, H = 393;
/** Mirrors useClassicThumbs.sync: the controller's output becomes runtime.thumb. */
const sync = (c: AdaptiveThumbs) => Object.assign(runtime.thumb, { active: c.active, throttle: c.output.forward, strafe: c.output.strafe, edgeTurn: c.output.edgeTurn, edgePitch: c.output.edgePitch, bank: 0 });
beforeEach(() => { clearInput(true); runtime.yaw = 0; runtime.pitch = 0; });
afterEach(() => clearInput(true));

describe('classic one thumb: a single held edge contact', () => {
  it('turns 360 deg in about 4.2 s with no re-grip, at exactly 1.5 rad/s from the first step', () => {
    const c = new AdaptiveThumbs(); c.start(1, 600, 200); c.activate(); sync(c);
    expect(runtime.thumb.active).toBe(true); expect(runtime.thumb.throttle).toBe(thumbThrottle(0));
    // One slide to the right edge (the drag itself looks), then the finger rests there.
    c.move(1, W, 200, W, H); look(c.output.lookX, c.output.lookY); sync(c);
    expect(runtime.thumb.edgeTurn).toBe(1); expect(thumbEdge(W - 8, W)).toBeCloseTo(36 / 44, 12);
    const y0 = runtime.yaw; let t = 0;
    while (Math.abs(runtime.yaw - y0) < 2 * Math.PI && t < 10) { thumbTurn(DT); t += DT; }
    expect(Math.abs(t - 2 * Math.PI / THUMB.yaw)).toBeLessThanOrEqual(.1);
    expect(runtime.yaw).toBeLessThan(y0); // the right edge turns right, as on main
    expect(runtime.thumb.throttle).toBe(thumbThrottle(W - 600)); // still cruising: no re-grip, no brake
  });
  it('slides look at 0.003 x 1.6 rad per px with no acceleration, in both orientations', () => {
    for (const [w, h] of [[W, H], [H, W]] as const) for (const dx of [5, 40, 120]) {
      const c = new AdaptiveThumbs(); c.start(1, 200, 200); c.activate(); runtime.yaw = 0;
      c.move(1, 200 + dx, 200, w, h); look(c.output.lookX, c.output.lookY);
      expect(runtime.yaw).toBeCloseTo(-dx * 1.6 * .003, 12);
      c.move(1, 200 + dx, 200 + dx, w, h); expect(c.output.lookX).toBe(0); expect(c.output.lookY).toBe(dx * 1.6);
    }
  });
  it('a quick tap never lifts: nothing moves until the 180 ms hold or an 8 px slide', () => {
    const c = new AdaptiveThumbs(); c.start(1, 100, 300); sync(c);
    expect(c.active).toBe(false); expect(runtime.thumb.throttle).toBe(0);
    c.move(1, 105, 300, W, H); expect(c.active).toBe(false); expect(c.output.forward).toBe(0);
    c.end(1); sync(c); expect(c.mode).toBe('idle'); expect(runtime.thumb.active).toBe(false);
    const held = new AdaptiveThumbs(); held.start(1, 100, 300); held.activate(); expect(held.active).toBe(true); expect(held.output.forward).toBe(thumbThrottle(0));
    const slid = new AdaptiveThumbs(); slid.start(1, 100, 300); slid.move(1, 108, 300, W, H); expect(slid.active).toBe(true); expect(slid.output.forward).toBe(thumbThrottle(8));
  });
  it('release hovers: the thumb intent clears at once and the cruise decays', () => {
    const c = new AdaptiveThumbs(); c.start(1, 100, 300); c.activate(); c.move(1, 100, 200, W, H); sync(c);
    let v = { x: 0, y: 0, z: -34 };
    for (let k = 0; k < 30; k++) v = advanceVelocity(v, { forward: runtime.thumb.throttle, strafe: 0, vertical: 0 }, 0, 0, true, true, DT);
    expect(Math.hypot(v.x, v.y, v.z)).toBeGreaterThan(20);
    c.end(1); sync(c);
    expect(runtime.thumb).toEqual({ active: false, throttle: 0, strafe: 0, edgeTurn: 0, edgePitch: 0, bank: 0 });
    for (let k = 0; k < 120; k++) v = advanceVelocity(v, { forward: 0, strafe: 0, vertical: 0 }, 0, 0, true, false, DT);
    expect(Math.hypot(v.x, v.y, v.z)).toBeLessThan(.5);
  });
});

describe('shooting stays out of the classic flight path', () => {
  it('firing at 34 m/s keeps 34 m/s: the trigger never changes the movement mode or the velocity step', () => {
    const s = createShooter(); s.input.lookSource = 'touch'; pressFire(s, 'touch'); s.weapon.sinceShot = .05;
    expect(moveMode(s)).toBe(0);
    let v = { x: 0, y: 0, z: -SPEED.surge };
    for (let k = 0; k < 180; k++) {
      v = advanceVelocity(v, { forward: 1, strafe: 0, vertical: 0 }, 0, 0, true, true, DT);
      expect(Math.hypot(v.x, v.y, v.z)).toBeCloseTo(SPEED.surge, 6);
    }
  });
  it('the flight modules never import the shooter, and the classic hook never mounts a Fire or Aim button', () => {
    for (const f of ['adaptiveThumbs', 'thumbFlight']) {
      const src = readFileSync(`src/game/${f}.ts`, 'utf8');
      expect(src).not.toMatch(/combat|shooter|aimAssist|Fire/);
    }
    const hook = readFileSync('src/ui/useClassicThumbs.tsx', 'utf8');
    expect(hook).not.toMatch(/FireControls|setExternal|aria-label="Fire"|aria-label="Aim"/);
    expect(hook).toMatch(/blastAt\(/); // tap a drone goes through the Lab's aimed-shot entry (tapFire.ts)
  });
});
