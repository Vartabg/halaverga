import { beforeEach, describe, expect, it } from 'vitest';
import { carve, resetCarve, CARVE } from '../src/game/carve';
import { advanceVelocity, moving, type Intent, type Vec } from '../src/game/motion';
const DT = 1 / 60, DEG = 180 / Math.PI;
const heading = (v: Vec) => Math.atan2(-v.x, -v.z);
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const THRUST: Intent = { forward: 1, strafe: 0, vertical: 0 }, NONE: Intent = { forward: 0, strafe: 0, vertical: 0 };
beforeEach(() => resetCarve());
/** A steady turn at w rad/s for s seconds; carve on/off. Returns the final velocity and yaw. */
function turn(w: number, s: number, withCarve: boolean, v: Vec = { x: 0, y: 0, z: -13 }) {
  let yaw = 0;
  for (let t = 0; t < s - 1e-9; t += DT) {
    yaw += w * DT;
    if (withCarve) carve(v, yaw, DT, true, 0);
    v = advanceVelocity(v, THRUST, yaw, 0, true, false, DT);
  }
  return { v, yaw };
}
describe('carve', () => {
  it('leaves turns under 2 rad/s bit-identical to advanceVelocity alone', () => {
    for (const w of [.5, 1, 1.99]) {
      resetCarve();
      const a = turn(w, 2, true), b = turn(w, 2, false);
      expect(a.v).toEqual(b.v);
    }
  });
  it('a 4.2 rad/s turn at 13 m/s with thrust: lag 20 deg or less, speed 11 m/s or more', () => {
    const plain = turn(4.2, 1.5, false), { v, yaw } = turn(4.2, 1.5, true);
    const lag = Math.abs(wrap(heading(v) - yaw)) * DEG;
    expect(lag).toBeLessThanOrEqual(20);
    expect(Math.hypot(v.x, v.z)).toBeGreaterThanOrEqual(11);
    expect(Math.abs(wrap(heading(plain.v) - plain.yaw)) * DEG).toBeGreaterThan(40); // the skid it fixes
  });
  it('rotates at most 60*dt/vh per step and keeps the speed', () => {
    const v = { x: 0, y: 2, z: -13 };
    carve(v, 0, DT, true, 0);
    const before = heading(v);
    carve(v, 6 * DT, DT, true, 0);
    expect(Math.abs(wrap(heading(v) - before))).toBeCloseTo(CARVE.accel * DT / 13, 12);
    expect(Math.hypot(v.x, v.z)).toBeCloseTo(13, 12); expect(v.y).toBe(2);
  });
  it('a coast plus a 6 rad/s look flick keeps its travel direction (gate off)', () => {
    let v: Vec = { x: 0, y: 0, z: -13 }, yaw = 0;
    const on = moving(NONE) || false || false;
    for (let t = 0; t < .3; t += DT) {
      yaw += 6 * DT; carve(v, yaw, DT, on, 0);
      v = advanceVelocity(v, NONE, yaw, 0, true, false, DT);
    }
    expect(on).toBe(false);
    expect(Math.abs(heading(v))).toBeLessThan(1e-9);
  });
  it('an epoch change (a respawn or reset) resets it', () => {
    const v = { x: 0, y: 0, z: -13 };
    carve(v, 0, DT, true, 0);
    carve(v, 3, DT, true, 1);
    expect(v).toEqual({ x: 0, y: 0, z: -13 });
    carve(v, 3 + 6 * DT, DT, true, 1);
    expect(heading(v)).not.toBe(0);
  });
  it('ignores slow travel', () => {
    const v = { x: 0, y: 0, z: -1.5 };
    carve(v, 0, DT, true, 0); carve(v, .1, DT, true, 0);
    expect(v).toEqual({ x: 0, y: 0, z: -1.5 });
  });
  it('allocates nothing', () => {
    expect(/\bnew\b|\[|\(\{|=\s*\{/.test(carve.toString())).toBe(false);
  });
});
