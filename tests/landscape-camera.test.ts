import { describe, expect, it } from 'vitest';
import { MathUtils } from 'three';
import { ADS_GAIN } from '../src/game/combat';
import { CHASE_BOOM, CHASE_HEAD } from '../src/game/presentation';
import { adsFovOf, baseFovStep, boomFor, fovFor, hipFovFor, shortWeight, speedFovTarget } from '../src/game/cameraFx';
import { sightLine } from '../src/world/suitRoll';
// The phone-landscape camera: a short CSS viewport (w 1) narrows the hip FOV toward a 95 deg horizontal cap and nears the boom.
const DEG = Math.PI / 180, RATES = [30, 60, 120, 165], PHONE = 852 / 393, v = { x: 0, y: 0, z: 0 };
const hfov = (vfov: number, aspect: number) => 2 * Math.atan(Math.tan(vfov * DEG / 2) * aspect) / DEG;
const halfTan = (deg: number) => Math.tan(deg * DEG / 2);

describe('short-viewport weight', () => {
  it('is 1 for every phone in landscape, 0 from 600 CSS px tall, smooth and monotonic between', () => {
    for (const h of [320, 375, 393, 430, 440]) expect(shortWeight(h, PHONE)).toBe(1);
    for (const h of [600, 720, 852, 1000, 1080, Infinity, NaN]) expect(shortWeight(h, PHONE)).toBe(0);
    expect(shortWeight(520, PHONE)).toBeCloseTo(.5, 12);
    let last = 1;
    for (let h = 400; h <= 640; h += 2.5) { const w = shortWeight(h, PHONE); expect(w).toBeLessThanOrEqual(last); expect(w).toBeGreaterThanOrEqual(0); last = w; }
  });
  it('is exactly 0 in portrait however short (a small phone in 100svh with the toolbars showing), and eases in from 1.2 to 1.5', () => {
    for (const [w, h] of [[375, 548], [360, 560], [320, 460], [393, 440], [440, 440], [520, 440]]) expect(shortWeight(h, w / h)).toBe(0);
    for (const aspect of [NaN, 0, -1, .46, 1, 1.2]) expect(shortWeight(393, aspect)).toBe(0);
    for (const aspect of [1.5, 1.78, 2.017, PHONE, 3]) expect(shortWeight(393, aspect)).toBe(1);
    expect(shortWeight(393, 1.35)).toBeCloseTo(.5, 12);
    let last = 0;
    for (let a = 1; a <= 1.7; a += .01) { const w = shortWeight(393, a); expect(w).toBeGreaterThanOrEqual(last); last = w; }
  });
});
describe('hip and ADS FOV', () => {
  it('stays exactly 65 wherever the weight is 0 (portrait, tablets, desktops)', () => {
    for (const aspect of [.46, .75, 1, 1.44, 1.6, 1.78, 2.17, 3.5, NaN]) expect(hipFovFor(aspect, 0)).toBe(65);
    expect(hipFovFor(.46, 1)).toBe(65); expect(hipFovFor(1.44, 1)).toBe(65); // narrow enough already: never widened
  });
  it('caps the landscape phone at a 95 deg horizontal field', () => {
    const hip = hipFovFor(PHONE, 1);
    expect(hip).toBeCloseTo(53.44, 2); expect(Math.abs(hfov(hip, PHONE) - 95)).toBeLessThan(1e-9);
    expect(hipFovFor(844 / 390, 1)).toBeCloseTo(53.52, 2); expect(hipFovFor(932 / 430, 1)).toBeCloseTo(53.45, 2);
    expect(hfov(65, PHONE)).toBeCloseTo(108.2, 1); // before
    expect(hipFovFor(1000 / 520, shortWeight(520, 1000 / 520))).toBeCloseTo(62.1, 1); // a short desktop window gets part of it
  });
  it('keeps the ADS zoom constant, so ADS_GAIN matches the crosshair speed at every hip FOV', () => {
    expect(adsFovOf(65)).toBe(50);
    for (let hip = 40; hip <= 65; hip += .5) expect(halfTan(adsFovOf(hip)) / halfTan(hip)).toBeCloseTo(ADS_GAIN, 12);
    expect(adsFovOf(hipFovFor(PHONE, 1))).toBeCloseTo(40.45, 2);
  });
  it('widens with speed and drops for ADS from the live hip', () => {
    const hip = hipFovFor(PHONE, 1);
    expect(speedFovTarget(17, false, hip)).toBe(hip + 1); expect(speedFovTarget(100, false, hip)).toBe(hip + 2); expect(speedFovTarget(100, true, hip)).toBe(hip);
    expect(fovFor(hip, 1, false, 0, hip)).toBeCloseTo(adsFovOf(hip), 12); expect(fovFor(hip, 0, false, 0, hip)).toBe(hip);
    expect(fovFor(hip + 2, 1, true, .5, hip)).toBe(hip + 2);
    expect(fovFor(65, 1, false, 0, 65)).toBe(50); expect(fovFor(66, .5, false, .3, 65)).toBe(fovFor(66, .5, false, .3));
  });
});
describe('base FOV across rotation', () => {
  it('matches MathUtils.damp bit for bit while the hip holds', () => {
    let a = 65, b = 65;
    for (let i = 0; i < 300; i++) { a = baseFovStep(a, 65, 65, i % 40, false, 1 / 60); b = MathUtils.damp(b, speedFovTarget(i % 40, false), 3, 1 / 60); expect(a).toBe(b); }
  });
  it('shifts on a hip change (no glide) and composes the same at every frame rate', () => {
    const hip = hipFovFor(PHONE, 1);
    for (const hz of RATES) {
      let base = 65, last = NaN, jump = 0;
      const turn = Math.ceil(hz / 2);
      for (let i = 0; i < hz; i++) {
        const now = i < turn ? 65 : hip, before = base;
        base = baseFovStep(base, last, now, 34, false, 1 / hz); last = now;
        if (i === turn) jump = base - before;
      }
      expect(jump).toBeCloseTo(hip - 65, 1); // the whole change lands on the rotation frame
      expect(Math.abs(base - (hip + 2 - 2 * Math.exp(-3)))).toBeLessThan(1e-9);
    }
  });
  it('holds the landscape hip exactly under reduced motion', () => {
    const hip = hipFovFor(PHONE, 1); let base = hip;
    for (let i = 0; i < 120; i++) { base = baseFovStep(base, hip, hip, 34, true, 1 / 60); expect(fovFor(base, 0, true, 0, hip)).toBe(hip); }
  });
});
describe('landscape boom', () => {
  it('is CHASE_BOOM exactly at w 0 and identical to the two-argument boom everywhere', () => {
    const a = { x: 0, y: 0, z: 0 };
    for (const aspect of [.46, 1, 1.44, 2.17]) for (const blend of [0, .3, 1]) {
      boomFor(blend, aspect, v); boomFor(blend, aspect, a, 0); expect(a).toEqual(v);
    }
    expect(boomFor(0, PHONE, v, 0)).toEqual(CHASE_BOOM);
  });
  it('nears and lowers the hip and ADS booms on a phone in landscape', () => {
    boomFor(0, PHONE, v, 1);
    expect(v.x).toBeCloseTo(.748, 12); expect(v.y).toBeCloseTo(.5, 12); expect(v.z).toBeCloseTo(4.664, 12);
    boomFor(1, 2.168, v, 1);
    expect(v.x).toBeCloseTo(.85, 12); expect(v.y).toBeCloseTo(.35, 12); expect(v.z).toBeCloseTo(2.288, 12);
  });
  it('frames the ADS shoulder at least 20% of the half-width off centre with the live ADS FOV', () => {
    for (const w of [0, 1]) for (const aspect of [.46, 1.44, 2.17]) {
      boomFor(1, aspect, v, w);
      const tan = halfTan(adsFovOf(hipFovFor(aspect, w)));
      expect(v.x).toBeGreaterThan(.25); expect((v.x - .25) / (v.z * tan * aspect)).toBeGreaterThanOrEqual(.2);
    }
  });
  it('moves the sight line the suit faces by about a degree at most, so suitRoll can keep CHASE_BOOM', () => {
    const short = boomFor(0, PHONE, { x: 0, y: 0, z: 0 }, 1), a = { x: 0, y: 0, z: 0 };
    let worst = 0, cruise = 0;
    for (const pitch of [-.12, ...Array.from({ length: 52 }, (_, i) => -1.3 + i * .05)]) for (const viewYaw of [-2, 0, .7]) {
      sightLine({ viewPitch: pitch, viewYaw }, a);
      const cp = Math.cos(pitch), sp = Math.sin(pitch), cy = Math.cos(viewYaw), sy = Math.sin(viewYaw);
      const y = short.y * cp - short.z * sp + CHASE_HEAD, z = short.y * sp + short.z * cp;
      const x = short.x * cy + z * sy, wz = -short.x * sy + z * cy, n = Math.hypot(x, y, wz);
      const deg = Math.acos(Math.min(1, (a.x * x + a.y * y + a.z * wz) / n)) / DEG;
      worst = Math.max(worst, deg); if (pitch === -.12) cruise = Math.max(cruise, deg);
    }
    expect(cruise).toBeLessThan(.5); expect(worst).toBeLessThan(1.2);
  });
});
