// The kill: what a drone's death spawns into the effect pools, as one recipe (ImpactFx.tsx owns the pools and the frame loop).
// Pure spawning into preallocated pools; seeded randomness from the caller's generator; no three.
import type { Vec3 } from '@/game/combat';
import { ASH } from './atmospherePalette';
import { CURVE_FLAT, CURVE_HOLD, PLUME, killSparkCount, lobeDir, shardGain, shardK, sparkParams, spawnPuff, spawnSpark, type Puffs, type Sparks } from './fxPools';
import { FX } from './fxMaterials';

export type BurstPools = { add: Puffs; alpha: Puffs; rings: Puffs; sparks: Sparks };
export type AddDebris = (c: Vec3, speed0: number, speed1: number, up: number, scale: number, hot: number) => void;
/** The ash wind (m/s): kill smoke drifts with the falling ash. */
export const WIND: Vec3 = { x: ASH.wind[0], y: 0, z: ASH.wind[1] };
/** Lingering smoke: three dark puffs that climb slowly, spread and thin over 2.6 s, so the drone's absence is felt after the fire. */
export const LINGER = { count: 3, life: 2.6, rise: .55, s0: 1.8, s1: 5.6, alpha: .5, spread: 1.2 } as const;
/** The shockwave: a ground-plane ring that races out 1.2 -> 7.5 m in .34 s, white-hot to orange, then gone. */
export const SHOCK = { life: .34, r0: 1.2, r1: 7.5, alpha: .7 } as const;
/** Fireball lobes: three offset flame puffs thrown out of the core, so the fire is a shape that boils rather than one disc. */
export const LOBES = 3;
/** The pre-burst: during the 80 ms hit-stop a white core swells at the drone (reduced motion: none; it shares the pop's flash gate). */
export const PRE_BURST = { life: .08, s0: .5, s1: 1.8, alpha: .9 } as const;
const UP: Vec3 = { x: 0, y: 1, z: 0 }, at: Vec3 = { x: 0, y: 0, z: 0 }, v: Vec3 = { x: 0, y: 0, z: 0 }, dir: Vec3 = { x: 0, y: 0, z: 0 };
const spark = { speed: 0, life: 0 };

export function spawnPreBurst(p: BurstPools, t: number, c: Vec3, g: number) {
  spawnPuff(p.add, t, c, 0, PRE_BURST.life, PRE_BURST.s0 * g, PRE_BURST.s1 * g, 1, FX.white, FX.pop, PRE_BURST.alpha, CURVE_FLAT);
}
/**
 * The burst at the drone's centre c, with the distance gain g (burstGain) and `pop` true when the 3-per-second flash gate let the
 * white pop through. Reduced motion: no pop, no ring, no lobes, fewer sparks, one still smoke puff.
 */
