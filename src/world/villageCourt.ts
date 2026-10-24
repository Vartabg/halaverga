import { INK } from './paintInk';

/** One painted patch on the arrival court. Visual only. The terrace collider underneath is unchanged. */
export type CourtPart = { x: number; y: number; z: number; w: number; h: number; d: number; color: string };

/** Threshold of Hermon Sanctuary Pavement: carved obsidian-indigo flagstones, golden Covenant seal inlays,
 * and alabaster threshold borders around the arrival dais (top near y 20.07). */
export function courtParts(): CourtPart[] {
  const y = 20.09, h = 0.04;
  return [
    { x: 0, y, z: 65, w: 6, h, d: 16, color: INK.plinth },
    { x: 0, y: 20.12, z: 65, w: 4.4, h: 0.04, d: 4.4, color: INK.crown },
    { x: 0, y: 20.15, z: 65, w: 3.4, h: 0.04, d: 3.4, color: INK.plinth },
    { x: 0, y: 20.18, z: 65, w: 1.6, h: 0.04, d: 1.6, color: INK.lit },
    { x: -7.2, y, z: 64, w: 6.4, h, d: 14, color: INK.rock },
    { x: 7.2, y, z: 64, w: 6.4, h, d: 14, color: INK.rock },
    { x: -6.8, y: 20.13, z: 63, w: 3.2, h: 0.05, d: 8.5, color: INK.shaft },
    { x: 6.8, y: 20.13, z: 63, w: 3.2, h: 0.05, d: 8.5, color: INK.shaft },
    { x: 0, y: 20.13, z: 56.6, w: 18, h: 0.06, d: 0.7, color: INK.crown },
    { x: 0, y: 20.16, z: 55.8, w: 20, h: 0.06, d: 0.8, color: INK.lit },
    { x: -10.4, y: 20.13, z: 65, w: 0.5, h: 0.08, d: 15, color: INK.crown },
    { x: 10.4, y: 20.13, z: 65, w: 0.5, h: 0.08, d: 15, color: INK.crown },
  ];
}
