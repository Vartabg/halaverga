import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FOOT, type Vec } from '../src/game/motion';
import { clearGesture, gesture } from '../src/game/gesture/bus';
import { gestureVelocity } from '../src/game/gesture/applyGesture';
import { DrawPath, FLOOR_CLEAR_M, GROUND_SKIP_M, type SweepCast } from '../src/game/gesture/drawPath';
import { createDrawScheme, STUB_MS } from '../src/game/gesture/drawScheme';
import { FOLLOW, IDLE, LANDING, PATH_BLOCKED } from '../src/game/gesture/pathFollow';
import { project } from '../src/game/gesture/screenRay';
import { createStrokeBuffer } from '../src/game/gesture/strokeBuffer';
import type { GestureCtx, StrokeClass } from '../src/game/gesture/types';
import { DRAW_BLEND_M, DRAW_SPACING, SWEEP_RADIUS } from '../src/game/gesture/tuning';
import { NEAR_M, RIBBON_GAP_M, createRibbon, writeRibbon } from '../src/world/GestureRibbon';
import type { RibbonPath } from '../src/ui/gesture/guideSteps';
import { CAM, HERO, frameAt, line } from './draw-harness';
// Playtest fixes for Draw (2026-09-24 emulation findings): a first stroke from the ground, the blocked stub, the ribbon wedge, the
// landing retarget spacing, and a host landing (Land, Space) that must drop the path.

const DT = 1 / 60;
const v = (x: number, y: number, z: number): Vec => ({ x, y, z });
const GROUND_Y = HERO.y - FOOT;
const cls: StrokeClass = { kind: 'swipe', dir: null, angle: 0, magnitude: 0, winding: 0, speed: 0, chordX: 0, chordY: 0 };
function ctxOf(over: Partial<GestureCtx> = {}): GestureCtx {
  return { canLand: () => true, pathClear: () => true, groundBelow: () => Infinity, clock: 0, land: () => {}, say: vi.fn(), ...over };
}
/** A mocked FlightSafety ball sweep over a flat terrace at GROUND_Y: the fraction of a -> b before the ball touches it. */
const terrace: SweepCast = (a, b) => {
  const floor = GROUND_Y + SWEEP_RADIUS;
  if (a.y < floor - 1e-6) return 0;
  if (b.y >= floor - 1e-6) return 1;
  return (a.y - floor) / (a.y - b.y);
};
const segments = (p: DrawPath) => {
  const out: number[] = [], a = v(0, 0, 0), b = v(0, 0, 0);
  for (let i = p.ring.first + 1; i < p.ring.count; i++) { p.ring.get(i - 1, a); p.ring.get(i, b); out.push(Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z)); }
  return out;
};

beforeEach(() => { clearGesture(); gesture.scheme = 'draw'; gesture.override = false; });
afterEach(() => { clearGesture(); gesture.scheme = 'off'; });

