import { describe, expect, it, vi } from 'vitest';
import { OneEuro, OneEuro2 } from '../src/game/gesture/oneEuro';
import { catmullRom, circumradius, minRadius, rdp, resampleEven, resampleStroke } from '../src/game/gesture/resample';
import { StrokeBuffer } from '../src/game/gesture/strokeBuffer';

const circleStroke = (buf: StrokeBuffer, r: number, deg: number, n: number, dtMs: number, cx = 300, cy = 400) => {
  buf.begin(1, 'touch', cx + r, cy, 1000);
  for (let i = 1; i <= n; i++) { const a = (deg * Math.PI / 180) * (i / n); buf.push(cx + r * Math.cos(a), cy + r * Math.sin(a), 1000 + i * dtMs); }
  return buf;
};

describe('strokeBuffer', () => {
  it('tracks arc, chord, bbox, travel and straightness', () => {
    const b = new StrokeBuffer().begin(3, 'mouse', 0, 0, 100);
    b.push(30, 0, 110); b.push(30, 40, 120);
    expect(b.pointerId).toBe(3); expect(b.kind).toBe('mouse');
    expect(b.count).toBe(3); expect(b.arc).toBeCloseTo(70); expect(b.chord).toBeCloseTo(50);
    expect(b.straightness).toBeCloseTo(50 / 70);
    expect([b.minX, b.minY, b.maxX, b.maxY]).toEqual([0, 0, 30, 40]);
    expect(b.travel).toBeCloseTo(50);
    expect([b.x(2), b.y(2), b.t(2)]).toEqual([30, 40, 120]);
  });

  it('winding is signed: clockwise on screen (y down) is positive, with 4 px segments', () => {
    const b = circleStroke(new StrokeBuffer(), 40, 360, 90, 5);
    expect(b.winding).toBeGreaterThan(340); expect(b.winding).toBeLessThan(365);
    const c = circleStroke(new StrokeBuffer(), 40, -360, 90, 5);
    expect(c.winding).toBeLessThan(-340);
    const tiny = new StrokeBuffer().begin(1, 'touch', 0, 0, 0);
    for (let i = 1; i < 40; i++) tiny.push(Math.cos(i) * 1.5, Math.sin(i) * 1.5, i);
    expect(tiny.winding).toBe(0);
  });

  it('a reversal (cusp) adds no winding', () => {
    const b = new StrokeBuffer().begin(1, 'touch', 0, 0, 0);
    for (let i = 1; i <= 10; i++) b.push(i * 10, 0, i * 10);
    for (let i = 1; i <= 10; i++) b.push(100 - i * 10, 0.5, 100 + i * 10);
    expect(Math.abs(b.winding)).toBeLessThan(5); // only the 3 deg step onto y 0.5 remains, not +-177
  });

  it('speed over 60 and 150 ms windows', () => {
    const b = new StrokeBuffer().begin(1, 'touch', 0, 0, 0);
    for (let i = 1; i <= 20; i++) b.push(i < 12 ? i * 2 : 22 + (i - 11) * 10, 0, i * 10); // 0.2 px/ms, then 1 px/ms
    expect(b.speed60).toBeCloseTo(1, 5);
    expect(b.speed150).toBeGreaterThan(0.2); expect(b.speed150).toBeLessThan(1);
  });

  it('the ring keeps the newest 512 samples in order while running values span the whole stroke', () => {
    const b = new StrokeBuffer().begin(1, 'touch', 0, 0, 0);
    for (let i = 1; i < 800; i++) b.push(i, 0, i);
    expect(b.count).toBe(512);
    expect(b.x(0)).toBe(800 - 512); expect(b.x(511)).toBe(799); expect(b.t(511)).toBe(799);
    expect(b.startX).toBe(0); expect(b.arc).toBeCloseTo(799); expect(b.travel).toBe(799);
  });

  it('push allocates no typed arrays, and time never runs backwards', () => {
    const b = new StrokeBuffer().begin(1, 'touch', 0, 0, 0);
    const spy = vi.spyOn(globalThis, 'Float32Array');
    for (let i = 1; i < 600; i++) { b.push(i, i % 7, i); void b.speed60; }
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
    b.push(0, 0, 10);
    expect(b.lastT).toBe(599);
  });
});

describe('oneEuro', () => {
  it('step response: no overshoot, settles quickly, and the first sample passes through', () => {
    const f = new OneEuro();
    expect(f.filter(0, 0)).toBe(0);
    let t = 0, y = 0, prev = 0, reached = -1;
    for (let k = 1; k <= 120; k++) {
      t = k * 1000 / 60; y = f.filter(100, t);
      expect(y).toBeGreaterThanOrEqual(prev - 1e-9); expect(y).toBeLessThanOrEqual(100 + 1e-9);
      if (reached < 0 && y >= 95) reached = t;
      prev = y;
    }
    expect(reached).toBeGreaterThan(0); expect(reached).toBeLessThan(600);
    expect(y).toBeGreaterThan(99.5);
  });

  it('beta makes it faster on a step; a still, jittery pointer is smoothed', () => {
    const slow = new OneEuro(1, 0), fast = new OneEuro(1, 0.05);
    slow.filter(0, 0); fast.filter(0, 0);
    expect(fast.filter(100, 16.7)).toBeGreaterThan(slow.filter(100, 16.7));
    const f = new OneEuro2();
    let a = 7, maxDev = 0;
    for (let k = 0; k < 240; k++) {
      a = (a * 16807) % 2147483647;
      const j = (a / 2147483647) * 2 - 1;
      f.filter(200 + j, 300 - j, k * 1000 / 120);
      if (k > 60) maxDev = Math.max(maxDev, Math.abs(f.x - 200), Math.abs(f.y - 300));
    }
    expect(maxDev).toBeLessThan(0.5);
  });

  it('ignores a non-advancing timestamp and resets', () => {
    const f = new OneEuro();
    f.filter(10, 0); const v = f.filter(20, 16);
    expect(f.filter(99, 16)).toBe(v);
    f.reset(); expect(f.filter(-5, 100)).toBe(-5);
  });
});

