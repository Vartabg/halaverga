import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  ADS_GAIN, EVENT_RING, MAX_DRONES, MAX_SLOW, createShooter, engaged, flashGate, frictionNow, lookGain, moveMode, mulberry32,
  pressAim, pressFire, pushEvent, readEvents, releaseAim, releaseFire, resetShooterFeel, resetShooterInput, springStep, tapShot,
  type ShotEvent,
} from '../src/game/combat';
const O = { x: 0, y: 0, z: 0 };
const out = { x: 0, y: 0 };
describe('shooter state', () => {
  it('preallocates every drone array, target and event slot and serializes', () => {
    const s = createShooter();
    expect(() => JSON.stringify(s)).not.toThrow();
    const f = s.drones as unknown as Record<string, unknown>;
    for (const [key, value] of Object.entries(f)) {
      if (key === 'count') continue;
      expect([key, (value as ArrayLike<unknown>).length]).toEqual([key, key === 'flashHist' ? MAX_DRONES * 3 : MAX_DRONES]);
    }
    expect([...s.drones.flashHist].every(v => v === -Infinity)).toBe(true);
    expect(new Set(s.drones.pos).size).toBe(MAX_DRONES);
    expect(s.targets).toHaveLength(MAX_DRONES); expect(new Set(s.targets).size).toBe(MAX_DRONES);
    expect(s.events.length).toBe(EVENT_RING); expect(new Set(s.events).size).toBe(EVENT_RING);
  });
  it('resetShooterInput drops held controls and keeps serials and stats', () => {
    const s = createShooter();
    pressFire(s, 'touch'); pressAim(s, false); pressAim(s, true);
    Object.assign(s.input, { touchId: 7, tapFireUntil: 3 }); s.stats.shots = 4; s.stats.kills = 2;
    resetShooterInput(s);
    expect(s.input).toMatchObject({ fire: false, fireSource: 'none', aim: false, aimLatched: false, touchId: null, tapFireUntil: 0, pressSerial: 1 });
    expect(s.stats.shots).toBe(4); expect(s.stats.kills).toBe(2);
  });
  it('resetShooterFeel returns every feel channel to exact rest', () => {
    const s = createShooter();
    s.aim.blend = .7; s.aim.fireHold = 1; s.aim.spreadHalf = .02; s.aim.acquired = true; s.aim.target = 3;
    for (const key of Object.keys(s.camFx)) (s.camFx as Record<string, number>)[key] = .5;
    Object.assign(s.assist, { engaged: true, slow: .6, driftYaw: .3, driftPitch: -.2 });
    Object.assign(s.muzzle, { x: 1, y: 2, z: 3, valid: true, weight: 1 });
    s.weapon.heat = 50; s.weapon.sinceShot = .1; s.input.pressSerial = 5; s.weapon.handledPress = 2;
    resetShooterFeel(s);
    expect([s.aim.blend, s.aim.fireHold, s.aim.spreadHalf]).toEqual([0, 0, 0]);
    for (const value of Object.values(s.camFx)) expect(value).toBe(0);
    expect(s.assist.slow).toBe(0); expect(s.assist.driftYaw).toBe(0); expect(s.assist.driftPitch).toBe(0); expect(s.assist.engaged).toBe(false);
    expect(s.aim.acquired).toBe(false); expect(s.aim.target).toBe(-1); expect(s.muzzle.valid).toBe(false);
    expect(s.weapon.heat).toBe(0); expect(s.weapon.sinceShot).toBe(Infinity); expect(s.weapon.handledPress).toBe(s.input.pressSerial);
    lookGain(s, 3, -2, out);
    expect(out.x).toBe(3); expect(out.y).toBe(-2);
  });
});
describe('fire and aim helpers', () => {
  it('counts presses, owns releases and taps without holding', () => {
    const s = createShooter();
    pressFire(s, 'click'); pressFire(s, 'click'); expect(s.input.pressSerial).toBe(2);
    releaseFire(s, 'keys'); expect(s.input.fire).toBe(true); expect(s.input.fireSource).toBe('click');
    releaseFire(s, 'click'); expect(s.input.fire).toBe(false); expect(s.input.fireSource).toBe('none');
    tapShot(s); expect(s.input.pressSerial).toBe(3); expect(s.input.fire).toBe(false);
  });
  it('toggles the aim latch and leaves it alone on release', () => {
    const s = createShooter();
    pressAim(s, true); expect(s.input.aimLatched).toBe(true);
    releaseAim(s); expect(s.input.aimLatched).toBe(true);
    pressAim(s, true); expect(s.input.aimLatched).toBe(false);
    pressAim(s, false); expect(s.input.aim).toBe(true); releaseAim(s); expect(s.input.aim).toBe(false);
  });
  it('picks the movement mode and the engaged window', () => {
    const s = createShooter();
    expect(moveMode(s)).toBe(0); expect(engaged(s)).toBe(false);
    s.input.fire = true; expect(moveMode(s)).toBe(1); s.input.fire = false;
    s.weapon.sinceShot = .29; expect(moveMode(s)).toBe(1);
    s.weapon.sinceShot = .3; expect(moveMode(s)).toBe(0); expect(engaged(s)).toBe(true);
    s.weapon.sinceShot = .99; expect(engaged(s)).toBe(true);
    s.weapon.sinceShot = 1; expect(engaged(s)).toBe(false);
    s.input.fire = true; pressAim(s, true); expect(moveMode(s)).toBe(2); expect(engaged(s)).toBe(true);
    s.input.fire = false; s.input.aimLatched = false; s.input.aim = true; expect(moveMode(s)).toBe(2);
  });
});
describe('event ring', () => {
  it('yields the newest EVENT_RING events in order and reuses slots', () => {
    const s = createShooter(), cursor = { last: 0 }, seen: ShotEvent[] = [], serials: number[] = [];
    const read = (e: ShotEvent) => { seen.push(e); serials.push(e.serial); };
    for (let k = 1; k <= 20; k++) { s.clock = k; pushEvent(s, 'hit', { x: k, y: 0, z: 0 }, O, null, k % MAX_DRONES); }
    readEvents(s, cursor, read);
    expect(serials).toEqual(Array.from({ length: 16 }, (_, k) => k + 5));
    expect(cursor.last).toBe(20);
    for (const e of seen) expect(e).toBe(s.events[(e.serial - 1) % EVENT_RING]);
    expect(seen[0].from.x).toBe(5); expect(seen[0].t).toBe(5); expect(seen[0].normal).toEqual({ x: 0, y: 1, z: 0 });
    seen.length = 0; serials.length = 0;
    pushEvent(s, 'kill', O, { x: 1, y: 2, z: 3 }, { x: 1, y: 0, z: 0 }, 2);
    readEvents(s, cursor, read);
    expect(serials).toEqual([21]); expect(seen[0]).toBe(s.events[20 % EVENT_RING]);
    expect(seen[0].kind).toBe('kill'); expect(seen[0].normal).toEqual({ x: 1, y: 0, z: 0 });
    readEvents(s, cursor, read); expect(serials).toEqual([21]);
  });
});
describe('look gain and friction', () => {
  it('passes input through bit-exactly while idle', () => {
    const s = createShooter();
    for (const [dx, dy] of [[3, -2], [0.1 + 0.2, -1e-17], [-123.456, 7e5]]) {
      lookGain(s, dx, dy, out); expect(out.x).toBe(dx); expect(out.y).toBe(dy);
    }
  });
  it('scales by the ADS gain at full blend', () => {
    const s = createShooter(); s.aim.blend = 1;
    expect(Math.abs(ADS_GAIN - .73196)).toBeLessThan(1e-5);
    lookGain(s, 10, -4, out);
    expect(out.x).toBeCloseTo(10 * ADS_GAIN, 12); expect(out.y).toBeCloseTo(-4 * ADS_GAIN, 12);
  });
  it('slows against the drift, not with it, and follows the steering device at once', () => {
    const s = createShooter();
    Object.assign(s.assist, { engaged: true, slow: .6, driftYaw: .5, driftPitch: 0, scale: 1 }); s.input.lookSource = 'touch';
    expect(frictionNow(s)).toBeCloseTo(.6, 12);
    lookGain(s, -5, 2, out); expect(out.x).toBe(-5); expect(out.y).toBeCloseTo(2 * .4, 12);
    lookGain(s, 5, 0, out); expect(out.x).toBeCloseTo(5 * .4, 12);
    s.input.lookSource = 'trackpad'; expect(frictionNow(s)).toBeCloseTo(.36, 12);
    for (const source of ['tap', 'mouse'] as const) {
      s.input.lookSource = source; expect(frictionNow(s)).toBe(0);
      lookGain(s, 5, -3, out); expect(out.x).toBe(5); expect(out.y).toBe(-3);
    }
    s.input.lookSource = 'touch'; s.assist.engaged = false; expect(frictionNow(s)).toBe(0);
    s.assist.engaged = true; s.assist.scale = 1.5; expect(frictionNow(s)).toBe(MAX_SLOW);
    s.assist.scale = 0; expect(frictionNow(s)).toBe(0);
  });
});
describe('flash gate', () => {
  it('allows three flashes per second', () => {
    const hist = new Float64Array(3).fill(-Infinity);
    expect([0, .11, .22, .33, 1.0, 1.05].map(t => flashGate(hist, 0, t))).toEqual([true, true, true, false, true, false]);
  });
  it('never passes more than three in any 1 s window at 9 calls per second', () => {
    const hist = new Float64Array(3).fill(-Infinity), passed: number[] = [];
    for (let k = 0; k < 27; k++) if (flashGate(hist, 0, k / 9)) passed.push(k / 9);
    expect(passed.length).toBeGreaterThanOrEqual(8);
    for (const t of passed) expect(passed.filter(u => u >= t && u < t + 1).length).toBeLessThanOrEqual(3);
  });
  it('isolates slots by offset', () => {
    const hist = new Float64Array(6).fill(-Infinity);
    for (const t of [0, .1, .2]) expect(flashGate(hist, 0, t)).toBe(true);
    expect(flashGate(hist, 0, .3)).toBe(false);
    for (const t of [.3, .4, .5]) expect(flashGate(hist, 3, t)).toBe(true);
    expect(flashGate(hist, 3, .6)).toBe(false);
    expect([...hist]).toEqual([0, .1, .2, .3, .4, .5]);
  });
});
describe('springStep', () => {
  const spring = { x: 0, v: 0 };
  it('composes identically at any frame rate', () => {
    for (const [x0, v0] of [[1, -3], [0, 20], [-.4, 7]]) {
      springStep(x0, v0, 10, .6, .5, spring); const x = spring.x, v = spring.v;
      for (const dt of [1 / 30, 1 / 60, 1 / 120, 1 / 165]) {
        let t = 0; spring.x = x0; spring.v = v0;
        while (.5 - t > 1e-12) { const h = Math.min(dt, .5 - t); springStep(spring.x, spring.v, 10, .6, h, spring); t += h; }
        expect(Math.abs(spring.x - x)).toBeLessThan(1e-9); expect(Math.abs(spring.v - v)).toBeLessThan(1e-9);
      }
    }
  });
  it('peaks at 0.9977 near 116 ms after an impulse of 20', () => {
    let peak = 0, at = 0; spring.x = 0; spring.v = 20;
    for (let k = 1; k <= 4000; k++) { springStep(spring.x, spring.v, 10, .6, 1e-4, spring); if (spring.x > peak) { peak = spring.x; at = k * 1e-4; } }
    expect(Math.abs(peak - .9977)).toBeLessThan(.001); expect(Math.abs(at - .1159)).toBeLessThan(.001);
  });
  it('returns the inputs for dt <= 0 or NaN', () => {
    for (const dt of [0, -.1, NaN]) { springStep(.3, -2, 10, .6, dt, spring); expect(spring).toEqual({ x: .3, v: -2 }); }
  });
});
describe('mulberry32 and landing safety', () => {
  it('is deterministic per seed and stays in [0, 1)', () => {
    const a = mulberry32(42), b = mulberry32(42), c = mulberry32(43);
    const seqA = Array.from({ length: 5 }, a), seqB = Array.from({ length: 5 }, b), seqC = Array.from({ length: 5 }, c);
    expect(seqA).toEqual(seqB); expect(seqA).not.toEqual(seqC);
    const r = mulberry32(7);
    for (let k = 0; k < 10000; k++) { const v = r(); expect(v >= 0 && v < 1).toBe(true); }
  });
  it('keeps combat.ts free of scene imports and first-load markers', () => {
    const src = readFileSync(new URL('../src/game/combat.ts', import.meta.url), 'utf8');
    for (const banned of ["from 'three'", '@react-three', '@dimforge', 'WebGLRenderer', 'isVector3', 'BufferGeometry', 'powerHero', 'bankLeft', 'Math.random('])
      expect([banned, src.includes(banned)]).toEqual([banned, false]);
  });
});
