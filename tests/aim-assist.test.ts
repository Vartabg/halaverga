import { beforeEach, describe, expect, it } from 'vitest';
import { advanceAssist, bestTarget, createAssistMemory, fovScale, magnetize, ZONES } from '../src/game/aimAssist';
import { aimGain, createShooter, frictionNow, lookGain, pressAim, pressFire, type ShooterState, type Vec3 } from '../src/game/combat';
import { adsFovOf, hipFovFor } from '../src/game/cameraFx';
import { readFileSync } from 'node:fs';

const DEG = Math.PI / 180, O: Vec3 = { x: 0, y: 0, z: 0 }, D: Vec3 = { x: 0, y: 0, z: -1 };
let s: ShooterState, mem = createAssistMemory();
/** Places target i at `dist` metres, `yawDeg` left of straight ahead (-Z) and `pitchDeg` up. */
function place(i: number, dist: number, yawDeg: number, pitchDeg = 0, los = true) {
  const t = s.targets[i], y = yawDeg * DEG, p = pitchDeg * DEG;
  t.c.x = -Math.sin(y) * Math.cos(p) * dist; t.c.y = Math.sin(p) * dist; t.c.z = -Math.cos(y) * Math.cos(p) * dist;
  t.alive = true; t.los = los; s.drones.count = Math.max(s.drones.count, i + 1);
}
const rhoDeg = (dist: number) => Math.asin(s.targets[0].r / dist) / DEG;
const step = (n: number, dt: number, strength = 1, fov = 65) => { for (let k = 0; k < n; k++) advanceAssist(s, mem, O, D, fov, strength, dt); };
beforeEach(() => { s = createShooter(); mem = createAssistMemory(); s.input.lookSource = 'touch'; });

describe('friction', () => {
  it('stays 0 while not engaged, even inside the inner zone', () => {
    place(0, 20, rhoDeg(20) * .5);
    step(60, 1 / 60);
    expect(s.assist.engaged).toBe(false); expect(s.aim.acquired).toBe(true); expect(s.aim.target).toBe(0);
    expect(s.assist.slow).toBe(0); expect(frictionNow(s)).toBe(0);
  });
  it('ramps to exactly .6 in about 10 ms (zone 2, hip) and releases at 4/s to exactly 0', () => {
    place(0, 20, rhoDeg(20) + .3); pressAim(s, false);
    step(1, .005); expect(s.assist.slow).toBeCloseTo(.3, 12);
    step(1, .005); expect(s.assist.slow).toBe(.6); expect(frictionNow(s)).toBe(.6);
    s.input.aim = false; s.input.aimLatched = false;
    step(1, .05); expect(s.assist.engaged).toBe(false); expect(s.assist.slow).toBeCloseTo(.4, 12);
    step(5, .05); expect(s.assist.slow).toBe(0); expect(frictionNow(s)).toBe(0);
  });
  it('uses the outer zone base strength and the ADS blend', () => {
    place(0, 20, rhoDeg(20) + 1.5); pressFire(s, 'touch');
    step(10, 1 / 60); expect(s.assist.slow).toBe(ZONES.hipSlowOuter);
    s.aim.blend = 1; step(1, 1 / 60); expect(s.aim.acquired).toBe(false); expect(s.assist.slow).toBeCloseTo(.5 - 4 / 60, 12);
    place(0, 20, rhoDeg(20) + .3); step(10, 1 / 60); expect(s.assist.slow).toBe(ZONES.adsSlowInner);
  });
  it('applies the device profile at read time: touch .6, tap and mouse 0 at once', () => {
    place(0, 20, rhoDeg(20)); pressAim(s, true); step(10, 1 / 60);
    expect(frictionNow(s)).toBe(.6);
    s.input.lookSource = 'tap'; expect(frictionNow(s)).toBe(0);
    s.input.lookSource = 'mouse'; expect(frictionNow(s)).toBe(0);
    s.input.lookSource = 'trackpad'; expect(frictionNow(s)).toBeCloseTo(.36, 12);
    expect(s.assist.slow).toBe(.6);
  });
  it('never shrinks a tap nudge: look(75, 0) turns exactly 75 * .003 * aimGain(blend)', () => {
    s.input.lookSource = 'tap'; place(0, 20, rhoDeg(20)); pressAim(s, true); step(10, 1 / 60);
    expect(s.aim.acquired).toBe(true); expect(s.assist.slow).toBe(.6);
    const out = { x: 0, y: 0 };
    for (const blend of [0, .5, 1]) {
      s.aim.blend = blend; lookGain(s, 75, 0, out);
      expect(out.x * .003).toBe(75 * aimGain(blend) * .003); expect(out.y).toBe(0);
    }
  });
  it('slows touch input by the friction, and caps at .85 at strength 1.5', () => {
    place(0, 20, rhoDeg(20)); pressAim(s, true); step(10, 1 / 60);
    const out = { x: 0, y: 0 }; lookGain(s, 10, 0, out); expect(out.x).toBeCloseTo(10 * (1 - .6), 12);
    step(1, 1 / 60, 1.5); expect(s.assist.scale).toBe(1.5); expect(frictionNow(s)).toBe(.85);
    step(1, 1 / 60, 0); expect(s.assist.engaged).toBe(false); expect(frictionNow(s)).toBe(0);
  });
});

