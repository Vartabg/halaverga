import { describe, expect, it } from 'vitest';
import { advanceAssist, createAssistMemory, magnetize } from '../src/game/aimAssist';
import { ADS_GAIN, createShooter, pressAim, pressFire, type ShooterState, type Vec3 } from '../src/game/combat';
import { KEY_FINE, arrowLook, clearInput, keyTurnRate, runtime } from '../src/game/runtime';
import { crossScale, markerState } from '../src/ui/hudTimeline';
import { hintText, hintTrack } from '../src/ui/hintSteps';
import { CURVE_FLAT, CURVE_HOLD, makePuffs, metresPerPx, puffFrame, pxSize, spawnPuff, tracerSpan, type TracerSpan } from '../src/world/fxPools';
// Contracts for the phase-1 review fixes: HUD cue and marker legibility, reduced-motion crosshair, tracer beam, kill-burst alpha
// curves, the pixel-capped muzzle flash and the arrow-key fine aim.
const DEG = Math.PI / 180, O: Vec3 = { x: 0, y: 0, z: 0 }, D: Vec3 = { x: 0, y: 0, z: -1 };

describe('HUD', () => {
  it('holds the crosshair at exactly 1 under reduced motion, pops 1.12 otherwise', () => {
    expect(crossScale(0, true)).toBe(1); expect(crossScale(.05, true)).toBe(1);
    expect(crossScale(0, false)).toBe(1.12); expect(crossScale(Infinity, false)).toBe(1);
  });
  it('attenuates the pop to 1.06 from the 4th shot of a burst (index 3), and keeps it exactly 1 under reduced motion', () => {
    expect(crossScale(0, false, 2)).toBe(1.12); expect(crossScale(0, false, 3)).toBe(1.06);
    expect(crossScale(0, true, 0)).toBe(1); expect(crossScale(0, true, 3)).toBe(1);
  });
  it('draws the kill as an unrotated, larger X that lasts 450 ms; other markers keep their timing', () => {
    expect(markerState('kill', .1, false)).toMatchObject({ visible: true, scale: 1.15, rotate: 0, opacity: 1 });
    expect(markerState('kill', .4, false).visible).toBe(true);
    expect(markerState('kill', .45, false).visible).toBe(false);
    expect(markerState('kill', 0, false).scale).toBeCloseTo(1.15 * 1.4, 12);
    expect(markerState('hit', .1, false)).toMatchObject({ scale: 1, rotate: 0 });
    expect(markerState('hit', .3, false).visible).toBe(false);
  });
  it('never tells a tap-pad player to drag', () => {
    const text = (coarse: boolean, tapControls: boolean) =>
      hintText(hintTrack({ shooter: true, coarse, desktopMode: 'trackpad', steering: 'free', tapControls }), 0, { autoFire: true, captured: false });
    for (const coarse of [true, false]) { expect(text(coarse, true)).toBe('Tap pad: Fire and Aim toggle'); expect(text(coarse, true)).not.toMatch(/drag/i); }
    expect(text(true, false)).toMatch(/drag/i);
  });
});

describe('acquired cue', () => {
  let s: ShooterState;
  const place = (dist: number, yawDeg: number) => {
    const t = s.targets[0], y = yawDeg * DEG;
    t.c.x = -Math.sin(y) * dist; t.c.y = 0; t.c.z = -Math.cos(y) * dist; t.alive = true; t.los = true; s.drones.count = 1;
  };
  const rho = (dist: number) => Math.asin(s.targets[0].r / dist) / DEG;
  const run = (strength = 1) => { const mem = createAssistMemory(); for (let k = 0; k < 10; k++) advanceAssist(s, mem, O, D, 65, strength, 1 / 60); };
  it('mouse at the hip: friction in the outer zone, but amber only inside the magnet cone', () => {
    s = createShooter(); s.input.lookSource = 'mouse'; pressFire(s, 'click');
    place(30, rho(30) + 1.5); run(); expect(s.aim.acquired).toBe(false); expect(s.assist.slow).toBeGreaterThan(0);
    place(30, rho(30) + .5); run(); expect(s.aim.acquired).toBe(true);
  });
  it('follows the magnet falloff past 60 m and the body alone with assist off', () => {
    s = createShooter(); s.input.lookSource = 'touch'; pressAim(s, false);
    place(80, rho(80) + .8); run(); expect(s.aim.acquired).toBe(false);
    place(80, rho(80) + .6); run(); expect(s.aim.acquired).toBe(true);
    place(30, rho(30) * .5); run(0); expect(s.aim.acquired).toBe(true);
    place(30, rho(30) + .2); run(0); expect(s.aim.acquired).toBe(false);
  });
  it('is amber exactly when a centred shot would magnetize or hit the body', () => {
    let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let k = 0; k < 400; k++) {
      s = createShooter(); s.input.lookSource = (['touch', 'tap', 'trackpad', 'mouse'] as const)[k % 4];
      s.aim.blend = rnd() > .5 ? 1 : 0; s.weapon.spreadHeat = 10 * rnd(); pressFire(s, 'touch');
      const dist = 5 + 115 * rnd(); place(dist, rho(dist) * rnd() * 2 + 3 * rnd() - .5);
      const strength = [0, 1, 1.5][k % 3]; run(strength);
      const bloom = s.weapon.spreadHeat / 10, a = Math.acos(-s.targets[0].c.z / Math.hypot(s.targets[0].c.x, s.targets[0].c.z));
      const hit = magnetize(O, D, s.targets, 1, s.aim.blend, bloom, s.input.lookSource, strength) >= 0 || a <= Math.asin(s.targets[0].r / dist);
      expect(s.aim.acquired).toBe(hit);
    }
  });
});

