import { beforeEach, describe, expect, it } from 'vitest';
import { FOOT, type Vec } from '../src/game/motion';
import { clearGesture, gesture, LIFT_REQUEST } from '../src/game/gesture/bus';
import { steerRates } from '../src/game/gesture/conduct';
import { createConductScheme, type ConductCue, type ConductScheme } from '../src/game/gesture/conductScheme';
import { OFFSET_JERK, STEER_PITCH_MAX, STEER_YAW_MAX } from '../src/game/gesture/tuning';
import type { AimFrame, ArbiterOut, GestureCtx, PointerKind, StrokeClass, StrokeView } from '../src/game/gesture/types';

const DT = 1 / 60, W = 1600, H = 900, CX = W / 2, CY = H / 2;
const frame: AimFrame = { origin: { x: 0, y: 2, z: 6 }, dir: { x: 0, y: 0, z: -1 }, right: { x: 1, y: 0, z: 0 },
  up: { x: 0, y: 1, z: 0 }, fov: 60, aspect: W / H, left: 0, top: 0, width: W, height: H, t: 1 };
const hero: Vec = { x: 0, y: 0, z: 0 };

function rng(seed: number) {
  return () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** Minimal StrokeView over plain arrays (tests only). */
class Stroke implements StrokeView {
  readonly pointerId = 1; xs: number[] = []; ys: number[] = []; ts: number[] = [];
  constructor(readonly kind: PointerKind = 'touch') {}
  get count() { return this.ts.length; }
  x(i: number) { return this.xs[i]; } y(i: number) { return this.ys[i]; } t(i: number) { return this.ts[i]; }
  get startX() { return this.xs[0]; } get startY() { return this.ys[0]; } get startT() { return this.ts[0]; }
  get lastX() { return this.xs[this.count - 1]; } get lastY() { return this.ys[this.count - 1]; } get lastT() { return this.ts[this.count - 1]; }
  arc = 0; chord = 0; minX = 0; minY = 0; maxX = 0; maxY = 0; winding = 0; straightness = 0; speed60 = 0; speed150 = 0; travel = 0;
  push(x: number, y: number, t: number) { this.xs.push(x); this.ys.push(y); this.ts.push(t); }
}
const cls = (over: Partial<StrokeClass> = {}): StrokeClass => ({ kind: 'none', dir: null, angle: 0, magnitude: 0, winding: 0,
  speed: 0, chordX: 0, chordY: 0, ...over });
const out = (type: ArbiterOut['type'], drone = -1): ArbiterOut => ({ type, id: 1, x: 900, y: 400, t: 0, drone, progress: 0 });

type Rig = { s: ConductScheme; ctx: GestureCtx; clock: number; cues: [ConductCue, number][]; stroke: Stroke | null };
function rig(opt: { clear?: boolean; ground?: number } = {}): Rig {
  const cues: [ConductCue, number][] = [];
  const s = createConductScheme({ frame: () => frame, cue: (k, d) => { cues.push([k, d]); } });
  const ctx: GestureCtx = { canLand: () => true, pathClear: () => opt.clear ?? true, groundBelow: () => opt.ground ?? 40,
    clock: 0, land: () => {}, say: () => {} };
  gesture.step = s.step;
  return { s, ctx, clock: 0, cues, stroke: null };
}
const ms = (r: Rig) => r.clock * 1000;
function down(r: Rig, x: number, y: number, kind: PointerKind = 'touch') {
  r.stroke = new Stroke(kind); r.stroke.push(x, y, ms(r)); r.s.down(r.stroke);
}
/** Runs `sec` of physics at 60 Hz; path(tSec since call) feeds samples at hz (jittered +-j px) while a stroke is down. */
function run(r: Rig, sec: number, path?: (t: number) => [number, number], hz = 60, j = 0, each?: () => void) {
  const rand = rng(7), t0 = r.clock, sdt = 1 / hz;
  let next = t0 + sdt;
  for (let i = 0, n = Math.round(sec / DT); i < n; i++) {
    const end = r.clock + DT;
    while (path && r.stroke && next <= end + 1e-9) {
      const [x, y] = path(next - t0);
      r.stroke.push(x + (rand() * 2 - 1) * j, y + (rand() * 2 - 1) * j, next * 1000); next += sdt;
    }
    if (path && r.stroke) r.s.move(r.stroke);
    r.clock = end; r.s.step(DT, hero, r.ctx); each?.();
  }
}
const up = (r: Rig, c = cls()) => { if (r.stroke) r.s.up(r.stroke, c); r.stroke = null; };
const circle = (cx: number, cy: number, rad: number, hz: number, cw = true) => (t: number): [number, number] => {
  const a = 2 * Math.PI * hz * t * (cw ? 1 : -1); return [cx + rad * Math.cos(a), cy + rad * Math.sin(a)];
};

beforeEach(() => { clearGesture(); gesture.scheme = 'conduct'; gesture.override = false; });

describe('conduct steering', () => {
  it('a centred point never steers; the deadzone and saturation hold', () => {
    const o = { yaw: 9, pitch: 9 };
    expect(steerRates(frame, CX, CY, hero, o)).toEqual({ yaw: 0, pitch: 0 });
    expect(steerRates(frame, CX + 25, CY, hero, o).yaw).toBe(0); // ~2 deg: inside the 4 deg deadzone
    expect(steerRates(frame, CX + 120, CY, hero, o).yaw).toBeLessThan(0); // right of centre turns right (negative yaw)
    expect(steerRates(frame, W - 5, CY, hero, o).yaw).toBe(-STEER_YAW_MAX);
    expect(steerRates(frame, CX, 5, hero, o).pitch).toBe(STEER_PITCH_MAX);
  });

  it('the first 120 ms of a contact never steers, then a resting off-centre finger turns at a constant rate', () => {
    const r = rig(); down(r, W - 100, CY);
    run(r, 0.1); expect(gesture.yawRate).toBe(0);
    run(r, 0.4); const a = gesture.yawRate;
    run(r, 1); expect(a).toBeLessThan(-0.5); expect(gesture.yawRate).toBeCloseTo(a, 6);
  });
});

describe('conduct tempo', () => {
  for (const hz of [60, 120]) it(`a stir at a fixed centroid raises speed with yaw-rate change < 0.1 rad/s (${hz} Hz)`, () => {
    const c = [CX + 200, CY] as const, rest = rig(); down(rest, c[0], c[1]); run(rest, 1);
    const baseline = gesture.yawRate; clearGesture(); gesture.scheme = 'conduct';
    const r = rig(); down(r, c[0] + 100, c[1]);
    let lo = Infinity, hi = -Infinity;
    run(r, 1.5, circle(c[0], c[1], 100, 1.1), hz, 1);
    const early = r.s.state.forward;
    run(r, 2.5, (t) => circle(c[0], c[1], 100, 1.1)(t + 1.5), hz, 1, () => { lo = Math.min(lo, gesture.yawRate); hi = Math.max(hi, gesture.yawRate); });
    expect(hi - lo).toBeLessThan(0.1);
    expect(Math.abs((hi + lo) / 2 - baseline)).toBeLessThan(0.1);
    expect(r.s.state.throttle).toBeGreaterThan(0.8);
    expect(r.s.state.forward).toBeGreaterThan(early);
    expect(gesture.spin).toBe(0); expect(r.cues.some(([k]) => k === 'roll')).toBe(false);
  });

  it('a linear sweep does not pump tempo', () => {
    const r = rig(); down(r, 100, 300);
    for (let k = 0; k < 3; k++) { // fast back-and-forth sweeps (2000 px/s) with +-1 px jitter
      run(r, 0.7, (t) => [100 + 2000 * t, 300 + 300 * t], 120, 1);
      run(r, 0.7, (t) => [1500 - 2000 * t, 510 - 300 * t], 120, 1);
    }
    expect(r.s.state.throttle).toBeLessThan(0.3);
  });

  it('a resting finger holds the throttle over 5 s', () => {
    const r = rig(); down(r, CX + 100, CY);
    run(r, 3, circle(CX, CY, 100, 1.1), 60, 1);
    const held = r.s.state.throttle, fwd = gesture.intent.forward;
    expect(held).toBeGreaterThan(0.6);
    run(r, 5);
    expect(r.s.state.throttle).toBe(held); expect(gesture.intent.forward).toBe(fwd); expect(gesture.live).toBe(true);
  });

  it('lift decays the intent, snaps it to exactly 0 within 2.5 s, and live turns false at once', () => {
    const r = rig(); down(r, CX + 100, CY);
    run(r, 3, circle(CX, CY, 100, 1.1), 60, 1);
    up(r); run(r, DT);
    expect(gesture.live).toBe(false); expect(gesture.intent.forward).toBeGreaterThan(0.5);
    run(r, 1); expect(gesture.intent.forward).toBeGreaterThan(0);
    run(r, 1.45); expect(gesture.intent.forward).toBe(0); expect(gesture.surge).toBe(false);
  });
});

describe('conduct flick and circle', () => {
  function flick(r: Rig, speed: number, dir: StrokeClass['dir'] = 'right') {
    down(r, CX, CY); run(r, DT); up(r, cls({ kind: 'flick', dir, speed }));
  }
  function peak(r: Rig, sec: number) {
    let p = 0, jerk = 0, prev = 0;
    run(r, sec, undefined, 60, 0, () => {
      const m = Math.hypot(gesture.offset.x, gesture.offset.y, gesture.offset.z);
      p = Math.max(p, m); jerk = Math.max(jerk, Math.abs(m - prev) / DT); prev = m;
    });
    return { p, jerk };
  }

  it('the flick dash magnitude is linear in release speed, within the jerk cap, along right plus forward', () => {
    const peaks = [0.9, 1.95, 3].map((sp) => { const r = rig(); flick(r, sp); return peak(r, 0.6); });
    expect(peaks[0].p).toBeCloseTo(6, 1); expect(peaks[1].p).toBeCloseTo(10, 1); expect(peaks[2].p).toBeCloseTo(14, 1);
    expect(peaks[2].jerk).toBeLessThanOrEqual(OFFSET_JERK);
    const r = rig(); flick(r, 2); run(r, 0.2);
    expect(gesture.offset.x).toBeGreaterThan(0); expect(gesture.offset.x).toBeCloseTo(-gesture.offset.z, 6);
  });

  it('the dash cooldown holds', () => {
    const r = rig(); flick(r, 2); run(r, 0.3);
    flick(r, 3); run(r, 0.2); // 0.3 s after the first dash: refused. The first dash ends at 0.45 s.
    expect(peak(r, 0.4).p).toBe(0);
    flick(r, 3); expect(peak(r, 0.5).p).toBeCloseTo(14, 1); // 0.9 s after the first: accepted
  });

  it('a slow large circle gives tempo, not a roll', () => {
    const r = rig(); down(r, CX + 120, CY);
    run(r, 3, circle(CX, CY, 120, 0.8), 60, 1, () => expect(gesture.spin).toBe(0));
    expect(r.cues.some(([k]) => k === 'roll')).toBe(false); expect(r.s.state.throttle).toBeGreaterThan(0.6);
  });

  for (const cw of [true, false]) it(`a fast ${cw ? 'clockwise' : 'counter-clockwise'} circle rolls ${cw ? 'right' : 'left'}`, () => {
    const r = rig(); down(r, CX + 40, CY);
    let spin = 0, side = 0;
    run(r, 0.6, circle(CX, CY, 40, 2.5, cw), 120, 1, () => {
      if (Math.abs(gesture.spin) > Math.abs(spin)) spin = gesture.spin;
      if (Math.abs(gesture.offset.x) > Math.abs(side)) side = gesture.offset.x;
    });
    up(r); run(r, 0.8, undefined, 60, 0, () => { if (Math.abs(gesture.spin) > Math.abs(spin)) spin = gesture.spin; });
    const roll = r.cues.find(([k]) => k === 'roll');
    expect(roll?.[1]).toBe(cw ? 1 : -1);
    expect(r.cues.some(([k]) => k === 'sparkle')).toBe(true);
    expect(Math.sign(spin)).toBe(cw ? 1 : -1); expect(Math.abs(spin)).toBeGreaterThan(5);
    expect(Math.sign(side)).toBe(cw ? 1 : -1);
    expect(gesture.spin).toBe(0);
  });

  it('a blocked roll gives spin only', () => {
    const r = rig({ clear: false }); down(r, CX + 40, CY);
    let spin = 0;
    run(r, 1.2, circle(CX, CY, 40, 2.5), 120, 1, () => {
      spin = Math.max(spin, gesture.spin);
      expect(Math.hypot(gesture.offset.x, gesture.offset.y, gesture.offset.z)).toBe(0);
    });
    expect(spin).toBeGreaterThan(5);
  });
});

describe('conduct desktop, lift and fallbacks', () => {
  it('an empty click toggles cruise and fires nothing; a drone click fires and does not toggle', () => {
    const shots: number[] = [];
    const s = createConductScheme({ frame: () => frame, fire: (d) => { shots.push(d); } });
    s.hover(CX, CY, 0);
    expect(s.handle(out('clickToggle'))).toBe(true);
    expect(s.state.cruising).toBe(true); expect(shots).toEqual([]);
    expect(s.handle(out('burst', 2))).toBe(true); expect(s.handle(out('clickToggle', 3))).toBe(true);
    expect(s.state.cruising).toBe(true); expect(shots).toEqual([2, 3]);
    expect(s.handle(out('look'))).toBe(false);
    s.handle(out('clickToggle')); expect(s.state.cruising).toBe(false);
  });

  it('hover steers while cruising; a press-drag (mouse stroke) does not conduct', () => {
    const r = rig(); r.s.hover(CX, CY, 0); r.s.toggleCruise();
    run(r, 0.3); expect(gesture.live).toBe(true); expect(gesture.intent.forward).toBeGreaterThan(0); expect(gesture.yawRate).toBe(0);
    for (let i = 1; i <= 30; i++) r.s.hover(CX + i * 10, CY, ms(r) + i * 16);
    run(r, 1); expect(gesture.yawRate).toBeLessThan(0);
    r.s.toggleCruise(); run(r, DT); expect(gesture.live).toBe(false); expect(gesture.yawRate).toBe(0);
    down(r, CX, CY, 'mouse'); run(r, 0.5, (t) => [CX + 300 * t, CY]); expect(gesture.live).toBe(false);
  });

  it('a grounded contact requests lift after the tap grace; a tap does not', () => {
    const r = rig({ ground: FOOT }); down(r, CX, CY); run(r, 0.05); up(r); run(r, 0.5);
    expect(gesture.request).toBeNull();
    down(r, CX, CY); run(r, 0.1); expect(gesture.request).toBeNull();
    run(r, 0.05); expect(gesture.request).toBe(LIFT_REQUEST);
  });

  it('keyboard override and a bus epoch bump drop the stroke', () => {
    const r = rig(); down(r, W - 100, CY); run(r, 0.5); expect(gesture.live).toBe(true);
    gesture.override = true; run(r, DT); gesture.override = false;
    expect(gesture.live).toBe(false); expect(gesture.intent.forward).toBe(0);
    down(r, W - 100, CY); run(r, 0.5); clearGesture(); run(r, DT); expect(gesture.live).toBe(false);
  });

  it('fallbacks: Faster cruises, Slower stops, Dash and Roll fire, Brake hovers', () => {
    const r = rig();
    r.s.fallback('faster'); r.s.fallback('faster'); run(r, 0.5);
    expect(gesture.live).toBe(true); expect(r.s.state.throttle).toBeCloseTo(0.5, 6); expect(gesture.yawRate).toBe(0);
    r.s.fallback('dash'); run(r, 0.2); expect(gesture.offset.z).toBeLessThan(-5);
    r.s.fallback('roll-left'); run(r, 0.3); expect(gesture.spin).toBeLessThan(0);
    r.s.fallback('slower'); r.s.fallback('slower'); run(r, DT); expect(r.s.state.cruising).toBe(false);
    r.s.fallback('faster'); run(r, 0.2); r.s.fallback('brake'); run(r, DT);
    expect(gesture.live).toBe(false); expect(gesture.intent.forward).toBe(0);
    expect(Math.hypot(gesture.offset.x, gesture.offset.y, gesture.offset.z)).toBe(0);
  });
});