describe('zones', () => {
  const boundary = (fov: number, ads: number, zone: 1 | 2, hip = 65) => {
    const out = { index: -1, zone: 0 as 0 | 1 | 2, angle: 0, dist: 0 };
    let lo = rhoDeg(20), hi = lo + 5;
    for (let k = 0; k < 60; k++) {
      const mid = (lo + hi) / 2; place(0, 20, mid);
      if (bestTarget(O, D, s.targets, s.drones.count, fov, ads, out, hip).zone >= zone) lo = mid; else hi = mid;
    }
    return lo - rhoDeg(20);
  };
  it('match the spec widths at 65 deg and scale with fovScale', () => {
    expect(fovScale(65)).toBeCloseTo(1, 14);
    expect(boundary(65, 0, 2)).toBeCloseTo(.6, 8); expect(boundary(65, 0, 1)).toBeCloseTo(2, 8);
    expect(boundary(65, 1, 2)).toBeCloseTo(.4, 8); expect(boundary(65, 1, 1)).toBeCloseTo(1.2, 8);
    for (const zone of [1, 2] as const) {
      const ratio = boundary(50, 0, zone) / boundary(65, 0, zone);
      expect(ratio).toBeCloseTo(Math.tan(25 * DEG) / Math.tan(32.5 * DEG), 7);
      // Same fraction of the half-screen at both FOVs.
      expect(Math.tan(boundary(50, 0, zone) * DEG) / Math.tan(25 * DEG)).toBeCloseTo(Math.tan(boundary(65, 0, zone) * DEG) / Math.tan(32.5 * DEG), 4);
    }
  });
  it('keep the same assist angles on the narrowed phone-landscape camera, hip and ADS', () => {
    const hip = hipFovFor(852 / 393, 1), ads = adsFovOf(hip);
    expect(boundary(hip, 0, 2, hip)).toBeCloseTo(.6, 8); expect(boundary(hip, 0, 1, hip)).toBeCloseTo(2, 8);
    for (const zone of [1, 2] as const) expect(boundary(ads, 1, zone, hip)).toBeCloseTo(boundary(50, 1, zone), 8);
    // advanceAssist reads the hip the camera published.
    place(0, 20, rhoDeg(20) + 1.9); s.aim.hipFov = hip; pressAim(s, true); s.aim.blend = 0;
    advanceAssist(s, mem, O, D, hip, 1, 1 / 60); expect(s.aim.target).toBe(0);
  });
  it('pick the target nearest in edge angle and skip dead or occluded ones', () => {
    const out = { index: -1, zone: 0 as 0 | 1 | 2, angle: 0, dist: 0 };
    place(0, 10, 3.5); place(1, 40, 1.5); // 0: edge 3.5 - 5.16 < 0 (big and near) beats 1: edge 1.5 - 1.29
    expect(bestTarget(O, D, s.targets, 2, 65, 0, out)).toMatchObject({ index: 0, zone: 2 });
    s.targets[0].los = false; expect(bestTarget(O, D, s.targets, 2, 65, 0, out)).toMatchObject({ index: 1, zone: 2 });
    s.targets[1].alive = false; expect(bestTarget(O, D, s.targets, 2, 65, 0, out)).toMatchObject({ index: -1, zone: 0 });
    place(0, 20, 20); expect(bestTarget(O, D, s.targets, 1, 65, 0, out).zone).toBe(0);
    place(0, .5, 90); expect(bestTarget(O, D, s.targets, 1, 65, 0, out)).toMatchObject({ index: 0, zone: 2 });
  });
});