describe('tracer beam', () => {
  const span: TracerSpan = { head: 0, tail: 0, alive: false, fade: 1 };
  it('starts at the arm on the first frame at every range and lives until arrival + 70 ms', () => {
    for (const d of [15, 40, 120, 250]) {
      tracerSpan(1 / 60, d, span);
      expect(span.tail).toBeLessThanOrEqual(.25 * d); expect(span.head - span.tail).toBeGreaterThanOrEqual(.4 * d);
      const arrive = d / Math.max(600, d / .033);
      expect(tracerSpan(arrive * .9, d, span).fade).toBe(1);
      expect(tracerSpan(arrive + .069, d, span).fade!).toBeLessThanOrEqual(.05);
      expect(tracerSpan(arrive + .069, d, span).alive).toBe(true);
      expect(tracerSpan(arrive + .0701, d, span).alive).toBe(false);
    }
  });
});

describe('effects', () => {
  it('kill-burst puffs can hold their brightness or stay flat', () => {
    const p = makePuffs(3), pos = { x: 0, y: 0, z: 0 }, col = { r: 0, g: 0, b: 0 }, size = { x: 0, y: 0 }, c = { r: 1, g: 1, b: 1 };
    spawnPuff(p, 0, O, 0, 1, 1, 1, 1, c, c, .8); spawnPuff(p, 0, O, 0, 1, 1, 1, 1, c, c, .8, CURVE_HOLD); spawnPuff(p, 0, O, 0, 1, 1, 1, 1, c, c, .8, CURVE_FLAT);
    expect(puffFrame(p, 0, .6, pos, col, size)).toBeCloseTo(.8 * (1 - .36), 12);
    expect(puffFrame(p, 1, .6, pos, col, size)).toBeCloseTo(.8 * .4 ** 1.5, 12);
    expect(puffFrame(p, 2, .6, pos, col, size)).toBe(.8);
  });
  it('keeps the per-shot muzzle flash (36 px core, 80 px halo) under 90 px at hip and ADS distances', () => {
    for (const dist of [2.2, 2.6, 3.4, 5, 5.3, 8]) for (const fov of [50, 65]) for (const h of [390, 667, 844, 1080]) {
      const m = metresPerPx(dist, fov, h);
      for (const [px, cap] of [[36, .45], [80, .9]]) expect(pxSize(px, cap, m) / m).toBeLessThanOrEqual(90);
    }
  });
});

describe('arrow-key fine aim', () => {
  const step = () => { const y = runtime.yaw; arrowLook(1 / 60); return runtime.yaw - y; };
  it('rates: fine first 150 ms while engaged, ADS gain, exactly 1 when idle', () => {
    expect(keyTurnRate(0, 1, true)).toBeCloseTo(KEY_FINE * ADS_GAIN, 15);
    expect(keyTurnRate(.15, 1, true)).toBeCloseTo(ADS_GAIN, 15);
    expect(keyTurnRate(0, 0, false)).toBe(1); expect(keyTurnRate(.3, 0, true)).toBe(1);
  });
  it('a one-frame tap turns 30% at full ADS; a held key reaches full speed after 150 ms; idle matches main', () => {
    clearInput(); runtime.shooter = createShooter(); pressAim(runtime.shooter, false); runtime.shooter.aim.blend = 1;
    runtime.keys.add('ArrowLeft');
    expect(step()).toBeCloseTo(1.5 * .3 * ADS_GAIN / 60, 12);
    for (let k = 0; k < 8; k++) step();
    expect(step()).toBeCloseTo(1.5 * ADS_GAIN / 60, 12);
    clearInput(); runtime.shooter = createShooter(); runtime.keys.add('ArrowLeft');
    const y = runtime.yaw; arrowLook(1 / 60);
    expect(runtime.yaw).toBe(y + (Number(true) - Number(false)) * (1 / 60) * 1.5);
    clearInput(); expect(runtime.keyHold).toEqual({ yaw: 0, pitch: 0, yawSign: 0, pitchSign: 0 });
  });
});
