import { INK } from './paintInk';

/** One painted patch on the arrival court. Visual only. The terrace collider underneath is unchanged. */
export type CourtPart = { x: number; y: number; z: number; w: number; h: number; d: number; color: string };

/** Packed earth and stone on the terrace the opening stands on (top near y 20.07). The middle stays a path.
 * Houses stay outside x -4..4 and z 62..68. Days of Jared, before the Flood. No photo map. */
export function courtParts(): CourtPart[] {
  const y = 20.09, h = 0.04;
  return [
    { x: 0, y, z: 65, w: 6, h, d: 16, color: INK.plinth },
    { x: -7.2, y, z: 64, w: 6.4, h, d: 14, color: INK.rock },
    { x: 7.2, y, z: 64, w: 6.4, h, d: 14, color: INK.rock },
    { x: 0, y: 20.13, z: 56.6, w: 18, h: 0.06, d: 0.7, color: INK.shaft },
    { x: -10.4, y: 20.13, z: 65, w: 0.5, h: 0.08, d: 15, color: INK.shaft },
    { x: 10.4, y: 20.13, z: 65, w: 0.5, h: 0.08, d: 15, color: INK.shaft },
  ];
}
