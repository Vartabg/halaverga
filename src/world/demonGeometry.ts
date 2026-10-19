import { BufferGeometry, ConeGeometry, IcosahedronGeometry, PlaneGeometry, Shape, ShapeGeometry, SphereGeometry } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const merge = (parts: BufferGeometry[]) => {
  const flat = parts.map(g => g.index ? g.toNonIndexed() : g), out = mergeGeometries(flat)!;
  new Set([...parts, ...flat]).forEach(g => g.dispose()); return out;
};
/** Original abyssal creature: an iron-crowned, winged adversary, not an Ophanim or a claim about a named biblical species. */
export function makeDemonGeometry() {
  const body: BufferGeometry[] = [], plate: BufferGeometry[] = [];
  body.push(new IcosahedronGeometry(.48, 1).scale(.75, 1.18, .7));
  body.push(new IcosahedronGeometry(.3, 1).scale(1, .9, 1.2).translate(0, .34, -.22));
  body.push(new ConeGeometry(.19, .42, 5).rotateX(-.8).translate(0, -.05, -.47));
  for (const side of [-1, 1]) {
    // Horns, fangs, long hooked limbs; the luminous maw remains the aimable weak point.
    plate.push(new ConeGeometry(.09, .43, 5).rotateZ(-side * .35).translate(side * .22, .72, -.16));
    plate.push(new ConeGeometry(.05, .32, 5).rotateZ(side * .28).translate(side * .31, .58, -.19));
    for (let j = 0; j < 3; j++) {
      body.push(new ConeGeometry(.032, .18, 4).rotateX(Math.PI).translate(side * (.09 + j * .065), .03, -.63 + j * .035));
      body.push(new ConeGeometry(.045, .32, 4).rotateZ(side * .6).translate(side * (.36 + j * .07), -.2 - j * .08, -.12));
    }
    body.push(new ConeGeometry(.09, .52, 5).rotateZ(side * .35).translate(side * .2, -.54, .02));
    body.push(new ConeGeometry(.07, .26, 5).rotateX(-1.6).translate(side * .27, -.76, -.1));
    // Ribbed iron cuirass.
    for (let j = 0; j < 4; j++) plate.push(new ConeGeometry(.045, .35, 4).rotateZ(side * 1.2).translate(side * .19, .2 - j * .11, -.3));
  }
  body.push(new ConeGeometry(.08, .55, 5).rotateX(.8).translate(0, -.48, .32));
  const wing = (side: number) => {
    const shape = new Shape(); shape.moveTo(.18, .18); shape.lineTo(.56, .67); shape.lineTo(1.42, .87);
    shape.quadraticCurveTo(1.07, .42, 1.68, .14); shape.quadraticCurveTo(.92, .3, 1.18, -.36);
    shape.quadraticCurveTo(.61, .03, .29, -.16); shape.closePath();
    const parts: BufferGeometry[] = [new ShapeGeometry(shape, 5).translate(0, 0, .1)];
    for (const [x, y, angle, length] of [[.72, .49, -1.1, 1.3], [1.04, .22, -1.6, 1.35], [.69, -.03, -1.95, 1.]]) {
      parts.push(new ConeGeometry(.037, length, 4).rotateZ(angle).translate(x, y, .08));
    }
    const g = merge(parts); g.scale(side, 1, 1); return g;
  };
  return { body: merge(body), plate: merge(plate), wingL: wing(-1), wingR: wing(1),
    eye: merge([new SphereGeometry(.09, 8, 6).scale(1, .6, .6).translate(-.12, .04, 0),
      new SphereGeometry(.09, 8, 6).scale(1, .6, .6).translate(.12, .04, 0),
      new SphereGeometry(.1, 8, 6).scale(1, .3, .4).translate(0, -.11, .01)]), halo: new PlaneGeometry(1, 1) };
}
