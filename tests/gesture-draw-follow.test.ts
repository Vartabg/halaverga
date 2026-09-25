import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import type { Vec } from '../src/game/motion';
import { clearGesture, gesture } from '../src/game/gesture/bus';
import { DrawPath } from '../src/game/gesture/drawPath';
import { createDrawScheme } from '../src/game/gesture/drawScheme';
import { EXIT, FOLLOW, IDLE, LANDING, PATH_BLOCKED, PathFollow } from '../src/game/gesture/pathFollow';
import { createStrokeBuffer } from '../src/game/gesture/strokeBuffer';
import type { GestureCtx, StrokeClass } from '../src/game/gesture/types';
import { ACCEL, CURVE_K, DRAW_LAG_M, DRAW_MAX_PTS, FLIGHT_SPEED } from '../src/game/gesture/tuning';
import { CAM, HERO, frameAt, line } from './draw-harness';

const DT = 1 / 60;
const v = (x: number, y: number, z: number): Vec => ({ x, y, z });
const len = (a: Vec) => Math.hypot(a.x, a.y, a.z);
function makeCtx(over: Partial<GestureCtx> = {}): GestureCtx {
  return { canLand: () => true, pathClear: () => true, groundBelow: () => Infinity, clock: 0, land: () => {}, say: vi.fn(), ...over };
}
/** A follower over a fresh path, and an ideal controller: the hero moves exactly by the commanded velocity. */
function rig(start = v(0, 0, 0)) {
  const path = new DrawPath(), view = { yaw: 0, pitch: -0.1 }, follow = new PathFollow(path, view);
  const pos = { ...HERO }, vel = { ...start };
  const step = (ctx: GestureCtx, clearance = false, move = true) => {
    follow.step(DT, pos, vel, ctx, clearance);
    const g = gesture;
    if (g.velocityOn) { vel.x = g.velocity.x; vel.y = g.velocity.y; vel.z = g.velocity.z; }
    if (move) { pos.x += vel.x * DT; pos.y += vel.y * DT; pos.z += vel.z * DT; } else vel.x = vel.y = vel.z = 0;
    view.yaw += g.yawRate * DT; view.pitch += g.pitchRate * DT;
  };
  return { path, follow, pos, vel, view, step };
}
/** The hero's arc along the path: nearest point over every segment. */
function arcOf(p: DrawPath, pos: Vec) {
  const r = p.ring, a = v(0, 0, 0), b = v(0, 0, 0);
  let best = Infinity, arc = 0;
  for (let i = r.first; i < r.count - 1; i++) {
    r.get(i, a); r.get(i + 1, b);
    const ex = b.x - a.x, ey = b.y - a.y, ez = b.z - a.z, l2 = ex * ex + ey * ey + ez * ez;
    const u = Math.max(0, Math.min(1, ((pos.x - a.x) * ex + (pos.y - a.y) * ey + (pos.z - a.z) * ez) / (l2 || 1)));
    const d = Math.hypot(a.x + ex * u - pos.x, a.y + ey * u - pos.y, a.z + ez * u - pos.z);
    if (d < best) { best = d; arc = r.arcOf(i) + u * Math.sqrt(l2); }
  }
  return arc;
}
/** A finished straight-ish path into the screen, the hero at its start. */
function finished(r: ReturnType<typeof rig>, x1 = 520, y1 = 360) {
  const f = frameAt(CAM);
  r.path.begin(HERO); line(r.path, f, 400, 320, x1, y1, 40); r.path.release(null, 0, 0);
  r.follow.start(r.vel);
  return f;
}

beforeEach(() => { clearGesture(); gesture.scheme = 'draw'; gesture.override = false; });
afterEach(() => { clearGesture(); gesture.scheme = 'off'; });