describe('drift', () => {
  it('is positive for a target moving left (yaw increasing) and resets to exactly 0 when disengaged', () => {
    pressAim(s, true);
    const rate = .05, dt = 1 / 60; // rad/s to the left, staying inside the zone
    for (let k = 0; k < 60; k++) { place(0, 20, rate * k * dt / DEG); advanceAssist(s, mem, O, D, 65, 1, dt); }
    expect(s.assist.driftYaw).toBeGreaterThan(0); expect(s.assist.driftYaw).toBeCloseTo(rate, 3);
    expect(Math.abs(s.assist.driftPitch)).toBeLessThan(1e-9);
    // Looking left (dx < 0 turns yaw up) follows the drift: no slow. Looking right is slowed.
    const out = { x: 0, y: 0 }; s.aim.blend = 0;
    lookGain(s, -10, 0, out); expect(out.x).toBe(-10); lookGain(s, 10, 0, out); expect(out.x).toBeLessThan(10);
    s.input.aimLatched = false; step(1, dt);
    expect(s.assist.driftYaw).toBe(0); expect(s.assist.driftPitch).toBe(0); expect(mem.valid).toBe(false);
  });
  it('tracks rising targets in pitch, holds at dt 0 and resets on a target change', () => {
    pressAim(s, true);
    for (let k = 0; k < 60; k++) { place(0, 20, 0, 3 * k / 60); advanceAssist(s, mem, O, D, 65, 1, 1 / 60); }
    expect(s.assist.driftPitch).toBeCloseTo(3 * DEG, 3); expect(s.aim.target).toBe(0);
    const held = s.assist.driftPitch; advanceAssist(s, mem, O, D, 65, 1, 0); expect(s.assist.driftPitch).toBe(held);
    s.targets[0].alive = false; place(1, 20, 0);
    advanceAssist(s, mem, O, D, 65, 1, 1 / 60);
    expect(s.aim.target).toBe(1); expect(s.assist.driftPitch).toBe(0); expect(s.assist.driftYaw).toBe(0); expect(mem.valid).toBe(true);
  });
});

describe('magnetize', () => {
  const at = (dist: number, offDeg: number, opts: { ads?: number; bloom?: number; src?: 'touch' | 'mouse' | 'tap'; strength?: number } = {}) => {
    place(0, dist, rhoDeg(dist) + offDeg);
    return magnetize(O, D, s.targets, 1, opts.ads ?? 0, opts.bloom ?? 0, opts.src ?? 'touch', opts.strength ?? 1);
  };
  it('needs line of sight, a live target and a non-zero strength', () => {
    expect(at(30, 1)).toBe(0);
    s.targets[0].los = false; expect(magnetize(O, D, s.targets, 1, 0, 0, 'touch', 1)).toBe(-1);
    s.targets[0].los = true; s.targets[0].alive = false; expect(magnetize(O, D, s.targets, 1, 0, 0, 'touch', 1)).toBe(-1);
    expect(at(30, 0, { strength: 0 })).toBe(-1);
  });
  it('is full strength within 60 m, fades to 80 m at half, and is -1 beyond 100 m', () => {
    expect(at(60, 1.49)).toBe(0); expect(at(60, 1.51)).toBe(-1); expect(at(10, 1.49)).toBe(0);
    expect(at(80, .74)).toBe(0); expect(at(80, .76)).toBe(-1);
    expect(at(101, .01)).toBe(-1); expect(at(150, 0)).toBe(-1);
  });
  it('shrinks with bloom and in ADS', () => {
    expect(at(30, 1)).toBe(0); expect(at(30, 1, { bloom: 1 })).toBe(-1); expect(at(30, .74, { bloom: 1 })).toBe(0);
    expect(at(30, .74, { ads: 1 })).toBe(0); expect(at(30, .76, { ads: 1 })).toBe(-1);
  });
  it('gives different cones per device at the same offset', () => {
    expect(at(30, 1, { src: 'touch' })).toBe(0); expect(at(30, 1, { src: 'mouse' })).toBe(-1);
    expect(at(30, .74, { src: 'mouse' })).toBe(0); expect(at(30, 2.2, { src: 'tap' })).toBe(0);
  });
  it('prefers the target nearer in angle', () => {
    place(0, 30, rhoDeg(30) + 1.2); place(1, 30, -(rhoDeg(30) + .4));
    expect(magnetize(O, D, s.targets, 2, 0, 0, 'touch', 1)).toBe(1);
    place(1, 30, -(rhoDeg(30) + 1.3)); expect(magnetize(O, D, s.targets, 2, 0, 0, 'touch', 1)).toBe(0);
  });
});

describe('purity', () => {
  it('advanceAssist writes nothing except s.assist and s.aim.acquired/target', () => {
    place(0, 20, rhoDeg(20)); place(1, 30, 3); pressFire(s, 'touch'); s.aim.blend = .4;
    const { assist, aim, ...rest } = structuredClone(s);
    step(30, 1 / 60, 1, 60);
    const { assist: a2, aim: m2, ...rest2 } = structuredClone(s);
    expect(rest2).toEqual(rest);
    expect({ ...m2, acquired: 0, target: 0 }).toEqual({ ...aim, acquired: 0, target: 0 });
    expect(m2.acquired).toBe(true); expect(m2.target).toBe(0); expect(aim.target).toBe(-1);
    expect(a2.engaged).toBe(true); expect(assist.slow).toBe(0); expect(a2.slow).toBeGreaterThan(0);
  });
  it('stays landing-safe and seeded', () => {
    for (const file of ['aimAssist', 'aimMotion']) {
      const src = readFileSync(`src/game/${file}.ts`, 'utf8');
      for (const bad of ['WebGLRenderer', 'isVector3', '@react-three', 'BufferGeometry', 'powerHero', 'bankLeft', 'Math.random(', "from 'three'", '@dimforge'])
        expect(src).not.toContain(bad);
    }
  });
});
