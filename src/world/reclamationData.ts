import type { Triple } from './kit';
export type Plant = { position: Triple; scale: Triple; yaw: number; tilt?: number };
const treeSites = [
  [-22, 2.1, 34, 4.6], [22, 2.1, 16, 5.6], [-25, 2.1, -16, 5.1], [25, 2.1, -13, 4.4],
  [-34, 20.65, 28, 2.3], [32, 16.95, 22, 2.8], [-41, 31.7, -28, 2.7], [33, 46.55, -38, 2.3],
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
  const vines = [
    [-39, 26.9, 37.4, 11], [-32, 26.9, 37.4, 8], [-41, 19.5, 37.4, 7],
    [29, 24.2, 30.9, 9], [34, 20.5, 30.9, 6], [-44, 42.7, -17.1, 10],
    [28, 57.7, -26.6, 11], [31, 46.55, -26.6, 7],
  ];
  for (const [x, top, z, count] of vines) for (let i = 0; i < count; i++) {
    const taper = 1 - i / (count * 1.5);
    plants.push({ position: [x + Math.sin(i * .8) * .45, top - i * .86, z],
      scale: [3.8 * taper, 4.5, 2.5], yaw: Math.sin(i) * .6, tilt: Math.PI });
  }
  return plants;
}
