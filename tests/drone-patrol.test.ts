import { beforeAll, describe, expect, it } from 'vitest';
import { Euler, Quaternion, Vector3 } from 'three';
import { makeCity } from '../src/world/cityData';
import { START, WORLD } from '../src/game/motion';
import { BUILDING_ROUTE } from '../src/game/navigation';
import { forwardOf, type Vec3 } from '../src/game/combat';
import { PATROLS, flyInStart, patrolPeakSpeed, patrolPosition } from '../src/game/dronePatrols';
type Box = { c: Vector3; h: Vector3; inv: Quaternion };
let boxes: Box[];
beforeAll(() => {
  const city = makeCity(); city.geometry.dispose();
  boxes = city.solids.map(s => ({ c: new Vector3(...s.position), h: new Vector3(...s.size),
    inv: new Quaternion().setFromEuler(new Euler(...s.rotation)).invert() }));
});
const local = new Vector3();
/** Distance from p to the nearest solid OBB: into the box frame, then clamp to the half-extents. */
function solidDistance(p: Vec3) {
  let best = Infinity;
  for (const b of boxes) {
    local.set(p.x, p.y, p.z).sub(b.c).applyQuaternion(b.inv);
    const dx = Math.max(0, Math.abs(local.x) - b.h.x), dy = Math.max(0, Math.abs(local.y) - b.h.y), dz = Math.max(0, Math.abs(local.z) - b.h.z);
    best = Math.min(best, Math.hypot(dx, dy, dz));
  }
  return best;
}
function routeDistance(p: Vec3) {
  let best = Infinity;
  for (let i = 1; i < BUILDING_ROUTE.length; i++) {
    const a = BUILDING_ROUTE[i - 1], b = BUILDING_ROUTE[i], ab = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
    const t = Math.min(1, Math.max(0, ((p.x - a.x) * ab.x + (p.y - a.y) * ab.y + (p.z - a.z) * ab.z) / (ab.x ** 2 + ab.y ** 2 + ab.z ** 2)));
    best = Math.min(best, Math.hypot(p.x - a.x - ab.x * t, p.y - a.y - ab.y * t, p.z - a.z - ab.z * t));
  }
  return best;
}
const samples = (p: typeof PATROLS[number]) => Array.from({ length: 720 }, (_, n) => patrolPosition(p, n / 720 * 2 * Math.PI / p.omega, { x: 0, y: 0, z: 0 }));
const view = forwardOf(0, -.12, { x: 0, y: 0, z: 0 });
const coneDeg = (q: Vec3) => {
  const d = { x: q.x - START.x, y: q.y - START.y, z: q.z - START.z }, len = Math.hypot(d.x, d.y, d.z);
  return Math.acos((d.x * view.x + d.y * view.y + d.z * view.z) / len) * 180 / Math.PI;
};
describe('drone patrol paths', () => {
  it('keeps the five patrol ids in order, with the tutorial drone first', () => {
    expect(PATROLS.map(p => p.id)).toEqual(['terrace-greeter', 'terrace-wing', 'canal-mid', 'viaduct-gap', 'tower-orbit']);
  });
  it('follows the Lissajous formula', () => {
    const p = PATROLS[2], q = patrolPosition(p, 1.3, { x: 0, y: 0, z: 0 }), a = p.omega * 1.3 + p.phase;
    expect(q.x).toBeCloseTo(p.c.x + p.r.x * Math.cos(a), 12); expect(q.y).toBeCloseTo(p.c.y + p.r.y * Math.sin(2 * a), 12);
    expect(q.z).toBeCloseTo(p.c.z + p.r.z * Math.sin(a), 12);
  });
  for (const p of PATROLS) it(`${p.id} clears solids, the route and the world, at a readable speed`, () => {
    let solid = Infinity, route = Infinity;
    for (const q of samples(p)) {
      solid = Math.min(solid, solidDistance(q)); route = Math.min(route, routeDistance(q));
      expect(q.x).toBeGreaterThanOrEqual(WORLD.minX + 6); expect(q.x).toBeLessThanOrEqual(WORLD.maxX - 6);
      expect(q.z).toBeGreaterThanOrEqual(WORLD.minZ + 6); expect(q.z).toBeLessThanOrEqual(WORLD.maxZ - 6);
      expect(q.y).toBeLessThan(95);
    }
    expect(solid, 'solid clearance').toBeGreaterThanOrEqual(5.7);
    expect(route, 'route clearance').toBeGreaterThanOrEqual(5);
    const peak = patrolPeakSpeed(p);
    expect(peak).toBeGreaterThanOrEqual(2.5); expect(peak).toBeLessThanOrEqual(5.5);
  });
  it('measures peak speed numerically, matching finite differences', () => {
    for (const p of PATROLS) {
      let fd = 0; const dt = 1e-3, a = { x: 0, y: 0, z: 0 }, b = { x: 0, y: 0, z: 0 };
      for (let n = 0; n < 4000; n++) {
        const t = n / 4000 * 2 * Math.PI / p.omega; patrolPosition(p, t, a); patrolPosition(p, t + dt, b);
        fd = Math.max(fd, Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) / dt);
      }
      expect(patrolPeakSpeed(p)).toBeCloseTo(fd, 2);
    }
  });
  it('keeps terrace-greeter inside a 25 deg cone of the spawn view for its whole path', () => {
    expect(Math.max(...samples(PATROLS[0]).map(coneDeg))).toBeLessThanOrEqual(25);
  });
  it('lets every possible alert anchor orbit 3 m without clipping (>= 2.7 m clearance)', () => {
    for (const p of PATROLS) {
      const pts = samples(p);
      for (let n = 0; n < pts.length; n += 10) for (let k = 0; k < 16; k++) {
        const th = k / 16 * 2 * Math.PI, q = { x: pts[n].x + 3 * Math.cos(th), y: pts[n].y, z: pts[n].z + 3 * Math.sin(th) };
        expect(solidDistance(q), `${p.id} anchor ${n} ring ${k}`).toBeGreaterThanOrEqual(2.7);
      }
    }
  });
});
describe('respawn fly-in', () => {
  it('starts 50 m out, away from the player, 10 m up, turning in alternating 45 deg steps', () => {
    const arrival = { x: 0, y: 30, z: 0 }, player = { x: 0, y: 30, z: 20 }, out = { x: 0, y: 0, z: 0 };
    expect(flyInStart(arrival, player, 0, out)).toEqual({ x: 0, y: 40, z: -50 });
    const turns = [0, 45, -45, 90, -90, 135, -135, 180];
    for (let k = 0; k < 8; k++) {
      flyInStart(arrival, player, k, out);
      const t = turns[k] * Math.PI / 180;
      // Positive turns rotate about +Y (counter-clockwise seen from above): -Z swings toward -X.
      expect(out.x).toBeCloseTo(-50 * Math.sin(t), 9); expect(out.z).toBeCloseTo(-50 * Math.cos(t), 9); expect(out.y).toBe(40);
    }
  });
  it('clamps inside the world with a 6 m margin and under 95 m', () => {
    const out = { x: 0, y: 0, z: 0 };
    flyInStart({ x: 190, y: 90, z: 100 }, { x: 150, y: 90, z: 60 }, 0, out);
    expect(out).toEqual({ x: WORLD.maxX - 6, y: 95, z: WORLD.maxZ - 6 });
    flyInStart({ x: -190, y: 10, z: -170 }, { x: -150, y: 10, z: -150 }, 0, out);
    expect(out.x).toBe(WORLD.minX + 6); expect(out.z).toBe(WORLD.minZ + 6);
  });
});
