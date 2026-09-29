import { CylinderGeometry, Matrix4, Quaternion, Vector3 } from 'three';
import { colors, type Kit } from './kit';

export function heroRuins(k: Kit) {
  for (const side of [-1, 1]) {
    // Deep edge beams and bearings give the highway structural weight.
    for (const z of [-4.2, 2.2]) {
      k.box(side * 32, 13.7, z, 40, 1.7, .65, colors.concrete);
      for (let i = 0; i < 8; i++) k.box(side * (15 + i * 4.5), 16.3, z, .09, 1.3, .09, colors.steel);
      k.box(side * 32, 16.85, z, 38, .12, .12, colors.steel);
    }
    k.box(side * 36, 12.5, -1, 7, 1.3, 4, colors.concrete);
    for (let i = 0; i < 6; i++) {
      k.box(side * (16 + i * 5.5), 15.64, -1, 2.8, .025, .12, colors.white);
      // Fractured aggregate clusters stop the rupture reading as a clean box cut.
      k.box(side * (10.1 + (i % 2) * .7), 14.7 - (i % 3) * .2, -4 + i * 1.15,
        1.1, .6, 1, colors.concrete, false, i * .4, side * .25);
      k.box(side * (8.4 + i * .24), 14.8 - i * .09, -3.8 + i * 1.25,
        4, .065, .065, colors.steel, false, .06 * i, side * .16);
    }
  }
  // A peeled piece of road still carries worn lane markings.
  k.box(6.44, 7.73, -1, 16.8, .04, 7.2, colors.road, false, .05, 1.17);
  k.box(6.39, 7.75, -1, 12, .025, .13, colors.white, false, .05, 1.17);
  // A leaning original road sign, without adding another HUD or navigation mode.
  k.box(-16, 19, -4, .14, 7, .14, colors.steel, false, 0, .1);
  k.box(-21, 19, -4, .14, 7, .14, colors.steel, false, 0, .1);
  k.box(-18.5, 21.1, -3.9, 6.8, 2.5, .16, '#356b65', true, 0, .1);
  for (let i = 0; i < 3; i++) k.box(-19, 21.7 - i * .45, -3.78, 3.4 - i * .6, .12, .02, colors.white, false, 0, .1);
  // Exposed drain outlets and dark waterline break up the engineered banks.
  for (const side of [-1, 1]) for (let i = 0; i < 9; i++) {
    const z = 45 - i * 18;
    k.box(side * 14.56, .65, z, .1, 1.1, 14, '#414f43');
    // Smart transit induction guideway embedded in retaining wall
    k.box(side * 14.72, 1.15, z, .12, .18, 14, colors.edge);
    k.box(side * 14.8, 1.22, z, .04, .06, 10, colors.amber);
    const pipe = new CylinderGeometry(.58, .58, 1.1, 12);
    pipe.applyMatrix4(new Matrix4().compose(new Vector3(side * 14.4, 1.8, z),
      new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), Math.PI / 2), new Vector3(1, 1, 1)));
    k.add(pipe, colors.edge);
  }
  // High-tension catenary utility cables spanning across the flooded avenue
  for (const [z, y] of [[10, 25], [-62, 33]] as const) {
    k.box(-14, y + .4, z, 14, .05, .05, colors.edge, false, 0, -.06);
    k.box(0, y - .15, z, 15, .05, .05, colors.edge);
    k.box(14, y + .4, z, 14, .05, .05, colors.edge, false, 0, .06);
  }
  // Suspended maintenance catwalk under the ruptured highway
  for (const side of [-1, 1]) {
    k.box(side * 24, 13.2, -1, 18, .18, 1.8, colors.steel);
    k.box(side * 24, 13.85, -1.8, 18, 1.1, .06, colors.steel);
    k.box(side * 24, 13.85, -.2, 18, 1.1, .06, colors.steel);
    // Utility conduit bundles running along the canal embankments
    k.box(side * 14.88, 3.2, -40, .07, .07, 180, colors.steel);
    k.box(side * 14.88, 3.8, -40, .07, .07, 180, colors.steel);
  }
  // Concrete rubble slabs fallen into the canal water at the bridge breach
  k.box(9.5, .8, -1, 3.6, 1.4, 4, colors.concrete, true, .25, .2);
  k.box(-9, .7, 1, 3.2, 1.2, 3.8, colors.concrete, true, -.2, -.18);
  k.box(7.5, 1.4, 2, 2.4, .9, 2.6, colors.concrete, false, .1, -.3);
}
