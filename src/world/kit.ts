import { BoxGeometry, Color, Float32BufferAttribute, Matrix4, Quaternion, Euler, Vector3, BufferGeometry } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
export type Triple = [number, number, number];
export type Solid = { position: Triple; size: Triple; rotation: Triple };
export type Kit = ReturnType<typeof createKit>;
export function createKit() {
  const pieces: BufferGeometry[] = [], solids: Solid[] = [];
  function box(x: number, y: number, z: number, w: number, h: number, d: number,
    color: string, solid = false, ry = 0, rz = 0) {
    const g = new BoxGeometry(w, h, d), c = new Color(color);
    const colors = new Float32Array(g.attributes.position.count * 3);
    for (let i = 0; i < colors.length; i += 3) { colors[i] = c.r; colors[i + 1] = c.g; colors[i + 2] = c.b; }
    g.setAttribute('color', new Float32BufferAttribute(colors, 3));
    g.applyMatrix4(new Matrix4().compose(new Vector3(x, y, z),
      new Quaternion().setFromEuler(new Euler(0, ry, rz)), new Vector3(1, 1, 1)));
    pieces.push(g);
    if (solid) solids.push({ position: [x, y, z], size: [w / 2, h / 2, d / 2], rotation: [0, ry, rz] });
  }
  function finish() {
    const geometry = mergeGeometries(pieces);
    pieces.forEach(g => g.dispose());
    geometry.computeBoundingSphere();
    return { geometry, solids };
  }
  return { box, finish, solids };
}
export const colors = { concrete: '#bda995', edge: '#3b4148', glass: '#315967', warm: '#c3836b',
  light: '#e0c1a0', moss: '#426456', road: '#46505a', white: '#d3ccae', steel: '#4b4755' };
export function building(k: Kit, x: number, base: number, z: number, w: number, d: number, floors: number, tint: string, seed: number) {
  const h = floors * 3.7;
  if (seed % 3 === 0) {
    k.box(x - w * .125, base + h * .34, z, w * .75, h * .68, d, tint, true);
    k.box(x + w * .375, base + h * .34, z - d * .25, w * .25, h * .68, d * .5, tint, true);
    k.box(x + w * .32, base + 4, z + d * .5 + 1, w * .4, .6, 8, colors.concrete, true, .18, -.5);
  } else k.box(x, base + h * .34, z, w, h * .68, d, tint, true);
  // Broken upper floors expose slabs, structural columns and empty interiors.
  for (let f = 0; f <= floors; f++) {
    const broken = f > floors - 3 || (seed % 3 === 0 && f > 2 && f % 4 === 1);
    const floorW = broken ? w * .7 : w + .6;
    k.box(x - (broken ? w * .15 : 0), base + f * 3.7, z, floorW, .28, d + .6, colors.concrete, true);
    if (f === floors) continue;
    for (let c = 0; c < Math.floor(w / 3); c++) {
      const xx = x - w / 2 + 1.5 + c * 3;
      if (broken && c > w / 3 - 2) continue;
      const missing = (f * 13 + c * 7 + seed) % 9 < 2;
      for (const side of [-1, 1]) {
        if (!missing) k.box(xx, base + f * 3.7 + 1.9, z + side * (d / 2 + .03), 2.6, 2.8, .16, colors.glass);
        k.box(xx - 1.5, base + f * 3.7 + 1.8, z + side * d / 2, .19, 3.7, .28, colors.edge);
        if (missing && !broken) k.box(xx, base + f * 3.7 + 1.8, z + side * (d / 2 + .05), 2.6, 2.8, .18, '#2d3742');
      }
    }
    if (!broken) for (const side of [-1, 1]) k.box(x + side * (w / 2 + .04), base + f * 3.7 + 1.7, z, .16, 2.7, d * .74, colors.glass);
  }
  // Rebar, fractured parapets, rooftop cooling equipment and a remaining antenna.
  for (let a = 0; a < 4; a++) k.box(x + w * .2, base + h - 3 + a * .4, z - d / 2 + a * 1.8, .08, 4, .08, colors.steel, false, 0, .15);
  k.box(x - w * .28, base + h + .6, z - d * .2, 3, 1, 2, '#777c76');
  k.box(x - w * .28, base + h + 1.13, z - d * .2, 2.4, .1, 1.4, colors.edge);
  k.box(x - w * .4, base + h + 2, z + d * .28, .12, 4, .12, colors.edge);
  k.box(x + w * .43, base + 1.5, z + d * .5 + 2, 4.7, .7, 3, tint, true, .2, -.18);
}
export function car(k: Kit, x: number, y: number, z: number, color: string, ry = 0) {
  k.box(x, y + .55, z, 1.9, .6, 4.3, color, true, ry);
  k.box(x, y + 1.03, z - .2, 1.65, .45, 2, colors.glass, false, ry);
  for (const dx of [-1, 1]) for (const dz of [-1.35, 1.35]) k.box(x + dx * .86, y + .27, z + dz, .32, .55, .68, '#272e37');
}