describe('pathFollow: speed', () => {
  it('holds at least flight speed along a 150 px circle stroke (curvature cap about 22 m/s)', () => {
    const r = rig(v(0, 0, -FLIGHT_SPEED)), ctx = makeCtx(), f = frameAt(CAM);
    r.path.begin(HERO); r.follow.start(r.vel);
    let min = Infinity, max = 0;
    for (let i = 0; i <= 72; i++) {   // 1.5 turns of a 75 px radius circle at 0.8 s per turn, drawn live at 60 Hz
      const a = i / 48 * 2 * Math.PI;
      frameAt(v(r.pos.x, r.pos.y + 1.5, r.pos.z + 8), 0, 0, f);
      r.path.append(400 + 75 * Math.cos(a), 250 + 75 * Math.sin(a), i * 1000 / 60, f);
      r.step(ctx);
      if (r.follow.s > 12) { min = Math.min(min, len(r.vel)); max = Math.max(max, len(r.vel)); }
    }
    r.path.release(null, 0, 0);
    for (let i = 0; i < 600 && r.follow.mode === FOLLOW; i++) {
      r.step(ctx);
      if (r.follow.mode === FOLLOW) { min = Math.min(min, len(r.vel)); max = Math.max(max, len(r.vel)); }
    }
    expect(r.follow.s).toBeGreaterThan(80);
    expect(min).toBeGreaterThanOrEqual(13);
    expect(max).toBeLessThanOrEqual(34);
  });

  it('never exceeds the curvature cap or the 42 m/s^2 ramp on a hard corner', () => {
    const r = rig(v(0, 0, -18)), ctx = makeCtx(), f = frameAt(CAM);
    r.path.begin(HERO); line(r.path, f, 400, 320, 640, 330, 20); line(r.path, f, 640, 330, 560, 120, 20, 340);
    r.path.release(null, 0, 0); r.follow.start(r.vel);
    const prev = { ...r.vel };
    let steps = 0;
    for (; steps < 900 && r.follow.mode === FOLLOW; steps++) {
      r.step(ctx);
      if (r.follow.mode !== FOLLOW) break;
      const rad = r.path.ring.radius[r.follow.seg % DRAW_MAX_PTS];
      expect(len(r.vel)).toBeLessThanOrEqual(Math.sqrt(CURVE_K * rad) + 1e-6);
      expect(Math.hypot(r.vel.x - prev.x, r.vel.y - prev.y, r.vel.z - prev.z)).toBeLessThanOrEqual(ACCEL * DT + 1e-6);
      prev.x = r.vel.x; prev.y = r.vel.y; prev.z = r.vel.z;
    }
    expect(steps).toBeGreaterThan(60);
  });

  it('never passes (drawn arc - 4 m) while inking, even when the pen pauses', () => {
    const r = rig(), ctx = makeCtx(), f = frameAt(CAM);
    r.path.begin(HERO); r.follow.start(r.vel);
    for (let i = 0; i <= 150; i++) {
      const k = i < 40 ? i : i < 110 ? 40 : i - 70;   // draws, pauses 70 frames, draws again
      r.path.append(400 + k * 3, 320 - k, i * 1000 / 60, f);
      r.step(ctx);
      const limit = Math.max(0, r.path.ring.endArc - DRAW_LAG_M);
      expect(r.follow.s).toBeLessThanOrEqual(limit + 1e-9);
      expect(arcOf(r.path, r.pos)).toBeLessThanOrEqual(limit + 0.05);
    }
    expect(r.follow.s).toBeGreaterThan(10);
    expect(gesture.yawRate).toBe(0); expect(gesture.pitchRate).toBe(0);   // the view never turns under the finger
    expect(gesture.facing).toBe(1); expect(gesture.live).toBe(true);
  });
});

