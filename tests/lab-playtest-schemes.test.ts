import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { advanceVelocity, type Vec } from '../src/game/motion';
import { createShooter } from '../src/game/combat';
import { flowSpeed } from '../src/game/flowFlight';
import { advanceFlightPose, FACING, type Pose, type PoseInput } from '../src/game/presentation';
import { clearGesture, gesture } from '../src/game/gesture/bus';
import { aimed, queueAimedBurst, resetAimed } from '../src/game/gesture/aimedShot';
import { labFacing } from '../src/game/gesture/aimFacing';
import { createBrushScheme, type BrushHost } from '../src/game/gesture/brushScheme';
import { PITCH_REACH, PITCH_REST, YAW_MAX } from '../src/game/gesture/conduct';
import { createConductScheme, DESK_FLOOR, LEAVE_GRACE_S, SWIPE_DASH } from '../src/game/gesture/conductScheme';
import { createStrokeBuffer } from '../src/game/gesture/strokeBuffer';
import { classify } from '../src/game/gesture/strokeFeatures';
import { releaseSpeed } from '../src/game/gesture/releaseSpeed';
import type { AimFrame, GestureCtx, StrokeClass, StrokeView } from '../src/game/gesture/types';
import { DASH_MIN, FACING_AIM, FLICK_SPEED, INK_WORLD_MS, SURGE_SPEED } from '../src/game/gesture/tuning';
import { arbiterDispatch, createArbiter } from '../src/ui/gesture/pointerArbiter';
import { createRunner, ghostAnchor, guideLink, setGuideLive } from '../src/ui/gesture/guideSteps';
import { CONDUCT_TAIL_MS, inkTailMs } from '../src/ui/gesture/inkStyle';
// Playtest fixes for Conduct, Brush, the guides and the aimed-burst body (2026-09-24 emulation findings).

const DT = 1 / 60;
const frameOf = (w: number, h: number, pitch = 0): AimFrame => ({ origin: { x: 0, y: 2, z: 6 }, dir: { x: 0, y: Math.sin(pitch), z: -Math.cos(pitch) },
  right: { x: 1, y: 0, z: 0 }, up: { x: 0, y: Math.cos(pitch), z: Math.sin(pitch) }, fov: 60, aspect: w / h, left: 0, top: 0, width: w, height: h, t: 1 });
const ctxOf = (over: Partial<GestureCtx> = {}): GestureCtx =>
  ({ canLand: () => true, pathClear: () => true, groundBelow: () => 40, clock: 0, land: () => {}, say: () => {}, ...over });
const cls = (over: Partial<StrokeClass>): StrokeClass => ({ kind: 'none', dir: null, angle: 0, magnitude: 0, winding: 0, speed: 0, chordX: 0, chordY: 0, ...over });
const hero: Vec = { x: 0, y: 0, z: 0 };

beforeEach(() => { clearGesture(); gesture.override = false; });
afterEach(() => { clearGesture(); gesture.scheme = 'off'; resetAimed(); guideLink.runner = null; setGuideLive(false); });

describe('Conduct: pitch is self-centring (phone landscape, 852 x 393)', () => {
  const W = 852, H = 393, f = frameOf(W, H);
  function conduct(view = { pitch: PITCH_REST }) {
    gesture.scheme = 'conduct';
    const guide = vi.fn(), s = createConductScheme({ frame: () => f, view, guide });
    const buf = createStrokeBuffer(), ctx = ctxOf();
    let t = 0;
    const run = (sec: number, at?: [number, number]) => {
      for (let i = 0, n = Math.round(sec / DT); i < n; i++) {
        t += DT * 1000;
        if (at) { buf.push(at[0], at[1], t); s.move(buf); }
        s.step(DT, hero, ctx); view.pitch += gesture.pitchRate * DT;
      }
    };
    const down = (x: number, y: number) => { buf.begin(1, 'touch', x, y, t); s.down(buf); };
    return { s, view, run, down, buf, guide, ctx, t: () => t };
  }
  it('a finger resting just above centre (25 px, ~4 deg) holds level instead of winding pitch up to the clamp', () => {
    const c = conduct(); c.down(W / 2 + 120, H / 2 - 25);
    let top = -Infinity;
    for (let k = 0; k < 50; k++) { c.run(0.1, [W / 2 + 120, H / 2 - 25]); top = Math.max(top, c.view.pitch); }
    expect(Math.abs(c.view.pitch - PITCH_REST)).toBeLessThan(0.02);
    expect(top).toBeLessThan(PITCH_REST + 0.05);
  });
  it('a finger near the top holds a climb at most PITCH_REACH above rest, and lifting it levels the glide back to rest', () => {
    const c = conduct(); c.down(W / 2, 30);
    c.run(4, [W / 2, 30]);
    expect(c.view.pitch).toBeGreaterThan(PITCH_REST + 0.3); expect(c.view.pitch).toBeLessThanOrEqual(PITCH_REST + PITCH_REACH + 1e-6);
    c.s.up(c.buf, cls({ kind: 'hold' })); c.run(2);
    expect(Math.abs(c.view.pitch - PITCH_REST)).toBeLessThan(0.05);
  });
});