describe('Draw: the first stroke from the ground', () => {
  // The hero stands on the terrace; the camera sits behind and above, looking level. The old ghost's curve starts below the hero.
  const f = frameAt(CAM), hero = { x: 0, y: 0 };
  project(f, HERO, hero);
  const ghostLike = (p: DrawPath) => { // down-left from the hero's feet, then up and away (the stroke that was blocked at once)
    line(p, f, hero.x, hero.y + 40, hero.x - 60, hero.y + 90, 12);
    line(p, f, hero.x - 60, hero.y + 90, hero.x + 160, hero.y - 120, 30, 200);
  };

  it('is blocked at once without the ground fix (the regression the playtest saw)', () => {
    const p = new DrawPath(); p.begin(HERO); ghostLike(p);
    p.sweep(terrace, 60);
    expect(p.blocked).toBe(true);
    expect(p.ring.endArc).toBeLessThan(2);
  });

  it('floors the early ink above the terrace, never points the first segment down, and flies the whole stroke', () => {
    const p = new DrawPath(); p.begin(HERO, FOOT); ghostLike(p);
    expect(p.sweptArc).toBe(GROUND_SKIP_M); // the take-off, with the ball already touching the terrace, is not swept
    p.release(null, 0, 0);
    for (let k = 0; k < 20; k++) p.sweep(terrace, 4);
    expect(p.blocked).toBe(false);
    const floor = GROUND_Y + FOOT + SWEEP_RADIUS + FLOOR_CLEAR_M, q = v(0, 0, 0), prev = v(0, 0, 0);
    for (let i = 1; i < p.ring.count; i++) {
      p.ring.get(i - 1, prev); p.ring.get(i, q);
      expect(q.y, `point ${i}`).toBeGreaterThanOrEqual(HERO.y - 1e-3); // never below the start: no dip toward the terrace
      if (p.ring.arcOf(i) > DRAW_BLEND_M) expect(q.y, `point ${i}`).toBeGreaterThan(floor - 0.5); // standing: held all stroke
    }
    expect(p.ring.get(1, q).y).toBeGreaterThanOrEqual(HERO.y);
    expect(p.ring.endArc).toBeGreaterThan(30);
  });

  it('hovering low, the floor fades after the first stretch, so a dive from the air still dives', () => {
    const p = new DrawPath(), hover = { ...HERO, y: HERO.y + 3 };
    p.begin(hover, FOOT + 3); ghostLike(p); p.release(null, 0, 0);
    expect(p.floorHold).toBe(false);
    let low = Infinity; const q = v(0, 0, 0);
    for (let i = 0; i < p.ring.count; i++) if (p.ring.arcOf(i) > 2 * DRAW_BLEND_M) low = Math.min(low, p.ring.get(i, q).y);
    expect(low).toBeLessThan(GROUND_Y + FOOT + SWEEP_RADIUS); // past 24 m the ink is its own again
  });

  it('the scheme reads the ground from ctx: a grounded start lifts, requests lift off, and reports the curve, then a chain', () => {
    const guide = vi.fn(), path = new DrawPath(), s = createDrawScheme({ frame: () => f, view: { yaw: 0, pitch: 0 }, guide }, path);
    const ctx = ctxOf({ groundBelow: () => FOOT }), buf = createStrokeBuffer(), pos = { ...HERO };
    s.step(DT, pos, ctx);
    buf.begin(1, 'touch', hero.x, hero.y + 40, 0); s.down(buf);
    for (let i = 1; i <= 12; i++) { buf.push(hero.x + i * 12, hero.y + 40 - i * 14, i * 16); s.move(buf); s.step(DT, pos, ctx); }
    expect(path.sweptArc).toBeGreaterThanOrEqual(GROUND_SKIP_M); // the grounded begin (ctx.groundBelow was cached by step)
    expect(guide).toHaveBeenCalledWith('curve');
    expect(gesture.request).toEqual({ kind: 'lift' });
    s.up(buf, cls);
    const air = ctxOf();
    pos.y += 6; s.step(DT, pos, air);
    expect(s.follow.mode).toBe(FOLLOW);
    buf.begin(2, 'touch', 400, 300, 400); s.down(buf);
    for (let i = 1; i <= 6; i++) { buf.push(400 + i * 12, 300 - i * 6, 400 + i * 16); s.move(buf); }
    expect(guide).toHaveBeenLastCalledWith('chain');
    expect(path.floorY).toBe(-Infinity); // airborne, far from the ground: no floor
  });

  it('a block keeps an amber stub past the cut on the ribbon for STUB_MS, so the block reads as a block', () => {
    const path = new DrawPath(), s = createDrawScheme({ frame: () => f, view: { yaw: 0, pitch: 0 } }, path);
    path.begin(HERO); line(path, f, 400, 320, 560, 250, 20);
    const wall = HERO.z - 1.5, now = performance.now();
    path.sweep((a, b) => (b.z < wall ? Math.max(0, (a.z - wall) / (a.z - b.z)) : 1), 4, now);
    expect(path.blocked).toBe(true);
    const rb = s.ribbon, ringN = path.ring.count - path.ring.first;
    expect(rb.count).toBe(ringN + 1); expect(rb.blocked).toBe(ringN - 1);
    expect(rb.z(ringN)).toBeLessThan(wall); // the stub runs into the wall
    expect(now - rb.t(ringN)).toBeGreaterThanOrEqual(150); // shown at once (older than the screen-ink tail)
    path.blockedAt = now - STUB_MS - 1;
    expect(rb.count).toBe(ringN);
  });
});