describe('pathFollow: aborts and hand-off', () => {
  it('aborts on deviation > 3 m held 0.5 s', () => {
    const r = rig(v(0, 0, -13)), ctx = makeCtx();
    finished(r);
    for (let i = 0; i < 10; i++) r.step(ctx);
    for (let i = 0; i < 40 && r.follow.mode === FOLLOW; i++) { r.pos.y = HERO.y + 6; r.step(ctx); }
    expect(r.follow.mode).toBe(EXIT); expect(r.follow.lastAbort).toBe('deviation');
  });
  it('aborts on clearance held 0.3 s', () => {
    const r = rig(v(0, 0, -13)), ctx = makeCtx();
    finished(r);
    for (let i = 0; i < 17; i++) r.step(ctx, true);
    expect(r.follow.mode).toBe(FOLLOW);
    for (let i = 0; i < 3; i++) r.step(ctx, true);
    expect(r.follow.lastAbort).toBe('clearance'); expect(r.follow.mode).toBe(EXIT);
  });
  it('aborts slow (Path blocked) unless a landing is armed', () => {
    const r = rig(v(0, 0, -13)), ctx = makeCtx();
    finished(r);
    for (let i = 0; i < 30 && r.follow.mode === FOLLOW; i++) r.step(ctx, false, false);
    expect(r.follow.lastAbort).toBe('slow'); expect(ctx.say).toHaveBeenCalledWith(PATH_BLOCKED);
    const q = rig(v(0, 0, -13)), c2 = makeCtx();
    finished(q); gesture.landArmed = true;
    for (let i = 0; i < 60; i++) q.step(c2, false, false);
    expect(q.follow.mode).toBe(FOLLOW); expect(q.follow.lastAbort).toBe('none');
  });
  it('lets keyboard override cancel at once, with no glide', () => {
    const r = rig(v(0, 0, -13)), ctx = makeCtx();
    finished(r);
    for (let i = 0; i < 5; i++) r.step(ctx);
    expect(gesture.velocityOn).toBe(true);
    gesture.override = true; r.step(ctx);
    expect(r.follow.mode).toBe(IDLE); expect(r.follow.lastAbort).toBe('override');
    expect(gesture.velocityOn).toBe(false); expect(gesture.facing).toBe(0);
  });
  it('ends open paths with a decay to 8 m/s over 1.5 s, then hovers', () => {
    const r = rig(v(0, 0, -13)), ctx = makeCtx();
    finished(r); r.path.finish(null);
    let i = 0;
    for (; i < 900 && r.follow.mode === FOLLOW; i++) r.step(ctx);
    expect(r.follow.mode).toBe(EXIT);
    for (let k = 0; k < 89; k++) r.step(ctx);
    expect(len(r.vel)).toBeCloseTo(8, 0);
    r.step(ctx); r.step(ctx);
    expect(r.follow.mode).toBe(IDLE); expect(gesture.velocityOn).toBe(false);
  });

  const landing = (canLand: boolean, pathClear: boolean) => {
    const r = rig(v(0, 0, -13)), land = vi.fn(), ctx = makeCtx({ canLand: () => canLand, pathClear: () => pathClear, land });
    finished(r);
    r.path.pendingEnd = false;
    const e = r.path.ring.last(v(0, 0, 0));
    r.path.finish({ point: v(e.x, e.y - 8, e.z), normal: v(0, 1, 0) });
    let armedAt = -1;
    for (let i = 0; i < 900 && (r.follow.mode === FOLLOW); i++) {
      r.step(ctx);
      if (gesture.request && gesture.request.kind === 'land' && armedAt < 0) {
        const end = r.path.ring.last(v(0, 0, 0));
        armedAt = Math.hypot(end.x - r.pos.x, end.y - r.pos.y, end.z - r.pos.z);
      }
    }
    return { r, armedAt };
  };
  it('hands off to a landing within 8 m only when canLand && pathClear', () => {
    const ok = landing(true, true);
    expect(ok.r.follow.mode).toBe(LANDING); expect(gesture.landArmed).toBe(true);
    expect(ok.armedAt).toBeGreaterThan(0); expect(ok.armedAt).toBeLessThanOrEqual(8 + 13 * DT);
    expect(gesture.request).toMatchObject({ kind: 'land', x: ok.r.path.land.x, y: ok.r.path.land.y, z: ok.r.path.land.z });
    clearGesture(); gesture.scheme = 'draw';
    for (const [c, p] of [[false, true], [true, false]] as const) {
      const no = landing(c, p);
      expect(no.armedAt).toBe(-1); expect(gesture.landArmed).toBe(false); expect(no.r.follow.mode).not.toBe(LANDING);
      clearGesture(); gesture.scheme = 'draw';
    }
  });
});

