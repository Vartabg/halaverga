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
export const CEDAR = { trunkR: .22, trunkH: .34, snowY: .97, snowR: .55, seed: 611 };

/** Authored bank sites (the old snag positions) plus a seeded scatter farther out, all clear of the route corridor (x -12..12). */
export function makeCedars(seed = CEDAR.seed): Cedar[] {
  const out: Cedar[] = trees.map(t => ({ position: t.position, scale: t.scale[1] / 4.5, yaw: t.yaw }));
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
