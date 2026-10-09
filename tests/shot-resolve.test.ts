import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import RAPIER from '@dimforge/rapier3d-compat';
import { Euler, Quaternion } from 'three';
import { makeCity } from '../src/world/cityData';
import { WORLD } from '../src/game/motion';
import { BOUNDARY_GROUPS, DRONE_RADIUS, EYE_FORWARD, EYE_RADIUS, SHOT_RANGE, WATER_LEVEL, type DroneTarget, type Vec3 } from '../src/game/combat';
import { createShooterWorld, resolveShot, type ShotHit, type WorldHit } from '../src/game/shotResolve';
let solids: ReturnType<typeof makeCity>['solids'];
const worlds: RAPIER.World[] = [];
const v = (x: number, y: number, z: number): Vec3 => ({ x, y, z });
const unit = (x: number, y: number, z: number) => { const l = Math.hypot(x, y, z); return v(x / l, y / l, z / l); };
beforeAll(async () => { await RAPIER.init(); const city = makeCity(); solids = city.solids; city.geometry.dispose(); });
afterEach(() => { worlds.splice(0).forEach(w => w.free()); });
/** The city as fixed cuboids plus the six DistrictBoundary cuboids (src/world/DistrictBoundary.tsx) in BOUNDARY_GROUPS. */
function setup() {
  const world = new RAPIER.World({ x: 0, y: 0, z: 0 }); worlds.push(world);
  solids.forEach(s => world.createCollider(RAPIER.ColliderDesc.cuboid(...s.size).setTranslation(...s.position).setRotation(new Quaternion().setFromEuler(new Euler(...s.rotation)))));
  const width = WORLD.maxX - WORLD.minX, depth = WORLD.maxZ - WORLD.minZ, cz = (WORLD.minZ + WORLD.maxZ) / 2;
  const walls: [number, number, number, number, number, number][] = [
    [1, 75, depth / 2 + 4, WORLD.minX - 1.44, 35, cz], [1, 75, depth / 2 + 4, WORLD.maxX + 1.44, 35, cz],
    [width / 2 + 4, 75, 1, 0, 35, WORLD.minZ - 1.44], [width / 2 + 4, 75, 1, 0, 35, WORLD.maxZ + 1.44],
    [width / 2 + 4, 1, depth / 2 + 4, 0, WORLD.ceiling + 2.04, cz], [width / 2 + 4, 1, depth / 2 + 4, 0, -1.4, cz],
  ];
  const boundary = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  walls.forEach(([hx, hy, hz, x, y, z]) => world.createCollider(RAPIER.ColliderDesc.cuboid(hx, hy, hz).setTranslation(x, y, z).setCollisionGroups(BOUNDARY_GROUPS), boundary));
  world.step();
  return { world, sw: createShooterWorld(world, RAPIER) };
}
const box = (world: RAPIER.World, c: Vec3, hx: number, hy: number, hz: number) => {
  world.createCollider(RAPIER.ColliderDesc.cuboid(hx, hy, hz).setTranslation(c.x, c.y, c.z)); world.step();
};
const target = (c: Vec3, los = true): DroneTarget => ({ c, r: DRONE_RADIUS, eye: v(c.x, c.y, c.z + EYE_FORWARD), eyeR: EYE_RADIUS, alive: true, los });
const shot = (): ShotHit => ({ kind: 'miss', t: 0, drone: -1, point: v(0, 0, 0), normal: v(0, 0, 0) });
const rawRay = (world: RAPIER.World, o: Vec3, d: Vec3, max: number) => world.castRay(new RAPIER.Ray(o, d), max, true);
const fwd = v(0, 0, -1);