describe('drawScheme', () => {
  const cls: StrokeClass = { kind: 'nudge', dir: null, angle: 0, magnitude: 0, winding: 0, speed: 0, chordX: 0, chordY: 0 };
  const setup = () => {
    const f = frameAt(CAM), path = new DrawPath(), s = createDrawScheme({ frame: () => f, view: { yaw: 0, pitch: -0.1 } }, path);
    const ctx = makeCtx(), buf = createStrokeBuffer(), pos = { ...HERO };
    s.step(DT, pos, ctx);
    return { f, path, s, ctx, buf, pos };
  };
  it('scrubbing back over the last 30% within 300 ms drops the unflown tail and glides', () => {
    const { path, s, ctx, buf, pos } = setup();
    buf.begin(1, 'touch', 400, 320, 0); s.down(buf);
    for (let i = 1; i <= 20; i++) { buf.push(400 + i * 15, 320 - i * 4, i * 16); s.move(buf); s.step(DT, pos, ctx); }
    expect(path.inking).toBe(true);
    const before = path.ring.endArc;
    for (let i = 1; i <= 8; i++) { buf.push(700 - i * 15, 240 + i * 4, 320 + i * 16); s.move(buf); }
    expect(path.dead).toBe(true); expect(s.follow.lastAbort).toBe('scrub');
    expect(path.ring.endArc).toBeLessThan(before);
    expect(path.ring.endArc).toBeLessThanOrEqual(s.follow.s + 1e-6);
  });
  it('turns a short failed-tap stroke into a chord nudge, and requests lift when grounded', () => {
    const { path, s, buf, pos } = setup();
    buf.begin(1, 'touch', 400, 320, 0); s.down(buf);
    for (let i = 1; i <= 3; i++) { buf.push(400 + i * 8, 320, i * 16); s.move(buf); }
    s.up(buf, cls);
    expect(path.ring.count).toBe(0); expect(s.follow.mode).toBe(IDLE);
    const grounded = makeCtx({ groundBelow: () => 1.06 });
    let peak = 0;
    for (let i = 0; i < 30; i++) { s.step(DT, pos, grounded); peak = Math.max(peak, gesture.offset.x); }
    expect(peak).toBeGreaterThan(0); expect(gesture.offset.x).toBe(0);
    buf.begin(2, 'touch', 400, 320, 600); s.down(buf);
    for (let i = 1; i <= 6; i++) { buf.push(400 + i * 12, 320 - i * 3, 600 + i * 16); s.move(buf); }
    s.step(DT, pos, grounded);
    expect(gesture.request).toEqual({ kind: 'lift' });
  });
  it('publishes a ring-relative ribbon view with sample times and the flown index', () => {
    const { path, s, ctx, buf, pos } = setup();
    buf.begin(1, 'touch', 400, 320, 1000); s.down(buf);
    for (let i = 1; i <= 30; i++) { buf.push(400 + i * 6, 320 - i * 3, 1000 + i * 16); s.move(buf); s.step(DT, pos, ctx); pos.z -= 0.2; }
    const rb = s.ribbon;
    expect(rb.count).toBe(path.ring.count); expect(rb.seq0).toBe(0); expect(rb.blocked).toBe(-1);
    expect([rb.x(0), rb.y(0), rb.z(0)]).toEqual([HERO.x, HERO.y, HERO.z]);
    for (let i = 1; i < rb.count; i++) expect(rb.t(i)).toBeGreaterThanOrEqual(rb.t(i - 1));
    expect(rb.t(0)).toBeGreaterThanOrEqual(1000);
    expect(rb.flown).toBeGreaterThan(0); expect(rb.flown).toBeLessThan(rb.count);
  });
  it('routes fly-to, brake and the fallbacks', () => {
    const { path, s } = setup();
    expect(s.handle({ type: 'miss', id: 1, x: 500, y: 300, t: 0, drone: -1, progress: 0 })).toBe(false);
    s.fallback('fly-to');
    expect(s.handle({ type: 'miss', id: 1, x: 500, y: 300, t: 0, drone: -1, progress: 0 })).toBe(true);
    expect(path.pendingEnd).toBe(true);
    path.finish(null);
    expect(path.ring.endArc).toBeGreaterThan(55);
    expect(s.follow.mode).toBe(FOLLOW);
    s.handle({ type: 'brake', id: 2, x: 0, y: 0, t: 0, drone: -1, progress: 0 });
    expect(s.follow.mode).toBe(IDLE); expect(path.ring.count).toBe(0);
  });
});

describe('no allocation per step', () => {
  it('constructs nothing while following, inking or gliding (constructor spy)', () => {
    const names = ['Float32Array', 'Float64Array', 'Array', 'Object', 'Map', 'Set', 'Uint8Array', 'Int8Array'] as const;
    const g = globalThis as unknown as Record<string, unknown>, saved = names.map(n => g[n]);
    let made = 0;
    const r = rig(v(0, 0, -13)), ctx = makeCtx(), f = frameAt(CAM);
    finished(r); r.path.finish(null);
    const q = rig(v(0, 0, -13));
    q.path.begin(HERO); q.follow.start(q.vel); line(q.path, f, 400, 320, 520, 300, 30);
    try {
      names.forEach((n, i) => { g[n] = new Proxy(saved[i] as object, { construct(t, a, nt) { made++; return Reflect.construct(t as never, a, nt); } }); });
      for (let i = 0; i < 400; i++) { r.step(ctx); q.step(ctx); }
    } finally { names.forEach((n, i) => { g[n] = saved[i]; }); }
    expect(made).toBe(0);
    const src = readFileSync('src/game/gesture/pathFollow.ts', 'utf8');
    for (const m of ['step', 'stepFollow', 'handoff', 'enterExit', 'stepExit', 'ease', 'stepNudge', 'out', 'idle']) {
      const at = src.search(new RegExp(`\\n  (private )?${m}\\(`));
      expect(at, m).toBeGreaterThan(0);
      let i = src.indexOf('{', src.indexOf(')', at)), depth = 0, end = i;
      for (; end < src.length; end++) { if (src[end] === '{') depth++; if (src[end] === '}' && --depth === 0) break; }
      const body = src.slice(i, end);
      expect(body, m).not.toMatch(/\bnew\s/); expect(body, m).not.toMatch(/[=(,:?]\s*[{[]/); expect(body, m).not.toMatch(/\.\.\./);
    }
  });
});
