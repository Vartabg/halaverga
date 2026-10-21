import { BREACH } from '@/game/breachRoutes';
import type { sanctuaryKit } from './sanctuaryKit';
type Kit = ReturnType<typeof sanctuaryKit>;
/** Broad lower cloister and high cantilever, with open ends and enough space to hover and turn. */
export function buildBreachRoutes(k: Kit) {
  const low = BREACH.low;
  k.box(low.x, 5, -49, 28, 5, 120);
  k.box(low.x, 7.6, -49, 28, .2, 120, 1);
  k.box(low.wallX, 18, low.wallZ, 4, 24, low.wallLength);
  k.box(low.x, 29, low.wallZ, 30, 4, low.wallLength);
  for (const z of [-27, -57, -87]) {
    k.column(-64, 7.7, z, 19, 1.25);
    k.box(low.wallX + 2.1, 26, z, .12, 3, 4, 1);
    k.box(low.x, 7.75, z, 3, .06, 9, 2);
  }
  for (const z of [13, -108]) {
    k.box(low.x, 7.8, z, 17, .18, 2, 1);
    k.column(-64, 0, z, 22, 1.8);
  }
  // Preserve the marked landing at30,61.44,-38; give its surrounding structure a readable underside.
  k.box(43, 58.6, -39, 22, 5.5, 58);
  k.box(43, 61.4, -39, 22, .06, 58, 1);
  k.box(57, 63, -39, .7, 3, 52);
  for (const z of [-15, -38, -61]) {
    k.box(54, 49, z, 3, 21, 4, 0, -.3);
    k.box(47, 55, z, 18, 3, 4);
    k.box(43, 61.46, z, 3, .06, 6, 2);
  }
  k.column(64, 2, -63, 65, 2.2); k.column(64, 2, -12, 44, 2.2);
  for (const [x, z, height] of [[-100, 22, 15], [-100, -114, 19], [100, -46, 25], [43, -39, 37]]) {
    k.drum(x, -height / 2, z, 2.5, height, 0, 13);
    k.box(x - 9, -height * .25, z, 2.5, height * .7, 4, 0, -.22);
  }
}
