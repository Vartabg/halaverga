import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { advanceVelocity, type Vec } from '../src/game/motion';
import { clearGesture, gesture } from '../src/game/gesture/bus';
import { gestureBase, gestureBefore, gestureIntent, gestureOffset, resetGestureApply } from '../src/game/gesture/applyGesture';
import type { GestureCtx, StrokeClass, StrokeKind, StrokeView } from '../src/game/gesture/types';
import {
  createManeuver, createManeuverOut, diveDuration, nudgeDistance, soarClimb, soarDuration, startTurn, stepManeuver, swipeMag,
  turnAngle, turnDodgeDistance,
} from '../src/game/gesture/maneuvers';
import { createBrushScheme, NO_DRONE, type BrushHost } from '../src/game/gesture/brushScheme';
import { NUDGE_FRAC, DRAW_M_PER_PX, OFFSET_JERK, TURN_PEAK_MAX } from '../src/game/gesture/tuning';

const dt = 1 / 60, DEG = Math.PI / 180;

/** A minimal StrokeView over plain arrays (strokeBuffer's contract), fed one sample at a time. */
class Stroke implements StrokeView {
  readonly pointerId = 1; xs: number[] = []; ys: number[] = []; ts: number[] = [];
  arc = 0; travel = 0; minX = Infinity; minY = Infinity; maxX = -Infinity; maxY = -Infinity; winding = 0; speed150 = 0;
  constructor(readonly kind: 'touch' | 'mouse' = 'touch') {}
  get count() { return this.xs.length; }
  x(i: number) { return this.xs[i]; } y(i: number) { return this.ys[i]; } t(i: number) { return this.ts[i]; }
  get startX() { return this.xs[0]; } get startY() { return this.ys[0]; } get startT() { return this.ts[0]; }
  get lastX() { return this.xs[this.count - 1]; } get lastY() { return this.ys[this.count - 1]; }
  get lastT() { return this.ts[this.count - 1]; }
  get chord() { return Math.hypot(this.lastX - this.startX, this.lastY - this.startY); }
  get straightness() { return this.arc > 0 ? this.chord / this.arc : 1; }
  get speed60() { return this.count > 1 ? this.chord / Math.max(1, this.lastT - this.startT) : 0; }
  private wx = NaN; private wy = NaN; private heading = NaN;
  push(x: number, y: number, t: number) {
    if (this.count) this.arc += Math.hypot(x - this.lastX, y - this.lastY);
    else { this.wx = x; this.wy = y; }
    this.xs.push(x); this.ys.push(y); this.ts.push(t);
    this.travel = Math.max(this.travel, Math.hypot(x - this.startX, y - this.startY));
    this.minX = Math.min(this.minX, x); this.maxX = Math.max(this.maxX, x);
    this.minY = Math.min(this.minY, y); this.maxY = Math.max(this.maxY, y);
    if (Math.hypot(x - this.wx, y - this.wy) >= 4) { // signed winding over >= 4 px segments, + = clockwise (y down)
      const h = Math.atan2(y - this.wy, x - this.wx);
      if (!Number.isNaN(this.heading)) {
        let d = h - this.heading; d -= 2 * Math.PI * Math.round(d / (2 * Math.PI)); this.winding += d / DEG;
      }
      this.heading = h; this.wx = x; this.wy = y;
    }
    return this;
  }
}
function cls(kind: StrokeKind, s: Stroke, winding = 0): StrokeClass {
  const cx = s.lastX - s.startX, cy = s.lastY - s.startY;
  const dir = kind === 'swipe' ? (Math.abs(cx) > Math.abs(cy) ? (cx < 0 ? 'left' : 'right') : (cy < 0 ? 'up' : 'down')) : null;
  return { kind, dir, angle: Math.atan2(cy, cx), magnitude: 0, winding, speed: 1, chordX: cx, chordY: cy };
}

