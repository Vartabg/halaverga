import { colors, type Kit } from './kit';
import { INK, INK_GROUP } from './paintInk';

/** Bridge of the Abyss & Dawn Waters Quay Buttresses: replaces the retired highway overpass, road sign, and drain pipes
 * with cyclopean basalt arches, bronze Watcher ward-pylons, and the Leaning Covenant Tablet while keeping exact solid colliders. */
export function heroRuins(k: Kit) {
  const ink = (x: number, y: number, z: number, w: number, h: number, d: number, col: string, solid = false, ry = 0, rz = 0) =>
    k.box(x, y, z, w, h, d, col, solid, ry, rz, 1, INK_GROUP);
  for (const side of [-1, 1]) {
    // Cyclopean basalt spandrels and bronze ward-posts along the Bridge of the Abyss
    for (const z of [-4.2, 2.2]) {
      ink(side * 32, 13.7, z, 40, 1.7, .65, INK.plinth);
      for (let i = 0; i < 8; i++) {
        ink(side * (15 + i * 4.5), 16.4, z, .38, 1.5, .38, INK.shaft);
        ink(side * (15 + i * 4.5), 17.25, z, .56, .24, .56, INK.crown);
      }
      ink(side * 32, 16.85, z, 38, .22, .28, INK.crown);
    }
    ink(side * 36, 12.5, -1, 7, 1.3, 4, INK.shaft);
    for (let i = 0; i < 6; i++) {
      // Carved golden covenant inlays along the bridge deck & fractured cleft stones at the abyss breach
      ink(side * (16 + i * 5.5), 15.64, -1, 2.4, .05, .45, INK.crown);
      ink(side * (10.1 + (i % 2) * .7), 14.7 - (i % 3) * .2, -4 + i * 1.15,
        1.2, .65, 1.1, INK.rock, false, i * .4, side * .25);
      ink(side * (8.4 + i * .24), 14.8 - i * .09, -3.8 + i * 1.25,
        3.6, .18, .22, INK.broken, false, .06 * i, side * .16);
    }
  }
  // Fallen cyclopean bridge slab in the cleft below
  ink(6.44, 7.73, -1, 16.8, .12, 7.2, INK.lit, false, .05, 1.17);
  ink(6.39, 7.82, -1, 12, .08, .55, INK.crown, false, .05, 1.17);
  // Watcher Bridge Gate Pylon & Obelisk Spire (preserves the exact solid collider at -18.5, 21.1, -3.9)
  ink(-18.5, 21.1, -3.9, 6.8, 2.5, .16, INK.plinth, true, 0, .1);
  ink(-18.5, 18.8, -3.9, 4.4, 5.2, 3.2, INK.plinth);
  ink(-18.5, 23.2, -3.9, 2.8, 5.4, 2.4, INK.shaft);
  ink(-18.5, 26.2, -3.9, 3.4, .65, 2.9, INK.crown);
  ink(-18.5, 28.4, -3.9, 1.6, 3.8, 1.6, INK.lit);
  k.box(-18.5, 30.8, -3.9, 1.1, 1.4, 1.1, colors.white);
  // Carved basalt quay buttresses and bronze water-gates along the Dawn Waters banks
  for (const side of [-1, 1]) for (let i = 0; i < 9; i++) {
    const z = 45 - i * 18;
    ink(side * 14.56, .85, z, .45, 1.5, 12, INK.plinth);
    ink(side * 14.35, 1.85, z, 1.1, 1.6, 1.4, INK.shaft);
    ink(side * 14.35, 2.75, z, 1.3, .28, 1.6, INK.crown);
  }
}
