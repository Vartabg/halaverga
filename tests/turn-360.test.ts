import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { advanceVelocity, moving, type Vec } from '../src/game/motion';
import { look, runtime } from '../src/game/runtime';
import { useGame } from '../src/game/store';
import { advanceFlightPose, angleDelta, FACING, type Pose } from '../src/game/presentation';
import { carve, resetCarve } from '../src/game/carve';
import { applyEdgeTurns, resetEdgeTurns } from '../src/game/edgeTurn';
import { EdgeRest } from '../src/game/lookEdgeRest';
import { touchLook } from '../src/game/touchLook';
import { AdaptiveThumbs } from '../src/game/adaptiveThumbs';
import { deskEdge, thumbEdge, thumbThrottle } from '../src/game/thumbFlight';
import { gestureBefore, gestureIntent } from '../src/game/gesture/applyGesture';
import { clearGesture, gesture } from '../src/game/gesture/bus';
import { yawFromScreen } from '../src/game/gesture/conduct';
import { createConductScheme } from '../src/game/gesture/conductScheme';
import { createBrushScheme, type BrushHost } from '../src/game/gesture/brushScheme';
import { createStrokeBuffer } from '../src/game/gesture/strokeBuffer';
import { classify } from '../src/game/gesture/strokeFeatures';
import { DrawPath } from '../src/game/gesture/drawPath';
import { PathFollow } from '../src/game/gesture/pathFollow';
import type { AimFrame, GestureCtx } from '../src/game/gesture/types';
import { FLIGHT_SPEED } from '../src/game/gesture/tuning';
import { CAM, HERO, frameAt } from './draw-harness';
// Turn-360 (spec 1.10): one full turn in every mode, chaining the real modules at 60 steps per second in node: the lab cap
// (gestureBefore), carve, the velocity blend (advanceVelocity), the body pose (advanceFlightPose), the edge turns (edgeTurn.ts) and
// the look edge rest (lookEdgeRest.ts). Node math only: none of it is iPhone, trackpad or windowed-browser validation.

const DT = 1 / 60, MS = 1000 / 60, TAU = 2 * Math.PI, DEG = Math.PI / 180;
const ctx: GestureCtx = { canLand: () => true, pathClear: () => true, groundBelow: () => 40, clock: 0, land() {}, say() {} };
const P = { x: 0, y: 30, z: 0 }, travel = (v: Vec) => Math.atan2(-v.x, -v.z), intentOut = { forward: 0, strafe: 0, vertical: 0, precise: false };
const LAND = [852, 393] as const, PORT = [393, 852] as const;
const rows: string[] = [];
const frameOf = (w: number, h: number): AimFrame => ({ origin: { x: 0, y: 2, z: 6 }, dir: { x: 0, y: 0, z: -1 }, right: { x: 1, y: 0, z: 0 },
  up: { x: 0, y: 1, z: 0 }, fov: 60, aspect: w / h, left: 0, top: 0, width: w, height: h, t: 1 });

