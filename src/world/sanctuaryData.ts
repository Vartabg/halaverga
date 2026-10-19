import { IcosahedronGeometry } from 'three';
import { sanctuaryKit } from './sanctuaryKit';

/** The starting landing is preserved; everything beyond it is a new, physically authored celestial battlefield. */
export function makeSanctuary() {
  const k = sanctuaryKit();
  // Consecrated launch dais: its upper face is exactly y=20 (the shared START checkpoint).
  k.box(0, 18, 65, 24, 4, 20);
  for (let i = 0; i < 4; i++) k.box(0, 15 - i * 3, 65, 21 - i * 3, 3, 17 - i * 2);
  for (const side of [-1, 1]) {
    k.box(side * 11.7, 20.2, 65, .35, .4, 20, 1);
    k.column(side * 10, 20, 72, 9, .65);
    k.drum(side * 8, 20.2, 59, 1.3, .4, 1);
    // No residential grids: fluted colonnades, layered plinths and pointed arches.
    for (let i = 0; i < 5; i++) {
      const z = 30 - i * 32, base = 7 + i * 2;
      k.box(side * 41, base - 3, z, 34, 6, 24);
      k.box(side * 41, base + .2, z, 35, .4, 25, 1);
      for (const x of [28, 54]) k.column(side * x, base + 1, z, 24 + i * 5, 1.6 + i * .12);
      k.arch(side * 41, base + 1, z - 8, 10, 22 + i * 3);
    }
    k.arch(side * 78, 5, -70, 15, 38);
    // A long processional wing, cut through by deep air lanes.
    k.box(side * 60, 3, -36, 40, 5, 190);
    for (let i = 0; i < 11; i++) k.box(side * 60, 5.7, 48 - i * 16, 38, .12, .28, 1);
    for (let i = 0; i < 14; i++) {
      const x = side * (105 + (i % 3) * 23), z = 60 - i * 26, h = 22 + (i * 13 % 55);
      k.column(x, 0, z, h, 2.5);
      k.box(x, h * .44, z, 4, h * .88, 4, 0, side * .08);
    }
    // Boundary-scale temple silhouettes, never office towers.
    for (let i = 0; i < 7; i++) k.arch(side * (245 + (i % 2) * 75), 0, 60 - i * 65, 17, 52 + i * 4);
  }
  // A fractured transverse bridge: the centre stays open from floor to sky.
  for (const side of [-1, 1]) {
    k.box(side * 35, 14.4, -1, 42, 2.2, 9);
    k.box(side * 35, 15.6, -1, 42, .15, 9.3, 1);
    k.column(side * 51, 0, -1, 13, 2);
  }
  // High landing, a tiny sanctuary rather than a habitable roof.
  k.drum(30, 52, -38, 6, 18, 0, 4.8);
  k.box(30, 61.39, -38, 8, .05, 8, 1);
  k.box(30, 61.43, -38, .22, .02, 4, 2); k.box(30, 61.43, -38, 4, .02, .22, 2);
  // The breach: a colossal split arch, the arena's persistent navigation landmark.
  k.arch(0, 4, -145, 32, 29);
  k.ring(0, 33, -147.2, 30, .35, 1);
  for (const side of [-1, 1]) k.column(side * 43, 0, -152, 85, 3.4);
  k.box(0, 5, -166, 90, 8, 34);
  for (let i = 0; i < 6; i++) k.box(0, 9 + i * .8, -159 - i * 2, 64 - i * 7, .8, 14, i === 5 ? 1 : 0);
  // Carved scripture stands at all existing discovery coordinates.
  for (const [x, y, z] of [[-7, 21, 58], [0, 12, -260], [-230, 18, -40], [230, 18, -30], [0, 10, 165]]) {
    k.box(x, y - 1.7, z, 6, 1.4, 5); k.box(x, y, z, 1.4, 2, .7, 1);
    k.box(x, y + .1, z + .36, .7, 1.1, .04, 2);
  }
  // Broken stone suspended in the abyss: deterministic, quiet silhouettes, not another skyline.
  for (let i = 0; i < 68; i++) {
    const a = i * 2.39996, r = 145 + (i * 29 % 190), h = 2 + (i * 7 % 38);
    const g = new IcosahedronGeometry(4 + i % 7, 0); g.scale(1, 1.8, .8);
    k.add(g, 0, Math.sin(a) * r, h, Math.cos(a) * r - 40, i * .3);
  }
  return k.finish();
}
