import { describe, expect, it } from 'vitest';
import { AIM_MOVE, aimVelocity } from '../src/game/aimMotion';
import { SPEED, advanceVelocity, type Intent, type Vec } from '../src/game/motion';
import { createShooter, moveMode, pressFire } from '../src/game/combat';

const RATES = [30, 60, 120, 165];
const speed = (v: Vec) => Math.hypot(v.x, v.y, v.z);
const flat = (v: Vec) => Math.hypot(v.x, v.z);
const intent = (forward = 0, strafe = 0, vertical = 0): Intent => ({ forward, strafe, vertical });
/** Steps `step` for `seconds` at `hz`, calling `each(v, t)` after every step; returns the final velocity and path length. */
function run(v0: Vec, hz: number, seconds: number, step: (v: Vec, dt: number) => Vec, each?: (v: Vec, t: number) => void) {
  let v = v0, path = 0; const dt = 1 / hz, n = Math.round(seconds * hz);
  for (let k = 1; k <= n; k++) { v = step(v, dt); path += speed(v) * dt; each?.(v, k * dt); }
  return { v, path };
}
const cruise = (): Vec => ({ x: 0, y: 0, z: -SPEED.surge });

describe.each(RATES)('ADS movement at %i Hz', hz => {
  it('brakes from 34 m/s to <= 6.5 m/s by .5 s, within 8 m, and settles at 6', () => {
    const f = (v: Vec, dt: number) => aimVelocity(v, intent(1), 0, 0, true, dt);
    const { v, path } = run(cruise(), hz, .5, f);
    expect(speed(v)).toBeLessThanOrEqual(6.5); expect(path).toBeLessThanOrEqual(8);
    expect(Math.abs(speed(run(v, hz, 2, f).v) - 6)).toBeLessThanOrEqual(.05);
  });
  it('creeps at 2.82 m/s under pointer cruise throttle and stops with no input', () => {
    const creep = run(cruise(), hz, 3, (v, dt) => aimVelocity(v, intent(8 / 34), 0, 0, true, dt)).v;
    expect(Math.abs(speed(creep) - 6 * 2 * 8 / 34)).toBeLessThanOrEqual(.05);
    expect(Math.abs(speed(run(cruise(), hz, 3, (v, dt) => aimVelocity(v, intent(.235), 0, 0, true, dt)).v) - 2.82)).toBeLessThanOrEqual(.05);
    expect(speed(run(cruise(), hz, 3, (v, dt) => aimVelocity(v, intent(), 0, 0, true, dt)).v)).toBeLessThan(.1);
  });
  it('limits the climb to 4 m/s and lifts with pitch while moving forward', () => {
    let peak = 0;
    run({ x: 0, y: 0, z: 0 }, hz, 2, (v, dt) => aimVelocity(v, intent(0, 0, 1), 0, 0, true, dt), v => { peak = Math.max(peak, Math.abs(v.y)); });
    expect(peak).toBeLessThanOrEqual(AIM_MOVE.vertical); expect(peak).toBeGreaterThan(3.95);
    const lift = run(cruise(), hz, 3, (v, dt) => aimVelocity(v, intent(1), 0, .8, true, dt)).v;
    expect(Math.abs(lift.y - 4 * .5 * Math.sin(.8))).toBeLessThanOrEqual(.05);
    expect(Math.abs(flat(lift) - 6)).toBeLessThanOrEqual(.05);
    run(cruise(), hz, 3, (v, dt) => aimVelocity(v, intent(1, .5), 0, 0, true, dt), v => expect(v.y).toBe(0));
  });
  it('walks at 3.5 m/s on the ground under gravity', () => {
    const f = (v: Vec, dt: number) => aimVelocity(v, intent(1, 1), .7, 0, false, dt);
    let prev = 0;
    const { v } = run({ x: 0, y: 0, z: 0 }, hz, 2, f, (w, t) => { expect(w.y).toBeCloseTo(Math.max(-20, -22 * t), 9); prev = w.y; });
    expect(Math.abs(flat(v) - 3.5)).toBeLessThanOrEqual(.05); expect(prev).toBe(-20);
    expect(Math.abs(flat(run({ x: 0, y: 0, z: 0 }, hz, 2, (w, dt) => aimVelocity(w, intent(1), 0, 0, false, dt)).v) - 3.5)).toBeLessThanOrEqual(.05);
  });
  it('caps the velocity change at 110 m/s^2', () => {
    const v0 = { x: 30, y: -20, z: 30 }, next = aimVelocity(v0, intent(-1), 1, 0, true, 1 / hz);
    expect(Math.hypot(next.x - v0.x, next.y - v0.y, next.z - v0.z)).toBeLessThanOrEqual(110 / hz + 1e-9);
  });
});

// Garo 2026-09-26: firing never brakes flight. There is no hip-fire velocity any more; a held trigger keeps mode 0 and the plain
// advanceVelocity, so a 34 m/s surge stays 34 m/s for as long as the trigger is down and through the 0.3 s trailing window.
describe.each(RATES)('firing never caps speed at %i Hz', hz => {
  it('keeps a 34 m/s surge at 34 m/s with the trigger held and just after a shot', () => {
    const s = createShooter(); pressFire(s, 'touch');
    expect(moveMode(s)).toBe(0);
    s.weapon.sinceShot = .1; expect(moveMode(s)).toBe(0);
    let min = Infinity;
    const { v } = run(cruise(), hz, 3, (v, dt) => moveMode(s) === 2 ? aimVelocity(v, intent(1), 0, 0, true, dt) : advanceVelocity(v, intent(1), 0, 0, true, true, dt),
      w => { min = Math.min(min, speed(w)); });
    expect(min).toBeGreaterThanOrEqual(SPEED.surge - 1e-6); expect(speed(v)).toBeCloseTo(SPEED.surge, 6);
    expect(moveMode(s)).toBe(0);
  });
});
