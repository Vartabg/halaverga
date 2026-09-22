import { describe, expect, it } from 'vitest';
import { MathUtils } from 'three';
import { createShooter, springStep, type CamFx } from '../src/game/combat';
import { CHASE_BOOM } from '../src/game/presentation';
import { addTrauma, adsStep, advanceCamFx, boomFor, CAM, fovFor, kick, noise1, peakFactor, punchFov, reticleRadiusPx,
  speedFovTarget } from '../src/game/cameraFx';
const DEG = Math.PI / 180, RATES = [30, 60, 120, 165];
const fresh = (): CamFx => createShooter().camFx;
const out = { x: 0, v: 0 };
// Whole steps of 1/hz, then one remainder step, covering `span` seconds (0.5 s is 82.5 steps at 165 Hz).
function run(span: number, hz: number, step: (dt: number, t: number) => void) {
  const n = Math.floor(span * hz + 1e-9); let t = 0;
  for (let i = 0; i < n; i++) { t += 1 / hz; step(1 / hz, t); }
  const rem = span - n / hz; if (rem > 1e-12) { t += rem; step(rem, t); }
}
describe('camera feel math', () => {
  it('peakFactor inverts the peak of an impulse from rest', () => {
    expect(1 / peakFactor(10, .6)).toBeCloseTo(20.05, 2);
  });
  it('composes the kick spring exactly at any frame rate', () => {
    for (const hz of RATES) {
      const fx = fresh(); kick(fx, 1, .4); const v0 = fx.kickPv, y0 = fx.kickYv;
      run(.5, hz, (dt, t) => advanceCamFx(fx, dt, false, t));
      expect(Math.abs(fx.kickP - springStep(0, v0, CAM.kickW, CAM.kickZ, .5, out).x)).toBeLessThan(1e-9);
      expect(Math.abs(fx.kickPv - out.v)).toBeLessThan(1e-9);
      expect(Math.abs(fx.kickY - springStep(0, y0, CAM.kickW, CAM.kickZ, .5, out).x)).toBeLessThan(1e-9);
    }
  });
  it('peaks the kick at the requested angle after 115.9 ms, pitching up', () => {
    const fx = fresh(); kick(fx, 1, 0);
    expect(fx.kickPv).toBeGreaterThan(0); expect(fx.kickYv).toBe(0);
    let best = -Infinity, at = 0;
    for (let k = 1; k <= 3000; k++) {
      const x = springStep(0, fx.kickPv, CAM.kickW, CAM.kickZ, k * 1e-4, out).x;
      if (x > best) { best = x; at = k * 1e-4; }
    }
    expect(Math.abs(best / DEG - 1)).toBeLessThan(.002);
    expect(Math.abs(at - .1159)).toBeLessThanOrEqual(1e-4 + 1e-12);
  });
  it('climbs to a mean pitch of 1.8A under sustained 9 Hz kicks', () => {
    for (const A of [.2, .35]) for (const hz of [108, 60]) {
      const fx = fresh(); let next = 0, sum = 0, n = 0;
      run(3, hz, (dt, t) => {
        advanceCamFx(fx, dt, false, t);
        if (t >= next - 1e-9) { kick(fx, A, 0); next += 1 / 9; }
        if (t >= 2) { sum += fx.kickP; n++; }
      });
      expect(Math.abs(sum / n / DEG / (1.8 * A) - 1)).toBeLessThan(.05);
    }
  });
  it('caps the shot FOV punch at 1 deg', () => {
    for (const [peak, rate] of [[.3, 9], [.9, 9], [5, 20]]) for (const hz of RATES) {
      const fx = fresh(); let next = 0, max = 0;
      run(3, hz, (dt, t) => {
        advanceCamFx(fx, dt, false, t);
        if (t >= next - 1e-9) { punchFov(fx, 'shot', peak); next += 1 / rate; }
        for (let k = 1; k <= 20; k++) max = Math.max(max, springStep(fx.fovShot, fx.fovShotV, CAM.shotW, CAM.shotZ, k * .005, out).x);
        max = Math.max(max, fx.fovShot);
      });
      expect(max).toBeLessThanOrEqual(CAM.shotMax + 1e-9);
      if (peak > 1) expect(max).toBeGreaterThan(.9); // the cap is what binds
    }
  });
  it('returns every channel to exactly 0 within 2 s of the last shot', () => {
    for (const hz of RATES) {
      const fx = fresh(); let next = 0, side = 1;
      run(1, hz, (dt, t) => {
        advanceCamFx(fx, dt, false, t);
        if (t >= next - 1e-9) { kick(fx, .35, (side = -side) * .4 * .35); punchFov(fx, 'shot', .3); next += 1 / 9; }
      });
      kick(fx, .35, .14); punchFov(fx, 'shot', .3); punchFov(fx, 'kill', 1.5); addTrauma(fx, .45);
      run(2, hz, (dt, t) => advanceCamFx(fx, dt, false, 1 + t));
      for (const [key, value] of Object.entries(fx)) expect([key, value]).toEqual([key, 0]);
      for (const value of Object.values(fx)) expect(Object.is(value, 0)).toBe(true);
    }
  });
  it('snaps the ADS blend to exactly 0 and 1', () => {
    for (const hz of RATES) {
      let b = 1, t = 0;
      while (b !== 0 && t < 1) { b = adsStep(b, false, 1 / hz, false); t += 1 / hz; }
      expect(b).toBe(0); expect(t).toBeLessThanOrEqual(.7);
      b = 0; t = 0;
      while (b !== 1 && t < 1) { b = adsStep(b, true, 1 / hz, false); t += 1 / hz; }
      expect(b).toBe(1);
      expect(adsStep(0, false, 1 / hz, false)).toBe(0); expect(adsStep(1, true, 1 / hz, false)).toBe(1);
    }
  });
  it('reaches 95% of the ADS blend in 0.15 s in and 0.214 s out', () => {
    for (const hz of RATES) for (const [on, want] of [[true, Math.log(20) / 20], [false, Math.log(20) / 14]] as const) {
      let b = on ? 0 : 1, t = 0;
      while (on ? b < .95 : b > .05) { b = adsStep(b, on, 1 / hz, false); t += 1 / hz; }
      expect(t).toBeGreaterThanOrEqual(want - .01);
      expect(t).toBeLessThanOrEqual(want + Math.max(.01, 1 / hz)); // first frame past the analytic time
    }
    expect(Math.log(20) / 20).toBeCloseTo(.15, 2); expect(Math.log(20) / 14).toBeCloseTo(.214, 3);
    expect(adsStep(.3, true, 1 / 60, true)).toBe(1); expect(adsStep(.7, false, 1 / 60, true)).toBe(0);
  });
  it('holds ADS FOV at exactly 50 with a separately damped base', () => {
    let base = 65, blend = 0, fov = 0, inPlace = 65;
    for (let i = 0; i < 600; i++) {
      blend = adsStep(blend, true, 1 / 60, false);
      base = MathUtils.damp(base, speedFovTarget(0, false), CAM.fovRate, 1 / 60);
      fov = fovFor(base, blend, false, 0);
      if (i > 60) expect(fov).toBe(50);
      inPlace = MathUtils.damp(inPlace, speedFovTarget(0, false), CAM.fovRate, 1 / 60) - CAM.adsFovDrop * blend;
    }
    expect(fov).toBe(50); expect(inPlace).toBeLessThan(0); // the in-place damp this replaces runs away
    expect(fovFor(65, 1, true, .5)).toBe(65); expect(fovFor(66, 0, false, 0)).toBe(66);
    expect(speedFovTarget(17, false)).toBe(66); expect(speedFovTarget(100, false)).toBe(67); expect(speedFovTarget(100, true)).toBe(65);
  });
  it('keeps the chase boom bit-exact at rest', () => {
    const v = { x: 1, y: 2, z: 3 };
    for (const aspect of [.46, 1, 2.17, NaN]) for (const blend of [0, -1]) expect(boomFor(blend, aspect, v)).toEqual(CHASE_BOOM);
    expect(CHASE_BOOM).toEqual({ x: .85, y: .7, z: 5.3 });
  });
  it('frames the ADS shoulder at least 20% of the half-width off centre', () => {
    const v = { x: 0, y: 0, z: 0 }, tan = Math.tan(25 * DEG);
    for (const aspect of [.46, 1.44, 2.17]) {
      boomFor(1, aspect, v);
      expect(v.x).toBeGreaterThan(.25);
      expect((v.x - .25) / (v.z * tan * aspect)).toBeGreaterThanOrEqual(.2);
    }
    boomFor(.5, 2.17, v); expect(v.z).toBeCloseTo((5.3 + 2.6) / 2, 12); expect(v.y).toBeCloseTo((.7 + .45) / 2, 12);
  });
  it('zeroes every channel under reduced motion', () => {
    const fx = fresh(); kick(fx, 1, 1); punchFov(fx, 'shot', .3); punchFov(fx, 'kill', 1.5); addTrauma(fx, .8);
    advanceCamFx(fx, 1 / 60, false, .1);
    expect(Object.values(fx).every(v => v !== 0)).toBe(true);
    advanceCamFx(fx, 1 / 60, true, .2);
    for (const value of Object.values(fx)) expect(Object.is(value, 0)).toBe(true);
  });
  it('decays trauma linearly and bounds the shake by trauma squared', () => {
    const fx = fresh(); addTrauma(fx, .45); addTrauma(fx, -1); expect(fx.trauma).toBe(0); addTrauma(fx, 2); expect(fx.trauma).toBe(1);
    fx.trauma = .45; let t = 0, maxShake = 0;
    for (let i = 0; i < 12; i++) {
      advanceCamFx(fx, 1 / 60, false, t += 1 / 60);
      expect(fx.trauma).toBeCloseTo(.45 - t, 12);
      const bound = fx.trauma ** 2 * 2.5 * DEG;
      expect(Math.abs(fx.shakeP)).toBeLessThanOrEqual(bound); expect(Math.abs(fx.shakeY)).toBeLessThanOrEqual(bound);
      maxShake = Math.max(maxShake, Math.abs(fx.shakeP) / bound, Math.abs(fx.shakeY) / bound);
    }
    expect(maxShake).toBeGreaterThan(0);
    while (t < .45 + 1 / 60) advanceCamFx(fx, 1 / 60, false, t += 1 / 60);
    expect(fx.trauma).toBe(0); expect(Object.is(fx.shakeP, 0) && Object.is(fx.shakeY, 0)).toBe(true);
    let lo = 0, hi = 0;
    for (let x = -50; x < 50; x += .013) {
      const n = noise1(x); expect(n).toBe(noise1(x)); lo = Math.min(lo, n); hi = Math.max(hi, n);
      expect(Math.abs(noise1(x + 1e-4) - n)).toBeLessThan(.01); // continuous
    }
    expect(lo).toBeGreaterThanOrEqual(-1); expect(hi).toBeLessThanOrEqual(1); expect(hi - lo).toBeGreaterThan(1);
  });
  it('sizes the reticle from the cone half-angle and FOV', () => {
    expect(reticleRadiusPx(2 * DEG, 65, 800)).toBeCloseTo(Math.tan(2 * DEG) / Math.tan(32.5 * DEG) * 400, 12);
  });
});
