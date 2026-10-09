import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { EVENT_RING, WATER_LEVEL, createShooter, flashGate, mulberry32, pushEvent, readEvents, type ShotEvent } from '../src/game/combat';
import {
  CLEAR_PX, CORE_FLOOR_PX, DRIFT_TAU, PUFF, STEAM_GAP, STEAM_PUFFS, claim, debrisAt, drawSparks, haloAlpha, haloClampPx, impactDelay, isShotKind,
  lobeDir, makePuffs, makeSparks, makeSteam, puffFrame, puffU, sparkParams, sparkReach, spawnPuff, spawnSpark, startSteam, stepSteam,
  tracerOrigin, tracerSpan, tracerSpeed, tracerWidth, waterContactTime, FIRST_FRAME,
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
        expect(span.head - span.tail).toBeGreaterThanOrEqual(0);
        expect(span.tail).toBeGreaterThanOrEqual(prevTail); prevTail = span.tail;
        if (span.alive) expect(span.tail).toBeLessThan(d);
      }
    }
    // Retracting beam (approved 2026-09-23 deviation): the tail eases in from the muzzle over the whole life as dist * k^2.
    const d = 250, life = d / tracerSpeed(d) + .07;
    expect(tracerSpan(.02, d, span)).toMatchObject({ alive: true });
    expect(span.tail).toBeCloseTo(d * (.02 / life) ** 2, 9);
    expect(tracerSpan(life / 2, d, span).tail).toBeCloseTo(d / 4, 9);
  });
  it('draw from the muzzle on the shot frame: tail 0, head one 60 Hz frame of flight out (never a zero-length first frame)', () => {
    for (const d of [.5, 12, 70, 250]) {
      const first = tracerSpan(0, d, { head: 0, tail: 0, alive: false }, true);
      expect(first.tail).toBe(0); expect(first.alive).toBe(true); expect(first.fade).toBe(1);
      expect(first.head).toBeCloseTo(Math.min(d, tracerSpeed(d) * FIRST_FRAME), 9); expect(first.head).toBeGreaterThan(0);
      // A late first frame keeps its own (longer) head but still starts at the muzzle.
      const late = tracerSpan(.03, d, { head: 0, tail: 0, alive: false }, true);
      expect(late.tail).toBe(0); expect(late.head).toBeCloseTo(Math.min(d, tracerSpeed(d) * .03), 9);
    }
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

describe('cannon-synced muzzle effects', () => {
  const shot = (t: number) => {
    const s = createShooter(); s.clock = t;
    pushEvent(s, 'miss', { x: 1, y: 2, z: 3 }, { x: 1, y: 2, z: -47 }, null); return s.events[0];
  };
  const org = { from: { x: 0, y: 0, z: 0 }, dir: { x: 0, y: 0, z: 0 }, dist: 0 };
  it('starts a same-frame tracer at the live kicked muzzle and points it at the shot point', () => {
    const e = shot(2), fx = { x: 1.3, y: 2.4, z: 2.2, valid: true };
    expect(tracerOrigin(e, 2, fx, org)).toBe(true);
    for (const k of ['x', 'y', 'z'] as const) expect(Math.abs(org.from[k] - fx[k])).toBeLessThan(1e-9);
    const d = Math.hypot(e.point.x - fx.x, e.point.y - fx.y, e.point.z - fx.z);
    expect(org.dist).toBeCloseTo(d, 12);
    for (const k of ['x', 'y', 'z'] as const) expect(fx[k] + org.dir[k] * org.dist).toBeCloseTo(e.point[k], 9);
    expect(org.from).not.toBe(fx);
  });
  it('falls back to the event origin for older events or an invalid muzzle', () => {
    const e = shot(2);
    for (const [clock, valid] of [[2.016, true], [2, false]] as const) {
      expect(tracerOrigin(e, clock, { x: 9, y: 9, z: 9, valid }, org)).toBe(true);
      expect(org.from).toEqual(e.from); expect(org.dist).toBeCloseTo(50, 12); expect(org.dir).toEqual({ x: 0, y: 0, z: -1 });
    }
    const z = shot(0); z.point.x = z.from.x; z.point.y = z.from.y; z.point.z = z.from.z;
    expect(tracerOrigin(z, 1, { x: 0, y: 0, z: 0, valid: false }, org)).toBe(false);
  });
  it('keeps the halo edge 40 px off screen centre, never above its size, never below the core floor', () => {
    for (let dx = -400; dx <= 400; dx += 3.5) for (const halo of [40, 80, 200]) for (const core of [8, 16, 36]) {
      const r = haloClampPx(dx, halo, core), floor = Math.min(core, CORE_FLOOR_PX);
      expect(r).toBeLessThanOrEqual(halo); expect(r).toBeGreaterThanOrEqual(floor);
      if (r > floor) expect(Math.abs(dx) - r / 2).toBeGreaterThanOrEqual(CLEAR_PX - 1e-9);
    }
    expect(haloClampPx(200, 80, 36)).toBe(80); expect(haloClampPx(Infinity, 80, 36)).toBe(80);
    expect(haloClampPx(60, 80, 36)).toBe(40); expect(haloClampPx(-60, 80, 36)).toBe(40); expect(haloClampPx(10, 80, 36)).toBe(16);
  });
  it('draws touch and tap tracers at least 2 px wide', () => {
    for (const d of [3, 10, 40, 120, 250]) for (const fov of [50, 65]) for (const h of [390, 844]) {
      expect(tracerWidth(d, fov, h, 2) / pxAt(d, fov, h)).toBeGreaterThanOrEqual(2 - 1e-9);
      expect(tracerWidth(d, fov, h, 2)).toBeGreaterThanOrEqual(tracerWidth(d, fov, h));
    }
    expect(tracerWidth(200, 65, 844, 2) / pxAt(200, 65, 844)).toBeCloseTo(2, 9);
  });
  it('dims the halo from the 4th shot of a burst', () => {
    expect([0, 1, 2, 3, 4, 20].map(haloAlpha)).toEqual([.45, .45, .45, .3, .3, .3]);
  });
  it('vents steam from the vent mouth once it is valid, first puff 40 ms after the overheat, 40 ms apart', () => {
    const p = makePuffs(STEAM_PUFFS), q = makeSteam(), rng = mulberry32(5), c = { r: 1, g: 1, b: 1 };
    const vent = { x: 3, y: 4, z: 5, valid: false }, muzzle = { x: 0, y: 0, z: 0 };
    expect(stepSteam(q, 10, vent, muzzle, rng, p, c)).toBe(0);
    startSteam(q, 10);
    expect(stepSteam(q, 10.039, vent, muzzle, rng, p, c)).toBe(0);
    vent.valid = true;
    expect(stepSteam(q, 10.04, vent, muzzle, rng, p, c)).toBe(1);
    expect(p.d[0]).toBeCloseTo(10.04, 12);
    expect(Math.hypot(p.d[2] - 3, p.d[3] - 4, p.d[4] - 5)).toBeLessThan(.06);
    expect(stepSteam(q, 10.5, vent, muzzle, rng, p, c)).toBe(STEAM_PUFFS - 1);
    for (let k = 0; k < STEAM_PUFFS; k++) {
      expect(p.d[k * PUFF]).toBeCloseTo(10.04 + k * STEAM_GAP, 12);
      expect(Math.hypot(p.d[k * PUFF + 2] - 3, p.d[k * PUFF + 3] - 4, p.d[k * PUFF + 4] - 5)).toBeLessThan(.06);
    }
    expect(stepSteam(q, 11, vent, muzzle, rng, p, c)).toBe(0);
    // Small wisps: each puff grows to at most .22 m, rises .1 m/s, jets at most .12 m out of the hatch and lives .5 s, so it stays
    // within about .3 m of the hatch.
    const reach = (o: number, d: Float64Array) => d[o + 5] * d[o + 1] + Math.hypot(d[o + 17], d[o + 18], d[o + 19]) * DRIFT_TAU + d[o + 7] / 2;
    for (let k = 0; k < STEAM_PUFFS; k++) {
      const o = k * PUFF, d = p.d;
      expect(d[o + 1]).toBeLessThanOrEqual(.5); expect(d[o + 7]).toBeLessThanOrEqual(.22); expect(d[o + 15]).toBeLessThanOrEqual(.3);
      expect(reach(o, d)).toBeLessThanOrEqual(.3);
    }
    // With the vent direction, every puff jets along it (so it leaves the hatch sideways, not up the barrel) and drifts there.
    const dir = { x: 0, y: 0, z: 1 }, pos = { x: 0, y: 0, z: 0 }, col = { r: 0, g: 0, b: 0 }, size = { x: 0, y: 0 };
    startSteam(q, 30); vent.valid = true; stepSteam(q, 31, vent, muzzle, rng, p, c, dir);
    for (let k = 0; k < STEAM_PUFFS; k++) {
      const o = k * PUFF, d = p.d;
      expect(d[o + 19]).toBeGreaterThan(.8); expect(Math.hypot(d[o + 17], d[o + 18])).toBe(0); expect(reach(o, d)).toBeLessThanOrEqual(.3);
      puffFrame(p, k, .5, pos, col, size); expect(pos.z - d[o + 4]).toBeGreaterThan(.1);
    }
    // Hatch not open (vent invalid): the muzzle is the fallback.
    startSteam(q, 20); vent.valid = false; stepSteam(q, 20.04, vent, muzzle, rng, p, c);
    expect(Math.hypot(p.d[2], p.d[3], p.d[4])).toBeLessThan(.1);
  });
  it('keeps non-kill sparks within 1.35 m; the kill burst keeps its spray', () => {
    const out = { speed: 0, life: 0 };
    let reach = 0, kill = 0;
    for (let i = 0; i <= 20; i++) for (let j = 0; j <= 20; j++) {
      sparkParams(i / 20, j / 20, false, out); reach = Math.max(reach, sparkReach(out.speed, out.life));
      expect(out.speed).toBeGreaterThan(0); expect(out.life).toBeGreaterThan(0);
      sparkParams(i / 20, j / 20, true, out); kill = Math.max(kill, sparkReach(out.speed, out.life));
    }
    expect(reach).toBeLessThanOrEqual(1.35); expect(kill).toBeGreaterThan(1.35);
    // The bound holds for real ballistic sparks at the worst case, in any direction.
    const sp = makeSparks(1), pos = new Float32Array(3), col = new Float32Array(3), w = { r: 1, g: 1, b: 1 };
    sparkParams(.999999, .999999, false, out);
    for (const d of [{ x: 1, y: 0, z: 0 }, { x: 0, y: -1, z: 0 }, { x: 0, y: 1, z: 0 }]) {
      spawnSpark(sp, 0, O, d, out.speed, out.life); drawSparks(sp, out.life - 1e-6, pos, col, w, w);
      expect(Math.hypot(pos[0], pos[1], pos[2])).toBeLessThanOrEqual(1.35);
    }
  });
  it('wires the helpers into the effect components', () => {
    const shotFx = readFileSync(new URL('../src/world/ShotFx.tsx', import.meta.url), 'utf8');
    const impact = readFileSync(new URL('../src/world/ImpactFx.tsx', import.meta.url), 'utf8');
    expect(shotFx).toMatch(/tracerOrigin\(e, clock, cannonLink\.fxMuzzle, org\)/);
    expect(shotFx).toMatch(/cannonLink\.fxMuzzle\.valid \? cannonLink\.fxMuzzle : runtime\.shooter\.muzzle\.valid/);
    expect(shotFx).toMatch(/stepSteam\(steamQ, t, cannonLink\.ventMouth/); expect(shotFx).toMatch(/tracerSpan\(t - tr\[o\], dist, span, live\[i\] === 2\)/); expect(shotFx).toMatch(/haloAlpha\(eventBurstIndex\(e\.serial\)\)/);
    expect(impact).toMatch(/sparkParams\(rng\(\), rng\(\), kill, spark\)/);
    for (const src of [shotFx, impact]) expect(src.split('\n').length).toBeLessThan(200);
  });
});
