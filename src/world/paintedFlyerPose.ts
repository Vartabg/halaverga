import type { Block } from './villageHouseData';
import { EYE, HAIR, LINEN, ROBE, SKIN, SOLE } from './villagerPose';

/** Hovering over the empty standing spot. Yaw PI turns the local -z face toward world +z, the arrival camera. */
export const FLIER = { x: 0, y: 21.9, z: 65.4, yaw: Math.PI };

export type FlyerPose = 'hover' | 'bank' | 'dive';

const MOUTH = '#6b3a32';

/** One painted stone. Same shape contract as the houses and the villager. */
const p = (x: number, y: number, z: number, w: number, h: number, d: number, color: string): Block => ({ x, y, z, w, h, d, color });

/** One wing on the back shoulders. Countable: one limb of two steps, one covert strip, one shadow row, five primaries. */
function wing(out: Block[], side: 1 | -1, pose: FlyerPose, tip: number) {
  const s = side;
  if (pose === 'dive') {
    // Folded: shortened, pressed flat and pushed behind the torso in a tight stack.
    out.push(p(s * 0.24, 1.02, 0.34, 0.4, 0.14, 0.3, LINEN));
    out.push(p(s * 0.52, 0.96, 0.62, 0.3, 0.14, 0.34, LINEN));
    out.push(p(s * 0.74, 0.94, 0.78, 0.34, 0.1, 0.28, LINEN));
    for (let i = 0; i < 5; i++) {
      const z = 0.9 + i * 0.13;
      out.push(p(s * 0.8, 1.06 - i * 0.1, z, 0.5, 0.06, 0.05, i === 0 ? SOLE : LINEN));
    }
    out.push(p(s * 0.55, 0.9, 0.62, 0.62, 0.08, 0.05, SOLE));
    out.push(p(s * 0.55, 0.82, 0.62, 0.5, 0.06, 0.04, LINEN));
    return;
  }
  const lift = pose === 'bank' ? s * 0.04 : 0; // bank rolls one wing up and the other down
  out.push(p(s * 0.34, 1.06 + lift, 0.24, 0.52, 0.15, 0.13, LINEN));
  out.push(p(s * 0.82, 1.3 + lift, 0.3, 0.5, 0.14, 0.13, LINEN));
  out.push(p(s * 1.16, 1.5 + lift, 0.36, 0.34, 0.13, 0.12, LINEN));
  out.push(p(s * 0.98, 1.62 + lift, 0.4, 0.9, 0.08, 0.06, LINEN));
  out.push(p(s * 1.3, 1.56 + tip * 0.5, 0.42, 1.2, 0.07, 0.05, SOLE));
  const rows: Array<[number, number, number]> = [
    [1.42, 1.66, 1.44],
    [1.52, 1.8, 1.3],
    [1.6, 1.94, 1.14],
    [1.66, 2.08, 0.96],
    [1.7, 2.22, 0.74],
  ];
  for (let i = 0; i < rows.length; i++) {
    const [cx, cy, len] = rows[i];
    const y = cy + (pose === 'bank' ? s * 0.12 * (1 - i * 0.14) : 0) + tip;
    out.push(p(s * cx, y, 0.44 + i * 0.03, len, 0.07, 0.05, LINEN));
  }
}

/** The body of the man: the villager's proportions, carried into flight. Robe trailing, face on local -z. */
function body(out: Block[], pose: FlyerPose) {
  const dive = pose === 'dive';
  const lean = pose === 'bank' ? 0.06 : 0;
  const zBody = dive ? 0.12 : 0;
  // Legs trail the flight: thighs under the robe hips, shins drawn back, soles kicked down.
  out.push(p(-0.11 - lean, 0.34, 0.02, 0.16, 0.42, 0.16, ROBE));
  out.push(p(0.11 - lean, 0.34, 0.02, 0.16, 0.42, 0.16, ROBE));
  out.push(p(-0.11 - lean, 0.06, dive ? 0.3 : 0.2, 0.13, 0.4, 0.13, ROBE));
  out.push(p(0.11 - lean, 0.06, dive ? 0.3 : 0.2, 0.13, 0.4, 0.13, ROBE));
  out.push(p(-0.11 - lean, -0.16, dive ? 0.44 : 0.34, 0.16, 0.1, 0.26, SOLE));
  out.push(p(0.11 - lean, -0.16, dive ? 0.44 : 0.34, 0.16, 0.1, 0.26, SOLE));
  // Tunic and belt trim, the same cloth as the villager.
  out.push(p(lean, 0.74 + zBody, 0, 0.56, 0.54, 0.32, LINEN));
  out.push(p(lean, 1.04 + zBody, -0.02, 0.58, 0.1, 0.34, SOLE));
  out.push(p(lean, 1.3 + zBody, 0, 0.5, 0.42, 0.28, LINEN));
  // Arms spread for hover and bank; tucked to the sides in the dive.
  const aX = dive ? 0.32 : 0.44;
  const aY = dive ? 1.2 : 1.16;
  const aZ = dive ? 0.14 : 0;
  out.push(p(-aX - lean * 0.5, aY + zBody, aZ, 0.14, 0.48, 0.14, LINEN));
  out.push(p(aX - lean * 0.5, aY + zBody, aZ, 0.14, 0.48, 0.14, LINEN));
  out.push(p(-aX - lean * 0.6, aY - 0.3 + zBody, aZ - 0.02, 0.12, 0.14, 0.12, SKIN));
  out.push(p(aX - lean * 0.6, aY - 0.3 + zBody, aZ - 0.02, 0.12, 0.14, 0.12, SKIN));
  // Head: neck, face, hair, eyes, nose, brow, mouth - the readable face of the paint bar.
  out.push(p(lean, 1.56 + zBody, 0, 0.14, 0.1, 0.12, SKIN));
  out.push(p(lean, 1.76 + zBody, dive ? -0.14 : 0, 0.32, 0.34, 0.28, SKIN));
  out.push(p(lean, 1.92 + zBody, dive ? -0.12 : 0.02, 0.34, 0.12, 0.3, HAIR));
  out.push(p(lean - 0.08, 1.8 + zBody, -0.16, 0.07, 0.06, 0.04, EYE));
  out.push(p(lean + 0.08, 1.8 + zBody, -0.16, 0.07, 0.06, 0.04, EYE));
  out.push(p(lean, 1.86 + zBody, -0.16, 0.24, 0.04, 0.04, HAIR));
  out.push(p(lean, 1.72 + zBody, -0.18, 0.06, 0.08, 0.06, SKIN));
  out.push(p(lean, 1.62 + zBody, -0.16, 0.1, 0.03, 0.03, MOUTH));
}

/** The winged painted man in local space. Same call with the same pose is the same array. */
export function paintedFlyerBlocks(pose: FlyerPose = 'hover'): Block[] {
  const out: Block[] = [];
  body(out, pose);
  wing(out, -1, pose, 0);
  wing(out, 1, pose, 0);
  return out;
}
