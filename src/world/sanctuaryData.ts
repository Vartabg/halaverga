import { IcosahedronGeometry } from 'three';
import { sanctuaryKit } from './sanctuaryKit';

/** Portrait arena: open air through the nave; large architecture marks the perimeter, never a slalom through the fight. */
export function makeSanctuary() {
  const k = sanctuaryKit();
  k.box(0, 18, 65, 24, 4, 20);
  for (let i = 0; i < 4; i++) k.box(0, 15 - i * 3, 65, 21 - i * 3, 3, 17 - i * 2);
  for (const side of [-1, 1]) {
    k.box(side * 11.7, 20.2, 65, .35, .4, 20, 1);
    k.column(side * 10, 20, 72, 9, .65);
    k.drum(side * 8, 20.2, 59, 1.3, .4, 1);
    // Three distinct perimeter sanctuaries replace the five dense rows beside the combat routes.
    for (let i = 0; i < 3; i++) {
      const z = 22 - i * 68, base = 7 + i * 2;
      k.box(side * 100, base - 3, z, 48, 6, 30);
      k.box(side * 100, base + .2, z, 49, .4, 31, 1);
      k.column(side * 80, base + 1, z, 28 + i * 7, 1.7);
      k.column(side * 122, base + 1, z, 28 + i * 7, 1.7);
      k.arch(side * 100, base + 1, z - 10, 13, 25 + i * 6);
    }
    // Low causeways sit outside the fighting space and below the horizon.
    k.box(side * 108, 3, -36, 34, 5, 190);
    for (let i = 0; i < 8; i++) k.box(side * 108, 5.7, 48 - i * 22, 32, .12, .28, 1);
    k.box(side * 87, 14.4, -1, 46, 2.2, 9);
    k.box(side * 87, 15.6, -1, 46, .15, 9.3, 1);
    k.column(side * 106, 0, -1, 13, 2);
    for (let i = 0; i < 7; i++) k.arch(side * (245 + (i % 2) * 75), 0, 60 - i * 65, 17, 52 + i * 4);
  }
  // Preserve the high landing coordinates, but remove the tall pedestal obstructing the approach/escape routes below it.
  k.drum(30, 60.85, -38, 6, 1, 0, 4.8);
  k.box(30, 61.39, -38, 8, .05, 8, 1);
  k.box(30, 61.43, -38, .22, .02, 4, 2); k.box(30, 61.43, -38, 4, .02, .22, 2);
  // The breach is the far landmark. Its framing arch stays beyond the combat nave.
  k.arch(0, 4, -145, 32, 29); k.ring(0, 33, -147.2, 30, .35, 1);
  for (const side of [-1, 1]) k.column(side * 43, 0, -152, 85, 3.4);
  k.box(0, 5, -166, 90, 8, 34);
  for (let i = 0; i < 6; i++) k.box(0, 9 + i * .8, -159 - i * 2, 64 - i * 7, .8, 14, i === 5 ? 1 : 0);
  for (const [x, y, z] of [[-7, 21, 58], [0, 12, -260], [-230, 18, -40], [230, 18, -30], [0, 10, 165]]) {
    k.box(x, y - 1.7, z, 6, 1.4, 5); k.box(x, y, z, 1.4, 2, .7, 1);
    k.box(x, y + .1, z + .36, .7, 1.1, .04, 2);
  }
  // Quiet, low fragments outside the arena. Nothing floats in the central camera corridor.
  for (let i = 0; i < 34; i++) {
    const a = i * 2.39996, r = 210 + (i * 29 % 130), h = 2 + (i * 7 % 16);
    const g = new IcosahedronGeometry(4 + i % 7, 0); g.scale(1, 1.1, .8);
    k.add(g, 0, Math.sin(a) * r, h, Math.cos(a) * r - 40, i * .3);
  }
  return k.finish();
}
