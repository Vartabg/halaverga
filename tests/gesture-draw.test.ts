import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { FOOT, WORLD, type Vec } from '../src/game/motion';
import { DrawPath } from '../src/game/gesture/drawPath';
import { project } from '../src/game/gesture/screenRay';
import { CAM, HERO, frameAt, line } from './draw-harness';
import { DRAW_BLEND_M, DRAW_D_MAX, DRAW_MAX_PTS, DRAW_MIN_R, DRAW_Y_MAX, LAND_LIFT_M, SWEEP_LAND_EXCLUDE_M } from '../src/game/gesture/tuning';
import { probeDrawPath } from '../src/world/DrawProbe';

const v = (x: number, y: number, z: number): Vec => ({ x, y, z });
const pointAt = (p: DrawPath, s: number) => { const o = v(0, 0, 0); p.ring.at(s, 0, o); return o; };
const points = (p: DrawPath) => {
  const out: Vec[] = [];
  for (let i = p.ring.first; i < p.ring.count; i++) out.push(p.ring.get(i, v(0, 0, 0)));
  return out;
};

describe('drawPath: stroke to 3D', () => {
  it('starts exactly at the hero', () => {
    const p = new DrawPath(), f = frameAt(CAM);
    p.begin(HERO); p.append(500, 350, 0, f);
    expect(p.ring.get(0, v(0, 0, 0))).toEqual(HERO);
    line(p, f, 500, 350, 700, 150, 20);
    expect(p.ring.count).toBeGreaterThan(3);
    expect(p.ring.get(0, v(0, 0, 0))).toEqual(HERO);
  });

  it('puts every sample past the blend on its own ray: it reprojects within 1 px through its own frame', () => {
    const p = new DrawPath();
    p.begin(HERO);
    let checked = 0;
    for (let i = 0; i <= 40; i++) {
      const f = frameAt(v(CAM.x, CAM.y, CAM.z - i * 0.25), 0.02 * Math.sin(i), -0.1);  // the camera translates with the hero
      const x = 420 + i * 7, y = 330 - i * 5 + 20 * Math.sin(i / 5);
      p.append(x, y, i * 16.7, f);
      if (p.worldArc < DRAW_BLEND_M) continue;
      const s = { x: 0, y: 0 };
      expect(project(f, p.control, s)).toBe(true);
      expect(Math.hypot(s.x - x, s.y - y)).toBeLessThan(1);
      checked++;
    }
    expect(checked).toBeGreaterThan(10);
  });

  it('keeps depth monotonic and capped at DRAW_D_MAX', () => {
    const p = new DrawPath(), f = frameAt(CAM);
    p.begin(HERO);
    let last = -Infinity;
    for (let i = 0; i <= 200; i++) {
      p.append(400 + 300 * Math.cos(i / 9), 300 + 200 * Math.sin(i / 13), i * 8, f);
      expect(p.depth).toBeGreaterThanOrEqual(last);
      expect(p.depth).toBeLessThanOrEqual(DRAW_D_MAX);
      last = p.depth;
    }
    expect(last).toBe(DRAW_D_MAX);
  });

  it('never bends tighter than DRAW_MIN_R, even through a sharp zigzag', () => {
    const p = new DrawPath(), f = frameAt(CAM);
    p.begin(HERO);
    line(p, f, 400, 300, 600, 300, 12); line(p, f, 600, 300, 420, 200, 12, 220); line(p, f, 420, 200, 640, 120, 12, 440);
    p.release(null, 0, 0);
    const r = p.ring;
    for (let i = r.first + 1; i < r.count - 1; i++) expect(r.radius[i % DRAW_MAX_PTS]).toBeGreaterThan(DRAW_MIN_R - 0.05);
  });

  it('clamps points into the flight space and flags big moves amber', () => {
    const inside = new DrawPath(), f0 = frameAt(CAM);
    inside.begin(HERO); line(inside, f0, 420, 300, 560, 260, 20);
    expect(Array.from(inside.ring.amber).slice(0, inside.ring.count).every(a => a === 0)).toBe(true);
    const p = new DrawPath(), cam = v(150, 70, 0), f = frameAt(cam, -Math.PI / 2, 0.8);   // looking up and toward +x (the east edge)
    p.begin(v(156, 70, 0)); line(p, f, 400, 300, 400, -700, 120);
    p.release(null, 0, 0);
    const pts = points(p);
    expect(pts.length).toBeGreaterThan(10);
    for (const q of pts) {
      expect(q.y).toBeLessThanOrEqual(DRAW_Y_MAX + 1e-3);
      expect(q.x).toBeLessThanOrEqual(WORLD.maxX - 12 + 1e-3);
    }
    expect(Array.from(p.ring.amber).some(a => a === 1)).toBe(true);
  });
});

