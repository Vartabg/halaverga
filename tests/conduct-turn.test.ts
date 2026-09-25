import { beforeEach, describe, expect, it } from 'vitest';
import type { Vec } from '../src/game/motion';
import { clearGesture, gesture } from '../src/game/gesture/bus';
import { YAW_MAX, yawFromScreen } from '../src/game/gesture/conduct';
import { createConductScheme, LEAVE_GRACE_S } from '../src/game/gesture/conductScheme';
import { createStrokeBuffer } from '../src/game/gesture/strokeBuffer';
import type { AimFrame, GestureCtx } from '../src/game/gesture/types';
// Conduct turning (spec 1.6): the screen-fraction yaw curve, a 360 from a resting finger or a desktop hover, and the desktop
// leave grace. Node math on the real scheme at 60 Hz; the lab yaw cap (applyGesture) is not applied here. Not iPhone or trackpad
// validation.

const DT = 1 / 60, TAU = 2 * Math.PI;
const frameOf = (w: number, h: number): AimFrame => ({ origin: { x: 0, y: 2, z: 6 }, dir: { x: 0, y: 0, z: -1 }, right: { x: 1, y: 0, z: 0 },
  up: { x: 0, y: 1, z: 0 }, fov: 60, aspect: w / h, left: 0, top: 0, width: w, height: h, t: 1 });
const ctx: GestureCtx = { canLand: () => true, pathClear: () => true, groundBelow: () => 40, clock: 0, land: () => {}, say: () => {} };
const hero: Vec = { x: 0, y: 0, z: 0 };
const PORTRAIT = frameOf(393, 852), LANDSCAPE = frameOf(852, 393), MAC = frameOf(1440, 900);

beforeEach(() => { clearGesture(); gesture.scheme = 'conduct'; gesture.override = false; });

describe('yawFromScreen', () => {
  it('follows the expo curve by fraction of the width', () => {
    const at = (fx: number) => yawFromScreen(MAC, 720 + fx * 1440);
    expect(at(0.05)).toBe(0);
    expect(-at(0.1)).toBeCloseTo(0.09, 1); expect(Math.abs(-at(0.1) - 0.09)).toBeLessThanOrEqual(0.02);
    expect(Math.abs(-at(0.2) - 0.84)).toBeLessThanOrEqual(0.1);
    expect(Math.abs(-at(0.3) - 2.24)).toBeLessThanOrEqual(0.15);
    expect(-at(0.45)).toBeCloseTo(YAW_MAX, 9); expect(-at(0.4)).toBeCloseTo(YAW_MAX, 9);
    expect(at(-0.3)).toBeCloseTo(-at(0.3), 9); // left of centre turns left, symmetric
    expect(yawFromScreen({ ...MAC, width: 0 }, 900)).toBe(0); expect(yawFromScreen(MAC, NaN)).toBe(0);
  });
  it('portrait and landscape give identical rates at the same fraction', () => {
    for (const fx of [0.05, 0.1, 0.2, 0.3, 0.45, -0.25]) {
      expect(yawFromScreen(PORTRAIT, 393 * (0.5 + fx))).toBeCloseTo(yawFromScreen(LANDSCAPE, 852 * (0.5 + fx)), 9);
    }
  });
});

/** Integrates the scheme's yaw rate; returns the seconds to the first full 360 (Infinity if not within `max`). */
function turnTime(stepOnce: () => void, max = 4) {
  let yaw = 0, t = 0;
  while (t < max) { stepOnce(); t += DT; yaw += gesture.yawRate * DT; if (Math.abs(yaw) >= TAU) return t; }
  return Infinity;
}

describe('a 360 by resting', () => {
  for (const [name, f] of [['portrait', PORTRAIT], ['landscape', LANDSCAPE]] as const) {
    it(`a finger resting at 0.45 of the width integrates 360 deg within 1.8 s (${name})`, () => {
      const s = createConductScheme({ frame: () => f }), buf = createStrokeBuffer(), x = f.width * 0.95, y = f.height / 2;
      let ms = 0;
      buf.begin(1, 'touch', x, y, ms); s.down(buf);
      const secs = turnTime(() => { ms += DT * 1000; buf.push(x, y, ms); s.move(buf); s.step(DT, hero, ctx); });
      expect(secs).toBeLessThanOrEqual(1.8);
      expect(gesture.yawRate).toBeCloseTo(-YAW_MAX, 6); // right edge turns right
    });
  }
  it('a desktop hover at 0.95 of the width while cruising integrates 360 deg within 1.8 s', () => {
    const s = createConductScheme({ frame: () => MAC }), x = 1440 * 0.95;
    let ms = 0;
    s.hover(x, 450, ms); s.toggleCruise();
    const secs = turnTime(() => { ms += DT * 1000; s.hover(x, 450, ms); s.step(DT, hero, ctx); });
    expect(secs).toBeLessThanOrEqual(1.8);
    expect(s.state.cruising).toBe(true);
  });
});

describe('desktop leave grace', () => {
  function cruiseAtEdge() {
    const s = createConductScheme({ frame: () => MAC });
    let ms = 0;
    const run = (sec: number, hover?: number) => {
      for (let i = 0, n = Math.round(sec / DT); i < n; i++) { ms += DT * 1000; if (hover !== undefined) s.hover(hover, 450, ms); s.step(DT, hero, ctx); }
    };
    s.hover(1300, 450, ms); s.toggleCruise(); run(0.5, 1300);
    return { s, run, ms: () => ms };
  }
  it('keeps turning for 1.0 s (plus or minus a frame) after the pointer leaves, then stops; the throttle holds', () => {
    const c = cruiseAtEdge(), rate = gesture.yawRate, u = c.s.state.throttle;
    expect(rate).toBeLessThan(-3);
    c.s.leave();
    let turning = 0;
    for (let i = 0; i < 120; i++) { c.run(DT); if (gesture.yawRate !== 0) { turning++; expect(gesture.yawRate).toBeCloseTo(rate, 3); } }
    expect(Math.abs(turning * DT - LEAVE_GRACE_S)).toBeLessThanOrEqual(DT + 1e-9);
    expect(gesture.yawRate).toBe(0); expect(c.s.state.throttle).toBeCloseTo(u, 9); expect(gesture.live).toBe(true);
  });
  it('a hover back inside the grace cancels it and steers from the new point', () => {
    const c = cruiseAtEdge();
    c.s.leave(); c.run(0.5);
    expect(gesture.yawRate).toBeLessThan(-3);
    c.run(1.5, 720 + 0.3 * 1440); // back in, 0.3 of the width right of centre
    expect(Math.abs(-gesture.yawRate - 2.24)).toBeLessThanOrEqual(0.15);
    c.s.leave(); c.run(0.5); expect(gesture.yawRate).toBeLessThan(0); // a fresh grace, not the stale one
    c.run(0.6); expect(gesture.yawRate).toBe(0);
  });
});
