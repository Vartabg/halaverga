import type { Triple } from './kit';
export type Plant = { position: Triple; scale: Triple; yaw: number; tilt?: number };
/** Dead trees on the banks, bare since the light went (2033). The rooftop trees and the facade vines are gone with the roofs. */
const treeSites = [
  [-22, 2.1, 34, 4.6], [22, 2.1, 16, 5.6], [-25, 2.1, -16, 5.1], [25, 2.1, -13, 4.4],
  [-50, 2.1, 44, 2.3], [58, 2.1, 49, 3], [-80, 2.1, -10, 2], [86, 2.1, -15, 2.4],
];
export const trees: Plant[] = treeSites.map(([x, y, z, s], i) => ({ position: [x, y, z],
  scale: [s * (.9 + i % 3 * .08), s, s], yaw: i * 2.399 }));
export function makeUnderstory() {
  const plants: Plant[] = [];
  for (const side of [-1, 1]) {
    for (let i = 0; i < 18; i++) {
      const z = 54 - i * 8.2;
      plants.push({ position: [side * (17 + i % 2), 3.8, z], scale: [3.2, 3.8, 3], yaw: i * 2.4 });
    }
    // Growth occupies the retained deck and leaves the fractured opening clear.
    for (let i = 0; i < 5; i++) plants.push({ position: [side * (15 + i * 5), 15.7, -3.5],
      scale: [3.8, 4, 3.3], yaw: i * 1.8 });
  }
  return plants;
}