describe('Draw: the world ribbon never draws a wedge', () => {
  const mock = (pts: Vec[], flown = 0): RibbonPath => ({ count: pts.length, seq0: 0, flown, blocked: -1,
    x: i => pts[i].x, y: i => pts[i].y, z: i => pts[i].z, t: () => 0 });
  it('splits the strip at a segment longer than RIBBON_GAP_M instead of joining a far point', () => {
    const pts = Array.from({ length: 10 }, (_, i) => v(i * 1.5, 20, -i));
    pts[5] = v(60, 80, -200); // a stale far point
    const b = createRibbon(), n = writeRibbon(b, mock(pts), 1000, { x: 0, y: 40, z: 80 }, false);
    expect(n).toBe((9 - 2) * 6); // segments 4-5 and 5-6 are dropped
    for (let k = 0; k < n; k += 3) {
      const [a, c] = [b.index[k], b.index[k + 2]], j0 = Math.floor(Math.min(a, c) / 2), j1 = Math.floor(Math.max(a, b.index[k + 1], c) / 2);
      const d = Math.hypot(pts[j1].x - pts[j0].x, pts[j1].y - pts[j0].y, pts[j1].z - pts[j0].z);
      expect(d).toBeLessThanOrEqual(RIBBON_GAP_M);
    }
  });
  it('fades points at the lens to nothing', () => {
    const cam = { x: 0, y: 20, z: 0 }, pts = Array.from({ length: 6 }, (_, i) => v(0, 20, -i * 1.5 + 3));
    const b = createRibbon();
    writeRibbon(b, mock(pts), 1000, cam, false);
    expect(b.col[2 * 8 + 3]).toBe(0); // point 2 sits on the camera
    expect(b.col[5 * 8 + 3]).toBeGreaterThan(0.5); // 4.5 m away
    expect(NEAR_M).toBeGreaterThan(0);
  });
  it('a landing retarget never stretches a ring segment past 2x the spacing, near or far', () => {
    for (const [dy, dz] of [[3, 0], [8, 4], [6, 40], [10, 90]]) {
      const p = new DrawPath(), f = frameAt(CAM), drop = `${dy}/${dz}`;
      p.begin(HERO); line(p, f, 400, 320, 520, 360, 40); p.release(null, 0, 0); p.pendingEnd = false;
      const e = p.ring.last(v(0, 0, 0));
      p.finish({ point: v(e.x + dz * 0.2, e.y - dy, e.z - dz), normal: v(0, 1, 0) });
      expect(p.wantsLand).toBe(true);
      expect(Math.max(...segments(p)), `drop ${drop}`).toBeLessThanOrEqual(2 * DRAW_SPACING + 1e-6);
      const end = p.ring.last(v(0, 0, 0));
      expect(Math.hypot(end.x - p.land.x, end.y - p.land.y - FOOT - 1.2, end.z - p.land.z), `drop ${drop}`).toBeLessThan(0.5);
    }
  });
});

describe('Draw: a host landing drops the path', () => {
  const setup = (flying = { on: true }) => {
    const f = frameAt(CAM), path = new DrawPath(), say = vi.fn();
    const s = createDrawScheme({ frame: () => f, view: { yaw: 0, pitch: -0.1 }, flying: () => flying.on }, path);
    const ctx = ctxOf({ say }), buf = createStrokeBuffer(), pos = { ...HERO };
    s.step(DT, pos, ctx);
    buf.begin(1, 'touch', 400, 320, 0); s.down(buf);
    for (let i = 1; i <= 20; i++) { buf.push(400 + i * 10, 320 - i * 3, i * 16); s.move(buf); s.step(DT, pos, ctx); pos.z -= 0.25; }
    s.up(buf, cls); path.finish(null);
    return { f, path, s, ctx, pos, say };
  };
  it('never lets a path velocity drive a grounded suit', () => {
    gesture.velocityOn = true; gesture.velocity.x = 9;
    const w = v(0, 0, 0);
    expect(gestureVelocity(w, null, false)).toBe(false); expect(w.x).toBe(0);
    expect(gestureVelocity(w, null, true)).toBe(true); expect(w.x).toBe(9);
  });
  it('Land or Space (clearGesture) stops following at once: no slow abort, no Path blocked, no glide', () => {
    const { path, s, ctx, pos, say } = setup();
    expect(s.follow.mode).toBe(FOLLOW);
    clearGesture(); // what Player's lift block does next to setting the landing goal
    for (let i = 0; i < 90; i++) { s.step(DT, pos, ctx); pos.z -= 0.02; } // the landing approach is slow
    expect(s.follow.mode).toBe(IDLE); expect(gesture.velocityOn).toBe(false);
    expect(path.ring.count).toBe(0); expect(say).not.toHaveBeenCalledWith(PATH_BLOCKED);
  });
  it('a rooftop hand-off fades the ribbon and drops the path once the suit has touched down', () => {
    const flying = { on: true }, { path, s, ctx, pos } = setup(flying);
    s.follow.mode = LANDING; gesture.landArmed = true;
    expect(s.ribbon.flown).toBe(s.ribbon.count); // every point spent: the ribbon fades behind the hero
    flying.on = false; s.step(DT, pos, ctx);
    expect(s.follow.mode).toBe(IDLE); expect(path.ring.count).toBe(0); expect(s.ribbon.count).toBe(0);
  });
});
