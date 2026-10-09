// Arrivals and damage, matched to what was hit: the impact recipes (ruin concrete, bare steel, water, a drone's shell or eye, a
// blocked muzzle), the exposed-shell and failing states of a damaged drone, and the sparks they share. Pure spawning into the
// caller's preallocated pools; seeded randomness from the caller's generator; no three.
import { SURFACE, type EventKind, type Vec3 } from '@/game/combat';
import { DRONE } from '@/game/droneDodge';
import { CURVE_HOLD, lobeDir, sparkParams, spawnPuff, spawnSpark, type Puffs, type Sparks } from './fxPools';
import { FX } from './fxMaterials';
import { WIND } from './fxBurst';

export type ImpactPools = { add: Puffs; alpha: Puffs; rings: Puffs; sparks: Sparks };
export type Scorch = (c: Vec3, n: Vec3, size: number) => void;
const UP: Vec3 = { x: 0, y: 1, z: 0 }, at: Vec3 = { x: 0, y: 0, z: 0 }, v: Vec3 = { x: 0, y: 0, z: 0 }, dir: Vec3 = { x: 0, y: 0, z: 0 };
const spark = { speed: 0, life: 0 };
/** Scorch sizes (m): a ruin wall takes a clear mark, bare steel a small one, a blocked muzzle a smudge. */
export const SCORCH = { concrete: .75, steel: .3, blocked: .45, life: 6 } as const;
/** The damage trail cadence (s) per stage: broken (plate gone, 4-3 HP) wisps; failing (2-1 HP) smokes, sparks and glows. */
export const TRAIL = { brokenSmoke: .3, brokenSpark: .6, failSmoke: .1, failSpark: .22, failGlow: .3 } as const;

/** `count` sparks in the cosine lobe around nrm. Non-kill sparks reach at most 1.35 m, so they stay tight around the impact. */
export function burstSparks(sp: Sparks, t: number, c: Vec3, nrm: Vec3, count: number, rng: () => number, kill = false) {
  for (let k = 0; k < count; k++) {
    lobeDir(nrm, rng(), rng(), dir); sparkParams(rng(), rng(), kill, spark); spawnSpark(sp, t, c, dir, spark.speed, spark.life);
  }
}
/** A water ring at (x, z) at time `when`. */
export function waterRing(rings: Puffs, x: number, z: number, when: number, level: number) {
  at.x = x; at.y = level + .02; at.z = z; spawnPuff(rings, when, at, 0, .8, .2, 1.6, 1, FX.water, FX.water, .8);
}
/**
 * One arrival at c with surface normal nrm. kind: the shot outcome; surface: SURFACE.* for 'world' and 'blocked'; g: the drone-burst
 * gain at c (the energy puff on a drone keeps its on-screen size at range). Reduced motion: fewer sparks, no dust drift.
 */