describe('resample', () => {
  it('resampleStroke gives exactly 64 points with spacing within 1%, first and last on the stroke ends', () => {
    const out = new Float32Array(128);
    for (const [r, deg] of [[80, 300], [30, 360], [120, 90]] as const) {
      const b = circleStroke(new StrokeBuffer(), r, deg, 200, 4);
      expect(resampleStroke(b, out)).toBe(64);
      const gaps: number[] = [];
      for (let i = 1; i < 64; i++) gaps.push(Math.hypot(out[i * 2] - out[i * 2 - 2], out[i * 2 + 1] - out[i * 2 - 1]));
      const mean = gaps.reduce((s, g) => s + g, 0) / gaps.length;
      for (const g of gaps) expect(Math.abs(g / mean - 1), `r ${r}`).toBeLessThan(0.01);
      expect(out[0]).toBeCloseTo(b.startX, 3); expect(out[1]).toBeCloseTo(b.startY, 3);
      expect(out[126]).toBeCloseTo(b.lastX, 3); expect(out[127]).toBeCloseTo(b.lastY, 3);
    }
    const line = new StrokeBuffer().begin(1, 'touch', 0, 0, 0); line.push(0, 0, 5);
    expect(resampleStroke(line, out)).toBe(64);
    expect(out[127]).toBe(0);
  });

  it('rdp keeps the corners of a jittered L and drops the noise', () => {
    const src = new Float32Array(200 * 2);
    for (let i = 0; i < 100; i++) { src[i * 2] = i; src[i * 2 + 1] = (i % 2) * 0.8; }
    for (let i = 0; i < 100; i++) { src[200 + i * 2] = 100 + (i % 2) * 0.8; src[201 + i * 2] = i + 1; }
    const out = new Float32Array(400);
    expect(rdp(src, 200, 2, 2, out)).toBe(3);
    expect(Math.hypot(out[2] - 100, out[3])).toBeLessThan(2.5);
    expect([out[4], out[5]]).toEqual([src[398], src[399]]);
  });

  it('catmullRom samples 3D points at the given spacing and ends on the last point', () => {
    const src = new Float32Array([0, 0, 0, 10, 2, 0, 20, 0, 5, 30, 3, 5]);
    const out = new Float32Array(96 * 3);
    const n = catmullRom(src, 4, 3, 1.5, out);
    expect(n).toBeGreaterThan(20); expect(n).toBeLessThanOrEqual(96);
    for (let i = 1; i < n - 1; i++) {
      const d = Math.hypot(out[i * 3] - out[i * 3 - 3], out[i * 3 + 1] - out[i * 3 - 2], out[i * 3 + 2] - out[i * 3 - 1]);
      expect(Math.abs(d - 1.5)).toBeLessThan(0.02);
    }
    expect([out[(n - 1) * 3], out[(n - 1) * 3 + 1], out[(n - 1) * 3 + 2]]).toEqual([30, 3, 5]);
    expect(catmullRom(src, 4, 3, 1.5, out, 10)).toBe(10);
  });

  it('resampleEven returns exactly n points on a polyline', () => {
    const src = new Float32Array([0, 0, 10, 0, 10, 10]);
    const out = new Float32Array(10);
    expect(resampleEven(src, 3, 2, 5, out)).toBe(5);
    expect(Array.from(out)).toEqual([0, 0, 5, 0, 10, 0, 10, 5, 10, 10]);
  });

  it('minRadius leaves no radius under rMin, in 2D and 3D, keeping the endpoints', () => {
    for (const dim of [2, 3] as const) {
      const n = 40, pts = new Float32Array(n * dim);
      for (let i = 0; i < n; i++) { // a zigzag with 90 deg corners every 5 points, 1.5 m spacing
        const leg = Math.floor(i / 5), u = i % 5;
        pts[i * dim] = (Math.ceil(leg / 2) * 5 + (leg % 2 === 0 ? u : 0)) * 1.5;
        pts[i * dim + 1] = (Math.floor(leg / 2) * 5 + (leg % 2 === 1 ? u : 0)) * 1.5;
        if (dim === 3) pts[i * dim + 2] = i * 0.3;
      }
      const end = Array.from(pts.slice((n - 1) * dim));
      let before = Infinity;
      for (let i = 1; i < n - 1; i++) before = Math.min(before, circumradius(pts, (i - 1) * dim, i * dim, (i + 1) * dim, dim));
      expect(before).toBeLessThan(5);
      expect(minRadius(pts, n, dim, 5)).toBeGreaterThanOrEqual(5);
      for (let i = 1; i < n - 1; i++) expect(circumradius(pts, (i - 1) * dim, i * dim, (i + 1) * dim, dim)).toBeGreaterThanOrEqual(5);
      expect(pts[0]).toBe(0); expect(Array.from(pts.slice((n - 1) * dim))).toEqual(end);
    }
  });
});
