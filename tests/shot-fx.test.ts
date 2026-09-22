import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { EVENT_RING, WATER_LEVEL, createShooter, flashGate, mulberry32, pushEvent, readEvents, type ShotEvent } from '../src/game/combat';
import {
  claim, debrisAt, drawSparks, impactDelay, isShotKind, lobeDir, makePuffs, makeSparks, puffFrame, puffU, spawnPuff, spawnSpark,
  tracerSpan, tracerSpeed, tracerWidth, waterContactTime,
} from '../src/world/fxPools';
const O = { x: 0, y: 0, z: 0 };
const span = { head: 0, tail: 0, alive: false };
const pxAt = (d: number, fov: number, h: number) => 2 * d * Math.tan(fov * Math.PI / 360) / h;
describe('tracers', () => {
  it('arrive within 33 ms at 1, 30 and 250 m', () => {
    for (const d of [1, 30, 250]) {
      expect(d / tracerSpeed(d)).toBeLessThanOrEqual(.033 + 1e-12);
      expect(impactDelay(d)).toBeLessThanOrEqual(.033 + 1e-12);
      expect(tracerSpan(.033, d, span).head).toBeCloseTo(d, 9);
      expect(tracerSpan(.5 * d / tracerSpeed(d), d, span).head).toBeLessThan(d);
    }
  });
  it('live while travelling, dead after arrival + 70 ms, tail never past dist', () => {
    for (const d of [1, 12, 30, 90, 250]) {
      const arrive = d / tracerSpeed(d);
      expect(tracerSpan(0, d, span)).toMatchObject({ head: 0, tail: 0, alive: true });
      expect(tracerSpan(arrive * .5, d, span).alive).toBe(true);
      expect(tracerSpan(arrive + .0701, d, span).alive).toBe(false);
      expect(tracerSpan(arrive + 1, d, span).alive).toBe(false);
      let prevTail = 0;
      for (let t = 0; t < arrive + .2; t += .0005) {
        tracerSpan(t, d, span);
        expect(span.tail).toBeLessThanOrEqual(d); expect(span.head).toBeLessThanOrEqual(d);
        expect(span.head - span.tail).toBeGreaterThanOrEqual(0); expect(span.head - span.tail).toBeLessThanOrEqual(18 + 1e-9);
        expect(span.tail).toBeGreaterThanOrEqual(prevTail); prevTail = span.tail;
        if (span.alive) expect(span.tail).toBeLessThan(d);
      }
    }
    // Long shots show an 18 m streak; after arrival the tail keeps the bullet speed until it reaches the point.
    const d = 250, v = tracerSpeed(d);
    expect(tracerSpan(.02, d, span)).toMatchObject({ alive: true });
    expect(span.head - span.tail).toBeCloseTo(18, 9);
    expect(tracerSpan(.033 + 5 / v, d, span).tail).toBeCloseTo(d - 13, 6);
  });
  it('are at least .05 m and exactly 1.5 px at long range', () => {
    for (const d of [0, .5, 3, 10, 40, 120, 250]) for (const fov of [50, 65]) for (const h of [320, 800, 1440]) {
      const w = tracerWidth(d, fov, h);
      expect(w).toBeGreaterThanOrEqual(.05); expect(w / pxAt(d, fov, h)).toBeGreaterThanOrEqual(1.5 - 1e-9);
    }
    expect(tracerWidth(200, 65, 800) / pxAt(200, 65, 800)).toBeCloseTo(1.5, 9);
    expect(tracerWidth(1, 65, 800)).toBe(.05);
  });
});
describe('muzzle flash gate (combat.ts)', () => {
  it('allows three flashes, blocks the fourth inside 1 s and recovers after the window', () => {
    const hist = new Float64Array(3).fill(-Infinity);
    expect([0, .11, .22].map(t => flashGate(hist, 0, t))).toEqual([true, true, true]);
    expect(flashGate(hist, 0, .33)).toBe(false);
    expect(flashGate(hist, 0, .99)).toBe(false);
    expect(flashGate(hist, 0, 1)).toBe(true);
    expect(flashGate(hist, 0, 1.05)).toBe(false);
    expect(flashGate(hist, 0, 1.11)).toBe(true);
    // A 9 Hz stream never passes more than 3 flashes in any 1 s window.
    const h2 = new Float64Array(3).fill(-Infinity), passed: number[] = [];
    for (let k = 0; k < 90; k++) if (flashGate(h2, 0, k / 9)) passed.push(k / 9);
    for (const t0 of passed) expect(passed.filter(t => t >= t0 && t < t0 + 1).length).toBeLessThanOrEqual(3);
  });
});
describe('ballistics', () => {
  it('debrisAt matches p0 + v0 t - 11 t^2 (g = 22)', () => {
    const p0 = { x: 1, y: 8, z: -3 }, v0 = { x: 4, y: 6, z: -2 }, out = { x: 0, y: 0, z: 0 };
    for (const t of [0, .1, .5, 1.3, 2.5]) {
      expect(debrisAt(p0, v0, t, out)).toBe(out);
      expect(out.x).toBeCloseTo(1 + 4 * t, 12); expect(out.y).toBeCloseTo(8 + 6 * t - 11 * t * t, 12); expect(out.z).toBeCloseTo(-3 - 2 * t, 12);
    }
  });
  it('waterContactTime finds the descending crossing of y = .1', () => {
    const out = { x: 0, y: 0, z: 0 }, rng = mulberry32(7);
    for (let k = 0; k < 50; k++) {
      const p0 = { x: rng() * 10, y: .5 + rng() * 30, z: rng() * 10 }, v0 = { x: rng() * 8 - 4, y: rng() * 16 - 4, z: rng() * 8 - 4 };
      const t = waterContactTime(p0, v0, WATER_LEVEL);
      expect(t).toBeGreaterThan(0);
      expect(debrisAt(p0, v0, t, out).y).toBeCloseTo(WATER_LEVEL, 9);
      expect(v0.y - 22 * t).toBeLessThan(0);
      expect(debrisAt(p0, v0, t * .5, out).y).toBeGreaterThan(WATER_LEVEL);
    }
    expect(waterContactTime({ x: 0, y: 11.1, z: 0 }, O)).toBeCloseTo(1, 12);
    expect(waterContactTime({ x: 0, y: -5, z: 0 }, { x: 0, y: 1, z: 0 })).toBe(Infinity);
  });
});
describe('pools', () => {
  it('claim wraps and reuses the oldest slot', () => {
    const r = { next: 0, size: 3 };
    expect(Array.from({ length: 7 }, () => claim(r))).toEqual([0, 1, 2, 0, 1, 2, 0]);
    const p = makePuffs(2);
    expect([spawnPuff(p, 0, O, 0, 1, 1, 1, 1, { r: 1, g: 0, b: 0 }, { r: 1, g: 0, b: 0 }, 1),
      spawnPuff(p, .1, O, 0, 1, 1, 1, 1, { r: 0, g: 1, b: 0 }, { r: 0, g: 1, b: 0 }, 1),
      spawnPuff(p, .2, O, 0, 1, 1, 1, 1, { r: 0, g: 0, b: 1 }, { r: 0, g: 0, b: 1 }, 1)]).toEqual([0, 1, 0]);
    const col = { r: 0, g: 0, b: 0 };
    puffFrame(p, 0, .1, { x: 0, y: 0, z: 0 }, col, { x: 0, y: 0 });
    expect(col).toEqual({ r: 0, g: 0, b: 1 });
  });
  it('puffs rise, grow, blend colour and fade to zero over their life', () => {
    const p = makePuffs(4), pos = { x: 0, y: 0, z: 0 }, col = { r: 0, g: 0, b: 0 }, size = { x: 0, y: 0 };
    expect(puffU(p, 0, 0)).toBe(-1);
    spawnPuff(p, 2, { x: 1, y: 2, z: 3 }, 1.5, 1.2, .9, 2.1, 2, { r: 1, g: 1, b: 1 }, { r: 0, g: .5, b: 0 }, .5);
    expect(puffU(p, 0, 1.9)).toBe(-1); expect(puffU(p, 0, 3.2)).toBe(-1);
    expect(puffFrame(p, 0, puffU(p, 0, 2), pos, col, size)).toBeCloseTo(.5, 12);
    const a = puffFrame(p, 0, puffU(p, 0, 2.6), pos, col, size);
    expect(pos.y).toBeCloseTo(2 + 1.5 * .6, 9); expect(size.x).toBeCloseTo(1.5, 9); expect(size.y).toBeCloseTo(3, 9);
    expect(col.r).toBeCloseTo(.5, 9); expect(col.g).toBeCloseTo(.75, 9); expect(a).toBeCloseTo(.5 * .75, 9);
    expect(puffFrame(p, 0, .999999, pos, col, size)).toBeLessThan(1e-5);
  });
  it('sparks fly ballistically, shift white to amber and blank once when they die', () => {
    const sp = makeSparks(4), pos = new Float32Array(12), col = new Float32Array(12);
    spawnSpark(sp, 1, { x: 0, y: 5, z: 0 }, { x: 1, y: 0, z: 0 }, 6, .2);
    expect(drawSparks(sp, 1.1, pos, col, { r: 1, g: 1, b: 1 }, { r: 1, g: .6, b: .2 })).toBe(1);
    expect(pos[0]).toBeCloseTo(.6, 5); expect(pos[1]).toBeCloseTo(5 - 11 * .01, 5);
    expect(col[0]).toBeCloseTo(.75, 5); expect(col[2]).toBeCloseTo(.6 * .75, 5);
    expect(drawSparks(sp, 1.21, pos, col, { r: 1, g: 1, b: 1 }, { r: 1, g: .6, b: .2 })).toBe(0);
    expect([col[0], col[1], col[2]]).toEqual([0, 0, 0]);
    expect(sp.shown[0]).toBe(0);
  });
  it('lobeDir stays a unit vector inside the hemisphere around the normal', () => {
    const rng = mulberry32(3), out = { x: 0, y: 0, z: 0 };
    for (const n of [{ x: 0, y: 1, z: 0 }, { x: 0, y: -1, z: 0 }, { x: 1, y: 0, z: 0 }, { x: .6, y: 0, z: -.8 }]) {
      let mean = 0;
      for (let k = 0; k < 400; k++) {
        lobeDir(n, rng(), rng(), out);
        const dot = out.x * n.x + out.y * n.y + out.z * n.z;
        expect(Math.hypot(out.x, out.y, out.z)).toBeCloseTo(1, 9); expect(dot).toBeGreaterThanOrEqual(-1e-9); mean += dot / 400;
      }
      expect(mean).toBeGreaterThan(.6); expect(mean).toBeLessThan(.73);   // cosine lobe: E[cos] = 2/3
    }
  });
});
describe('events', () => {
  it('a cursor started at the current serial never replays old events', () => {
    const s = createShooter(), seen: number[] = [], fn = (e: ShotEvent) => { seen.push(e.serial); };
    for (let k = 0; k < 5; k++) pushEvent(s, 'hit', O, O, null);
    const cursor = { last: s.eventSerial };
    readEvents(s, cursor, fn); expect(seen).toEqual([]);
    pushEvent(s, 'overheat', O, O, null); readEvents(s, cursor, fn); readEvents(s, cursor, fn);
    expect(seen).toEqual([6]);
    for (let k = 0; k < EVENT_RING + 4; k++) pushEvent(s, 'miss', O, O, null);
    const late = { last: s.eventSerial }; seen.length = 0;
    readEvents(s, late, fn); expect(seen).toEqual([]);
    pushEvent(s, 'burst', O, O, null, 2); readEvents(s, late, fn); expect(seen).toEqual([s.eventSerial]);
  });
  it('only the seven shot outcomes spawn tracers and impacts', () => {
    expect(['miss', 'world', 'water', 'hit', 'weak', 'kill', 'blocked'].every(k => isShotKind(k as never))).toBe(true);
    expect(['overheat', 'vent', 'telegraph', 'arrive', 'break', 'burst'].some(k => isShotKind(k as never))).toBe(false);
  });
});
describe('source guard', () => {
  it('the effect modules never call Math.random', () => {
    for (const f of ['ShotFx.tsx', 'ImpactFx.tsx', 'fxPools.ts', 'fxMaterials.ts'])
      expect(readFileSync(new URL('../src/world/' + f, import.meta.url), 'utf8')).not.toContain('Math.random');
  });
});