export function spawnImpact(p: ImpactPools, scorch: Scorch, kind: EventKind, surface: number, c: Vec3, nrm: Vec3, t: number, rng: () => number, reduced: boolean, g: number, water: number) {
  if (kind === 'water') {
    // A splash column, the ring, and three droplets thrown up and out that fall back within .35 s.
    at.x = c.x; at.y = c.y + .3; at.z = c.z;
    spawnPuff(p.add, t, at, 0, .3, .2, .26, 2.4, FX.water, FX.water, .9); waterRing(p.rings, c.x, c.z, t, water);
    for (let k = 0, n = reduced ? 1 : 3; k < n; k++) {
      lobeDir(UP, .1 + .3 * rng(), rng(), dir); v.x = dir.x * 2.5; v.y = dir.y * 2.5; v.z = dir.z * 2.5;
      spawnPuff(p.add, t + .02 * k, c, -1.2, .35, .08, .2, 1.4, FX.water, FX.water, .8, 0, v);
    }
    return;
  }
  if (kind === 'hit' || kind === 'weak' || kind === 'kill') {
    // The shell: the shot's energy splashes teal (amber on the eye) and a little dark smoke leaves the dent.
    burstSparks(p.sparks, t, c, nrm, reduced ? 4 : kind === 'weak' ? 10 : 6 + Math.floor(rng() * 5), rng, kind === 'kill');
    const eye = kind === 'weak', sz = eye ? .45 : .35;
    spawnPuff(p.add, t, c, 0, .12, sz * g, (eye ? .8 : .6) * g, 1, eye ? FX.amber : FX.core, FX.spark, .8);
    if (kind !== 'weak') spawnPuff(p.alpha, t + .03, c, .9, .5, .2 * g, .7 * g, 1, FX.smoke, FX.smoke, .45, 0, null, WIND);
    return;
  }
  const steel = surface === SURFACE.steel, blocked = kind === 'blocked';
  // The world: a teal energy splash on any surface; concrete throws dust and takes a scorch; bare steel pings white and sparks more.
  spawnPuff(p.add, t, c, 0, .09, .15, steel ? .5 : .6, 1, steel ? FX.steelHot : FX.core, FX.fringe, .9);
  burstSparks(p.sparks, t, c, nrm, reduced ? 3 : steel ? 9 + Math.floor(rng() * 5) : 5 + Math.floor(rng() * 4), rng);
  if (!steel) {
    v.x = nrm.x * 1.6; v.y = nrm.y * 1.6 + .3; v.z = nrm.z * 1.6;
    spawnPuff(p.alpha, t, c, .5, blocked ? .4 : .6, .3, blocked ? .9 : 1.3, 1, FX.dust, FX.dustEnd, .55, 0, reduced ? null : v);
  }
  scorch(c, nrm, blocked ? SCORCH.blocked : steel ? SCORCH.steel : SCORCH.concrete);
}
/** The plate breaking off at 4 HP: an orange flare where the shell opened, on top of the chips and sparks the caller adds. */
export function spawnBreak(p: ImpactPools, t: number, c: Vec3, g: number) {
  spawnPuff(p.add, t, c, 0, .3, .5 * g, 1.1 * g, 1, FX.pop, FX.blaze, .8, CURVE_HOLD);
}
/** The drone starting to fail at 2 HP: a crackle of sparks, a gout of dark smoke and a short amber flare. */
export function spawnFail(p: ImpactPools, t: number, c: Vec3, g: number, rng: () => number, reduced: boolean) {
  burstSparks(p.sparks, t, c, UP, reduced ? 4 : 12, rng);
  spawnPuff(p.alpha, t, c, 1.2, 1, .5 * g, 1.8 * g, 1, FX.ash, FX.ashEnd, .7, 0, null, WIND);
  spawnPuff(p.add, t, c, 0, .25, .4 * g, .9 * g, 1, FX.amber, FX.blaze, .7, CURVE_HOLD);
}
/** Stage of a live drone's damage: 0 whole, 1 broken (plate gone), 2 failing (2 HP or less). */
export const damageStage = (hp: number, broken: number) => hp <= DRONE.failAt ? 2 : broken || hp <= DRONE.breakAt ? 1 : 0;
export type TrailClock = { smoke: Float64Array; spark: Float64Array; glow: Float64Array };
/**
 * The trail of damaged drone i at p (gain g keeps it readable at range). Broken: thin wisps and a spark now and then. Failing: dark
 * smoke on the wind, sparks and a steady dim ember glow in the open shell. Each cadence runs on its own timer.
 */
export function trailDrone(p: ImpactPools, clock: TrailClock, i: number, stage: number, at: Vec3, t: number, g: number, rng: () => number, reduced: boolean) {
  if (stage === 0) { clock.smoke[i] = clock.spark[i] = clock.glow[i] = 0; return; }
  const failing = stage === 2;
  if (t >= clock.smoke[i]) {
    if (failing) spawnPuff(p.alpha, t, at, 1.4, 1.3, .6 * g, 2.2 * g, 1, FX.ash, FX.ashEnd, .7, 0, null, WIND);
    else spawnPuff(p.alpha, t, at, 1.2, .9, .35 * g, 1.1 * g, 1, FX.ash, FX.ashEnd, .4, 0, null, WIND);
    clock.smoke[i] = t + (failing ? TRAIL.failSmoke : TRAIL.brokenSmoke);
  }
  if (t >= clock.spark[i]) { burstSparks(p.sparks, t, at, UP, failing && !reduced ? 2 : 1, rng); clock.spark[i] = t + (failing ? TRAIL.failSpark : TRAIL.brokenSpark); }
  if (failing && t >= clock.glow[i]) { spawnPuff(p.add, t, at, 0, .4, .5 * g, .5 * g, 1, FX.blaze, FX.ember, .45); clock.glow[i] = t + TRAIL.failGlow; }
}
