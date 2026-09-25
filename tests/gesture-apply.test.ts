import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { advanceVelocity, type Intent, type Vec } from '../src/game/motion';
import { createShooter, pressFire, type FireSource } from '../src/game/combat';
import { clearGesture, gesture } from '../src/game/gesture/bus';
import { gestureBase, gestureBefore, gestureIntent, gestureOffset, gestureVelocity, labMode, NO_LANDING, resetGestureApply,
  type GestureHost, type GestureIntentOut } from '../src/game/gesture/applyGesture';
import type { GestureCtx } from '../src/game/gesture/types';
import { OFFSET_JERK, SNAP_INTENT } from '../src/game/gesture/tuning';

const dt = 1 / 60, cruise: Intent = { forward: 1, strafe: 0, vertical: 0 };
const len = (v: Vec) => Math.hypot(v.x, v.y, v.z);
/** A 0.45 s sin^2 bump along x with peak A: integral A * T / 2, largest derivative A * PI / T. */
const T = .45, A = 10, bump = (t: number) => (t > 0 && t < T ? A * Math.sin(Math.PI * t / T) ** 2 : 0);

/** Player's velocity path in order: gestureBase -> mode branch -> gestureOffset -> anticipate -> stored velocity. */
function fly(steps: number, offsetAt: (t: number) => number, anticipate: (v: Vec) => Vec, start: Vec, onStep?: (v: Vec, base: Vec) => void) {
  const vel = { ...start }, pos = { x: 0, y: 0, z: 0 }, base = { x: 0, y: 0, z: 0 };
  resetGestureApply();
  for (let i = 0; i < steps; i++) {
    gesture.offset.x = offsetAt(i * dt);
    gestureBase(vel, base);
    let v = advanceVelocity(base, cruise, 0, 0, true, false, dt);
    gestureOffset(v);
    v = anticipate(v);
    vel.x = v.x; vel.y = v.y; vel.z = v.z;
    pos.x += v.x * dt; pos.y += v.y * dt; pos.z += v.z * dt;
    onStep?.(vel, base);
  }
  return { pos, vel };
}
function ctxOf(canLand: boolean) {
  const calls = { land: 0, say: [] as string[] };
  const ctx: GestureCtx = { clock: 0, canLand: () => canLand, pathClear: () => true, groundBelow: () => Infinity,
    land: () => { calls.land++; }, say: text => { calls.say.push(text); } };
  return { ctx, calls };
}

