import { mulberry32 } from '@/game/combat';
import { trees } from './reclamationData';

/** Cedars of Lebanon on the banks below the summit (days of Jared, pre-Flood: living trees, not snags). Pure data, Node-safe.
 * A cedar is a trunk plus flat tiers, wide at the bottom and narrow at the top, with snow lying on the highest tier. */
export type Cedar = { position: [number, number, number]; scale: number; yaw: number };
export const CEDAR_TIERS = [
  { r: 2.6, y: .42, h: .5 },
  { r: 2.0, y: .60, h: .46 },
  { r: 1.45, y: .76, h: .42 },
  { r: .95, y: .90, h: .38 },
] as const;
export const CEDAR = { trunkR: .22, trunkH: .34, snowY: .985, snowR: .34, seed: 611 };

/** Hero cedars flanking the arrival terrace view: tall enough (scale 1.8-2.3, ~16-20 m) for their tiered crowns to enter the
 * frame from the banks below, clear of the route corridor. */
export const HERO_CEDARS: Cedar[] = [
  { position: [-19, 2.1, 44], scale: 2.2, yaw: .7 },
  { position: [20, 2.1, 38], scale: 1.9, yaw: 2.4 },
  { position: [-24, 2.1, 8], scale: 2.0, yaw: 1.5 },
  { position: [25, 2.1, 2], scale: 2.3, yaw: 0 },
];

/** Authored bank sites (the old snag positions) plus a seeded scatter farther out, all clear of the route corridor (x -12..12). */
export function makeCedars(seed = CEDAR.seed): Cedar[] {
  const out: Cedar[] = [...HERO_CEDARS, ...trees.map(t => ({ position: t.position, scale: t.scale[1] / 4.5, yaw: t.yaw }))];
  const rng = mulberry32(seed);
  for (let i = 0; i < 14; i++) {
    const side = i % 2 ? 1 : -1;
    out.push({
      position: [side * (34 + rng() * 62), 2.1, 58 - rng() * 128],
      scale: .8 + rng() * .9,
      yaw: rng() * Math.PI * 2,
    });
  }
  return out;
}
