import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import type { Vec } from '../src/game/motion';
import { clearGesture, gesture } from '../src/game/gesture/bus';
import { DrawPath } from '../src/game/gesture/drawPath';
import { turnMax } from '../src/game/gesture/drawRing';
import { TURTLE_R, WRAP_M_PER_PX, WRAP_MIN_R, WrapTurtle, headingOf } from '../src/game/gesture/drawWrap';
import { FOLLOW, PathFollow } from '../src/game/gesture/pathFollow';
import { wrapAngle } from '../src/game/gesture/strokeBuffer';
import type { AimFrame, GestureCtx } from '../src/game/gesture/types';
import { DRAW_MAX_PTS, FLIGHT_SPEED } from '../src/game/gesture/tuning';
import { CAM, HERO, frameAt } from './draw-harness';
// Draw wrap (turn-360 spec 1.8): the real DrawStroke / DrawPath on a still 65 degree camera, phone landscape and portrait. Node
// math on the real modules, not a device check.

const DT = 1 / 60, DEG = Math.PI / 180, N = DRAW_MAX_PTS;
const VIEWS = [[852, 393], [393, 852]] as const;
const v = (x: number, y: number, z: number): Vec => ({ x, y, z });
const frame = (w: number, h: number): AimFrame => { const f = frameAt(CAM); f.width = w; f.height = h; f.aspect = w / h; return f; };
/** Screen loops from the top, clockwise on screen (y down) for dir 1: radius r0 -> r1, the centre rising `rise` px per turn. */
function loops(p: DrawPath, f: AimFrame, turns: number, r0: number, r1 = r0, rise = 0, dir = 1, perTurn = 48, onSample?: () => void) {
  const cx = f.width / 2, cy = f.height / 2 + (rise ? rise * turns / 2 : 0), n = Math.round(turns * perTurn);
  for (let i = 0; i <= n; i++) {
    const u = i / n, a = -Math.PI / 2 + dir * u * turns * 2 * Math.PI, r = r0 + (r1 - r0) * u;
    p.append(cx + r * Math.cos(a), cy - rise * turns * u + r * Math.sin(a), i * 1000 / 60, f);
    onSample?.();
  }
}
/** Signed winding of the ring's horizontal tangent, rad (+ = left, as yaw). */
function tangentWinding(p: DrawPath, from = p.ring.first) {
  const r = p.ring;
  let sum = 0, last = NaN;
  for (let i = from; i < r.count - 1; i++) {
    const a = i % N, b = (i + 1) % N, dx = r.x[b] - r.x[a], dz = r.z[b] - r.z[a];
    if (Math.hypot(dx, dz) < 0.2) continue;
    const h = headingOf(dx, dz);
    if (!Number.isNaN(last)) sum += wrapAngle(h - last);
    last = h;
  }
  return sum;
}
/** Largest |revolutions| the ring's horizontal polyline makes about any local centre (the mean of each 12-point window). */
function maxRevolutions(p: DrawPath) {
  const r = p.ring;
  let worst = 0;
  for (let c = r.first; c + 12 <= r.count; c++) {
    let cx = 0, cz = 0;
    for (let k = c; k < c + 12; k++) { cx += r.x[k % N] / 12; cz += r.z[k % N] / 12; }
    let sum = 0, last = NaN;
    for (let i = r.first; i < r.count; i++) {
      const dx = r.x[i % N] - cx, dz = r.z[i % N] - cz;
      if (Math.hypot(dx, dz) < 1e-3) continue;
      const h = Math.atan2(dx, dz);
      if (!Number.isNaN(last)) sum += wrapAngle(h - last);
      last = h;
    }
    worst = Math.max(worst, Math.abs(sum) / (2 * Math.PI));
  }
  return worst;
}
/** Largest 3D turn between successive ring segments. */
function maxTurn(p: DrawPath) {
  const r = p.ring;
  let worst = 0;
  for (let i = r.first + 1; i < r.count - 1; i++) {
    const a = (i - 1) % N, b = i % N, c = (i + 1) % N;
    const ux = r.x[b] - r.x[a], uy = r.y[b] - r.y[a], uz = r.z[b] - r.z[a], wx = r.x[c] - r.x[b], wy = r.y[c] - r.y[b], wz = r.z[c] - r.z[b];
    const cos = (ux * wx + uy * wy + uz * wz) / (Math.hypot(ux, uy, uz) * Math.hypot(wx, wy, wz));
    worst = Math.max(worst, Math.acos(Math.max(-1, Math.min(1, cos))));
  }
  return worst;
}