function rig(over: Partial<BrushHost> = {}) {
  const st = { flying: true, yaw: 0, pitch: 0, clearance: false, ground: 50, landTarget: null as Vec | null, clear: true,
    locks: 0, endLocks: 0, bursts: 0, nearest: false, said: [] as string[] };
  const host: BrushHost = {
    flying: () => st.flying, yaw: () => st.yaw, clearance: () => st.clearance, landTarget: () => st.landTarget,
    lassoBegin() {}, lassoAdd: () => st.locks, lassoEnd: closed => (closed ? st.endLocks : 0),
    lockBurst() { st.bursts++; }, lockNearest: () => st.nearest, ...over,
  };
  const ctx: GestureCtx = { clock: 0, canLand: () => true, pathClear: () => st.clear, groundBelow: () => st.ground,
    land() {}, say(t) { st.said.push(t); } };
  const b = createBrushScheme(host);
  gesture.step = b.step;
  const pos = { x: 0, y: 30, z: 0 };
  const step = (n = 1) => { for (let i = 0; i < n; i++) b.step(dt, pos, ctx); };
  step();
  return { st, b, ctx, pos, step };
}
type Rig = ReturnType<typeof rig>;
/** A straight stroke at 60 Hz by (dx, dy) over ms, move() on each sample; `settle` holds still at 60 Hz until it commits. */
function draw(r: Rig, dx: number, dy: number, ms = 150, settle = true) {
  const s = new Stroke().push(400, 500, 1000), n = Math.max(2, Math.round(ms / 16));
  r.b.down(s);
  for (let i = 1; i <= n; i++) { s.push(400 + dx * i / n, 500 + dy * i / n, 1000 + ms * i / n); r.b.move(s); }
  for (let k = 0; settle && k < 5 && !r.b.view.committed; k++) { s.push(s.lastX, s.lastY, s.lastT + 16); r.b.move(s); }
  return s;
}
function circle(r: Rig, cw: boolean, radius = 50) {
  const s = new Stroke().push(450 + radius, 500, 0);
  r.b.down(s);
  for (let i = 1; i <= 40; i++) {
    const a = (cw ? 1 : -1) * i / 40 * 2 * Math.PI;
    s.push(450 + radius * Math.cos(a), 500 + radius * Math.sin(a), i * 16); r.b.move(s);
  }
  return s;
}
/** Sum of the world offset the scheme wrote, integrated over steps until the program ends. */
function flyOffset(r: Rig, max = 180) {
  const d = { x: 0, y: 0, z: 0 };
  for (let i = 0; i < max && (i === 0 || r.b.view.program !== 'none'); i++) {
    r.step(); d.x += gesture.offset.x * dt; d.y += gesture.offset.y * dt; d.z += gesture.offset.z * dt;
  }
  return d;
}

describe('maneuvers', () => {
  it('turns land within 10% of the target angle with the peak rate at or below 2.5 rad/s', () => {
    for (const deg of [20, 45, 90]) {
      const m = startTurn(createManeuver(), 1, (deg - 20) / 70), o = createManeuverOut();
      let sum = 0, peak = 0, jerk = 0, lastRight = 0;
      while (m.id !== 'none') {
        stepManeuver(m, dt, 50, o); sum += o.yawRate * dt; peak = Math.max(peak, Math.abs(o.yawRate));
        jerk = Math.max(jerk, Math.abs(o.right - lastRight) / dt); lastRight = o.right;
      }
      expect(Math.abs(sum - deg * DEG)).toBeLessThan(deg * DEG * 0.1);
      expect(peak).toBeLessThanOrEqual(TURN_PEAK_MAX);
      expect(jerk).toBeLessThanOrEqual(OFFSET_JERK);
    }
  });
  it('magnitude scaling is monotonic', () => {
    const tiers = [0, 0.25, 0.5, 0.75, 1];
    for (const f of [turnAngle, soarDuration, diveDuration, soarClimb]) {
      tiers.slice(1).forEach((m, i) => expect(f(m)).toBeGreaterThan(f(tiers[i])));
    }
    expect(swipeMag(120)).toBeGreaterThan(swipeMag(80));
    expect(nudgeDistance(60)).toBeGreaterThan(nudgeDistance(30));
  });
});