describe('Conduct on the Mac (1440 x 900)', () => {
  const W = 1440, H = 900, f = frameOf(W, H, -0.12);
  function mac() {
    gesture.scheme = 'conduct';
    const view = { pitch: -0.12 }, s = createConductScheme({ frame: () => f, view }), ctx = ctxOf();
    let t = 0;
    const run = (sec: number, hover?: [number, number]) => {
      for (let i = 0, n = Math.round(sec / DT); i < n; i++) { t += DT * 1000; if (hover) s.hover(hover[0], hover[1], t); s.step(DT, hero, ctx); view.pitch += gesture.pitchRate * DT; }
    };
    return { s, run, view, t: () => t };
  }
  it('pointing at the right third turns steadily (at most YAW_MAX) at about the Standard cruise speed', () => {
    const m = mac(); m.s.hover(W / 2, H / 2, 0); m.s.toggleCruise();
    m.run(1.5, [1070, H / 2]);
    const a = gesture.yawRate; m.run(0.5, [1070, H / 2]);
    expect(a).toBeLessThan(0); expect(-a).toBeLessThanOrEqual(YAW_MAX); expect(gesture.yawRate).toBeCloseTo(a, 6);
    expect(m.s.state.throttle).toBeGreaterThanOrEqual(DESK_FLOOR - 1e-9);
    expect(gesture.intent.forward * SURGE_SPEED).toBeGreaterThan(8);
    expect(flowSpeed(DESK_FLOOR)).toBeGreaterThan(8); expect(flowSpeed(DESK_FLOOR)).toBeLessThan(13);
    expect(13 / YAW_MAX).toBeGreaterThan(3); // even the edge rate is a tight curve at cruise speed, not a spin in place
  });
  it('a pointer that leaves the window stops after the 1 s grace, holds the throttle, and never dashes or stirs', () => {
    const m = mac(); m.s.hover(W / 2, H / 2, 0); m.s.toggleCruise(); m.run(0.5, [W / 2, H / 2]);
    const u = m.s.state.throttle;
    for (let i = 1; i <= 8; i++) m.s.hover(W / 2 + i * 90, H / 2 - i * 56, m.t() + i * 8); // a fast sweep out through the corner
    m.s.hover(W - 3, 3, m.t() + 72); m.s.leave();
    let off = 0;
    const each = (sec: number) => { for (let i = 0, n = Math.round(sec / DT); i < n; i++) {
      m.run(DT); off = Math.max(off, Math.hypot(gesture.offset.x, gesture.offset.y, gesture.offset.z));
      expect(m.s.state.throttle).toBeCloseTo(u, 6);
    } };
    each(LEAVE_GRACE_S - 2 * DT); expect(gesture.yawRate).toBeLessThan(-3); // the last hover point (the corner) still steers
    each(3 * DT); expect(gesture.yawRate).toBe(0);
    each(2); expect(gesture.yawRate).toBe(0); expect(off).toBe(0);
    expect(Math.abs(m.view.pitch + 0.12)).toBeLessThan(0.05); // with no steer point the glide levels back to rest
  });
  it('a click below the horizon starts the cruise even over a drone (stopped only); the arbiter asks before it arms the burst', () => {
    const m = mac();
    expect(m.s.clickStarts(W / 2, H * 0.75)).toBe(true); expect(m.s.clickStarts(W / 2, H * 0.2)).toBe(false);
    m.s.toggleCruise(); expect(m.s.clickStarts(W / 2, H * 0.75)).toBe(false);
    const a = createArbiter({ scheme: 'conduct', pick: () => 3, blaster: () => true, toggle: () => true,
      zone: { x: 0, y: 0, width: 0, height: 0, left: 0, right: 0, top: 0, bottom: 0 } });
    const e = { type: 'down' as const, id: 1, x: 700, y: 700, t: 0, kind: 'mouse' as const, buttons: 1, epoch: 0 };
    expect(a.out.slice(0, arbiterDispatch(a, e)).map(o => o.type)).toEqual([]);
    expect(a.out.slice(0, arbiterDispatch(a, { ...e, type: 'up', t: 80 })).map(o => [o.type, o.drone])).toEqual([['clickToggle', -1]]);
  });
});