/** One flight: steps the chain, watches the body bound and bank, and records when the view (or travel) first passes 360. */
class Flight {
  v: Vec; pose: Pose; t = 0; done = Infinity; lag = NaN; peak = 0; bank = 0; spin = 0; over = 0;
  private y0: number; private prev: number;
  constructor(readonly reduced: boolean, speed = 13, readonly yaw = () => runtime.yaw) {
    this.v = { x: 0, y: 0, z: -speed }; this.y0 = this.prev = yaw();
    this.pose = { viewYaw: this.y0, viewPitch: -.12, yaw: this.y0, pitch: -.12, lean: 0, bank: 0, speed, flight: 1, power: 0, brake: 0,
      spin: 0, bound: { yaw: FACING.yaw, up: FACING.pitchUp, down: FACING.pitchDown }, turnRate: 0, lastYaw: NaN };
  }
  get turned() { return this.yaw() - this.y0; }
  /** Physics step in Player's order. rated: this step's yaw change is rate-driven (not a direct drag). */
  step(forward: number, surge: boolean, o: { lab?: boolean; rated?: boolean; carveOn?: boolean } = {}) {
    if (o.lab) gestureBefore(DT, P, ctx, runtime);
    applyEdgeTurns(DT, { sustainedEdges: true, reduced: this.reduced, shooter: false });
    const intent = { forward, strafe: 0, vertical: 0, precise: gesture.live ? true as const : undefined };
    carve(this.v, runtime.yaw, DT, o.carveOn ?? (moving(intent) || surge || gesture.live), 1);
    this.v = advanceVelocity(this.v, intent, runtime.yaw, 0, true, surge, DT);
    this.watch(o.rated ?? true);
  }
  /** Body pose, bound, bank, rate and completion for this step. */
  watch(rated: boolean) {
    const y = this.yaw();
    advanceFlightPose(this.pose, { yaw: y, pitch: -.12, speed: Math.hypot(this.v.x, this.v.y, this.v.z), velocity: this.v, flying: true,
      reduced: this.reduced, facing: gesture.facing, spin: gesture.spin }, DT);
    this.t += DT;
    if (rated) this.peak = Math.max(this.peak, Math.abs(y - this.prev) / DT);
    this.prev = y;
    this.bank = Math.max(this.bank, Math.abs(this.pose.bank)); this.spin = Math.max(this.spin, Math.abs(this.pose.spin ?? 0));
    if (Math.abs(angleDelta(this.pose.viewYaw, this.pose.yaw)) > this.pose.bound!.yaw + 1e-6) this.over++;
    if (this.done === Infinity && Math.abs(this.turned) >= TAU) this.mark(Math.abs(angleDelta(travel(this.v), y)));
  }
  mark(lag: number) { this.done = this.t; this.lag = lag; }
}
function expectFull(name: string, f: Flight, max: number, t0 = 0) {
  rows.push(`${name}: ${(f.done - t0).toFixed(2)} s, lag ${(f.lag / DEG).toFixed(1)} deg, bank ${f.bank.toFixed(2)}`);
  expect(f.done - t0, name).toBeLessThanOrEqual(max);
  expect(f.lag / DEG, `${name} travel lag`).toBeLessThanOrEqual(25);
  expect(f.over, `${name} body bound`).toBe(0); expect(f.bank, `${name} bank`).toBeLessThanOrEqual(.6 + 1e-9);
}
function expectReduced(name: string, f: Flight, t0 = 0) {
  rows.push(`${name} (reduced motion): ${Number.isFinite(f.done) ? (f.done - t0).toFixed(2) + ' s' : 'over the window'}, peak ${f.peak.toFixed(2)} rad/s`);
  expect(f.peak, `${name} rate`).toBeLessThanOrEqual(2.5 + 1e-6); expect(f.done - t0, name).toBeGreaterThanOrEqual(2.5);
  expect(f.bank, `${name} bank`).toBe(0); expect(f.spin, `${name} spin`).toBe(0); expect(f.over, `${name} body bound`).toBe(0);
}
const minJerk = (u: number) => u * u * u * (10 - 15 * u + 6 * u * u);

beforeEach(() => {
  runtime.yaw = 0; runtime.pitch = -.12; ctx.clock = 0; resetCarve(); resetEdgeTurns();
  runtime.trackpad.active = false; runtime.trackpad.outside = 0; runtime.trackpad.outsideAge = 0; runtime.trackpad.edgeTurn = runtime.trackpad.edgePitch = 0;
  Object.assign(runtime.thumb, { active: false, throttle: 0, strafe: 0, edgeTurn: 0, edgePitch: 0 }); runtime.stick.edgeTurn = 0;
  const s = runtime.shooter; s.aim.blend = 0; s.assist.slow = 0; s.assist.engaged = false;
  useGame.setState({ reduced: false, lookAccel: true, edgeRest: true, touchLook: 1, touchAim: 1, invertY: false, aimAssist: 0 });
  clearGesture(); gesture.scheme = 'off'; gesture.step = null; gesture.reduced = false; gesture.override = false;
});
afterAll(() => { gesture.scheme = 'off'; gesture.step = null; clearGesture(); if (rows.length) console.info('turn-360 (node math):\n  ' + rows.join('\n  ')); });