describe('drawPath: release end and sweep', () => {
  const stroke = () => {
    const p = new DrawPath(), f = frameAt(CAM);
    p.begin(HERO); line(p, f, 400, 320, 520, 380, 30);
    return { p, f };
  };

  it('retargets a landable end above the surface and sweeps short of the last 3 m', () => {
    const { p, f } = stroke();
    p.release(f, 520, 380);
    expect(p.pendingEnd).toBe(true);
    const hitPoint = v(p.endO.x + p.endD.x * 30, p.endO.y + p.endD.y * 30, p.endO.z + p.endD.z * 30);
    const segs: [Vec, Vec][] = [];
    const cast = (a: Vec, b: Vec) => { segs.push([{ ...a }, { ...b }]); return 1; };
    const hit = { t: 0, normal: v(0, 1, 0) }, end = { point: v(0, 0, 0), normal: v(0, 1, 0) };
    probeDrawPath(p, (o, d, max, out) => { out.t = 30; out.normal.x = 0; out.normal.y = 1; out.normal.z = 0; return max > 30; }, cast, hit, end);
    expect(p.wantsLand).toBe(true);
    expect(p.land.x).toBeCloseTo(hitPoint.x, 6); expect(p.land.y).toBeCloseTo(hitPoint.y, 6);
    const e = p.ring.last(v(0, 0, 0));
    expect(e.x).toBeCloseTo(hitPoint.x, 3); expect(e.y).toBeCloseTo(hitPoint.y + FOOT + LAND_LIFT_M, 3); expect(e.z).toBeCloseTo(hitPoint.z, 3);
    for (let i = 0; i < 30; i++) p.sweep(cast);
    expect(p.blocked).toBe(false);
    expect(p.sweptArc).toBeLessThanOrEqual(p.ring.endArc - SWEEP_LAND_EXCLUDE_M + 1e-9);
    expect(p.sweptArc).toBeGreaterThan(p.ring.endArc - SWEEP_LAND_EXCLUDE_M - 2.01);
    const far = segs.reduce((m, [, b]) => Math.max(m, Math.hypot(b.x - HERO.x, b.y - HERO.y, b.z - HERO.z)), 0);
    expect(far).toBeLessThan(Math.hypot(e.x - HERO.x, e.y - HERO.y, e.z - HERO.z));
  });

  it('runs on along the exit tangent under open sky', () => {
    const { p, f } = stroke();
    p.release(f, 520, 380);
    const before = p.ring.endArc;
    p.finish(null);
    expect(p.wantsLand).toBe(false);
    expect(p.ring.endArc).toBeGreaterThan(before + 10);
  });

  it('truncates at the first blocked sweep and marks the path blocked (mocked cast)', () => {
    const { p, f } = stroke();
    p.release(f, 520, 380); p.finish(null);
    const total = p.ring.endArc, wallZ = pointAt(p, total * 0.6).z;
    const cast = (a: Vec, b: Vec) => (b.z < wallZ ? Math.max(0, Math.min(1, (a.z - wallZ) / (a.z - b.z))) : 1);
    let casts = 0;
    for (let i = 0; i < 40; i++) { const n = p.sweep(cast); expect(n).toBeLessThanOrEqual(4); casts += n; }
    expect(casts).toBeLessThanOrEqual(60);
    expect(p.blocked).toBe(true); expect(p.dead).toBe(true);
    expect(p.ring.endArc).toBeLessThan(total - 5);
    expect(p.ring.last(v(0, 0, 0)).z).toBeGreaterThan(wallZ);
    expect(p.ring.last(v(0, 0, 0)).z).toBeLessThan(wallZ + 1.5);
  });
});

describe('draw modules', () => {
  it('stay under 200 lines, three-free and random-free', () => {
    for (const f of ['src/game/gesture/drawPath.ts', 'src/game/gesture/drawRing.ts', 'src/game/gesture/pathFollow.ts',
      'src/game/gesture/drawScheme.ts', 'src/world/DrawProbe.tsx']) {
      const src = readFileSync(f, 'utf8');
      expect(src.split('\n').length, f).toBeLessThan(200);
      expect(src, f).not.toMatch(/from 'three'/);
      expect(src, f).not.toMatch(/Math\.random/);
    }
  });
});
