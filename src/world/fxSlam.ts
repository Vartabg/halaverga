// What a thrown demon's strike throws up (thrown.ts lands it; ImpactFx.tsx owns the pools): dust and chips of rock from the
// mountain, dust blown off a cliff face, a column of spray and widening rings from the gorge water. Pure spawning into
// preallocated pools; seeded randomness from the caller's generator.
import type { Vec3 } from '@/game/combat';
import { CURVE_HOLD, lobeDir, shardGain, shardK, sparkParams, spawnPuff, spawnSpark, type Puffs, type Rgb } from './fxPools';
import { FX } from './fxMaterials';
import { WIND, type AddDebris, type BurstPools } from './fxBurst';

/** full: the strike speed (m/s) drawn at full size. dust / chips / rings / embers: how many pieces a full ground or water strike
 *  throws. throw: the speed (m/s) the skirt leaves at; it is spent within a tenth of a second (DRIFT_TAU), so the skirt lands
 *  about throw / 10 metres out. sit: how far above the surface a puff's centre stands, as a share of its height. The ground and
 *  the water are opaque, and a puff is a soft disc whose body is its middle: centred on the surface, the half that carries the
 *  body is cut away and only a faint rim shows (found on screen, 2026-11-10). The alphas here run above 1: a density, which
 *  fills the disc's middle in solid (fxShaders.billboard), because at 1 the disc is mostly its faint edge: at 2.5 it is solid to
 *  a third of its radius, and as it fades the solid part shrinks, so a cloud thins from its edge inward. */
export const SLAM = { full: 30, dust: 8, chips: 8, rings: 3, embers: 6, throw: 32, sit: .45 } as const;
/** 0.8 to 1.4: how big a strike at this speed reads. The floor is high on purpose: the slowest strike that counts (THROWN.thud)
 *  still has to read from the air. */
export const slamSize = (speed: number) => Math.min(1.4, Math.max(.8, speed / SLAM.full));
/** Which surface took the strike, from the height of the mountain under it (`floor`, heightAt) and how level the surface is: a
 *  cliff face, the gorge water (no mountain above the water line there, even beside a bank that tilts the normal), or the ground. */
export const slamSurface = (floor: number, ny: number, water: number): 'water' | 'wall' | 'ground' =>
  ny <= .5 ? 'wall' : floor <= water ? 'water' : 'ground';
const at: Vec3 = { x: 0, y: 0, z: 0 }, v: Vec3 = { x: 0, y: 0, z: 0 }, dir: Vec3 = { x: 0, y: 0, z: 0 }, spark = { speed: 0, life: 0 };
const UP: Vec3 = { x: 0, y: 1, z: 0 };

/** A puff standing on the surface at c (normal n): lifted by SLAM.sit of its height and climbing as fast as it grows, plus `up`
 *  m/s of its own. still (reduced motion): no climb and no drift, lifted clear of the surface at its final size instead. */
function stand(p: Puffs, t: number, c: Vec3, n: Vec3, up: number, life: number, s0: number, s1: number, stretch: number, c0: Rgb, c1: Rgb,
  alpha: number, drift: Vec3 | null, wind: Vec3 | null, still = false) {
  const lift = SLAM.sit * stretch * (still ? s1 : s0);
  at.x = c.x + n.x * lift; at.y = c.y + n.y * lift; at.z = c.z + n.z * lift;
  const rise = still ? 0 : n.y * (SLAM.sit * stretch * (s1 - s0) / life + up);
  return spawnPuff(p, t, at, rise, life, still ? .7 * s1 : s0, s1, stretch, c0, c1, alpha, CURVE_HOLD, still ? null : drift, still ? null : wind);
}

/** The strike at c on a surface with normal n, at `speed` m/s, where the mountain stands `floor` high and the water `water`,
 *  with the distance gain g. Reduced motion: still clouds only. */