/**
 * Twin sticks: a min-jerk look swipe of D px in T ms that ends in a rest band (landscape 350 px / 200 ms, portrait 250 / 180).
 * Right turns end 20 px from the right edge; left turns end on the landscape stick line's strip (8 px in) or, in portrait, 20 px
 * from the left edge (EdgeRest.fit).
 */
function swipe([w, h]: readonly [number, number], dir: 1 | -1, each: (x: number, ms: number) => void, start?: (x0: number) => void) {
  const D = w > h ? 350 : 250, T = w > h ? 200 : 180, inner = Math.round(.45 * w), n = Math.round(T / MS);
  const x1 = dir < 0 ? w - 20 : w > h ? inner + 8 : 20, x0 = dir < 0 ? x1 - D : x1 + D;
  let x = x0, yaw = 0;
  start?.(x0);
  for (let k = 1; k <= n; k++) {
    const nx = x0 + (x1 - x0) * minJerk(k / n), dx = nx - x, y = runtime.yaw;
    touchLook(dx, 0, Math.abs(dx) / (T / n)); yaw += runtime.yaw - y; x = nx; each(nx, k * T / n);
  }
  return { x0, inner, yaw, T };
}
/** ...then the thumb rests there: the edge rest is ticked every frame, as useTwinStick does for a still thumb. */
function twin(view: readonly [number, number], dir: 1 | -1, reduced: boolean) {
  useGame.setState({ reduced });
  const rest = new EdgeRest(), f = new Flight(reduced), [w, h] = view;
  rest.fit(w, w > h, { l: 12, r: Math.round(.45 * w) }, false);
  const s = swipe(view, dir, (x, ms) => { runtime.stick.edgeTurn = rest.move(x, ms); f.step(1, false, { rated: false }); }, x0 => rest.down(x0, 0));
  let ms = s.T;
  while (f.t < 5 && f.done === Infinity) { ms += MS; runtime.stick.edgeTurn = rest.tick(ms); f.step(1, false); }
  return { f, swipe: s.yaw };
}
describe('phone twin sticks: a fast swipe that ends in a rest band keeps turning', () => {
  for (const [name, view] of [['landscape', LAND], ['portrait', PORT]] as const) for (const dir of [-1, 1] as const) {
    const side = dir < 0 ? 'right, outer band' : 'left, inner band';
    it(`${name} ${side}: 360 in 1.4 s or less`, () => {
      const { f } = twin(view, dir, false);
      expectFull(`twin ${name} ${side}`, f, 1.4); expect(Math.sign(f.turned)).toBe(dir);
    });
    it(`${name} ${side}, reduced motion: the swipe equals Fixed Speed and the rest stays within 2.5 rad/s`, () => {
      useGame.setState({ lookAccel: false }); const fixed = swipe(view, dir, () => {}).yaw;
      useGame.setState({ lookAccel: true }); runtime.yaw = 0;
      const r = twin(view, dir, true), f = r.f;
      expect(r.swipe).toBeCloseTo(fixed, 9);
      rows.push(`twin ${name} ${side} (reduced motion): ${f.done.toFixed(2)} s, rest peak ${f.peak.toFixed(2)} rad/s`);
      expect(f.peak).toBeLessThanOrEqual(2.5 + 1e-6); expect(f.bank).toBe(0); expect(f.over).toBe(0);
    });
  }
});

