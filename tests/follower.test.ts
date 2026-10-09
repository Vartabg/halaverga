import { describe, expect, it } from 'vitest';
import { createFollower, resetFollower, retuneFollower, stepFollower } from '../src/world/follower';

/** Output samples at every 1/30 s (common to 30/60/120/165 Hz is not exact for 165, so 165 samples at its nearest frame). */
function trace(f: number, z: number, r: number, hz: number, input: (t: number, prev: number, dt: number) => number, T = .6) {
  const s = createFollower(f, z, r), dt = 1 / hz, out: number[] = [], all: [number, number][] = [];
  let x = 0;
  for (let i = 1; i <= Math.round(T * hz); i++) {
    x = input(i * dt, x, dt); stepFollower(s, x, dt); all.push([i * dt, s.y]);
  }
  for (let k = 1; k <= Math.round(T * 30); k++) {
    const t = k / 30; let best = all[0];
    for (const p of all) if (Math.abs(p[0] - t) < Math.abs(best[0] - t)) best = p;
    out.push(best[1]);
  }
  return { out, all };
}
const step = () => 1;
/** The aim weight the raise follower sees: an exponential ease at 35/s toward 1. */
const eased = (_t: number, prev: number, dt: number) => prev + (1 - prev) * (1 - Math.exp(-35 * dt));
const peak = (all: [number, number][]) => all.reduce((a, b) => b[1] > a[1] ? b : a);

describe('second-order follower', () => {
  it('does not overshoot when damped at z .98 with r 0', () => {
    for (const hz of [30, 60, 120, 165]) for (const f of [2.2, 3, 12]) {
      const { all } = trace(f, .98, 0, hz, step, 1.5);
      expect(Math.max(...all.map(p => p[1]))).toBeLessThanOrEqual(1 + 1e-9);
      for (let i = 1; i < all.length; i++) expect(all[i][1]).toBeGreaterThanOrEqual(all[i - 1][1] - 1e-12);
    }
  });
  it('(6, .6, 2) overshoots the eased aim weight with its peak at 60-140 ms', () => {
    for (const hz of [30, 60, 120, 165]) {
      const [t, y] = peak(trace(6, .6, 2, hz, eased).all);
      expect(y).toBeGreaterThan(1.02);
      expect(t).toBeGreaterThanOrEqual(.06); expect(t).toBeLessThanOrEqual(.14);
    }
  });
  it('agrees within 3% across 30/60/120/165 Hz at common times', () => {
    for (const [f, z, r] of [[8, .55, 0], [3, .75, 0], [12, .98, 0], [2.2, .98, 0], [6, .6, 2]]) {
      const ref = trace(f, z, r, 165, step).out;
      for (const hz of [30, 60, 120]) {
        const got = trace(f, z, r, hz, step).out;
        // 165 Hz frames miss the 1/30 grid by up to 3 ms: compare only on grid points 165 Hz hits within .5 ms.
        got.forEach((y, k) => { if (Math.abs(Math.round((k + 1) / 30 * 165) / 165 - (k + 1) / 30) < 5e-4) expect(Math.abs(y - ref[k])).toBeLessThan(.03); });
        const at60 = trace(f, z, r, 60, step).out;
        got.forEach((y, k) => expect(Math.abs(y - at60[k])).toBeLessThan(.03));
      }
    }
  });
  it('(8, .55) at dt 1/30 stays bounded within 1.2x the continuous overshoot', () => {
    const z = .55, over = Math.exp(-z * Math.PI / Math.sqrt(1 - z * z));
    const { all } = trace(8, z, 0, 30, step, 3);
    expect(Math.max(...all.map(p => p[1])) - 1).toBeLessThanOrEqual(1.2 * over);
    expect(Math.abs(all[all.length - 1][1] - 1)).toBeLessThan(1e-3);
  });
  it('treats a NaN, zero or negative dt as no change', () => {
    const s = createFollower(6, .6, 2);
    stepFollower(s, 1, 1 / 60); const snap = { ...s };
    for (const dt of [NaN, 0, -1]) { stepFollower(s, 5, dt); expect(s).toEqual(snap); }
  });
  it('retuneFollower keeps y and yd; resetFollower is exact rest', () => {
    const s = createFollower(8, .55, 0);
    for (let i = 0; i < 3; i++) stepFollower(s, 1, 1 / 60);
    const { y, yd, xp } = s;
    retuneFollower(s, 12, .98, 0);
    expect(s.y).toBe(y); expect(s.yd).toBe(yd); expect(s.xp).toBe(xp);
    expect(s.k1).toBeCloseTo(.98 / (Math.PI * 12), 12);
    resetFollower(s, .25);
    expect(s.y).toBe(.25); expect(s.yd).toBe(0);
    stepFollower(s, .25, 1 / 60); expect(s.y).toBe(.25); expect(s.yd).toBe(0);
  });
});