export function spawnSlam(p: BurstPools, addDebris: AddDebris, t: number, c: Vec3, n: Vec3, speed: number, water: number, floor: number, g: number,
  rng: () => number, reduced: boolean) {
  const k = Math.min(1.8, slamSize(speed) * Math.max(1, g)), kind = slamSurface(floor, n.y, water);
  if (kind === 'water') {
    // A column of spray thrown straight up, a low crown of it around the foot, a skirt thrown outward, and rings running out.
    dir.x = c.x; dir.y = water; dir.z = c.z;
    stand(p.alpha, t, dir, UP, 3 * k, 1.1, 2 * k, 4.2 * k, 2.6, FX.spray, FX.sprayEnd, 3.5, null, null, reduced);
    stand(p.alpha, t + .04, dir, UP, 0, 1.2, 3.6 * k, 8.5 * k, .7, FX.spray, FX.sprayEnd, 2.2, null, null, reduced);
    if (reduced) return;
    for (let i = 0; i < SLAM.dust; i++) {
      const a = 2 * Math.PI * (i + rng()) / SLAM.dust, s = SLAM.throw * (.7 + .5 * rng()) * k; v.x = Math.cos(a) * s; v.y = 0; v.z = Math.sin(a) * s;
      stand(p.alpha, t + .015 * i, dir, UP, 1.5 * k, 1, 1.6 * k, 4 * k, 1.3, FX.spray, FX.sprayEnd, 2.6, v, null);
    }
    at.x = c.x; at.y = water + .02; at.z = c.z;
    for (let i = 0; i < SLAM.rings; i++) spawnPuff(p.rings, t + .13 * i, at, 0, 1.2, 1 * k, (4.5 + 2.2 * i) * k, 1, FX.spray, FX.spray, .8 - .15 * i);
    return;
  }
  const wall = kind === 'wall';
  // The cloud that stays, which is all reduced motion gets: pale stone dust that swells where the body struck and thins over two
  // seconds. On a cliff it is pushed off the face.
  v.x = wall ? n.x * 26 * k : 0; v.y = 0; v.z = wall ? n.z * 26 * k : 0;
  stand(p.alpha, t, c, n, 0, 2, (wall ? 3.4 : 4.5) * k, (wall ? 8 : 10) * k, 1, FX.stone, FX.stoneEnd, 2.2, v, WIND, reduced);
  if (reduced) return;
  // The burst: dark earth thrown out fast and gone in half a second, and on the ground a plume thrown up out of the middle of it.
  stand(p.alpha, t, c, n, 0, .5, 2.4 * k, (wall ? 7 : 8) * k, 1, FX.earth, FX.stone, 3, v, null);
  if (!wall) stand(p.alpha, t + .04, c, n, 3 * k, 1.3, 2.4 * k, 6 * k, 1.6, FX.earth, FX.stoneEnd, 2.6, null, WIND);
  // Two directions lying in the surface, to throw a skirt of dust out along it.
  const ax = Math.abs(n.y) < .9 ? 0 : 1, ay = Math.abs(n.y) < .9 ? 1 : 0;
  let ux = ay * n.z, uy = -ax * n.z, uz = ax * n.y - ay * n.x; const ul = Math.hypot(ux, uy, uz) || 1; ux /= ul; uy /= ul; uz /= ul;
  const wx = n.y * uz - n.z * uy, wy = n.z * ux - n.x * uz, wz = n.x * uy - n.y * ux, count = wall ? 4 : SLAM.dust, off = wall ? 14 : 0;
  for (let i = 0; i < count; i++) {
    const a = 2 * Math.PI * (i + rng()) / count, cs = Math.cos(a), sn = Math.sin(a), s = SLAM.throw * (.7 + .5 * rng()) * k;
    v.x = (ux * cs + wx * sn) * s + n.x * off; v.y = (uy * cs + wy * sn) * s + n.y * off; v.z = (uz * cs + wz * sn) * s + n.z * off;
    stand(p.alpha, t + .012 * i, c, n, 0, 1 + .6 * rng(), 2.6 * k, (5.6 + 1.6 * rng()) * k, 1, i & 1 ? FX.earth : FX.stone, FX.stoneEnd, 2.4, v, WIND);
  }
  // Chips of rock in the mountain's own colours, and embers knocked off the demon. Chips fly every way, so off a cliff about half
  // go into the rock and are lost: six are thrown there to leave three or so in the air.
  at.x = c.x + n.x * .4; at.y = c.y + n.y * .4; at.z = c.z + n.z * .4;
  for (let i = 0, chips = wall ? 6 : SLAM.chips; i < chips; i++) addDebris(at, 4, 6 + 9 * k, wall ? 1.5 : 4 + 5 * k, shardK(.55 + .5 * rng(), shardGain(g)), 0, true);
  for (let i = 0; i < SLAM.embers; i++) { lobeDir(n, rng(), rng(), dir); sparkParams(rng(), rng(), false, spark); spawnSpark(p.sparks, t, at, dir, spark.speed, spark.life); }
}
