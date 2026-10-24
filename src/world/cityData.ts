import { createKit, car, colors, CALM_GROUP } from './kit';
import { ruinBuilding, type RuinKind } from './ruinBuilding';
import { trees } from './reclamationData';
import { heroRuins } from './heroRuins';
import { STELE, placeStele } from './steleData';
import { INK, INK_GROUP } from './paintInk';
/** The district-edge hills: ash-grey stone walls and weathered summit ridges on the stone texture. Neither hex is in kit.ts's
 * surface() lists, so both fall in the stone group. */
export const HILL = { wall: '#7b786f', top: '#69655a', outerWall: '#75726a', outerTop: '#625e54', lift: [2.2, 1.4] as [number, number] };
/** What is left of each Watcher bastion (ruinBuilding.ts): the ruin kind and how many courses of its core still stand. */
const RUINS: [RuinKind, number][] = [
  ['stump', 3], ['frame', 3], ['shell', 3], ['stump', 4], ['shell', 7], ['shell', 10], ['frame', 4], ['stump', 3],
  ['pile', 3], ['shell', 5], ['stump', 5], ['frame', 4], ['shell', 6], ['frame', 5], ['stump', 5], ['shell', 6],
];
export function makeCity() {
  const k = createKit();
  const ink = (x: number, y: number, z: number, w: number, h: number, d: number, col: string, solid = false, ry = 0, rz = 0) =>
    k.box(x, y, z, w, h, d, col, solid, ry, rz, 1, INK_GROUP);
  // Twin basalt banks flanking the Dawn Waters channel.
  for (const side of [-1, 1]) {
    k.box(side * 75, -4, -35, 120, 12, 260, '#6c7a6b', true);
    k.box(side * 76, 1.8, -32, 116, .5, 240, colors.road, true);
    k.box(side * 16, 1.3, -42, 2.8, 5, 230, colors.concrete, true);
    // Bronze Covenant way-pillars along the Dawn Waters causeway (replaces road lane stripes)
    for (let z = -148; z < 82; z += 22) {
      ink(side * 24, 2.85, z, .75, 1.6, .75, INK.shaft);
      k.box(side * 24, 3.78, z, 1.0, .28, 1.0, colors.steel);
    }
  }
  const entries: [number, number, number, number, number, number, string][] = [
    [-34, 2, 28, 17, 18, 7, '#bd866f'], [-62, 2, 16, 23, 20, 10, '#ab9a86'],
    [36, 2, 22, 18, 17, 6, '#cbaa8d'], [68, 2, 29, 21, 19, 10, '#a79e96'],
    [-38, 2, -28, 20, 21, 11, '#b5afa0'], [36, 2, -38, 23, 22, 16, '#b7a692'],
    [-70, 2, -40, 24, 24, 15, '#9b9491'], [76, 2, -33, 23, 28, 8, '#b47c67'],
    [-34, 2, -86, 18, 21, 6, '#c39779'], [37, 2, -100, 23, 20, 10, '#a69c8b'],
    [-73, 2, -98, 27, 22, 10, '#ab968a'], [84, 2, -96, 28, 24, 14, '#9b9991'],
    [-40, 2, -146, 22, 20, 10, '#939893'], [43, 2, -160, 26, 20, 13, '#a39388'],
    [-109, 7, -11, 22, 27, 12, '#af9482'], [115, 8, -5, 23, 22, 13, '#b1a298'],
  ];
  entries.forEach((e, i) => ruinBuilding(k, ...e, i, ...RUINS[i], i === 5));
  for (const side of [-1, 1]) {
    k.hill(side * 140, 3, -15, 52, 25, 205, HILL.wall, HILL.top, HILL.lift);
    k.hill(side * 179, 12, -36, 40, 43, 200, HILL.outerWall, HILL.outerTop, HILL.lift);
    ruinBuilding(k, side * 140, 15.5, -70, 21, 23, 9, '#c49a7c', 23, 'stump', 3);
    ruinBuilding(k, side * 173, 33.5, -125, 19, 18, 7, '#a8a58e', 24, 'pile', 2);
  }
  // Threshold of Hermon: the sacred arrival terrace where the Watchers swore their oath.
  k.box(0, 19, 65, 24, 2, 20, colors.concrete, true);
  k.box(0, 20.04, 65, 22.8, .06, 18.8, colors.road);
  k.box(0, 9, 65, 18, 18, 14, '#7f7776', true);
  for (const x of [-9, 9]) {
    k.box(x, 21.2, 69, .14, 2.2, 10, '#a9b4b4', false, 0, 0, 2, CALM_GROUP);
    ink(x, 22.25, 69, .48, .28, 10.4, INK.crown);
    ink(x, 20.12, 65, .55, .24, 9.6, INK.plinth);
    // Twin Sanctuary Brazier Pylons framing the Threshold of Hermon
    ink(x * 1.18, 21.6, 56.2, 1.8, 3.2, 1.8, INK.plinth);
    ink(x * 1.18, 23.45, 56.2, 2.2, .55, 2.2, INK.crown);
    ink(x * 1.18, 24.15, 56.2, 1.2, .95, 1.2, INK.broken);
  }
  // Tablet of Semjaza (-7, 21, 58): Stepped Watcher Oath Obelisk & Covenant Shrine (preserves exact solid collider)
  ink(-7, 21, 58, 1.6, 2, 1.2, INK.plinth, true);
  ink(-7, 21.2, 58, 2.6, 2.4, 2.2, INK.plinth);
  ink(-7, 22.65, 58, 2.9, .45, 2.5, INK.crown);
  ink(-7, 25.1, 58, 1.5, 4.5, 1.3, INK.lit);
  ink(-7, 27.6, 58, 1.9, .5, 1.7, INK.crown);
  k.box(-7, 28.6, 58, .95, 1.6, .95, colors.white);
  ink(6, 20.25, 55.3, 5, .45, 2, INK.shaft, true, .23, -.14);
  // Bridge of the Abyss: cloven cyclopean stone span across the central chasm.
  for (const side of [-1, 1]) {
    ink(side * 31, 15, -1, 42, 1.1, 9, INK.rock, true);
    ink(side * 31, 15.58, -1, 42, .08, 7.5, INK.lit);
    ink(side * 36, 7, -1, 2.2, 15, 3, INK.shaft, true);
    for (const z of [-5, 3]) ink(side * 34, 16.2, z, 35, .55, .35, INK.crown);
    for (let i = 0; i < 5; i++) ink(side * 8, 14.9, -3 + i, 7, .16, .18, INK.broken);
  }
  ink(7, 7.5, -1, 17, 1.2, 8, INK.rock, true, .05, 1.17);
  // Sanctuary of the Throne (30, 61.39, -38): high ziggurat altar dais with Golden Celestial Seal.
  ink(30, 61.39, -38, 8, .05, 8, INK.lit, true);
  k.box(30, 61.43, -38, .45, .03, 5.2, colors.white);
  k.box(30, 61.43, -38, 5.2, .03, .45, colors.white);
  ink(30, 61.42, -38, 3.2, .04, 3.2, INK.crown);
  car(k, -24, 2.1, 45, '#5e4130', .1);
  car(k, 26, 2.1, -17, '#4a4540', -.12);
  car(k, -26, 2.1, -76, '#553a2b', .18);
  // Waterfront Watcher Reliquary Shrine at (-22, 3.5, -48) (preserves exact solid collider)
  ink(-22, 3.5, -48, 2.7, 2.5, 9, INK.shaft, true);
  ink(-22, 4.95, -48, 3.1, .38, 9.4, INK.crown);
  k.box(-22, 3.8, -43.45, 1.8, 1.4, .12, colors.white);
  for (let i = 0; i < 40; i++) {
    const side = i % 2 ? -1 : 1, z = 54 - i * 5.5, x = side * (29 + i * 7 % 70);
    ink(x, 2.55, z, 1.4 + i % 3, .8, 1.8, i % 4 ? INK.shaft : INK.plinth, false, i * .6, i % 3 * .09);
  }
  // Outer 1 Enoch Tablet Sanctuaries (non-solid visual monuments at the 4 open-world tablet coordinates)
  const outerShrines: [number, number, number][] = [[0, 3.2, -260], [-230, 3.2, -40], [230, 3.2, -30], [0, 3.2, 165]];
  for (const [sx, sy, sz] of outerShrines) {
    ink(sx, sy + 2.2, sz, 5.4, 4.4, 5.4, INK.plinth);
    ink(sx, sy + 7.5, sz, 2.8, 7.2, 2.8, INK.shaft);
    ink(sx, sy + 11.5, sz, 3.6, .9, 3.6, INK.crown);
    k.box(sx, sy + 13.2, sz, 1.4, 2.6, 1.4, colors.white);
  }
  for (const tree of trees) if (tree.position[1] < 3) {
    const [x, y, z] = tree.position, s = tree.scale[1];
    k.solids.push({ position: [x, y + s, z], size: [.24 * s, s, .24 * s], rotation: [0, 0, 0] });
  }
  heroRuins(k);
  STELE.forEach(s => placeStele(k, s));
  return k.finish();
}