export function spawnKillBurst(p: BurstPools, addDebris: AddDebris, t: number, c: Vec3, g: number, rng: () => number, reduced: boolean, pop: boolean) {
  const sg = shardGain(g);
  for (let k = 0; k < 9; k++) addDebris(c, 5, 11, 4, shardK(k < 3 ? 1.15 : .65 + .25 * rng(), sg), 1);
  // An 80 ms white-hot pop (gated), a hot centre, a flame core that holds its brightness while it grows 1.4 -> 3.4 m and cools
  // yellow -> orange -> ember, and a wide dim glow that outlasts the flying pieces.
  if (pop) spawnPuff(p.add, t, c, 0, .08, 5 * g, 5 * g, 1, FX.pop, FX.pop, 1, CURVE_FLAT);
  // The soft disc texture shows about 40% of a puff's width as its bright body, so the fire is sized 1.4x the 2026-09-23 recipe
  // (hot centre 1 -> 2.6 m, flame 1.8 -> 4.4 m, ember 3 -> 5.6 m, glow 3.5 -> 7.5 m) to read as a fireball, not a spark.
  spawnPuff(p.add, t, c, 0, .3, 1 * g, 2.6 * g, 1, FX.pop, FX.flame, 1, CURVE_HOLD);
  spawnPuff(p.add, t, c, 0, .5, 1.8 * g, 4.4 * g, 1, FX.flame, FX.blaze, 1, CURVE_HOLD);
  spawnPuff(p.add, t + .1, c, 0, .7, 3 * g, 5.6 * g, 1, FX.blaze, FX.ember, .85, CURVE_HOLD);
  spawnPuff(p.add, t, c, 0, .9, 3.5 * g, 7.5 * g, 1, FX.blaze, FX.ember, .4, CURVE_HOLD);
  // A dark alpha-blended core under the flame (the additive pool draws after it) so the flash reads over a bright sky.
  spawnPuff(p.alpha, t, c, 0, .5, 1.2 * g, 3.4 * g, 1, FX.char, FX.char, .4, CURVE_HOLD);
  if (!reduced) {
    // Lobes: flame thrown out of the core in three seeded directions, each jetting 4 m/s and holding its heat .45 s.
    for (let k = 0; k < LOBES; k++) {
      lobeDir(UP, .2 + .7 * rng(), (k + rng()) / LOBES, dir);
      at.x = c.x + dir.x * .3 * g; at.y = c.y + dir.y * .3 * g; at.z = c.z + dir.z * .3 * g;
      v.x = dir.x * 4; v.y = dir.y * 4; v.z = dir.z * 4;
      spawnPuff(p.add, t + .02 * k, at, 0, .45, 1.2 * g, 3 * g, 1, FX.flame, FX.blaze, .8, CURVE_HOLD, v);
    }
    spawnPuff(p.rings, t, c, 0, SHOCK.life, SHOCK.r0 * g, SHOCK.r1 * g, 1, FX.pop, FX.blaze, SHOCK.alpha, CURVE_HOLD);
  }
  for (let k = 0, n = reduced ? 8 : killSparkCount(rng()); k < n; k++) {
    lobeDir(UP, rng(), rng(), dir); sparkParams(rng(), rng(), true, spark); spawnSpark(p.sparks, t, c, dir, spark.speed, spark.life);
  }
  // Smoke: a few offset puffs of different sizes that start 80 ms after the pop, rise at their own speeds and spread out to a pale grey,
  // so it climbs away instead of hanging as one dark smudge (reduced motion: two still puffs).
  for (let k = 0, n = reduced ? 2 : 4; k < n; k++) {
    const a = 2 * Math.PI * (k + rng()) / n, r = .5 + .5 * rng();
    at.x = c.x + Math.cos(a) * r; at.y = c.y + (rng() - .3) * .6; at.z = c.z + Math.sin(a) * r;
    v.x = Math.cos(a) * 3; v.y = 0; v.z = Math.sin(a) * 3;
    spawnPuff(p.alpha, t + .08 + .04 * k, at, reduced ? 0 : PLUME.rise * (.7 + .6 * rng()), PLUME.life, PLUME.s0 * g * (.7 + .6 * rng()), PLUME.s1 * g, 1, FX.plume, FX.plumeEnd, PLUME.alpha, CURVE_HOLD, reduced ? null : v);
  }
  // Then the dark smoke that stays: darker than the overcast, lit from below by the glow while it lasts, drifting on the ash wind.
  for (let k = 0, n = reduced ? 1 : LINGER.count; k < n; k++) {
    const a = 2 * Math.PI * (k + .5 * rng()) / n, r = .4 * g * rng();
    at.x = c.x + Math.cos(a) * r; at.y = c.y + .3 * rng(); at.z = c.z + Math.sin(a) * r;
    v.x = Math.cos(a) * LINGER.spread; v.y = .4; v.z = Math.sin(a) * LINGER.spread;
    spawnPuff(p.alpha, t + .25 + .12 * k, at, LINGER.rise * (.8 + .4 * rng()), LINGER.life, LINGER.s0 * g, LINGER.s1 * g, 1, FX.ash, FX.ashEnd, LINGER.alpha, 0, reduced ? null : v, WIND);
  }
}