describe('Conduct: flicks read and dash', () => {
  /** A 4-sample flick right at 120 Hz, plus the stationary pointer-up sample the up event adds. */
  function flickStroke(tail: boolean, ease = false) {
    const s = createStrokeBuffer(); s.begin(1, 'touch', 300, 300, 0);
    const n = ease ? 11 : 4;
    for (let i = 1; i <= n; i++) { const u = i / n, k = ease ? 1 - (1 - u) ** 2 : u; s.push(300 + (ease ? 200 : 80) * k, 300, i * (ease ? 90 / n : 8.33)); }
    if (tail) s.push(s.lastX, s.lastY, s.lastT + 8);
    return s as StrokeView;
  }
  it('the stationary pointer-up sample no longer halves the release speed, and an ease-out flick still reads as a flick', () => {
    const plain = releaseSpeed(flickStroke(false)), tailed = releaseSpeed(flickStroke(true));
    expect(tailed).toBeCloseTo(plain, 6); expect(plain).toBeGreaterThan(2);
    const c = classify(flickStroke(true, true), 'conduct');
    expect(c.kind).toBe('flick'); expect(c.speed).toBeGreaterThan(FLICK_SPEED);
  });
  it('dashes along a diagonal flick\'s real angle, and a quick straight (swipe) release dashes at SWIPE_DASH', () => {
    gesture.scheme = 'conduct';
    const f = frameOf(852, 393), s = createConductScheme({ frame: () => f }), buf = createStrokeBuffer(), ctx = ctxOf();
    buf.begin(1, 'touch', 400, 200, 0); s.down(buf); s.step(DT, hero, ctx);
    const a = -18 * Math.PI / 180; // up-right, 18 deg off the axis: dir null before, dropped
    s.up(buf, cls({ kind: 'flick', dir: null, angle: a, speed: 2 })); for (let i = 0; i < 12; i++) s.step(DT, hero, ctx);
    expect(gesture.offset.x).toBeGreaterThan(0); expect(gesture.offset.y).toBeGreaterThan(0);
    let peak = 0;
    const t = createConductScheme({ frame: () => f }); buf.begin(2, 'touch', 400, 200, 0); t.down(buf); t.step(DT, hero, ctx);
    t.up(buf, cls({ kind: 'swipe', angle: 0, speed: FLICK_SPEED }));
    for (let i = 0; i < 40; i++) { t.step(DT, hero, ctx); peak = Math.max(peak, Math.hypot(gesture.offset.x, gesture.offset.y, gesture.offset.z)); }
    expect(peak).toBeCloseTo(DASH_MIN * SWIPE_DASH, 1);
  });
  it('reports each onboarding step once: steer, stir, lift to glide, flick, circle', () => {
    gesture.scheme = 'conduct';
    const f = frameOf(852, 393), guide = vi.fn(), s = createConductScheme({ frame: () => f, guide }), buf = createStrokeBuffer(), ctx = ctxOf();
    buf.begin(1, 'touch', 700, 196, 0); s.down(buf);
    let t = 0;
    for (let i = 0; i < 60; i++) { t += 16; buf.push(700, 196, t); s.move(buf); s.step(DT, hero, ctx); }
    for (let i = 0; i < 180; i++) { t += 8; const a = i / 120 * 2 * Math.PI * 1.1; buf.push(600 + 80 * Math.cos(a), 196 + 80 * Math.sin(a), t); s.move(buf); if (i % 2) s.step(DT, hero, ctx); }
    for (let i = 0; i < 70; i++) { t += 8; const a = i / 24 * 2 * Math.PI; buf.push(600 + 30 * Math.cos(a), 196 + 30 * Math.sin(a), t); s.move(buf); if (i % 2) s.step(DT, hero, ctx); }
    s.up(buf, cls({ kind: 'flick', angle: 0, speed: 2 }));
    for (let i = 0; i < 10; i++) s.step(DT, hero, ctx);
    const seen = guide.mock.calls.map(c => c[0]);
    for (const ev of ['rest-steer', 'stir', 'circle', 'lift-glide', 'flick']) expect(seen.filter(e => e === ev), ev).toHaveLength(1);
  });
});

