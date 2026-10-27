import { describe, expect, it } from 'vitest';
import { STRIKE, beginStrike, cancelStrike, landStrike, strike, strikeVelocity } from '../src/game/strike';

describe('sword strike dive', () => {
  it('dives at the target at strike speed, freezes on the blow, carries through and hands flight back', () => {
    cancelStrike(); const p = { x: 0, y: 0, z: 0 }, v = { x: 0, y: 0, z: 0 };
    beginStrike(0, { x: 0, y: 0, z: -30 }, 30);
    for (let k = 0; k < 10; k++) strikeVelocity(v, p, 1 / 60, false);
    expect(v.z).toBeCloseTo(-STRIKE.minSpeed - 16.43, 0); // 30 m in .42 s, above the minimum expect(Math.hypot(v.x, v.y)).toBeLessThan(1e-6);
    landStrike(); strikeVelocity(v, p, 1 / 60, false);
    expect(Math.hypot(v.x, v.y, v.z)).toBe(0); // the freeze
    for (let k = 0; k < 4; k++) strikeVelocity(v, p, 1 / 60, false);
    v.x = v.y = v.z = 0; strikeVelocity(v, p, 1 / 60, false); expect(v.z).toBeLessThan(-20); // momentum out the far side
    for (let k = 0; k < 40; k++) { v.x = v.y = v.z = 0; strikeVelocity(v, p, 1 / 60, false); }
    expect(strike.phase).toBe(0); expect(strikeVelocity(v, p, 1 / 60, false)).toBe(false);
  });
  it('a dive that never connects gives up after its time and carries on', () => {
    cancelStrike(); const p = { x: 0, y: 0, z: 0 }, v = { x: 0, y: 0, z: 0 };
    beginStrike(0, { x: 0, y: 0, z: -500 });
    for (let t = 0; t < STRIKE.maxTime + .05; t += 1 / 60) strikeVelocity(v, p, 1 / 60, false);
    expect(strike.phase).toBe(2); expect(strike.landed).toBe(false);
  });
  it('a long dive zips faster, capped', () => {
    cancelStrike(); beginStrike(0, { x: 0, y: 0, z: -30 }, 30); expect(strike.speed).toBeCloseTo(30 / STRIKE.dive, 3);
    beginStrike(0, { x: 0, y: 0, z: -400 }, 400); expect(strike.speed).toBe(STRIKE.maxSpeed);
  });
  it('a finishing blow brakes to a hover instead of carrying through', () => {
    cancelStrike(); const p = { x: 0, y: 0, z: 0 }, v = { x: 0, y: 0, z: -130 };
    beginStrike(0, { x: 0, y: 0, z: -30 }, 30); landStrike(false);
    for (let k = 0; k < 20 && strike.phase !== 0; k++) { v.z = -130; strikeVelocity(v, p, 1 / 60, false); }
    expect(v.z).toBe(0); expect(strike.phase).toBe(0);
  });
  it('reduced motion strikes without the freeze', () => {
    cancelStrike(); const p = { x: 0, y: 0, z: 0 }, v = { x: 0, y: 0, z: 0 };
    beginStrike(0, { x: 0, y: 0, z: -30 }); landStrike(); strikeVelocity(v, p, 1 / 60, true);
    expect(Math.hypot(v.x, v.y, v.z)).toBeGreaterThan(0);
  });
});
