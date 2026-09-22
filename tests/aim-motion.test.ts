import { describe, expect, it } from 'vitest';
import { AIM_MOVE, aimVelocity, hipVelocity } from '../src/game/aimMotion';
import { SPEED, advanceVelocity, type Intent, type Vec } from '../src/game/motion';

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

describe.each(RATES)('hip-fire movement at %i Hz', hz => {
  it('clamps a 34 m/s surge to <= 13.5 m/s by .6 s, never below 12.5 while held', () => {
    let min = Infinity;
    const { v } = run(cruise(), hz, .6, (v, dt) => hipVelocity(v, intent(1), 0, 0, true, true, dt));
    expect(speed(v)).toBeLessThanOrEqual(13.5);
    run(cruise(), hz, 3, (v, dt) => hipVelocity(v, intent(1), 0, 0, true, true, dt), w => { min = Math.min(min, speed(w)); });
    expect(min).toBeGreaterThanOrEqual(12.5);
    expect(Math.abs(speed(run(cruise(), hz, 3, (v, dt) => hipVelocity(v, intent(1), 0, 0, true, true, dt)).v) - 13)).toBeLessThan(.05);
    expect(speed(run(cruise(), hz, 3, (v, dt) => hipVelocity(v, intent(1), 0, .4, true, true, dt)).v)).toBeCloseTo(13, 1);
  });
  it('keeps an 8 m/s pointer cruise bit-identical to normal flight', () => {
    const i = intent(8 / 34);
    let v: Vec = { x: 0, y: 0, z: -8 };
    for (let k = 0; k < 2 * hz; k++) {
      const next = hipVelocity(v, i, 0, 0, true, true, 1 / hz);
      expect(next).toEqual(advanceVelocity(v, i, 0, 0, true, true, 1 / hz));
      expect(Math.abs(speed(next) - 8)).toBeLessThanOrEqual(.05); v = next;
    }
  });
  it('matches advanceVelocity without surge below 13.5 m/s and on the ground', () => {
    for (const [v, i, yaw, pitch] of [[{ x: 3, y: 1, z: -12 }, intent(1, .3), .4, .2], [{ x: 0, y: 0, z: 0 }, intent(), 0, 0],
      [{ x: -9, y: 0, z: 9 }, intent(0, -1, 1), 2, -.5]] as const) {
      expect(hipVelocity(v, i, yaw, pitch, true, false, 1 / hz)).toEqual(advanceVelocity(v, i, yaw, pitch, true, false, 1 / hz));
      expect(hipVelocity(v, i, yaw, pitch, false, true, 1 / hz)).toEqual(advanceVelocity(v, i, yaw, pitch, false, true, 1 / hz));
    }
  });
  it('brakes faster than normal flight would', () => {
    const t = (step: (v: Vec, dt: number) => Vec) => { let at = Infinity; run(cruise(), hz, 3, step, (w, s) => { if (speed(w) <= 13.5 && at === Infinity) at = s; }); return at; };
    const hip = t((v, dt) => hipVelocity(v, intent(1), 0, 0, true, true, dt));
    const plain = t((v, dt) => advanceVelocity(v, intent(1), 0, 0, true, false, dt));
    expect(hip).toBeLessThanOrEqual(.6); expect(plain).toBeGreaterThan(.9);
  });
});
