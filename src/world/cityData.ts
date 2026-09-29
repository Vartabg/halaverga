import { createKit, building, car, colors } from './kit';
import { trees } from './reclamationData';
import { heroRuins } from './heroRuins';
export function makeCity() {
  const k = createKit();
  // A hillside on either side of the submerged transport corridor.
  for (const side of [-1, 1]) {
    k.box(side * 75, -4, -35, 120, 12, 260, '#6c7a6b', true);
    k.box(side * 76, 1.8, -32, 116, .5, 240, colors.road, true);
    k.box(side * 16, 1.3, -42, 2.8, 5, 230, colors.concrete, true);
    for (let z = -148; z < 82; z += 11) k.box(side * 24, 2.08, z, .16, .03, 4, colors.white);
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
  entries.forEach((e, i) => building(k, ...e, i));
  for (const side of [-1, 1]) {
    k.box(side * 140, 3, -15, 52, 25, 205, '#6b7b66', true);
    k.box(side * 179, 12, -36, 40, 43, 200, '#657362', true);
    building(k, side * 140, 15.5, -70, 21, 23, 9, '#c49a7c', 23);
    building(k, side * 173, 33.5, -125, 19, 18, 7, '#a8a58e', 24);
  }
  // Distant surviving skyline: sculpted silhouettes anchored by the hero Solar Arcology
  for (let i = 0; i < 22; i++) {
    const x = (i - 10.5) * 18, h = 28 + (i * 19 % 38), z = -215 - (i % 4) * 12;
    // Central landmark: the Solar Arcology twin spires and fractured connecting sky-bridge
    if (Math.abs(x) < 22) continue;
    k.box(x, h / 2 - 3, z, 12 + i % 4, h, 14, '#6d787e');
    k.box(x - 2, h + 1, z, 5, 6, 10, '#5f696e');
    if (i % 3 === 0) k.box(x + 1, h + 4, z, .14, 8, .14, colors.steel);
  }
  // The Solar Arcology: twin towers framing the central canal axis at z = -230
  k.box(-11, 38, -232, 14, 82, 16, '#647076');
  k.box(-11, 80, -232, 9, 8, 11, '#525e64');
  k.box(-11, 86, -232, .2, 12, .2, colors.steel);
  k.box(11, 34, -228, 13, 74, 15, '#69757b');
  k.box(11, 72, -228, 8, 6, 10, '#556167');
  k.box(11, 77, -228, .2, 10, .2, colors.steel);
  // Fractured sky-bridge connecting the twin arcology spires across the central flight axis
  k.box(-4, 52, -230, 9, 3.2, 5.5, colors.concrete);
  k.box(5, 50.8, -230, 7, 3.2, 5.5, colors.concrete, false, 0, -.12);

  // Arrival terrace: framed observation deck overlooking the flooded canal
  k.box(0, 19, 65, 24, 2, 20, colors.concrete, true);
  k.box(0, 20.04, 65, 22.8, .06, 18.8, colors.road);
  k.box(0, 9, 65, 18, 18, 14, '#7f7776', true);
  // Tactile amber safety warning border along the departure edge
  k.box(0, 20.07, 55.6, 22.4, .025, .5, colors.amber);
  for (const x of [-9, 9]) {
    k.box(x, 21.2, 69, .14, 2.2, 10, colors.steel);
    k.box(x, 22.25, 69, .2, .13, 10, colors.white);
    k.box(x, 20.12, 65, .28, .12, 9, '#ddaa76');
  }
  // Cantilevered solar observation canopy framing the view from arrival
  k.box(-8.5, 23.5, 62, .18, 5, .18, colors.steel, false, 0, .14);
  k.box(-6.8, 25.8, 60, 4.2, .06, 5.5, colors.glass, false, .08, -.22);
  k.box(-6.8, 25.75, 60, 4.4, .08, 5.7, colors.steel, false, .08, -.22);
  // Weathered 2033 arrival terminal console with solar accumulator and indicator
  k.box(-7, 21, 58, 1.6, 2, 1.2, '#283432', true);
  k.box(-7, 22.05, 58, 1.2, .08, .9, colors.glass);
  k.box(-7, 21.7, 58.65, 1.1, .6, .08, colors.cyan);
  k.box(-6.3, 21.5, 58.65, .08, .15, .09, colors.amber);
  k.box(6, 20.25, 55.3, 5, .45, 2, colors.concrete, true, .23, -.14);
  // Ruptured elevated road: a navigable opening, visible reinforcing steel.
  for (const side of [-1, 1]) {
    k.box(side * 31, 15, -1, 42, 1.1, 9, colors.concrete, true);
    k.box(side * 31, 15.58, -1, 42, .08, 7.5, colors.road);
    k.box(side * 36, 7, -1, 2.2, 15, 3, colors.concrete, true);
    for (const z of [-5, 3]) k.box(side * 34, 16.2, z, 35, .55, .3, colors.concrete);
    for (let i = 0; i < 5; i++) k.box(side * 8, 14.9, -3 + i, 7, .09, .09, '#44434d');
  }
  k.box(7, 7.5, -1, 17, 1.2, 8, colors.concrete, true, .05, 1.17);
  // A marked roof offers another safe destination.
  k.box(30, 61.39, -38, 8, .05, 8, '#b5bb94', true);
  k.box(30, 61.43, -38, .25, .02, 4, colors.white);
  k.box(30, 61.43, -38, 4, .02, .25, colors.white);
  car(k, -24, 2.1, 45, '#b77755', .1);
  car(k, 26, 2.1, -17, '#a5aa9f', -.12);
  car(k, -26, 2.1, -76, '#809999', .18);
  k.box(-22, 3.5, -48, 2.7, 2.5, 9, '#a29069', true);
  k.box(-22, 3.8, -43.45, 2.3, 1.5, .08, colors.glass);
  for (let i = 0; i < 40; i++) {
    const side = i % 2 ? -1 : 1, z = 54 - i * 5.5, x = side * (29 + i * 7 % 70);
    k.box(x, 2.55, z, 1.4 + i % 3, .8, 1.8, '#a99b88', false, i * .6, i % 3 * .09);
  }
  for (const tree of trees) if (tree.position[1] < 3) {
    const [x, y, z] = tree.position, s = tree.scale[1];
    k.solids.push({ position: [x, y + s, z], size: [.24 * s, s, .24 * s], rotation: [0, 0, 0] });
  }
  heroRuins(k);
  return k.finish();
}