/** Classic one thumb: touch at 600 px, drag to 25 px from the right edge (the drag looks and sets the throttle), then rest. */
function classic(reduced: boolean, drag = true) {
  const [w, h] = LAND, f = new Flight(reduced);
  if (drag) {
    const c = new AdaptiveThumbs(); c.start(1, 600, 200);
    for (let k = 1; k <= 9; k++) {
      c.move(1, 600 + (w - 25 - 600) * minJerk(k / 9), 200, w, h); look(c.output.lookX, c.output.lookY);
      Object.assign(runtime.thumb, { active: c.active, throttle: c.output.forward, strafe: c.output.strafe, edgeTurn: c.output.edgeTurn, edgePitch: c.output.edgePitch });
      f.step(runtime.thumb.throttle, true, { rated: false });
    }
  } else Object.assign(runtime.thumb, { active: true, throttle: thumbThrottle(w - 25 - 600), strafe: 0, edgeTurn: thumbEdge(w - 25, w), edgePitch: 0 });
  while (f.t < 6 && f.done === Infinity) f.step(runtime.thumb.throttle, true);
  return f;
}
describe('phone one thumb: resting 25 px from the edge keeps turning', () => {
  it('360 in 2.1 s or less', () => expectFull('classic thumb 25 px in', classic(false), 2.1));
  it('reduced motion, from the rest: within 2.5 rad/s, 2.5 s or more', () => expectReduced('classic thumb rest', classic(true, false)));
});

/** Desktop free cursor while cruising: centre to the right edge (a direct look), then hold there or slide off the side. */
function desk(reduced: boolean, exit: boolean, move = true) {
  const tp = runtime.trackpad, f = new Flight(reduced, 8), w = 1440;
  Object.assign(tp, { active: true, throttle: 8 / 34, edgeAge: 0, outside: 0, outsideAge: 0, edgeTurn: move ? 0 : 1, edgePitch: 0 });
  let x = 720;
  if (move) for (let k = 1; k <= 18; k++) { const nx = 720 + (w - 2 - 720) * minJerk(k / 18); look(nx - x, 0); x = nx; tp.edgeTurn = deskEdge(x, w); tp.edgeAge = 0; f.step(tp.throttle, true, { rated: false }); }
  if (exit) Object.assign(tp, { outside: 1, outsideAge: 0, edgeTurn: 1, edgePitch: 0 });
  while (f.t < 6 && f.done === Infinity) f.step(tp.throttle, true);
  return f;
}
describe('desktop Standard: the edge hold keeps turning', () => {
  it('cursor to the edge and hold: 360 in 2.0 s or less', () => expectFull('desktop edge hold', desk(false, false), 2.0));
  it('cursor to the edge and slide off the side of the window: 360 in 2.0 s or less', () => expectFull('desktop side exit', desk(false, true), 2.0));
  it('reduced motion, the edge hold alone: within 2.5 rad/s, 2.5 s or more', () => expectReduced('desktop edge hold', desk(true, false, false)));
});

/** Lab Conduct: a finger resting at 0.45 of the width from the centre (the real scheme through gestureBefore's cap). */
function conduct([w, h]: readonly [number, number], reduced: boolean) {
  const fr = frameOf(w, h), s = createConductScheme({ frame: () => fr }), buf = createStrokeBuffer(), f = new Flight(reduced), x = w * .95;
  gesture.scheme = 'conduct'; gesture.reduced = reduced; gesture.step = (dt, p, c) => s.step(dt, p, c as GestureCtx);
  let ms = 0; buf.begin(1, 'touch', x, h / 2, ms); s.down(buf);
  while (f.t < 6 && f.done === Infinity) {
    ms += MS; buf.push(x, h / 2, ms); s.move(buf);
    gestureIntent(null, intentOut); f.step(intentOut.forward, gesture.surge, { lab: true });
  }
  return f;
}
describe('lab Conduct: a finger in the outer 10% wraps all the way round', () => {
  for (const [name, view] of [['landscape', LAND], ['portrait', PORT]] as const) {
    it(`${name}: 360 in 1.8 s or less`, () => expectFull(`conduct ${name}`, conduct(view, false), 1.8));
    it(`${name}, reduced motion: within 2.5 rad/s, 2.5 s or more`, () => expectReduced(`conduct ${name}`, conduct(view, true)));
  }
});