describe('Brush: cruise height, dives, clearance and guides', () => {
  function brush(over: Partial<BrushHost> = {}) {
    gesture.scheme = 'brush';
    const st = { flying: true, yaw: 0, pitch: -0.12, clearance: false, ground: 40, normal: { x: 0, y: 1, z: 0 } };
    const guide = vi.fn();
    const host: BrushHost = { flying: () => st.flying, yaw: () => st.yaw, pitch: () => st.pitch, clearance: () => st.clearance,
      clearanceNormal: () => st.normal, landTarget: () => null, lassoBegin() {}, lassoAdd: () => 0, lassoEnd: () => 0, lockBurst() {},
      lockNearest: () => false, guide, ...over };
    const b = createBrushScheme(host), pos = { x: 0, y: 30, z: 0 }, ctx = ctxOf({ groundBelow: () => st.ground });
    const step = (n = 1) => { for (let i = 0; i < n; i++) b.step(DT, pos, ctx); };
    step(); return { b, st, step, pos, guide };
  }
  it('the cruise holds altitude against the view pitch (it used to sink about 1.6 m/s at -0.12)', () => {
    const r = brush(); r.b.fallback('turn-left'); r.step(120);
    let v: Vec = { x: 0, y: 0, z: -13 };
    for (let i = 0; i < 180; i++) {
      r.step();
      v = advanceVelocity(v, gesture.intent, 0, r.st.pitch, true, gesture.surge, DT);
    }
    expect(r.b.cruising).toBe(true); expect(Math.abs(v.y)).toBeLessThan(0.05);
  });
  it('a dive pulls out early enough to level off 8 m up, braking distance included', () => {
    const r = brush(); r.b.fallback('dive'); r.step(2);
    r.st.ground = 12; r.step();
    expect(r.b.view.program).toBe('dive'); // 12 m, not falling yet: 12 - 3 > 5
    for (let i = 0; i < 3; i++) { r.pos.y -= 20 * DT; r.step(); } // falling at 20 m/s: braking takes 4.8 m
    expect(r.b.view.program).toBe('pullout');
  });
  it('under clearance only a program that pushes into the obstacle is cancelled: soar off a floor runs, a dive into it stops', () => {
    let r = brush(); r.b.fallback('soar'); r.st.clearance = true; r.step(3);
    expect(r.b.view.program).toBe('soar');
    r = brush(); r.b.fallback('dive'); r.st.clearance = true; r.step();
    expect(r.b.view.program).toBe('none'); expect(r.b.view.lastCancel).toBe('clearance');
    r = brush(); r.st.normal = { x: -1, y: 0, z: 0 }; r.b.fallback('turn-left'); r.st.clearance = true; r.step(3); // wall on the right
    expect(r.b.view.program).toBe('turn');
    r = brush(); r.st.normal = { x: -1, y: 0, z: 0 }; r.b.fallback('turn-right'); r.st.clearance = true; r.step();
    expect(r.b.view.program).toBe('none');
  });
  it('reports soar, turn and dive to the guide', () => {
    const r = brush();
    for (const a of ['soar', 'turn-left', 'dive'] as const) r.b.fallback(a);
    expect(r.guide.mock.calls.map(c => c[0])).toEqual(['up', 'turn', 'down']);
  });
});

