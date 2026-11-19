import { createKit, addWaystone } from './kit';
import { STELE, placeStele } from './steleData';
import { INK } from './paintInk';
import { MASSIF, heightAt } from './massifData';
import { makeMassifChunk } from './massifGeometry';
import { makeHermonArch } from './hermonArch';

/** Authored sanctuaries on the near massif and outlying tablet sites. */
export function makeNearMassif() {
  const k = createKit();
  const terrains = [makeMassifChunk('hermon-near', MASSIF.near, MASSIF.step), makeHermonArch()];

  // Tablet of Semjaza on the flat arrival promontory; quoted source framing remains in navigation/arrival.json.
  k.solids.push({ position: [-7, 21, 58], size: [.8, 1, .6], rotation: [0, 0, 0] });
  k.pillar(-7, 22.2, 58, 4.4, .82, 1.35, 58, .3, 1, { depth: .1, course: 2.8 });
  k.solids.push({ position: [6, 20.25, 55.3], size: [2.5, .225, 1], rotation: [0, .23, -.14] });
  k.pillar(6, 20.8, 55.3, 1.8, 1.25, 1.95, 55, .23, .95, { depth: .09, course: 1.4 });
  for (const [x, z, ry, h, seed] of [[-8.6, 61.2, .45, 3.1, 61], [7.8, 59.8, -.35, 3.4, 62], [-5.2, 55.8, .18, 2.6, 63]]) {
    k.pillar(x, 20 + h / 2, z, h, .52, .88, seed, ry, .96, { depth: .08, course: 2.2 });
  }

  // High Sanctuary of the Throne: a snow-alabaster covenant seal and low megalithic witnesses.
  k.box(30, 61.44, -38, .42, .05, 5.2, INK.cap);
  k.box(30, 61.45, -38, 5.2, .05, .42, INK.cap);
  k.box(30, 61.43, -38, 3.2, .04, 3.2, INK.crown);
  for (const [x, z, seed] of [[23, -43, 301], [37, -43, 302], [30, -47, 303]]) {
    const base = heightAt(x, z);
    k.pillar(x, base + 2.1, z, 4.2, .55, 1.15, seed, .35, .96, { depth: .12, course: 2.1 });
  }

  // Talus waystones and four outer source-tablet sanctuaries use the same ground as the flight mesh.
  for (const [x, z, yaw] of [[-24, 45, .1], [26, -17, -.12], [-26, -76, .18]]) addWaystone(k, x, heightAt(x, z) + .1, z, yaw);
  for (const [x, z] of [[0, -260], [-230, -40], [230, -30], [0, 165]]) {
    k.pillar(x, 9.7, z, 13, .24, 3.8, Math.abs(x + z), .4, .96, { depth: .14, course: 3.0 });
    k.box(x, 16.25, z, .8, .12, .8, INK.crown);
  }
  STELE.forEach(s => placeStele(k, s));
  const finished = k.finish();
  return { ...finished, stones: k.stones, terrains, triangles: terrains.reduce((sum, t) => sum + t.triangles, 0) };
}
