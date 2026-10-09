import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { DRONE_RADIUS, EYE_FORWARD, EYE_RADIUS, WATER_LEVEL, mulberry32, type DroneTarget, type Vec3 } from '../src/game/combat';
import { angleTo, angularRadius, coneSample, hitDrones, projectedStart, raySphere, raySphereSpan, rayWater, type DroneHit, type Span } from '../src/game/shotMath';
const v = (x: number, y: number, z: number): Vec3 => ({ x, y, z });
const unit = (x: number, y: number, z: number) => { const l = Math.hypot(x, y, z); return v(x / l, y / l, z / l); };
const deg = Math.PI / 180;
/** Drone at c whose eye faces `face` (unit). */
const drone = (c: Vec3, face: Vec3, alive = true): DroneTarget => ({ c, r: DRONE_RADIUS, eye: v(c.x + face.x * EYE_FORWARD, c.y + face.y * EYE_FORWARD, c.z + face.z * EYE_FORWARD), eyeR: EYE_RADIUS, alive, los: true });
const hit = (): DroneHit => ({ index: -1, t: 0, weak: false });

describe('shot geometry', () => {
  it('projects the start level with the head, never backwards', () => {
    const o = v(0, 2, 5), d = v(0, 0, -1), out = v(9, 9, 9);
    expect(projectedStart(o, d, v(.6, 1.5, 1), out)).toBe(out);
    expect(out).toEqual(v(0, 2, 1));
    projectedStart(o, d, v(0, 2, 8), out); // head behind the camera: clamp keeps the camera origin
    expect(out).toEqual(o);
    projectedStart(o, unit(0, -1, -1), v(0, 0, 3), out);
    expect(out.y).toBeCloseTo(0, 12); expect(out.z).toBeCloseTo(3, 12);
  });
  it('spans spheres from outside, inside, behind and at a tangent', () => {
    const s: Span = { enter: -1, exit: -1 }, o = v(0, 0, 0), d = v(0, 0, -1);
    expect(raySphereSpan(o, d, v(0, 0, -10), 1, s)).toBe(true);
    expect(s.enter).toBeCloseTo(9, 12); expect(s.exit).toBeCloseTo(11, 12);
    expect(raySphereSpan(o, d, v(0, 0, -.5), 1, s)).toBe(true);
    expect(s.enter).toBe(0); expect(s.exit).toBeCloseTo(1.5, 12);
    expect(raySphereSpan(o, d, v(0, 0, 10), 1, s)).toBe(false);
    expect(raySphereSpan(o, d, v(0, 0, 1), 1, s)).toBe(false); // exit exactly at the origin
    expect(raySphereSpan(o, d, v(1, 0, -5), 1, s)).toBe(true);
    expect(s.enter).toBeCloseTo(5, 6); expect(s.exit).toBeCloseTo(5, 6);
    expect(raySphereSpan(o, d, v(1.001, 0, -5), 1, s)).toBe(false);
  });
  it('returns the entry distance or Infinity', () => {
    expect(raySphere(v(0, 0, 0), v(1, 0, 0), v(4, 0, 0), 1)).toBeCloseTo(3, 12);
    expect(raySphere(v(0, 0, 0), v(1, 0, 0), v(4, 3, 0), 1)).toBe(Infinity);
    expect(raySphere(v(0, 0, 0), v(1, 0, 0), v(-4, 0, 0), 1)).toBe(Infinity);
  });
  it('meets the water only on downward rays from above it', () => {
    expect(rayWater(v(0, 20, 0), v(0, -1, 0))).toBeCloseTo(20 - WATER_LEVEL, 12);
    expect(rayWater(v(0, 10, 0), unit(0, -1, -1))).toBeCloseTo((10 - WATER_LEVEL) * Math.SQRT2, 12);
    expect(rayWater(v(0, 20, 0), v(0, 1, 0))).toBe(Infinity);
    expect(rayWater(v(0, 20, 0), v(0, 0, -1))).toBe(Infinity);
    expect(rayWater(v(0, -1, 0), v(0, -1, 0))).toBe(Infinity);
    expect(rayWater(v(0, 5, 0), v(0, -1, 0), 2)).toBeCloseTo(3, 12);
  });
  it('samples a centre-weighted cone deterministically and without escaping it', () => {
    const half = 2 * deg, out = v(0, 0, 0);
    for (const dir of [v(0, 0, -1), v(1, 0, 0), v(0, 1, 0), unit(1, 2, -3), unit(-.2, -.9, .1)]) {
      const rng = mulberry32(7); let worst = 0, inner = 0;
      for (let i = 0; i < 10000; i++) {
        coneSample(dir, half, rng, out);
        expect(Math.hypot(out.x, out.y, out.z)).toBeCloseTo(1, 12);
        const a = angleTo(v(0, 0, 0), dir, out); worst = Math.max(worst, a); if (a < half / 2) inner++;
      }
      expect(worst).toBeLessThanOrEqual(half + 1e-9);
      expect(worst).toBeGreaterThan(half * .95);
      expect(inner / 10000).toBeGreaterThan(.55); // u^1.5 puts 63% inside half the radius (uniform area would put 25%)
    }
    const a = mulberry32(42), b = mulberry32(42), pa = v(0, 0, 0), pb = v(0, 0, 0);
    for (let i = 0; i < 100; i++) { coneSample(v(0, 0, -1), half, a, pa); coneSample(v(0, 0, -1), half, b, pb); expect(pa).toEqual(pb); }
    let calls = 0; const counted = () => { calls++; return .5; };
    expect(coneSample(unit(1, 2, 3), 0, counted, out)).toEqual(unit(1, 2, 3));
    expect(calls).toBe(0);
  });
  it('measures angles and angular radii', () => {
    expect(angleTo(v(0, 0, 0), v(0, 0, -1), v(0, 1, -1))).toBeCloseTo(45 * deg, 12);
    expect(angleTo(v(0, 0, 0), v(0, 0, -1), v(0, 0, 3))).toBeCloseTo(Math.PI, 12);
    expect(angleTo(v(0, 0, 0), v(0, 0, -1), v(0, 0, -1e9))).toBe(0);
    expect(angularRadius(1, 2)).toBeCloseTo(30 * deg, 12);
    expect(angularRadius(1, .5)).toBe(Math.PI / 2);
  });
});

