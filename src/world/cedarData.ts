import { mulberry32 } from '@/game/combat';
import { GROWTH, heightAt, slopeAt } from './massifData';
import { trees } from './reclamationData';

/** Cedars of Lebanon on the banks below the summit (days of Jared, pre-Flood: living trees, not snags). Pure data, Node-safe.
 * A cedar is a trunk plus flat tiers, wide at the bottom and narrow at the top, with snow lying on the highest tier.
 * Every trunk base is sampled off the massif, so the grove follows the terrain instead of one authored bank level. */
export type Cedar = { position: [number, number, number]; scale: number; yaw: number };
export const CEDAR_TIERS = [
  { r: 1.35, y: .52, h: .13, dx: -.14, dz: .10 },
  { r: 1.48, y: .64, h: .12, dx: .18, dz: -.12 },
  { r: 1.18, y: .76, h: .11, dx: -.12, dz: -.12 },
  { r: .88, y: .87, h: .10, dx: .06, dz: .07 },
] as const;
export const CEDAR = { trunkR: .22, trunkH: .78, snowY: .94, snowR: .78, seed: 611 };
/** Metres from trunk base to snow cap at scale 1. Cedars.tsx builds the geometry to this height. */
export const CEDAR_HEIGHT = 9;

/** Ground a cedar: the authored x and z choose the site, the sampler decides how high the ground is there. */
const plant = (x: number, z: number, scale: number, yaw: number): Cedar =>
  ({ position: [x, heightAt(x, z), z], scale, yaw });

/** Ground that will hold a cedar: off the flight corridor, below the treeline and gentle enough to stand on. */
export const canGrow = (x: number, z: number) =>
  Math.abs(x) > GROWTH.corridor && heightAt(x, z) <= GROWTH.treeline && slopeAt(x, z) <= GROWTH.cedarSlope;

/** Hero cedars flanking the arrival view: rooted on the lower gorge shelves, spreading horizontal tabular crowns above the lip. */
export const HERO_SITES = [
  { x: -24, z: 46, scale: 3.0, yaw: .7 },
  { x: 24, z: 46, scale: 2.95, yaw: 2.4 },
  { x: -24, z: 41, scale: 3.05, yaw: 1.5 },
  { x: 24, z: 41, scale: 3.0, yaw: 0 },
] as const;
export const HERO_CEDARS: Cedar[] = HERO_SITES.map(s => plant(s.x, s.z, s.scale, s.yaw));

/** The heroes, then the authored bank sites, then a seeded scatter. Every site but the heroes is dropped unless canGrow
 * accepts the ground under it, which is what keeps the grove off the summit snow and the east cliffs. */
export function makeCedars(seed = CEDAR.seed): Cedar[] {
  const out: Cedar[] = [...HERO_CEDARS];
  for (const t of trees) {
    const [x, , z] = t.position;
    if (canGrow(x, z)) out.push(plant(x, z, t.scale[1] / 4.5, t.yaw));
  }
  const rng = mulberry32(seed);
  // Each bank is filled on its own quota. The east flank climbs to the summit and rejects most draws, so a single
  // alternating loop would spend the whole scatter on the west side.
  for (const side of [-1, 1]) {
    for (let planted = 0, tries = 0; planted < 7 && tries < 300; tries++) {
      const x = side * (18 + rng() * 70), z = 58 - rng() * 128, scale = .8 + rng() * .9, yaw = rng() * Math.PI * 2;
      if (!canGrow(x, z)) continue;
      out.push(plant(x, z, scale, yaw));
      planted++;
    }
  }
  return out;
}