/** Lab Brush: the real scheme; strokes are fed one sample per physics step. Returns the flight and the release time. */
function brush(reduced: boolean) {
  const host: BrushHost = { flying: () => true, yaw: () => runtime.yaw, clearance: () => false, landTarget: () => null, lassoBegin() {}, lassoAdd: () => 0,
    lassoEnd: () => 0, lockBurst() {}, lockNearest: () => false, width: () => 852, reduced: () => reduced };
  const b = createBrushScheme(host), f = new Flight(reduced);
  gesture.scheme = 'brush'; gesture.reduced = reduced; gesture.step = (dt, p, c) => b.step(dt, p, c as GestureCtx);
  const tick = () => { gestureIntent(null, intentOut); f.step(intentOut.forward, gesture.surge, { lab: true }); };
  const stroke = (pts: (k: number) => [number, number], n: number) => {
    const s = createStrokeBuffer(); let ms = f.t * 1000;
    for (let k = 0; k <= n; k++) { const [x, y] = pts(k / n); if (k === 0) { s.begin(1, 'touch', x, y, ms); b.down(s); } else { s.push(x, y, ms); b.move(s); } ms += MS; tick(); }
    b.up(s, classify(s, 'brush'));
  };
  const finish = () => { while (f.t < 8 && f.done === Infinity) tick(); return f; };
  return { f, b, stroke, tick, finish };
}
const loop = (k: number): [number, number] => [420 + 110 * Math.cos(k * TAU), 200 + 110 * Math.sin(k * TAU)];
describe('lab Brush: the whirl spins you round, and same-direction swipes stack', () => {
  it('a big clockwise loop whirls right: 360 in 1.4 s or less from the release', () => {
    const r = brush(false); r.stroke(loop, 48); const t0 = r.f.t;
    expect(r.b.view.program).toBe('whirl');
    const f = r.finish(); expectFull('brush whirl (from release)', f, 1.4, t0); expect(f.turned).toBeLessThan(0);
  });
  it('four quick right swipes: 360 in 2.1 s or less from the first touch', () => {
    const r = brush(false);
    for (let i = 0; i < 4; i++) { r.stroke(k => [300 + 300 * k, 200], 9); for (let j = 0; j < 5; j++) r.tick(); }
    expectFull('brush 4 stacked swipes', r.finish(), 2.1);
  });
  it('reduced motion: the whirl and stacked swipes stay within 2.5 rad/s and take 2.5 s or more, with no bank or spin', () => {
    const r = brush(true); r.stroke(loop, 48); const t0 = r.f.t; expectReduced('brush whirl', r.finish(), t0);
    beforeEachReset();
    const s = brush(true);
    for (let i = 0; i < 4; i++) { s.stroke(k => [300 + 300 * k, 200], 9); for (let j = 0; j < 5; j++) s.tick(); }
    expectReduced('brush 4 stacked swipes', s.finish());
  });
});
function beforeEachReset() { runtime.yaw = 0; resetCarve(); resetEdgeTurns(); clearGesture(); }

/**
 * Lab Draw: screen loops drawn one sample per step on a still camera (as draw-wrap.test), flown by PathFollow. The 360 is timed
 * from when the hero reaches the wrap entry on the path (150 deg of winding, spec 1.8d, as draw-wrap.test); pen-down is reported.
 */