describe('WrapTurtle', () => {
  it('accumulates winding like strokeBuffer and enters at 150 degrees', () => {
    const t = new WrapTurtle();
    for (let i = 0; i <= 20; i++) { const a = i / 48 * 2 * Math.PI; t.feed(100 + 80 * Math.cos(a), 100 + 80 * Math.sin(a)); }
    expect(t.winding / DEG).toBeGreaterThan(130); expect(t.ready).toBe(false);
    for (let i = 21; i <= 24; i++) { const a = i / 48 * 2 * Math.PI; t.feed(100 + 80 * Math.cos(a), 100 + 80 * Math.sin(a)); }
    expect(t.ready).toBe(true);
    t.reset(); expect(t.winding).toBe(0); expect(t.on).toBe(false);
  });
  it('takes the entry debt the way the finger circles, paid off over 90 px', () => {
    const out = v(0, 0, 0), id = (q: Vec) => q, t = new WrapTurtle();
    t.winding = 150 * DEG; t.enter(v(0, 10, 0), 0, 0, 40 * DEG);   // clockwise: ideal -150, at +40: owes -190 (not +170)
    t.advance(0, 0, out, id); expect(t.wanted).toBeCloseTo(40 * DEG, 9);
    t.advance(90, 0, out, id); expect(t.wanted).toBeCloseTo(-150 * DEG, 9);
    // The turtle trails what the ink asks for by the TURTLE_R arc limit: 90 px walks 3.15 m, at most 3.15 / TURTLE_R rad.
    expect(t.heading).toBeCloseTo(40 * DEG - 90 * WRAP_M_PER_PX / TURTLE_R, 9);
    expect(t.owed).toBeCloseTo(t.wanted - t.heading, 12); expect(t.owed).toBeLessThan(0);
    t.reset(); t.winding = -150 * DEG; t.enter(v(0, 10, 0), 0, 0, 100 * DEG);   // counter-clockwise: ideal +150, owes +50
    for (let i = 0; i < 9; i++) t.advance(10, 0, out, id);
    expect(t.wanted).toBeCloseTo(150 * DEG, 9); expect(t.heading).toBeCloseTo(150 * DEG, 9);
    t.reset(); t.winding = 10 * DEG; t.enter(v(0, 10, 0), 0, 0, -10 * DEG);   // already on the ideal heading: nothing owed
    expect(Math.abs(t.owed)).toBeLessThan(1e-12);
  });
});

