import type { Triple } from './kit';
import { GROWTH, heightAt, slopeAt } from './massifData';
export type Plant = { position: Triple; scale: Triple; yaw: number; tilt?: number };
/** Authored cedar sites on the banks below the summit. cedarData grows a tree on each one the terrain still accepts. */
const treeSites = [
  [-22, 34, 4.6], [22, 16, 5.6], [-25, -16, 5.1], [25, -13, 4.4],
  [-50, 44, 2.3], [58, 49, 3], [-80, -10, 2], [86, -15, 2.4],
];
export const trees: Plant[] = treeSites.map(([x, z, s], i) => ({ position: [x, heightAt(x, z), z],
  scale: [s * (.9 + i % 3 * .08), s, s], yaw: i * 2.399 }));
/** Ivy and scrub in rows along the gorge banks, each clump set on the terrain. Rows that climb past the treeline or onto a
 * cliff face are dropped rather than left hanging, so the east flank thins out as it rises toward the summit. */
export function makeUnderstory() {
  const plants: Plant[] = [];
  const rooted = (x: number, z: number) => heightAt(x, z) <= GROWTH.treeline && slopeAt(x, z) <= GROWTH.ivySlope;
  for (const side of [-1, 1]) {
    for (let i = 0; i < 18; i++) {
      const z = 54 - i * 8.2, x = side * (17 + i % 2);
      if (rooted(x, z)) plants.push({ position: [x, heightAt(x, z), z], scale: [3.2, 3.8, 3], yaw: i * 2.4 });
    }
    for (let i = 0; i < 5; i++) {
      const x = side * (15 + i * 5), z = -3.5;
      if (rooted(x, z)) plants.push({ position: [x, heightAt(x, z), z], scale: [3.8, 4, 3.3], yaw: i * 1.8 });
    }
  }
  return plants;
}
