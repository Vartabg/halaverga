import type { Block } from './villageHouseData';

/** Feet on the arrival path. Yaw PI turns the local -z face toward world +z, the arrival camera. */
export const VILLAGER = { x: 2.55, y: 20.12, z: 62.4, yaw: Math.PI };

const SKIN = '#c49a78';
const LINEN = '#d7c7a8';
const ROBE = '#7d624c';
const HAIR = '#2a2118';
const EYE = '#1c1612';
const SOLE = '#3c342e';

/** A person on foot, built in local space. The face and the nose sit on local -z. */
export function villagerBlocks(): Block[] {
  const p = (x: number, y: number, z: number, w: number, h: number, d: number, color: string): Block => ({ x, y, z, w, h, d, color });
  return [
    p(-0.12, 0.06, 0.04, 0.16, 0.12, 0.28, SOLE),
    p(0.12, 0.06, 0.04, 0.16, 0.12, 0.28, SOLE),
    p(-0.1, 0.4, 0, 0.16, 0.52, 0.16, ROBE),
    p(0.1, 0.4, 0, 0.16, 0.52, 0.16, ROBE),
    p(0, 0.86, 0, 0.56, 0.62, 0.32, LINEN),
    p(0, 1.02, -0.02, 0.58, 0.1, 0.34, SOLE),
    p(0, 1.28, 0, 0.48, 0.4, 0.26, LINEN),
    p(-0.36, 1.16, 0, 0.14, 0.48, 0.14, LINEN),
    p(0.36, 1.16, 0, 0.14, 0.48, 0.14, LINEN),
    p(-0.36, 0.86, -0.02, 0.12, 0.14, 0.12, SKIN),
    p(0.36, 0.86, -0.02, 0.12, 0.14, 0.12, SKIN),
    p(0, 1.52, 0, 0.14, 0.1, 0.12, SKIN),
    p(0, 1.72, 0, 0.32, 0.34, 0.28, SKIN),
    p(0, 1.88, 0.02, 0.34, 0.12, 0.3, HAIR),
    p(-0.08, 1.76, -0.16, 0.07, 0.06, 0.04, EYE),
    p(0.08, 1.76, -0.16, 0.07, 0.06, 0.04, EYE),
    p(0, 1.82, -0.16, 0.22, 0.04, 0.04, HAIR),
    p(0, 1.68, -0.18, 0.06, 0.08, 0.06, SKIN),
    p(0, 1.58, -0.16, 0.1, 0.03, 0.03, '#6b3a32'),
  ];
}