describe('Draw wrap: a circle turns you around', () => {
  for (const [w, h] of VIEWS) {
    it(`a radius-80 circle winds the tangent 360 degrees, never tighter than 2.5 m (${w} x ${h})`, () => {
      const p = new DrawPath(), f = frame(w, h);
      p.begin(HERO); loops(p, f, 1, 80); p.release(null, 0, 0);
      expect(p.wrapped).toBe(true); expect(p.wrapping).toBe(false);
      expect(Math.abs(tangentWinding(p) / DEG + 360)).toBeLessThanOrEqual(25);   // clockwise on screen turns right
      const r = p.ring;
      for (let i = r.first + 1; i < r.count - 1; i++) expect(r.radius[i % N]).toBeGreaterThanOrEqual(WRAP_MIN_R - 1e-3);
      expect(p.ring.spins).toBe(0);   // a wrap is a turn, not a barrel roll
    });
    it(`a 1.5-turn spiral winds 540 degrees (${w} x ${h})`, () => {
      const p = new DrawPath(), f = frame(w, h);
      p.begin(HERO); loops(p, f, 1.5, 60, 110, 0, -1, 48); p.release(null, 0, 0);
      expect(Math.abs(tangentWinding(p) / DEG - 540)).toBeLessThanOrEqual(35);   // counter-clockwise turns left
    });
    it(`an upward spring climbs as it turns (${w} x ${h})`, () => {
      const p = new DrawPath(), f = frame(w, h);
      let entry = -1, entryY = 0;
      p.begin(HERO);
      loops(p, f, 3, 70, 70, 50, 1, 48, () => { if (entry < 0 && p.wrapping) { entry = p.ring.count; entryY = p.ring.y[(entry - 1) % N]; } });
      p.release(null, 0, 0);
      expect(entry).toBeGreaterThan(0);
      let top = -Infinity;
      for (let i = entry; i < p.ring.count; i++) top = Math.max(top, p.ring.y[i % N]);
      expect(top - entryY).toBeGreaterThanOrEqual(2);
      expect(Math.abs(tangentWinding(p) / DEG + 1080)).toBeLessThanOrEqual(60);
    });
    it(`enters continuously: no turn between segments above turnMax(2.5 m) (${w} x ${h})`, () => {
      const p = new DrawPath(), f = frame(w, h);
      p.begin(HERO); loops(p, f, 1.25, 80);
      expect(p.wrapping).toBe(true);
      expect(maxTurn(p)).toBeLessThanOrEqual(turnMax(WRAP_MIN_R) + 1e-6);
      p.release(null, 0, 0);
      expect(maxTurn(p)).toBeLessThanOrEqual(turnMax(WRAP_MIN_R) + 1e-6);
    });
  }

  it('leaves a swoop under 150 degrees of winding exactly as before (ring snapshot from the pre-wrap code)', () => {
    // Recorded from b649104 (before the wrap): count, then every third point's x, y, z to 4 decimals.
    const before = [
      [38, 0, 21, 62, -2.3313, 21.9056, 58.2711, -4.0639, 23.2275, 54.3377, -5.2828, 24.8085, 50.3081, -5.7835, 26.6316, 46.2343,
        -4.2292, 28.6381, 42.5766, -1.5599, 30.1328, 39.2865, 1.6349, 30.9031, 36.2213, 5.0967, 30.8984, 33.3544, 8.6121, 30.1305,
        30.6596, 11.8645, 28.8216, 28.2238, 15.2757, 27.3742, 25.6706, 18.687, 25.9269, 23.1175],
      [33, 0, 21, 62, -1.1659, 21.8055, 57.7318, -1.9318, 22.7372, 53.3974, -2.3874, 23.742, 49.0357, -2.4002, 24.8034, 44.6661,
        -1.1998, 25.8031, 40.4589, 0.6616, 26.3595, 36.4052, 2.8644, 26.299, 32.4863, 4.9482, 25.6385, 29.0748, 7.2542, 24.6763,
        25.3323, 9.5602, 23.7141, 21.5898],
    ];
    VIEWS.forEach(([w, h], k) => {
      const p = new DrawPath(), f = frame(w, h), cx = w * 0.5, cy = h * 0.5 + 60, R = Math.min(w, h) * 0.35;
      p.begin(HERO);
      for (let i = 0; i <= 40; i++) { const a = Math.PI * (0.9 - 0.6 * i / 40); p.append(cx + R * Math.cos(a), cy - R * Math.sin(a), i * 1000 / 60, f); }
      p.release(null, 0, 0);
      expect(p.wrapped).toBe(false);
      const r = p.ring, got: number[] = [r.count];
      for (let i = r.first; i < r.count; i += 3) got.push(+r.x[i % N].toFixed(4), +r.y[i % N].toFixed(4), +r.z[i % N].toFixed(4));
      expect(got).toEqual(before[k]);
    });
  });

  it('a knot (hairpins and tiny scribbles) never orbits a point more than once and never fills the ring', () => {
    for (const [w, h] of VIEWS) {
      const f = frame(w, h), cx = w / 2, cy = h / 2;
      const zig = new DrawPath();   // sharp hairpins: cusps add no winding, so this stays on the rays and each target lands behind
      zig.begin(HERO);
      for (let i = 0; i <= 64; i++) { const u = (i % 8) / 4, x = u <= 1 ? u : 2 - u; zig.append(cx - 20 + 40 * x, cy - i * 0.5, i * 1000 / 60, f); }
      zig.release(null, 0, 0);
      const knot = new DrawPath();  // tiny tight loops that wrap, far inside the 2.5 m turning circle, alternating direction
      knot.begin(HERO);
      for (let i = 0; i <= 240; i++) {
        const turn = Math.floor(i / 24), a = (turn % 2 ? -1 : 1) * (i % 24) / 24 * 2 * Math.PI;
        knot.append(cx + 20 * Math.sin(a) + turn * 3, cy - 20 * Math.cos(a), i * 1000 / 60, f);
      }
      knot.release(null, 0, 0);
      for (const p of [zig, knot]) {
        expect(p.full).toBe(false);
        expect(p.ring.count - p.ring.first).toBeLessThan(N - 1);
        expect(maxRevolutions(p)).toBeLessThanOrEqual(1.05);
      }
    }
  });
});

