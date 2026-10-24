import { createKit, car, colors, CALM_GROUP } from './kit';
import { ruinBuilding, type RuinKind } from './ruinBuilding';
import { trees } from './reclamationData';
import { heroRuins } from './heroRuins';
import { STELE, placeStele } from './steleData';
import { INK, INK_GROUP } from './paintInk';
/** The outer Hermon alpine ridges: weathered stone cliffs and summit snow-stone on the stone texture. */
export const HILL = { wall: '#7b786f', top: '#69655a', outerWall: '#75726a', outerTop: '#625e54', lift: [2.2, 1.4] as [number, number] };
const RUINS: [RuinKind, number][] = [
  ['stump', 3], ['frame', 3], ['shell', 3], ['stump', 4], ['shell', 7], ['shell', 10], ['frame', 4], ['stump', 3],
  ['pile', 3], ['shell', 5], ['stump', 5], ['frame', 4], ['shell', 6], ['frame', 5], ['stump', 5], ['shell', 6],
];
export function makeCity() {
  const k = createKit();
  const ink = (x: number, y: number, z: number, w: number, h: number, d: number, col: string, solid = false, ry = 0, rz = 0) =>
    k.box(x, y, z, w, h, d, col, solid, ry, rz, 1, INK_GROUP);
  // Twin alpine mountain shelves flanking the Hermon chasm (no visible straight canal edge at x = ±15)
  for (const side of [-1, 1]) {
    k.solids.push({ position: [side * 75, -4, -35], size: [60, 6, 130], rotation: [0, 0, 0] });
    k.box(side * 76, 1.8, -32, 116, .5, 240, colors.road, true);
    k.solids.push({ position: [side * 16, 1.3, -42], size: [1.4, 2.5, 115], rotation: [0, 0, 0] });
    // Conical fluted mountain foothills and waystones along the alpine shelf
    for (let z = -142; z <= 74; z += 27) {
      k.pillar(side * (24 + (Math.abs(z) % 5)), 3.2, z, 4.2, .45, 1.75, z * 13 + side, z * .2, .96, { depth: .15, course: 1.8 });
      k.box(side * (24 + (Math.abs(z) % 5)), 5.4, z, .7, .35, .7, colors.steel);
    }
  }
  const entries: [number, number, number, number, number, number, string][] = [
    [-34, 2, 28, 17, 18, 7, '#bd866f'], [-62, 2, 16, 23, 20, 10, '#ab9a86'],
    [36, 2, 22, 18, 17, 6, '#cbaa8d'], [68, 2, 29, 21, 19, 10, '#a79e96'],
    [-38, 2, -28, 20, 21, 11, '#b5afa0'], [36, 2, -38, 23, 22, 16, '#b7a692'],
    [-70, 2, -40, 24, 24, 15, '#9b9491'], [76, 2, -33, 23, 28, 8, '#b47c67'],
    [-34, 2, -86, 18, 21, 6, '#c39779'], [37, 2, -100, 23, 20, 10, '#a69c8b'],
    [-73, 2, -98, 27, 22, 10, '#ab968a'], [84, 2, -96, 28, 24, 14, '#9b9991'],
    [-40, 2, -146, 22, 20, 10, '#939893'], [43, 2, -146, 26, 20, 13, '#a39388'],
    [-109, 7, -11, 22, 27, 12, '#af9482'], [115, 8, -5, 23, 22, 13, '#b1a298'],
  ];
  entries[13][2] = -160;
  entries.forEach((e, i) => ruinBuilding(k, ...e, i, ...RUINS[i], i === 5));
  for (const side of [-1, 1]) {
    k.hill(side * 140, 3, -15, 52, 25, 205, HILL.wall, HILL.top, HILL.lift);
    k.hill(side * 179, 12, -36, 40, 43, 200, HILL.outerWall, HILL.outerTop, HILL.lift);
    ruinBuilding(k, side * 140, 15.5, -70, 21, 23, 9, '#c49a7c', 23, 'stump', 3);
    ruinBuilding(k, side * 173, 33.5, -125, 19, 18, 7, '#a8a58e', 24, 'pile', 2);
    // Towering conical Mount Hermon snow peaks along the outer east and west alpine ridges
    for (let z = -110; z <= 70; z += 45) {
      k.pillar(side * 142, 28, z, 28, 3.5, 16, z * 7 + side, z * .15, .98, { depth: .16, course: 4.5 });
      k.pillar(side * 178, 46, z - 15, 36, 4.2, 18, z * 11 + side, z * .22, 1.0, { depth: .16, course: 5.0 });
    }
  }
  // Summit Sanctuary of the Oath (0, 20, 65): supported by a fluted Mount Hermon peak crag
  k.box(0, 19, 65, 24, 2, 20, colors.concrete, true);
  k.box(0, 20.04, 65, 22.8, .06, 18.8, colors.road);
  k.box(0, 17.5, 65.1, 14, 1, 12, colors.concrete);
  k.solids.push({ position: [0, 9, 65], size: [9, 9, 7], rotation: [0, 0, 0] });
  k.pillar(0, 9.5, 65, 19, 8.8, 12.6, 65, .25, .94, { depth: .15, course: 3.8 });
  for (const x of [-9, 9]) {
    k.box(x, 21.2, 69, .14, 2.2, 10, '#a9b4b4', false, 0, 0, 2, CALM_GROUP);
    ink(x, 22.25, 69, .48, .28, 10.4, INK.crown);
    ink(x, 20.12, 65, .55, .24, 9.6, INK.plinth);
    k.pillar(x * 1.18, 22.8, 56.2, 5.6, .18, 1.35, x * 7, .4, 1, { depth: .12, course: 2.1 });
  }
  // Tablet of Semjaza (-7, 21, 58): Carved Mount Hermon Oath Monolith (preserves exact solid collider)
  k.solids.push({ position: [-7, 21, 58], size: [.8, 1, .6], rotation: [0, 0, 0] });
  k.pillar(-7, 24.6, 58, 9.2, .16, 1.45, 58, .3, 1, { depth: .14, course: 2.8 });
  k.box(-7, 29.5, 58, .65, 1.2, .65, colors.white);
  k.solids.push({ position: [6, 20.25, 55.3], size: [2.5, .225, 1], rotation: [0, .23, -.14] });
  k.pillar(6, 20.4, 55.3, 1.4, .8, 2.2, 55, .23, .95, { depth: .14, course: 1.4 });
  // Cloven Crag Arch colliders at z = -1 (visual mountain arch is sculpted in heroRuins.ts)
  for (const side of [-1, 1]) {
    k.solids.push({ position: [side * 31, 15, -1], size: [21, .55, 4.5], rotation: [0, 0, 0] });
    k.solids.push({ position: [side * 36, 7, -1], size: [1.1, 7.5, 1.5], rotation: [0, 0, 0] });
  }
  k.solids.push({ position: [7, 7.5, -1], size: [8.5, .6, 4], rotation: [0, .05, 1.17] });
  // High Peak of the Throne (30, 61.39, -38): snow-crowned 12-sided summit altar dais (no wide overhanging square slab)
  k.solids.push({ position: [30, 61.39, -38], size: [4, .025, 4], rotation: [0, 0, 0] });
  k.box(30, 61.43, -38, .45, .03, 5.2, colors.white);
  k.box(30, 61.43, -38, 5.2, .03, .45, colors.white);
  ink(30, 61.42, -38, 3.2, .04, 3.2, INK.crown);
  car(k, -24, 2.1, 45, '#5e4130', .1);
  car(k, 26, 2.1, -17, '#4a4540', -.12);
  car(k, -26, 2.1, -76, '#553a2b', .18);
  // Western Gorge Crag Shrine at (-22, 3.5, -48) (preserves exact solid collider)
  k.solids.push({ position: [-22, 3.5, -48], size: [1.35, 1.25, 4.5], rotation: [0, 0, 0] });
  k.pillar(-22, 5.2, -48, 7.4, .24, 2.8, 48, .2, .95, { depth: .15, course: 2.6 });
  for (let i = 0; i < 40; i++) {
    const side = i % 2 ? -1 : 1, z = 54 - i * 5.5, x = side * (29 + i * 7 % 70);
    k.pillar(x, 3.8, z, 3.8 + (i % 4) * 1.4, .22, 1.8 + (i % 3) * .7, i * 29, i * .6, .92, { depth: .15, course: 2.2 });
  }
  const outerShrines: [number, number, number][] = [[0, 3.2, -260], [-230, 3.2, -40], [230, 3.2, -30], [0, 3.2, 165]];
  for (const [sx, sy, sz] of outerShrines) {
    k.pillar(sx, sy + 6.5, sz, 13, .24, 3.8, Math.abs(sx + sz), .4, .96, { depth: .14, course: 3.0 });
    k.box(sx, sy + 13.5, sz, 1.0, 2.0, 1.0, colors.white);
  }
  for (const tree of trees) if (tree.position[1] < 3) {
    const [x, y, z] = tree.position, s = tree.scale[1];
    k.solids.push({ position: [x, y + s, z], size: [.24 * s, s, .24 * s], rotation: [0, 0, 0] });
  }
  heroRuins(k);
  STELE.forEach(s => placeStele(k, s));
  return k.finish();
}
