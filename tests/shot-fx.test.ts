import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AdditiveBlending, Box3, BoxGeometry, type BufferAttribute, Euler, type MeshStandardMaterial, Vector3 } from 'three';
import { FX, debrisPool, disposePool, fxKit, shardGeometry, sparkMinPx } from '../src/world/fxMaterials';
import { EVENT_RING, WATER_LEVEL, createShooter, flashGate, mulberry32, pushEvent, readEvents, type ShotEvent } from '../src/game/combat';
import {
  CLEAR_PX, CORE_FLOOR_PX, CURVE_HOLD, DRIFT_TAU, PLUME, PUFF, STEAM_GAP, STEAM_PUFFS, claim, debrisAt, drawSparks, haloAlpha, haloClampPx, impactDelay, isShotKind,
  burstGain, killSparkCount, lobeDir, makePuffs, makeSparks, makeSteam, puffFrame, puffU, SHARD_K_MAX, shardGain, shardK, shardScale, shardTint, sparkParams, sparkReach, spawnPuff, spawnSpark, startSteam, stepSteam,
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

describe('kill and hit effect shapes (no squares, no slabs)', () => {
  const geo = shardGeometry(), pos = geo.attributes.position, nTri = pos.count / 3, o3 = { x: 0, y: 0, z: 0 };
  const tri = (i: number) => [0, 1, 2].map(k => new Vector3().fromBufferAttribute(pos, i * 3 + k));
  /** Sorted extents and mean projected area (surface area / 4, exact for convex bodies) of slot i's shard at uniform scale k. */
  const stats = (i: number, k: number) => {
    shardScale(i, o3); let area = 0; const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9], sc = new Vector3(o3.x * k, o3.y * k, o3.z * k);
    for (let f = 0; f < nTri; f++) {
      const [a, b, c] = tri(f).map(p => p.multiply(sc));
      area += b.clone().sub(a).cross(c.clone().sub(a)).length() / 2;
      for (const p of [a, b, c]) for (let d = 0; d < 3; d++) { mn[d] = Math.min(mn[d], p.getComponent(d)); mx[d] = Math.max(mx[d], p.getComponent(d)); }
    }
    return { area: area / 4, ext: [0, 1, 2].map(d => mx[d] - mn[d]).sort((x, y) => x - y) };
  };
  it('debris is a chunky many-faced lump, not a box slab, a plain tetrahedron or a flat plate', () => {
    expect(geo.type).not.toBe('BoxGeometry'); expect(geo.index).toBeNull(); expect(nTri).toBeGreaterThanOrEqual(20);
    const nrm = geo.attributes.normal;
    for (let f = 0; f < nTri; f++) {
      const n0 = new Vector3().fromBufferAttribute(nrm, f * 3), n2 = new Vector3().fromBufferAttribute(nrm, f * 3 + 2), [p0, p1, p2] = tri(f);
      expect(n0.length()).toBeCloseTo(1, 5); expect(n0.distanceTo(n2)).toBeLessThan(1e-6);   // flat: one normal per face
      expect(n0.dot(p1.clone().sub(p0).cross(p2.clone().sub(p0)).normalize())).toBeCloseTo(1, 5);
    }
    // At least 14 distinct corners, spread over three layers in z (an apex, two rings, an apex), not a two-sided plate.
    const corners = new Set<string>(), zs = new Set<string>();
    for (let v = 0; v < pos.count; v++) { corners.add([0, 1, 2].map(k => pos.getComponent(v, k).toFixed(4)).join()); zs.add(pos.getZ(v).toFixed(2)); }
    expect(corners.size).toBe(12); expect(zs.size).toBeGreaterThanOrEqual(10);
    // Outward winding: nearly every face normal points away from the centre.
    let out = 0; for (let f = 0; f < nTri; f++) { const [a, b, c] = tri(f), n = new Vector3().fromBufferAttribute(nrm, f * 3); if (n.dot(a.add(b).add(c)) > 0) out++; }
    expect(out).toBeGreaterThan(nTri * .85);
  });
  it('is centred on its bounding box and .8 m long at scale 1', () => {
    const box = new Box3().setFromBufferAttribute(pos as BufferAttribute), size = box.getSize(new Vector3()), c = box.getCenter(new Vector3());
    expect(Math.max(size.x, size.y, size.z)).toBeCloseTo(.8, 4); expect(c.length()).toBeLessThan(1e-6);
    expect([size.x, size.y, size.z].sort((x, y) => x - y)[0] / .8).toBeGreaterThan(.55);   // thick: thinnest extent over .55 of the length
  });
  /** What the camera sees: the shard (slot i, scale k) turned through `rots` seeded random rotations, orthographically projected, and the
   *  convex hull of the outline measured: area against its tightest bounding rectangle (a rectangle is 1) and thinnest width against the longest span. */
  const outline = (verts: number[], sc: Vector3, rots: number) => {
    let seed = 7; const rnd = () => (seed = Math.imul(seed, 1664525) + 1013904223 >>> 0) / 4294967296;
    let fillMax = 0, widthMin = 1; const e = new Euler(), v = new Vector3();
    for (let r = 0; r < rots; r++) {
      e.set(rnd() * 6.283, rnd() * 6.283, rnd() * 6.283);
      const pts = []; for (let n = 0; n < verts.length; n += 3) { v.set(verts[n] * sc.x, verts[n + 1] * sc.y, verts[n + 2] * sc.z).applyEuler(e); pts.push([v.x, v.y]); }
      pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      const cr = (o: number[], a: number[], b: number[]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]), hull: number[][] = [];
      for (const half of [pts, [...pts].reverse()]) {
        const start = hull.length;
        for (const p of half) { while (hull.length >= start + 2 && cr(hull[hull.length - 2], hull[hull.length - 1], p) <= 0) hull.pop(); hull.push(p); }
        hull.pop();
      }
      let area = 0, boxMin = 1e9, wMin = 1e9, span = 0;
      for (let i = 0; i < hull.length; i++) { const a = hull[i], b = hull[(i + 1) % hull.length]; area += (a[0] * b[1] - b[0] * a[1]) / 2; }
      for (let i = 0; i < hull.length; i++) {
        const a = hull[i], b = hull[(i + 1) % hull.length], l = Math.hypot(b[0] - a[0], b[1] - a[1]), ux = (b[0] - a[0]) / l, uy = (b[1] - a[1]) / l;
        let lo = 1e9, hi = -1e9, w = 0;
        for (const p of hull) { const s = (p[0] - a[0]) * ux + (p[1] - a[1]) * uy; lo = Math.min(lo, s); hi = Math.max(hi, s); w = Math.max(w, -(p[0] - a[0]) * uy + (p[1] - a[1]) * ux); }
        boxMin = Math.min(boxMin, (hi - lo) * w); wMin = Math.min(wMin, w);
      }
      for (const a of hull) for (const b of hull) span = Math.max(span, Math.hypot(a[0] - b[0], a[1] - b[1]));
      fillMax = Math.max(fillMax, area / boxMin); widthMin = Math.min(widthMin, wMin / span);
    }
    return { fill: fillMax, width: widthMin };
  };
  const verts = Array.from(pos.array as ArrayLike<number>);
  it('the projected silhouette is never a rectangle or a bar, in any of 150 rotations, for every slot', () => {
    for (let i = 0; i < 32; i++) {
      shardScale(i, o3); const o = outline(verts, new Vector3(o3.x, o3.y, o3.z), 150);
      expect(o.fill).toBeLessThan(.88); expect(o.width).toBeGreaterThan(.4);   // a slab or plate is 1.0 face-on and under .25 edge-on
    }
  });
  it('the silhouette measure does catch the old shapes: a box slab and a flattened lump both fail it', () => {
    const slab = Array.from(new BoxGeometry(.5, .08, .35).toNonIndexed().attributes.position.array as ArrayLike<number>), one = new Vector3(1, 1, 1);
    const sl = outline(slab, one, 150); expect(sl.fill > .88 || sl.width < .4).toBe(true);
    const flat = outline(verts, new Vector3(1.1, 1, .35), 150); expect(flat.fill > .88 || flat.width < .4).toBe(true);
  });
  it('no slot reads as a blade or a flat sheet: long/mid under 1.8, thin/mid over .6', () => {
    for (let i = 0; i < 32; i++) { const { ext } = stats(i, 1); expect(ext[2] / ext[1]).toBeLessThan(1.8); expect(ext[0] / ext[1]).toBeGreaterThan(.6); }
  });
  it('a piece is never bigger than the drone: the real largest kill piece stays under 1.5 m, and the smallest still reads', () => {
    expect(shardK(1.15, shardGain(2.2))).toBe(SHARD_K_MAX); expect(shardK(.65, 1)).toBeCloseTo(.65, 9);   // the burst's real extremes
    const kMax = shardK(1.15, shardGain(2.2));
    for (let i = 0; i < 32; i++) {
      expect(stats(i, kMax).ext[2]).toBeLessThan(1.5); expect(stats(i, kMax).ext[2]).toBeLessThan(.8 * 1.86);   // drone rotor span 1.86 m
      expect(stats(i, .65).area).toBeGreaterThan(.1);   // the smallest burst piece, at least the old .5 x .08 x .35 slab's .12 within a sliver
      expect(stats(i, shardK(.75, 1)).area).toBeGreaterThan(.12);   // a break chip at close range
    }
  });
  it('per-slot scale gives three visibly different families, deterministically', () => {
    const o = { x: 0, y: 0, z: 0 }, fam = new Set<string>(), shapes = new Set<string>();
    for (let i = 0; i < 32; i++) {
      shardScale(i, o); const again = { x: 0, y: 0, z: 0 }; shardScale(i, again); expect(again).toEqual(o);
      expect(o.x).toBeGreaterThan(.3); expect(o.y).toBeGreaterThan(.3); expect(o.z).toBeGreaterThan(.3);
      fam.add(o.y > 1.1 ? 'wedge' : o.z > 1.15 * o.x ? 'chip' : 'panel'); shapes.add((o.x / o.y).toFixed(2));
    }
    expect([...fam].sort()).toEqual(['chip', 'panel', 'wedge']); expect(shapes.size).toBeGreaterThan(8);
  });
  it('tints shards gunmetal, worn panel and scorched red (never one flat cream), with headroom under the warm sun', () => {
    const seen = new Set<number>(); for (let i = 0; i < 32; i++) seen.add(shardTint(i));
    expect([...seen].sort()).toEqual([0, 1, 2]);
    for (const c of [FX.metal, FX.panel, FX.rust]) expect(Math.max(c.r, c.g, c.b)).toBeLessThan(.25);   // linear colour: dark, never near white (the old panel was .53)
    expect(FX.rust.r).toBeGreaterThan(FX.rust.b * 3);
    expect(FX.panel.r + FX.panel.g + FX.panel.b).toBeGreaterThan(FX.metal.r + FX.metal.g + FX.metal.b);
  });
  it('the debris pool uses the shard, per-instance tint and heat, and the flat-shaded material with a cold-piece floor', () => {
    const pool = debrisPool(32);
    expect(pool.geometry.type).not.toBe('BoxGeometry'); expect(pool.geometry.attributes.position.count).toBe(pos.count);
    expect(pool.geometry.attributes.aHeat.count).toBe(32); expect(pool.count).toBe(0); expect(pool.instanceMatrix.count).toBe(32);
    expect(pool.instanceColor!.count).toBe(32);
    const m = pool.material as MeshStandardMaterial; expect(m.flatShading).toBe(true); expect(m.color.getHex()).toBe(0xffffff);
    expect(m.customProgramCacheKey!()).toBe('fx-debris-heat'); disposePool(pool);
    const kit = readFileSync(new URL('../src/world/fxMaterials.ts', import.meta.url), 'utf8');
    expect(kit).toMatch(/diffuseColor\.rgb \* \.1/);   // emissive floor
    expect(kit).toMatch(/aHeat \* clamp\(length\(position\) \* 3\. - \.5, \.12, 1\.\)/);   // heat glows the far tips and corners, the faces stay metal
  });
  it('burst gain keeps the fireball at least 150 px across to 30 m, never shrinks it, never exceeds 2.2, and is monotonic', () => {
    for (const [fov, h] of [[65, 800], [65, 390], [50, 1200]]) {
      let prev = 1;
      for (let d = 2; d <= 250; d += 4) {
        const g = burstGain(d, fov, h), mpp = 2 * d * Math.tan(fov * Math.PI / 360) / h;
        expect(g).toBeGreaterThanOrEqual(1); expect(g).toBeLessThanOrEqual(2.2); expect(g).toBeGreaterThanOrEqual(prev - 1e-12); prev = g;
        if (150 * mpp <= 3.5 * 2.2) expect(3.5 * g / mpp).toBeGreaterThanOrEqual(150 - 1e-6);
      }
    }
    expect(burstGain(26, 65, 800)).toBeGreaterThan(1.5);   // the owner's ~26 m desktop case
    expect(burstGain(3, 65, 800)).toBe(1);
    expect(shardGain(1)).toBe(1); expect(shardGain(2.2)).toBeGreaterThan(1.5); expect(shardGain(2.2)).toBeLessThan(2.2);
    expect(killSparkCount(0)).toBeGreaterThanOrEqual(40); expect(killSparkCount(.999)).toBeLessThanOrEqual(57);
  });
  it('the smoke is a warm charcoal that rises fast and fades early, not a lavender disc', () => {
    expect(FX.plume.r).toBeGreaterThan(FX.plume.b * 1.8); expect(FX.plumeEnd.r).toBeGreaterThanOrEqual(FX.plumeEnd.b);
    expect(PLUME.life).toBeLessThanOrEqual(1.2); expect(PLUME.rise).toBeGreaterThanOrEqual(2);
    const p = makePuffs(1), pos2 = { x: 0, y: 0, z: 0 }, col = { r: 0, g: 0, b: 0 }, size = { x: 0, y: 0 };
    spawnPuff(p, 0, O, PLUME.rise, PLUME.life, PLUME.s0, PLUME.s1, 1, FX.plume, FX.plumeEnd, PLUME.alpha, CURVE_HOLD);
    expect(puffFrame(p, 0, .6, pos2, col, size)).toBeLessThan(.25);   // mostly gone while the pieces still fly
    expect(pos2.y).toBeGreaterThan(PLUME.rise * PLUME.life * .6 - 1e-9);
  });
  it('sparks are round additive discs: transparent, mapped, soft-edged, bright at the 2 px sample points', () => {
    const m = fxKit().spark;
    expect(m.map).toBeTruthy(); expect(m.map).toBe(fxKit().sparkMap); expect(m.transparent).toBe(true);
    expect(m.blending).toBe(AdditiveBlending); expect(m.sizeAttenuation).toBe(true); expect(m.vertexColors).toBe(true);
    const img = m.map!.image as { data: Uint8Array; width: number }, n = img.width, a = (x: number, y: number) => img.data[(y * n + x) * 4 + 3];
    for (const [x, y] of [[0, 0], [n - 1, 0], [0, n - 1], [n - 1, n - 1]]) expect(a(x, y)).toBe(0);   // square corners are clear
    for (let k = 0; k < n; k++) { expect(a(k, 0)).toBeLessThan(10); expect(a(0, k)).toBeLessThan(10); }   // no edge row left lit
    expect(a(n / 2, n / 2)).toBe(255);
    // A 2 px point samples at uv .25/.75 (r .71 from centre): still at least half alpha, and corner samples match edge samples (round).
    const q = n / 4, hi = n - 1 - q;
    expect(a(q, q)).toBeGreaterThan(128); expect(a(hi, q)).toBe(a(q, q)); expect(a(q, hi)).toBe(a(q, q)); expect(a(hi, hi)).toBe(a(q, q));
    expect(a(n / 2, 1)).toBeLessThan(a(q, q));
    expect(sparkMinPx.value).toBeGreaterThanOrEqual(2);
  });
  it('sparks cool from white-yellow through orange to ember and fade out', () => {
    const sp = makeSparks(1), pos = new Float32Array(3), col = new Float32Array(3);
    const c0 = { r: 1, g: 1, b: .8 }, c1 = { r: 1, g: .4, b: .1 }, c2 = { r: .5, g: .1, b: .05 };
    spawnSpark(sp, 0, O, { x: 0, y: 1, z: 0 }, 1, 1);
    drawSparks(sp, .001, pos, col, c0, c1, c2); expect(col[1]).toBeGreaterThan(.99);
    drawSparks(sp, .5, pos, col, c0, c1, c2); expect(col[0]).toBeCloseTo(.75, 5); expect(col[1]).toBeCloseTo(.4 * .75, 5);
    drawSparks(sp, .75, pos, col, c0, c1, c2); expect(col[1]).toBeCloseTo(.25 * (1 - .5625), 5); expect(col[0]).toBeCloseTo(.75 * (1 - .5625), 5);
    expect(drawSparks(sp, 1.01, pos, col, c0, c1, c2)).toBe(0);
  });
  it('the kill burst is a bright fire the pieces are thrown out of: bigger pop, longer flame and glow, more and bigger embers', () => {
    const impact = readFileSync(new URL('../src/world/ImpactFx.tsx', import.meta.url), 'utf8');
    expect(impact).toMatch(/\.08, 5 \* g, 5 \* g, 1, FX\.pop, FX\.pop, 1, CURVE_FLAT/);   // the first-frame flash is 5 g wide for 80 ms
    const glow = /spawnPuff\(addP, t, c, 0, ([\d.]+), ([\d.]+) \* g, ([\d.]+) \* g, 1, FX\.blaze, FX\.ember, ([\d.]+), CURVE_HOLD\)/.exec(impact)!;
    expect(Number(glow[1])).toBeGreaterThanOrEqual(.9); expect(Number(glow[3])).toBeGreaterThanOrEqual(6);   // a wide dim glow that outlasts the flame
    expect(impact).toMatch(/t \+ \.1, c, 0, \.7, 2\.6 \* g, 4\.6 \* g/);   // the ember-red core holds .7 s
    expect(impact).toMatch(/1\.5 \* emberGain/); expect(impact).toMatch(/EMBER_T = \.55/);
    const out = { speed: 0, life: 0 }; sparkParams(0, 0, true, out); expect(out.life).toBeGreaterThanOrEqual(.3);   // embers last, not flicker
    expect(killSparkCount(0)).toBeGreaterThanOrEqual(40);
  });
  it('the smoke is several offset puffs that drift out and rise at their own speeds, pale at the end, not one centred smudge', () => {
    const impact = readFileSync(new URL('../src/world/ImpactFx.tsx', import.meta.url), 'utf8');
    expect(impact).toMatch(/n = reduced \? 2 : 4/); expect(impact).toMatch(/Math\.cos\(a\) \* r/);   // spread round the burst
    expect(impact).toMatch(/PLUME\.rise \* \(\.7 \+ \.6 \* rng\(\)\)/); expect(impact).toMatch(/PLUME\.s0 \* g \* \(\.7 \+ \.6 \* rng\(\)\)/);   // own rise and size
    expect(FX.plumeEnd.r + FX.plumeEnd.g + FX.plumeEnd.b).toBeGreaterThan(FX.plume.r + FX.plume.g + FX.plume.b);   // fades lighter, toward the sky
    expect(PLUME.alpha).toBeLessThanOrEqual(.55);
  });
  it('kill pieces take their size from shardK, so none passes the cap', () => {
    const impact = readFileSync(new URL('../src/world/ImpactFx.tsx', import.meta.url), 'utf8');
    expect(impact).toMatch(/shardK\(k < 3 \? 1\.15 : \.65 \+ \.25 \* rng\(\), sg\)/); expect(impact).toMatch(/shardK\(\.75, shardGain\(gainAt\(e\.point\)\)\)/);
    expect(shardK(5, 5)).toBe(SHARD_K_MAX);
  });
  it('keeps the five-draw-call budget and wires the hot ramp and shard scale', () => {
    const impact = readFileSync(new URL('../src/world/ImpactFx.tsx', import.meta.url), 'utf8');
    expect(impact).toMatch(/meshes: \[sparks, add, alpha, rings, debris\]/);
    expect(impact).toMatch(/drawSparks\(sp, t, sPos, sCol, FX\.pop, FX\.blaze, FX\.ember\)/);
    expect(impact).toMatch(/shardScale\(i, sh\)/);
    expect(impact).toMatch(/tint\(debris, i, TINTS\[shardTint\(i\)\], 1\)/);   // every claimed slot gets its tint
    expect(impact).toMatch(/gainAt\(c\)/); expect(impact).toMatch(/spawnPuff\(alphaP, t, c, 0, \.5, 1 \* g, 2\.8 \* g, 1, FX\.char/);   // dark core under the flame
    expect(impact).toMatch(/add\.renderOrder = sparks\.renderOrder = 2/);   // the smoke draws first, so flames and embers are not dimmed
    expect(impact).not.toMatch(/setScalar\(db/);
    const kit = readFileSync(new URL('../src/world/fxMaterials.ts', import.meta.url), 'utf8');
    expect(kit).not.toMatch(/\bBoxGeometry\b/);
    for (const f of ['fxMaterials.ts', 'fxPools.ts', 'ImpactFx.tsx']) expect(readFileSync(new URL('../src/world/' + f, import.meta.url), 'utf8').split('\n').length).toBeLessThan(200);
  });
});