describe('Draw wrap: flying it', () => {
  beforeEach(() => { clearGesture(); gesture.scheme = 'draw'; gesture.override = false; });
  afterEach(() => { clearGesture(); gesture.scheme = 'off'; });
  const ctx = (): GestureCtx => ({ canLand: () => true, pathClear: () => true, groundBelow: () => Infinity, clock: 0, land: () => {}, say: vi.fn() });

  for (const [w, h] of VIEWS) {
    it(`a radius-70 circle turns the hero through 360 degrees in 2.3 s or less, the view turning while inking (${w} x ${h})`, () => {
      const path = new DrawPath(), view = { yaw: 0, pitch: -0.1 }, follow = new PathFollow(path, view), c = ctx(), f = frame(w, h);
      const pos = { ...HERO }, vel = v(0, 0, -FLIGHT_SPEED);
      let t = 0, turned = 0, lastH = headingOf(vel.x, vel.z), done = -1, inkYaw = 0, peak = 0, entryArc = -1, t0 = -1, fromDown = -1;
      const step = () => {
        if (entryArc < 0 && path.wrapping) entryArc = path.ring.endArc;
        follow.step(DT, pos, vel, c);
        if (gesture.velocityOn) { vel.x = gesture.velocity.x; vel.y = gesture.velocity.y; vel.z = gesture.velocity.z; }
        pos.x += vel.x * DT; pos.y += vel.y * DT; pos.z += vel.z * DT;
        view.yaw += gesture.yawRate * DT; view.pitch += gesture.pitchRate * DT; t += DT;
        if (path.wrapping) inkYaw = Math.max(inkYaw, Math.abs(gesture.yawRate));
        peak = Math.max(peak, Math.abs(gesture.yawRate));
        if (Math.hypot(vel.x, vel.z) > 1) { const hh = headingOf(vel.x, vel.z); turned += wrapAngle(hh - lastH); all += wrapAngle(hh - lastH); lastH = hh; }
        if (t0 < 0 && entryArc >= 0 && follow.s >= entryArc) { t0 = t; turned = 0; }
        if (t0 >= 0 && done < 0 && Math.abs(turned) >= 2 * Math.PI) done = t - t0;
        if (fromDown < 0 && Math.abs(all) >= 2 * Math.PI) fromDown = t;
      };
      let all = 0;
      path.begin(HERO); follow.start(vel);
      loops(path, f, 2, 70, 70, 0, 1, 48, step);
      path.release(null, 0, 0);
      for (let i = 0; i < 600 && follow.mode === FOLLOW && (done < 0 || fromDown < 0); i++) step();
      test360.push(`${w}x${h}: ${done.toFixed(2)} s from the wrap entry (${fromDown.toFixed(2)} s from pen-down), peak yawRate ${peak.toFixed(2)}`);
      expect(done).toBeGreaterThan(0); expect(done).toBeLessThanOrEqual(2.3);
      expect(turned).toBeLessThan(0);   // clockwise on screen turns right
      expect(inkYaw).toBeGreaterThan(0.5);
      expect(peak).toBeLessThanOrEqual(6 + 1e-9);
    });
  }
  const test360: string[] = [];
  afterEach(() => { if (test360.length) console.info(`draw wrap 360: ${test360.join('; ')}`); test360.length = 0; });
});

describe('draw wrap modules', () => {
  it('stay under their line budgets, three-free and random-free', () => {
    for (const [f, max] of [['src/game/gesture/drawWrap.ts', 199], ['src/game/gesture/drawStroke.ts', 160],
      ['src/game/gesture/drawRing.ts', 195], ['src/game/gesture/pathFollow.ts', 199]] as const) {
      const src = readFileSync(f, 'utf8');
      expect(src.split('\n').length, f).toBeLessThanOrEqual(max);
      expect(src, f).not.toMatch(/from 'three'/); expect(src, f).not.toMatch(/Math\.random/);
    }
  });
});