describe('drone hits', () => {
  const o = v(0, 0, 0), d = v(0, 0, -1);
  it('gives a front-facing eye priority when shot 0.2 m off-axis, 20 deg off its facing', () => {
    const face = unit(Math.sin(20 * deg), 0, Math.cos(20 * deg)), g = drone(v(0, 0, -20), face);
    const ray = unit(.2, 0, -20), h = hit(); // passes 0.2 m from the centre, through the turned eye
    expect(raySphere(o, ray, g.eye, g.eyeR)).toBeLessThan(Infinity);
    expect(hitDrones(o, ray, [g], 1, Infinity, h)).toBe(true);
    expect(h).toEqual({ index: 0, t: raySphere(o, ray, g.eye, g.eyeR), weak: true });
  });
  it('keeps eye priority when the body is entered first at an oblique angle', () => {
    const g = drone(v(0, 0, -20), unit(Math.sin(70 * deg), 0, Math.cos(70 * deg))), ray = unit(g.eye.x, g.eye.y, g.eye.z), h = hit();
    const bodyEnter = raySphere(o, ray, g.c, g.r), eyeEnter = raySphere(o, ray, g.eye, g.eyeR);
    expect(eyeEnter).toBeGreaterThan(bodyEnter); // strict nearest-t would score the body
    expect(hitDrones(o, ray, [g], 1, Infinity, h)).toBe(true);
    expect(h).toEqual({ index: 0, t: eyeEnter, weak: true });
  });
  it('scores a body graze and a shot through a rear-facing eye as body hits', () => {
    const graze = drone(v(0, 0, -20), v(0, 0, 1)), h = hit();
    expect(hitDrones(o, unit(.8, 0, -20), [graze], 1, Infinity, h)).toBe(true);
    expect(h.weak).toBe(false); expect(h.t).toBeCloseTo(raySphere(o, unit(.8, 0, -20), graze.c, graze.r), 12);
    const rear = drone(v(0, 0, -20), v(0, 0, -1));
    expect(raySphere(o, d, rear.eye, rear.eyeR)).toBeLessThan(Infinity);
    expect(hitDrones(o, d, [rear], 1, Infinity, h)).toBe(true);
    expect(h.index).toBe(0); expect(h.weak).toBe(false); expect(h.t).toBeCloseTo(20 - DRONE_RADIUS, 12);
    expect(hitDrones(o, d, [drone(v(0, 0, -20), v(0, 0, 1))], 1, Infinity, h)).toBe(true);
    expect(h.weak).toBe(true); expect(h.t).toBeCloseTo(20 - EYE_FORWARD - EYE_RADIUS, 12);
  });
  it('scores a ray that clips only the protruding eye rim (outside the body) as a weak hit, front-facing only', () => {
    const side = drone(v(0, 0, -20), unit(Math.sin(60 * deg), 0, Math.cos(60 * deg))), from = v(.93, 0, 0), h = hit();
    expect(raySphere(from, d, side.c, side.r)).toBe(Infinity); // .93 m off-axis misses the .9 m body
    const eyeEnter = raySphere(from, d, side.eye, side.eyeR);
    expect(eyeEnter).toBeLessThan(Infinity);
    expect(hitDrones(from, d, [side], 1, Infinity, h)).toBe(true);
    expect(h).toEqual({ index: 0, t: eyeEnter, weak: true });
    expect(hitDrones(from, d, [side], 1, eyeEnter - .01, h)).toBe(false); // a wall before the eye hides it
    const away = drone(v(0, 0, -20), unit(Math.sin(60 * deg), 0, -Math.cos(60 * deg)));
    expect(raySphere(from, d, away.eye, away.eyeR)).toBeLessThan(Infinity);
    expect(hitDrones(from, d, [away], 1, Infinity, h)).toBe(false); // the rim of an eye facing away never scores
  });
  it('picks the nearest live drone before maxT and skips dead or uncounted ones', () => {
    const far = drone(v(0, 0, -40), v(0, 0, 1)), near = drone(v(0, 0, -15), v(1, 0, 0)), dead = drone(v(0, 0, -5), v(0, 0, 1), false);
    const h = hit();
    expect(hitDrones(o, d, [far, near, dead], 3, Infinity, h)).toBe(true);
    expect(h.index).toBe(1); expect(h.t).toBeCloseTo(15 - DRONE_RADIUS, 12);
    expect(hitDrones(o, d, [far, near], 1, Infinity, h)).toBe(true);
    expect(h.index).toBe(0); expect(h.weak).toBe(true);
    expect(hitDrones(o, d, [far, near], 2, 10, h)).toBe(false); // a wall at 10 m hides both
    expect(hitDrones(o, v(1, 0, 0), [far, near], 2, Infinity, h)).toBe(false);
  });
  it('stays pure and landing-safe', () => {
    const src = readFileSync('src/game/shotMath.ts', 'utf8');
    for (const s of ['three', '@react-three', '@dimforge', 'Math.random', 'WebGLRenderer', 'isVector3', 'BufferGeometry', 'powerHero', 'bankLeft', 'new ']) expect(src).not.toContain(s);
    expect(src.split('\n').length).toBeLessThan(200);
  });
});