describe('shot resolution against the city', () => {
  it('lets a building occlude a drone behind it', () => {
    const { sw } = setup(), o = v(-34, 10, 50), out = shot(), d = [target(v(-34, 10, 5))];
    expect(resolveShot(sw, o, fwd, o, null, d, 1, -1, out)).toBe(out);
    expect(out.kind).toBe('world'); expect(out.drone).toBe(-1);
    expect(out.point.z).toBeGreaterThan(30); expect(out.point.z).toBeLessThan(40);
    expect(out.normal.z).toBeCloseTo(1, 3); expect(out.t).toBeCloseTo(50 - out.point.z, 6);
    resolveShot(sw, v(-34, 10, 12), fwd, v(-34, 10, 12), null, d, 1, -1, out); // in front of the building the drone is hit
    expect(out.kind).toBe('weak'); expect(out.drone).toBe(0); expect(out.t).toBeCloseTo(7 - EYE_FORWARD - EYE_RADIUS, 6);
  });
  it('passes through the invisible boundary wall', () => {
    const { world, sw } = setup(), o = v(0, 90, 0), d = v(1, 0, 0), out = shot();
    expect(rawRay(world, o, d, SHOT_RANGE)?.timeOfImpact).toBeCloseTo(WORLD.maxX + .44, 3); // the wall is on this ray
    resolveShot(sw, o, d, o, null, [], 0, -1, out);
    expect(out.kind).toBe('miss'); expect(out.t).toBe(SHOT_RANGE);
    expect(out.point).toEqual(v(SHOT_RANGE, 90, 0)); expect(out.normal).toEqual(v(-1, -0, -0));
    resolveShot(sw, v(0, 60, 0), v(0, 1, 0), v(0, 60, 0), null, [], 0, -1, out);
    expect(out.kind).toBe('miss'); // ceiling too
  });
  it('meets the canal water at y .1, above the boundary floor', () => {
    const { world, sw } = setup(), o = v(0, 20, 50), d = unit(0, -20, 22 - 50), out = shot();
    expect(rawRay(world, o, d, SHOT_RANGE)?.collider.collisionGroups()).toBe(BOUNDARY_GROUPS); // only the floor is below
    resolveShot(sw, o, d, o, null, [], 0, -1, out);
    expect(out.kind).toBe('water'); expect(out.point.y).toBeCloseTo(WATER_LEVEL, 9); expect(out.normal).toEqual(v(0, 1, 0));
    expect(out.point.z).toBeCloseTo(50 - (20 - WATER_LEVEL) * 28 / 20, 6);
  });
  it('skips a prop between the camera and the head', () => {
    const { world, sw } = setup(), o = v(0, 60, 10), head = v(.6, 59.5, 6), out = shot(), hit: WorldHit = { t: 0, normal: v(0, 0, 0) };
    box(world, v(0, 60, 8), .5, .5, .5);
    expect(sw.castShot(o, fwd, SHOT_RANGE, hit)).toBe(true); expect(hit.t).toBeCloseTo(1.5, 5);
    resolveShot(sw, o, fwd, head, null, [target(v(0, 60, -10))], 1, -1, out);
    expect(out.kind).toBe('weak'); expect(out.t).toBeCloseTo(16 - EYE_FORWARD - EYE_RADIUS, 6);
    expect(out.point.z).toBeCloseTo(-10 + EYE_FORWARD + EYE_RADIUS, 6);
  });
  it('blocks a shot when a wall stands between the muzzle and the target', () => {
    const { world, sw } = setup(), o = v(0, 60, 20), out = shot(), d = [target(v(0, 60, 0))];
    box(world, v(2, 60, 12), .5, 2, .5);
    resolveShot(sw, o, fwd, o, v(3, 60, 20), d, 1, -1, out);
    expect(out.kind).toBe('blocked'); expect(out.drone).toBe(-1);
    expect(out.point.x).toBeGreaterThan(1.49); expect(out.point.x).toBeLessThan(2.51); expect(out.point.z).toBeCloseTo(12.5, 5);
    expect(out.normal.z).toBeCloseTo(1, 5);
    resolveShot(sw, o, fwd, o, v(-3, 60, 20), d, 1, -1, out); // the other forearm has a clear line
    expect(out.kind).toBe('weak'); expect(out.drone).toBe(0);
    resolveShot(sw, o, fwd, o, v(0, 60, 20.3), d, 1, -1, out); // muzzle on the camera ray
    expect(out.kind).toBe('weak');
    const face = v(-34, 10, 50); // a muzzle ray ending on the facade the camera ray hit is not blocked by that facade
    for (const m of [v(-33.6, 9.8, 50.3), v(-34.4, 10.3, 49.8)]) { resolveShot(sw, face, fwd, face, m, [], 0, -1, out); expect(out.kind).toBe('world'); }
  });
  it('grants a magnetised body hit only with line of sight and in front of the environment', () => {
    const { sw } = setup(), o = v(0, 60, 20), out = shot(), g = target(v(2, 60, 0));
    resolveShot(sw, o, fwd, o, null, [g], 1, -1, out);
    expect(out.kind).toBe('miss');
    resolveShot(sw, o, fwd, o, null, [g], 1, 0, out);
    expect(out.kind).toBe('hit'); expect(out.drone).toBe(0);
    const n = unit(-2, 0, 20), dist = Math.hypot(2, 20);
    expect(out.normal.x).toBeCloseTo(n.x, 9); expect(out.normal.z).toBeCloseTo(n.z, 9);
    expect(out.point.x).toBeCloseTo(2 + n.x * DRONE_RADIUS, 9); expect(out.point.z).toBeCloseTo(n.z * DRONE_RADIUS, 9);
    expect(out.t).toBeCloseTo(dist - DRONE_RADIUS, 9);
    g.los = false; resolveShot(sw, o, fwd, o, null, [g], 1, 0, out); expect(out.kind).toBe('miss');
    g.los = true; g.alive = false; resolveShot(sw, o, fwd, o, null, [g], 1, 0, out); expect(out.kind).toBe('miss');
    const behind = target(v(-32, 10, 0)), wall = v(-34, 10, 50); // magnetism never reaches past the building
    resolveShot(sw, wall, fwd, wall, null, [behind], 1, 0, out); expect(out.kind).toBe('world');
    const front = target(v(0, 60, 0));
    resolveShot(sw, o, fwd, o, null, [front], 1, 0, out); expect(out.kind).toBe('weak'); // a real eye hit beats the magnet
  });
  it('ignores a kinematic capsule on the ray', () => {
    const { world, sw } = setup(), o = v(0, 60, 20), out = shot();
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, 60, 15));
    world.createCollider(RAPIER.ColliderDesc.capsule(.6, .4), body); world.step();
    expect(rawRay(world, o, fwd, SHOT_RANGE)?.timeOfImpact).toBeCloseTo(4.6, 5);
    resolveShot(sw, o, fwd, o, null, [target(v(0, 60, 0))], 1, -1, out);
    expect(out.kind).toBe('weak');
    expect(sw.lineClear(o, v(0, 60, 0))).toBe(true);
  });
  it('checks line of sight in open air and through buildings', () => {
    const { sw } = setup();
    expect(sw.lineClear(v(0, 60, 20), v(0, 60, -40))).toBe(true);
    expect(sw.lineClear(v(-34, 10, 50), v(-34, 10, 5))).toBe(false);
    expect(sw.lineClear(v(-34, 10, 37.6), v(-34, 10, 37.3))).toBe(true); // shorter than the .5 m allowance
    expect(sw.lineClear(v(0, 90, 0), v(210, 90, 0))).toBe(true); // boundary walls are not cover
  });
  it('keeps Rapier type-only and allocates a single ray', () => {
    const src = readFileSync('src/game/shotResolve.ts', 'utf8');
    expect(src).toContain("import type RAPIER from '@dimforge/rapier3d-compat'");
    expect(src.match(/new /g)).toHaveLength(1);
    expect(src).not.toMatch(/from '(three|@react-three)/);
    expect(src.split('\n').length).toBeLessThan(200);
  });
});