describe('brushScheme', () => {
  beforeEach(() => { gesture.scheme = 'brush'; clearGesture(); resetGestureApply(); });
  afterEach(() => { gesture.scheme = 'off'; gesture.step = null; clearGesture(); resetGestureApply(); });

  it('a swipe commits mid-stroke and longer swipes turn further', () => {
    const turned = [80, 180, 300].map(px => {
      const r = rig(); let yaw = 0;
      draw(r, -px, 0);
      expect(r.b.view.committed).toBe(true);
      expect(r.b.view.program).toBe('turn');
      for (let i = 0; i < 120; i++) { r.step(); yaw += gesture.yawRate * dt; }
      return yaw;
    });
    expect(turned[0]).toBeGreaterThan(0);
    expect(turned[1]).toBeGreaterThan(turned[0]);
    expect(turned[2]).toBeGreaterThan(turned[1]);
  });
  it('the turn dodge offset lands within 10% and slides toward the turn', () => {
    const r = rig(); r.st.yaw = 0.7;
    r.b.fallback('turn-left');
    const d = flyOffset(r), want = turnDodgeDistance(turnAngle(0.5));
    const right = d.x * Math.cos(0.7) - d.z * Math.sin(0.7);
    expect(Math.abs(-right - want)).toBeLessThan(want * 0.1);
    expect(Math.abs(d.y)).toBeLessThan(1e-9);
  });
  it('a Soar climbs within 10% of its promise through the real flight model, then levels', () => {
    for (const px of [60, 180, 300]) {
      const r = rig(), host = { yaw: 0, pitch: 0, lift: false }, io = { forward: 0, strafe: 0, vertical: 0, precise: false };
      r.b.fallback('turn-left'); r.step(200); // cruising
      let v: Vec = { x: 0, y: 0, z: -13 }; const base = { x: 0, y: 0, z: 0 }, p = { x: 0, y: 30, z: 0 };
      const s = draw(r, 0, -px); expect(r.b.view.program).toBe('soar'); r.b.up(s, cls('swipe', s));
      gesture.step = r.b.step;
      for (let i = 0; i < 240; i++) {
        gestureBefore(dt, p, r.ctx, host); gestureIntent(null, io);
        v = advanceVelocity(gestureBase(v, base), { forward: io.forward, strafe: 0, vertical: io.vertical }, host.yaw, host.pitch,
          true, gesture.surge, dt);
        gestureOffset(v); p.y += v.y * dt;
      }
      const want = soarClimb(swipeMag(px));
      expect(Math.abs(p.y - 30 - want)).toBeLessThan(want * 0.1);
      expect(Math.abs(host.pitch)).toBeLessThan(0.02);
      expect(Math.abs(v.y)).toBeLessThan(0.1);
    }
  });
  it('a dive surges down and pulls out as soon as groundBelow drops under 5 m', () => {
    const r = rig();
    draw(r, 0, 200); r.step(8);
    expect(r.b.view.program).toBe('dive');
    expect(gesture.intent.vertical).toBeLessThan(-0.5);
    expect(gesture.surge).toBe(true);
    r.st.ground = 4.9; r.step();
    expect(r.b.view.program).toBe('pullout');
    expect(gesture.intent.vertical).toBeGreaterThanOrEqual(0);
    expect(gesture.surge).toBe(false);
  });
  it('a swipe down while low (under 5 m) with a landTarget requests land instead of diving', () => {
    const r = rig(); r.st.ground = 4; r.st.landTarget = { x: 3, y: 12, z: -4 }; r.step();
    draw(r, 0, 200);
    expect(gesture.request).toEqual({ kind: 'land', x: 3, y: 12, z: -4 });
    expect(gesture.landArmed).toBe(true);
    expect(r.b.cruising).toBe(false);
    expect(r.b.view.program).toBe('none');
  });
  it('higher up a swipe down stays a dive unless it ends on the land target; standing it lifts and dives, never lands', () => {
    let r = rig(); r.st.ground = 26; r.st.landTarget = { x: 3, y: 12, z: -4 }; r.step();
    draw(r, 0, 200);
    expect(gesture.request).toBeNull(); expect(r.b.view.program).toBe('dive'); expect(r.b.cruising).toBe(true);
    clearGesture();
    const at: number[][] = [];
    r = rig({ landAt: (x, y) => { at.push([x, y]); return true; } }); r.st.ground = 26; r.st.landTarget = { x: 3, y: 12, z: -4 }; r.step();
    draw(r, 0, 200);
    expect(gesture.request).toEqual({ kind: 'land', x: 3, y: 12, z: -4 }); expect(at[0]).toEqual([400, 700]);
    clearGesture();
    r = rig(); r.st.flying = false; r.st.ground = 1.04; r.st.landTarget = { x: 3, y: 12, z: -4 }; r.step();
    draw(r, 0, 200);
    expect(gesture.request).toEqual({ kind: 'lift' }); expect(gesture.landArmed).toBe(false);
  });
  it('each cancel reason stops the program at once', () => {
    const running = () => {
      gesture.override = false; const r = rig(); r.b.fallback('turn-right'); r.step(10);
      expect(gesture.yawRate).toBeLessThan(0); return r;
    };
    let r = running(); draw(r, 4, 12, 32, false);
    expect([gesture.yawRate, r.b.view.lastCancel]).toEqual([0, 'stroke']);
    r = running(); r.b.fallback('brake');
    expect([gesture.yawRate, gesture.intent.forward, r.b.view.lastCancel]).toEqual([0, 0, 'brake']);
    r = running(); gesture.override = true; r.step();
    expect([gesture.yawRate, gesture.offset.x, r.b.view.lastCancel]).toEqual([0, 0, 'override']);
    r = running(); r.st.clearance = true; r.step();
    expect([gesture.yawRate, r.b.view.lastCancel]).toEqual([0, 'clearance']);
  });
  it('a 250 ms hold shows the guide without braking; 900 ms brakes to hover', () => {
    const r = rig(); r.b.fallback('soar'); r.step(120);
    expect(gesture.intent.forward).toBe(1);
    r.b.down(new Stroke().push(300, 300, 0));
    r.b.hold(250); r.step();
    expect(r.b.view.guide).toBe(true);
    expect(gesture.intent.forward).toBe(1);
    r.b.hold(575); expect(r.b.view.ring).toBeCloseTo(0.5, 5);
    r.b.hold(900); r.step();
    expect(r.b.view.guide).toBe(false);
    expect(gesture.intent.forward).toBe(0);
  });
  it('a lasso locks mid-stroke and bursts on release; an empty-sky circle rolls', () => {
    let r = rig(); r.st.locks = 2; r.st.endLocks = 2;
    const s = circle(r, true);
    expect(r.b.view.locks).toBe(2);
    r.b.up(s, cls('circle', s, 360));
    expect(r.st.bursts).toBe(1);
    expect(r.b.view.program).toBe('none');
    for (const cw of [true, false]) {
      r = rig(); const c = circle(r, cw);
      r.b.up(c, cls('circle', c, cw ? 360 : -360)); r.step(20);
      expect(r.b.view.program).toBe('roll');
      expect(Math.sign(gesture.spin)).toBe(cw ? 1 : -1);
      expect(r.st.bursts).toBe(0);
    }
    r = rig(); const big = circle(r, true, 220);
    expect(r.b.view.committed).toBe(false);
    r.b.up(big, cls('circle', big, big.winding)); r.step();
    expect(r.b.view.program).toBe('roll');
    r = rig(); r.st.clear = false; const c = circle(r, true);
    r.b.up(c, cls('circle', c, 360));
    const d = flyOffset(r);
    expect(Math.hypot(d.x, d.z)).toBe(0);
  });
  it('an unknown stroke gives a 30% chord nudge and greys the ink', () => {
    const r = rig();
    const s = new Stroke().push(400, 400, 0);
    r.b.down(s);
    [[430, 380], [420, 340], [470, 330], [460, 320]].forEach(([x, y], i) => { s.push(x, y, 200 + i * 200); r.b.move(s); });
    r.b.up(s, cls('none', s));
    expect(r.b.view.grey).toBe(true);
    const d = flyOffset(r), want = NUDGE_FRAC * s.chord * DRAW_M_PER_PX;
    expect(Math.abs(Math.hypot(d.x, d.y, d.z) - want)).toBeLessThan(want * 0.1);
    expect(d.x / d.y).toBeCloseTo(60 / 80, 3);
  });
  it('a stroke from the ground requests lift, and cruise starts once airborne', () => {
    const r = rig(); r.st.flying = false; r.step();
    draw(r, 0, -20, 300, false);
    expect(gesture.request).toEqual({ kind: 'lift' });
    r.st.flying = true; r.step();
    expect(r.b.cruising).toBe(true);
    expect(gesture.intent.forward).toBe(1);
  });
  it('fallbacks drive the same programs, and a lock with no drone says so', () => {
    const r = rig();
    for (const [a, id] of [['soar', 'soar'], ['dive', 'dive'], ['turn-left', 'turn'], ['turn-right', 'turn'], ['roll', 'roll']] as const) {
      r.b.fallback(a); expect(r.b.view.program).toBe(id); r.step();
      expect(r.b.view.program).toBe(id);
    }
    r.b.fallback('lock-burst');
    expect(r.st.said).toEqual([NO_DRONE]);
  });
  it('clearGesture (pointercancel, pause) leaves zero intent on the next step', () => {
    const r = rig(); r.b.fallback('dive'); r.step(5);
    clearGesture(); r.step();
    expect([gesture.intent.forward, gesture.intent.vertical, gesture.yawRate, gesture.surge]).toEqual([0, 0, 0, false]);
  });
});
