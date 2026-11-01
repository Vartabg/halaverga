import { colors, type Kit } from './kit';
import { INK, INK_GROUP } from './paintInk';

/** The Cloven Crag Arch of Hermon & Gorge Bluffs: replaces the retired highway overpass, road sign, and canal walls
 * with natural fluted basalt mountain arches, snow-capped crag spurs, and a Watcher monolith spire while keeping exact solid colliders. */
export function heroRuins(k: Kit) {
  const ink = (x: number, y: number, z: number, w: number, h: number, d: number, col: string, solid = false, ry = 0, rz = 0) =>
    k.box(x, y, z, w, h, d, col, solid, ry, rz, 1, INK_GROUP);
  for (const side of [-1, 1]) {
    // Stepped basalt mountain arch buttresses spanning from the gorge cliffs toward the central cleft (zero flat square slabs)
    for (let i = 0; i < 5; i++) {
      const x = side * (14 + i * 8.5), h = 11 + i * 2.2, r = 3.6 + (i % 2) * 1.2;
      k.pillar(x, 9.8 - i * .5, -1 + (i % 2 ? 1.2 : -1.2), h, r * .38, r * 1.1, i * 23 + side * 7, i * .5, .96, { depth: .16, course: 3.2 });
    }
    k.pillar(side * 36, 8.2, -1, 16.5, 1.4, 4.2, side * 41, .35, .92, { depth: .15, course: 3.6 });
  }
  // Fallen crag spire resting in the chasm below the cleft arch
  k.pillar(6.5, 6.6, -1, 14.5, .8, 3.1, 73, .4, .94, { depth: .16, course: 3.0 });
  // Western Crag Watcher Spire (preserves the exact solid collider at -18.5, 21.1, -3.9)
  k.solids.push({ position: [-18.5, 21.1, -3.9], size: [3.4, 1.25, .08], rotation: [0, 0, .1] });
  k.pillar(-18.5, 22.0, -3.9, 15.5, .75, 3.1, 91, .5, .98, { depth: .15, course: 3.4 });
  k.box(-18.5, 30.6, -3.9, 1.0, 1.8, 1.0, colors.white);
  // Scalloped 12-sided basalt gorge bluffs overlapping the water's edge so no straight canal wall is visible
  for (const side of [-1, 1]) for (let i = 0; i < 14; i++) {
    const z = 62 - i * 16, x = side * (16.5 + (i % 3) * 2.8), r = 4.2 + (i % 3) * 1.6, h = 6.5 + (i % 3) * 2.8;
    k.pillar(x, .8 + h * .38, z, h, r * .35, r * 1.25, i * 37 + side * 11, i * .6, .94, { depth: .16, course: 2.6 });
  }
}
