// Shot resolution against Rapier (scene chunk only). One reusable Ray; results use module scratch vectors.
import type RAPIER from '@dimforge/rapier3d-compat';
import { ONLY_FIXED, SHOT_GROUPS, SHOT_RANGE, type DroneTarget, type Vec3 } from './combat';
import { hitDrones, projectedStart, rayWater, type DroneHit } from './shotMath';
export type WorldHit = { t: number; normal: Vec3 };
export type ShooterWorld = {
  castShot(o: Vec3, d: Vec3, maxT: number, out: WorldHit): boolean;
  lineClear(a: Vec3, b: Vec3): boolean;
};
export type ShotHit = { kind: 'miss' | 'world' | 'water' | 'hit' | 'weak' | 'blocked'; t: number; drone: number; point: Vec3; normal: Vec3 };

/** Shots and line-of-sight rays see fixed colliders in group 0 only: the player capsule and district boundary are skipped. */
export function createShooterWorld(world: RAPIER.World, rapier: typeof RAPIER): ShooterWorld {
  const ray = new rapier.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -1 });
  const aim = (o: Vec3, dx: number, dy: number, dz: number) => {
    ray.origin.x = o.x; ray.origin.y = o.y; ray.origin.z = o.z; ray.dir.x = dx; ray.dir.y = dy; ray.dir.z = dz;
  };
  return {
    castShot(o, d, maxT, out) {
      aim(o, d.x, d.y, d.z);
      const hit = world.castRayAndGetNormal(ray, maxT, true, ONLY_FIXED, SHOT_GROUPS);
      if (!hit) return false;
      out.t = hit.timeOfImpact; out.normal.x = hit.normal.x; out.normal.y = hit.normal.y; out.normal.z = hit.normal.z;
      return true;
    },
    lineClear(a, b) {
      const x = b.x - a.x, y = b.y - a.y, z = b.z - a.z, l = Math.hypot(x, y, z), max = l - .5;
      if (!(max > 0)) return true;
      aim(a, x / l, y / l, z / l);
      return world.castRay(ray, max, true, ONLY_FIXED, SHOT_GROUPS) === null;
    },
  };
}

const start: Vec3 = { x: 0, y: 0, z: 0 }, dir: Vec3 = { x: 0, y: 0, z: 0 };
const env: WorldHit = { t: 0, normal: { x: 0, y: 1, z: 0 } }, muzzleHit: WorldHit = { t: 0, normal: { x: 0, y: 1, z: 0 } };
const drone: DroneHit = { index: -1, t: 0, weak: false };
const set = (v: Vec3, x: number, y: number, z: number) => { v.x = x; v.y = y; v.z = z; };
const along = (out: Vec3, o: Vec3, d: Vec3, t: number) => set(out, o.x + d.x * t, o.y + d.y * t, o.z + d.z * t);

/**
 * Resolves one hitscan shot along the camera ray (o, unit d), started level with the hero's head. t is measured from that
 * projected start, except for 'blocked', where it is measured from the muzzle. `magnet` (-1 for none) grants a body hit on
 * that drone when it has line of sight and is nearer than the environment. The muzzle segment check runs last.
 */
export function resolveShot(w: ShooterWorld, o: Vec3, d: Vec3, head: Vec3, muzzle: Vec3 | null, targets: readonly DroneTarget[],
  count: number, magnet: number, out: ShotHit): ShotHit {
  const s = projectedStart(o, d, head, start);
  const worldT = w.castShot(s, d, SHOT_RANGE, env) ? env.t : Infinity, waterT = rayWater(s, d);
  const envT = Math.min(worldT, waterT, SHOT_RANGE);
  out.drone = -1;
  if (hitDrones(s, d, targets, count, envT, drone)) {
    const c = targets[drone.index].c;
    out.kind = drone.weak ? 'weak' : 'hit'; out.t = drone.t; out.drone = drone.index; along(out.point, s, d, drone.t);
    const nx = out.point.x - c.x, ny = out.point.y - c.y, nz = out.point.z - c.z, nl = Math.hypot(nx, ny, nz) || 1;
    set(out.normal, nx / nl, ny / nl, nz / nl);
  } else if (magnet >= 0 && magnet < count && targets[magnet].alive && targets[magnet].los
    && Math.hypot(targets[magnet].c.x - s.x, targets[magnet].c.y - s.y, targets[magnet].c.z - s.z) - targets[magnet].r < envT) {
    const g = targets[magnet], x = g.c.x - s.x, y = g.c.y - s.y, z = g.c.z - s.z, l = Math.hypot(x, y, z) || 1;
    out.kind = 'hit'; out.t = Math.max(0, l - g.r); out.drone = magnet;
    set(out.normal, -x / l, -y / l, -z / l); along(out.point, g.c, out.normal, g.r);
  } else if (worldT <= waterT && worldT < Infinity) {
    out.kind = 'world'; out.t = worldT; along(out.point, s, d, worldT); set(out.normal, env.normal.x, env.normal.y, env.normal.z);
  } else if (waterT <= SHOT_RANGE) {
    out.kind = 'water'; out.t = waterT; along(out.point, s, d, waterT); set(out.normal, 0, 1, 0);
  } else {
    out.kind = 'miss'; out.t = SHOT_RANGE; along(out.point, s, d, SHOT_RANGE); set(out.normal, -d.x, -d.y, -d.z);
  }
  if (muzzle === null) return out;
  const x = out.point.x - muzzle.x, y = out.point.y - muzzle.y, z = out.point.z - muzzle.z, l = Math.hypot(x, y, z);
  if (!(l > .15)) return out;
  set(dir, x / l, y / l, z / l);
  if (w.castShot(muzzle, dir, l, muzzleHit) && muzzleHit.t < l - .15) {
    out.kind = 'blocked'; out.t = muzzleHit.t; out.drone = -1; along(out.point, muzzle, dir, muzzleHit.t);
    set(out.normal, muzzleHit.normal.x, muzzleHit.normal.y, muzzleHit.normal.z);
  }
  return out;
}