describe('Guides and ink', () => {
  it('a live stroke hides the ghost (setGuideLive wakes the runner both ways)', () => {
    const r = createRunner('draw', 0, 0), wake = vi.fn(); r.wake = wake; guideLink.runner = r;
    setGuideLive(true); expect(guideLink.live).toBe(true); setGuideLive(true);
    setGuideLive(false); expect(wake).toHaveBeenCalledTimes(2);
  });
  it('portrait: the ghost and its label move clear of the Lift/Land button; landscape is unchanged', () => {
    const lift = { left: 305, top: 725, right: 366, bottom: 786 };
    const b = ghostAnchor(true, 393, 852, 0, { x: 0, y: 0, size: 0 }, lift), h = b.size / 2;
    expect(b.x + h <= lift.left || b.x - h >= lift.right || b.y + h + 74 <= lift.top).toBe(true);
    const land = ghostAnchor(true, 852, 393, 0, { x: 0, y: 0, size: 0 }), withBtn = ghostAnchor(true, 852, 393, 0, { x: 0, y: 0, size: 0 }, { left: 770, top: 315, right: 824, bottom: 369 });
    expect(withBtn).toEqual(land);
  });
  it('Conduct keeps a short comet tail; Draw hands over to the ribbon; Brush keeps the whole stroke', () => {
    expect(inkTailMs('draw')).toBe(INK_WORLD_MS); expect(inkTailMs('conduct')).toBe(CONDUCT_TAIL_MS); expect(inkTailMs('brush')).toBe(Infinity);
    expect(CONDUCT_TAIL_MS).toBeLessThanOrEqual(400); expect(inkTailMs('conduct', 90)).toBe(90);
  });
});

describe('Aimed-burst body', () => {
  it('Brush and Draw write facing every step, yet the pose gets FACING_AIM while an aimed burst runs', () => {
    gesture.scheme = 'brush';
    const s = createShooter();
    const host: BrushHost = { flying: () => true, yaw: () => 0, clearance: () => false, landTarget: () => null, lassoBegin() {},
      lassoAdd: () => 0, lassoEnd: () => 0, lockBurst() {}, lockNearest: () => false };
    const b = createBrushScheme(host);
    queueAimedBurst(s, { x: 0.5, y: 0, z: -0.8 }, -1);
    b.step(DT, { x: 0, y: 30, z: 0 }, ctxOf());
    expect(gesture.facing).toBe(0); expect(aimed.active).toBe(true);
    expect(labFacing()).toBe(2);
    const pose: Pose = { viewYaw: 0, viewPitch: 0, yaw: 0, pitch: 0, lean: 0, bank: 0, speed: 0, flight: 1, power: 0, brake: 0, aim: 0,
      bound: { yaw: FACING.yaw, up: FACING.pitchUp, down: FACING.pitchDown } };
    advanceFlightPose(pose, { yaw: 0, pitch: 0, speed: 0, velocity: { x: 0, y: 0, z: 0 }, flying: true, reduced: false, aim: 1, facing: labFacing() }, DT);
    expect(pose.bound?.yaw).toBe(FACING_AIM.yaw);
    resetAimed(); gesture.facing = 0; expect(labFacing()).toBe(0);
  });
  it('cruising level while looking down at a drone, the chest pitches onto it (absolute aim pitch), not above it', () => {
    const pose: Pose = { viewYaw: 0, viewPitch: -0.3, yaw: 0, pitch: 0, lean: 0, bank: 0, speed: 13, flight: 1, power: 0, brake: 0, aim: 1,
      bound: { yaw: FACING_AIM.yaw, up: FACING_AIM.pitchUp, down: FACING_AIM.pitchDown } };
    const input: PoseInput = { yaw: 0, pitch: -0.3, speed: 13, velocity: { x: 0, y: 0, z: -13 }, flying: true, reduced: false, aim: 1, facing: 2,
      aimYaw: 0, aimPitch: 0 };
    for (let i = 0; i < 180; i++) advanceFlightPose(pose, input, DT);
    expect(pose.pitch).toBeCloseTo(-0.3, 2);
    const standard: PoseInput = { ...input, facing: 0 };
    const p2 = { ...pose, pitch: 0, bound: { yaw: FACING.yaw, up: FACING.pitchUp, down: FACING.pitchDown } };
    for (let i = 0; i < 180; i++) advanceFlightPose(p2, standard, DT);
    expect(p2.pitch).toBeCloseTo(0, 2); // standard aiming is unchanged: the body keeps the (level) travel pitch
  });
});