function draw([w, h]: readonly [number, number], reduced: boolean, pts: (k: number) => [number, number], n: number) {
  const fr = frameAt(CAM); fr.width = w; fr.height = h; fr.aspect = w / h;
  const path = new DrawPath(), view = { yaw: 0, pitch: -.1, lift: false }, follow = new PathFollow(path, view), f = new Flight(reduced, FLIGHT_SPEED, () => view.yaw);
  gesture.scheme = 'draw'; gesture.reduced = reduced;
  const pos = { ...HERO };
  let turned = 0, last = travel(f.v), peakRaw = 0, done = Infinity, entry = Infinity, entryArc = -1, all = 0, pen = Infinity;
  const step = () => {
    if (entryArc < 0 && path.wrapping) entryArc = path.ring.endArc;
    follow.step(DT, pos, f.v, ctx); peakRaw = Math.max(peakRaw, Math.abs(gesture.yawRate));
    gestureBefore(DT, pos, ctx, view);
    if (gesture.velocityOn) { f.v.x = gesture.velocity.x; f.v.y = gesture.velocity.y; f.v.z = gesture.velocity.z; }
    pos.x += f.v.x * DT; pos.y += f.v.y * DT; pos.z += f.v.z * DT;
    f.watch(true);
    if (Math.hypot(f.v.x, f.v.z) > 1) { const hd = travel(f.v), d = angleDelta(last, hd); turned += d; all += d; last = hd; }
    if (entry === Infinity && entryArc >= 0 && follow.s >= entryArc) { entry = f.t; turned = 0; }
    if (pen === Infinity && Math.abs(all) >= TAU) pen = f.t;
    if (done === Infinity && entry < Infinity && Math.abs(turned) >= TAU) { done = f.t; f.lag = Math.abs(angleDelta(travel(f.v), view.yaw)); }
  };
  path.begin(HERO); follow.start(f.v);
  for (let k = 0; k <= n; k++) { const [x, y] = pts(k / n); path.append(x, y, k * MS, fr); step(); }
  path.release(null, 0, 0);
  for (let i = 0; i < 360 && (reduced ? f.done === Infinity : done === Infinity || pen === Infinity); i++) step();
  if (!reduced) f.done = done;
  return { f, peakRaw, turned, entry, pen };
}
const circle = ([w, h]: readonly [number, number], r: number, turns = 2) => (k: number): [number, number] =>
  [w / 2 + r * Math.cos(-Math.PI / 2 + k * turns * TAU), h / 2 + r * Math.sin(-Math.PI / 2 + k * turns * TAU)];
describe('lab Draw: a circle turns you around', () => {
  for (const [name, view] of [['landscape', LAND], ['portrait', PORT]] as const) {
    it(`${name}: a radius-70 px circle turns the travel 360 in 2.3 s or less from the wrap entry`, () => {
      const r = draw(view, false, circle(view, 70), 96);
      expect(r.entry).toBeLessThan(Infinity);
      expectFull(`draw circle ${name} (from the wrap entry; pen-down ${r.pen.toFixed(2)} s)`, r.f, 2.3, r.entry); expect(r.turned).toBeLessThan(0);
    });
    it(`${name}, reduced motion: the view turns within 2.5 rad/s, 2.5 s or more`, () => expectReduced(`draw circle ${name} (view)`, draw(view, true, circle(view, 70), 96).f));
  }
});

describe('slow precision is unchanged', () => {
  it('twin: 30 px at 0.1 px/ms turns 8.9 deg, and ending 30 px from the edge gives no edge turn', () => {
    touchLook(30, 0, .1); expect(-runtime.yaw / DEG).toBeCloseTo(8.94, 1);
    const rest = new EdgeRest(); rest.configure(852, -1, 383, 1); rest.down(852 - 60, 0);
    let out = 0; for (let k = 1; k <= 18; k++) out = Math.max(out, Math.abs(rest.move(852 - 60 + 30 * k / 18, k * MS)));
    for (let k = 19; k < 60; k++) out = Math.max(out, Math.abs(rest.tick(k * MS)));
    expect(out).toBe(0);
  });
  it('Conduct at 0.1 of the width from the centre turns 0.12 rad/s or less', () => {
    for (const [w, h] of [LAND, PORT, [1440, 900] as const]) expect(Math.abs(yawFromScreen(frameOf(w, h), w * .6))).toBeLessThanOrEqual(.12);
  });
  it('a Draw swoop under 150 deg of winding never asks for more than 2.5 rad/s of view turn', () => {
    const [w, h] = LAND, R = h * .35, r = draw(LAND, false, k => { const a = Math.PI * (.9 - .6 * k); return [w / 2 + R * Math.cos(a), h / 2 + 60 - R * Math.sin(a)]; }, 40);
    expect(r.peakRaw).toBeLessThanOrEqual(2.5 + 1e-9);
  });
});