describe('applyGesture', () => {
  beforeEach(() => { gesture.scheme = 'conduct'; gesture.exemptHip = true; clearGesture(); resetGestureApply(); });
  afterEach(() => { gesture.scheme = 'off'; gesture.step = null; clearGesture(); resetGestureApply(); });

  it('a 0.45 s flick envelope integrates to its displacement and velocity returns to baseline', () => {
    expect(A * Math.PI / T).toBeLessThanOrEqual(OFFSET_JERK);
    const settled = { x: 0, y: 0, z: -13 }, same = (v: Vec) => v, steps = 90;
    const plain = fly(steps, () => 0, same, settled), dashed = fly(steps, bump, same, settled);
    const expected = A * T / 2, got = dashed.pos.x - plain.pos.x;
    expect(Math.abs(got - expected)).toBeLessThan(expected * .1);
    expect(Math.hypot(dashed.vel.x - plain.vel.x, dashed.vel.y - plain.vel.y, dashed.vel.z - plain.vel.z)).toBeLessThan(.1);
  });
  it('a mocked anticipate that halves v every step never lets velocity grow or run away negative', () => {
    let last = Infinity, minBase = Infinity;
    const halve = (v: Vec) => ({ x: v.x / 2, y: v.y / 2, z: v.z / 2 });
    fly(240, () => A, halve, { x: 0, y: 0, z: -13 }, (v, base) => {
      expect(len(v)).toBeLessThanOrEqual(last + 1e-9); last = len(v); minBase = Math.min(minBase, base.x);
    });
    expect(minBase).toBeGreaterThanOrEqual(-1e-9);
  });
  it('labMode keeps mode 2 and exempts only mode 1 while a scheme is on and exemptHip is set', () => {
    expect([labMode(0), labMode(1), labMode(2)]).toEqual([0, 0, 2]);
    gesture.exemptHip = false; expect(labMode(1)).toBe(1);
    gesture.exemptHip = true; gesture.scheme = 'off'; expect(labMode(1)).toBe(1);
  });
  it('a land request is ignored when canLand is false and sets the message; lift and a valid land pass through', () => {
    const host: GestureHost = { yaw: 0, pitch: 0, lift: false };
    const refused = ctxOf(false);
    gesture.landArmed = true; gesture.request = { kind: 'land', x: 1, y: 2, z: 3 };
    gestureBefore(dt, { x: 0, y: 0, z: 0 }, refused.ctx, host);
    expect(refused.calls.land).toBe(0); expect(refused.calls.say).toEqual([NO_LANDING]);
    expect(gesture.request).toBeNull(); expect(gesture.landArmed).toBe(false); expect(refused.ctx.clock).toBeCloseTo(dt);
    const ok = ctxOf(true);
    gesture.request = { kind: 'land', x: 1, y: 2, z: 3 }; gestureBefore(dt, { x: 0, y: 0, z: 0 }, ok.ctx, host);
    expect(ok.calls.land).toBe(1); expect(ok.calls.say).toEqual([]);
    gesture.request = { kind: 'lift' }; gestureBefore(dt, { x: 0, y: 0, z: 0 }, ok.ctx, host);
    expect(host.lift).toBe(true);
  });
  it('runs the scheme step first and applies clamped rates inside the gesture pitch band', () => {
    const host: GestureHost = { yaw: 0, pitch: .88, lift: false }, { ctx } = ctxOf(true);
    let seen = -1;
    gesture.step = (_dt, _p, c) => { seen = (c as GestureCtx).clock; gesture.yawRate = 9; gesture.pitchRate = 9; };
    gestureBefore(dt, { x: 0, y: 0, z: 0 }, ctx, host);
    expect(seen).toBeCloseTo(dt); expect(host.yaw).toBeCloseTo(2.5 * dt); expect(host.pitch).toBeCloseTo(.9);
    host.pitch = 1.1; gestureBefore(dt, { x: 0, y: 0, z: 0 }, ctx, host);
    expect(host.pitch).toBeCloseTo(1.1);
  });
  it('gestureIntent is zero in a non-live decay tail while landGoal is set, and below 0.02', () => {
    const out: GestureIntentOut = { forward: 9, strafe: 9, vertical: 9, precise: true }, goal = { x: 0, y: 0, z: 0 };
    gesture.intent.forward = .4; gesture.intent.strafe = -.3; gesture.live = false;
    expect(gestureIntent(goal, out)).toEqual({ forward: 0, strafe: 0, vertical: 0, precise: false });
    expect(gestureIntent(null, out)).toEqual({ forward: .4, strafe: -.3, vertical: 0, precise: false });
    gesture.live = true;
    expect(gestureIntent(goal, out)).toEqual({ forward: .4, strafe: -.3, vertical: 0, precise: true });
    gesture.intent.forward = SNAP_INTENT * .9; gesture.intent.strafe = -SNAP_INTENT * .5; gesture.intent.vertical = .01;
    expect(gestureIntent(null, out)).toEqual({ forward: 0, strafe: 0, vertical: 0, precise: true });
  });
  it('gestureVelocity replaces the branch only while velocityOn and no landGoal', () => {
    const v = { x: 1, y: 1, z: 1 };
    gesture.velocity.x = 5; gesture.velocityOn = true;
    expect(gestureVelocity(v, { x: 0, y: 0, z: 0 })).toBe(false); expect(v.x).toBe(1);
    expect(gestureVelocity(v, null)).toBe(true); expect(v).toEqual({ x: 5, y: 0, z: 0 });
  });
  it("FireSource includes 'gesture'", () => {
    const s = createShooter(), source: FireSource = 'gesture';
    pressFire(s, source); expect(s.input.fireSource).toBe('gesture');
  });
});
