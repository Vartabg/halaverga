import { createKit, building, car, colors } from './kit';
import { trees } from './reclamationData';
import { heroRuins } from './heroRuins';
import { waterfrontDetails } from './waterfrontDetails';
import { distantTerrain } from './distantTerrain';
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
  // Distant surviving skyline: sculpted broken tops, never a wallpaper image.
  for (let i = 0; i < 20; i++) {
    const x = (i - 9.5) * 17, h = 24 + (i * 17 % 41), z = -210 - (i % 3) * 13;
    k.box(x, h / 2 - 3, z, 11 + i % 5, h, 13, '#737e83');
    k.box(x - 3, h - 1, z, 5, 8, 12, '#737e83');
    // Weathered floor bands and a fractured roof keep the far skyline architectural.
    for (let floor=3;floor<h-4;floor+=3.8) {
      k.box(x,floor-3,z+6.54,9+i%5,.7,.08,'#4f555e');
      if ((floor+i)%3>1) k.box(x-3,floor-2,z+6.6,2.5,1.5,.08,'#596064');
    }
    for (let rib=0;rib<3;rib++) {
      k.box(x-4+rib*2.6,h-3+rib%2*1.3,z-4,.2,5+rib%2*2,.22,colors.steel);
      k.box(x-4+rib*2.6,h-3+rib%2*1.3,z+4,.2,5+rib%2*2,.22,colors.steel);
    }
    k.box(x-3,h+3.1,z,5.8,.25,13,colors.concrete);
  }
  // Arrival terrace is the sole fully prepared landing surface.
  k.box(0, 19, 65, 24, 2, 20, colors.concrete, true);
  k.box(0, 20.04, 65, 22.8, .06, 18.8, colors.road);
  k.box(0, 9, 65, 18, 18, 14, '#7f7776', true);
  for (const x of [-9, 9]) {
    k.box(x, 21.2, 69, .14, 2.2, 10, colors.steel);
    k.box(x, 22.25, 69, .2, .13, 10, colors.white);
    k.box(x, 20.12, 65, .28, .12, 9, '#ddaa76');
  }
  k.box(-7, 21, 58, 1.6, 2, 1.2, colors.steel, true);
  k.box(-7, 21.7, 58.65, 1.1, .6, .08, '#b8e8b0');
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
  waterfrontDetails(k);
  distantTerrain(k);
  return k.finish();
}
