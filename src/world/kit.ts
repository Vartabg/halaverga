import { BoxGeometry, Color, Float32BufferAttribute, Matrix4, Quaternion, Euler, Vector3, BufferGeometry } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
export type Triple = [number, number, number];
export type Solid = { position: Triple; size: Triple; rotation: Triple; kind?: 'building' };
export type Kit = ReturnType<typeof createKit>;
export const surfaces = ['stone', 'glass', 'metal', 'ground', 'paint', 'asphalt'] as const;
function surface(color: string) {
  if (color === colors.road) return 5;
  if (color === colors.glass || color === '#2d3742') return 1;
  if ([colors.steel, colors.edge, '#44434d', '#272e37'].includes(color)) return 2;
  if ([colors.road, '#6c7a6b', '#6b7b66', '#657362'].includes(color)) return 3;
  if ([colors.white, '#ddaa76', '#b8e8b0'].includes(color)) return 4;
  return 0;
}
export function createKit() {
  const pieces: BufferGeometry[][] = surfaces.map(() => []), solids: Solid[] = [];
  function add(g: BufferGeometry, color: string) {
    const c = new Color(color), p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
    const shade = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      shade.set([c.r, c.g, c.b], i * 3);
      // Meter-based UVs prevent a 100 m wall stretching one texture across itself.
      if (Math.abs(n.getY(i)) > .5) uv.setXY(i, p.getX(i) / 4, p.getZ(i) / 4);
      else if (Math.abs(n.getX(i)) > .5) uv.setXY(i, p.getZ(i) / 4, p.getY(i) / 4);
      else uv.setXY(i, p.getX(i) / 4, p.getY(i) / 4);
    }
    g.setAttribute('color', new Float32BufferAttribute(shade, 3));
    pieces[surface(color)].push(g);
  }
  function box(x: number, y: number, z: number, w: number, h: number, d: number,
    color: string, solid = false, ry = 0, rz = 0) {
    const g = new BoxGeometry(w, h, d);
    g.applyMatrix4(new Matrix4().compose(new Vector3(x, y, z),
      new Quaternion().setFromEuler(new Euler(0, ry, rz)), new Vector3(1, 1, 1)));
    add(g, color);
    if (solid) solids.push({ position: [x, y, z], size: [w / 2, h / 2, d / 2], rotation: [0, ry, rz] });
  }
  function finish() {
    const merged = pieces.map(group => mergeGeometries(group));
    const geometry = mergeGeometries(merged, true);
    pieces.flat().forEach(g => g.dispose()); merged.forEach(g => g.dispose());
    geometry.computeBoundingSphere();
    return { geometry, solids };
  }
  function block(x: number, y: number, z: number, w: number, h: number, d: number) {
    solids.push({ position: [x, y, z], size: [w / 2, h / 2, d / 2], rotation: [0, 0, 0], kind: 'building' });
  }
  function slab(x: number, y: number, z: number, w: number, d: number, seed: number) {
    const g = new BoxGeometry(w, .32, d, 8, 1, 4), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const xx = p.getX(i), zz = p.getZ(i);
      const edge = Math.max(Math.abs(xx) / (w / 2), Math.abs(zz) / (d / 2));
      const chip = edge > .99 ? .15 + .7 * Math.abs(Math.sin(xx * 17.17 + zz * 13.3 + seed)) : 0;
      p.setXYZ(i, xx - Math.sign(xx) * chip, p.getY(i), zz - Math.sign(zz) * chip * .65);
    }
    g.computeVertexNormals(); g.translate(x, y, z); add(g, colors.concrete);
  }
  return { box, block, slab, add, finish, solids };
}
export const colors = { concrete: '#c8c8b6', edge: '#3b4141', glass: '#709698', warm: '#c3836b',
  light: '#e0c1a0', moss: '#426456', road: '#626666', white: '#d3ccae', steel: '#494a42' };
export function building(k: Kit, x: number, base: number, z: number, w: number, d: number, floors: number, tint: string, seed: number) {
  const h = floors * 3.7;
  // Exterior-only traversal: solid lower shell and a stepped cap matching the broken roof.
  // Empty stories remain visible, but are not traversable interiors in this milestone.
  const shoulder = (floors - 3) * 3.7 + .14;
  k.block(x, base + shoulder / 2, z, w + .6, shoulder, d + .6);
  k.block(x - w * .15, base + (shoulder + h + .14) / 2, z, w * .7, h + .14 - shoulder, d + .6);
  // Retain the original fallen slab and debris collision/visuals.
  if (seed % 3 === 0) k.box(x + w * .32, base + 4, z + d * .5 + 1, w * .4, .6, 8, colors.concrete, true, .18, -.5);
  k.box(x + w * .43, base + 1.5, z + d * .5 + 2, 4.7, .7, 3, tint, true, .2, -.18);
  // Visible architecture is authored in Blender; retain the established collision envelope.

}
export function car(k: Kit, x: number, y: number, z: number, color: string, ry = 0) {
  k.box(x, y + .55, z, 1.9, .6, 4.3, color, true, ry);
  k.box(x, y + 1.03, z - .2, 1.65, .45, 2, colors.glass, false, ry);
  for (const dx of [-1, 1]) for (const dz of [-1.35, 1.35]) k.box(x + dx * .86, y + .27, z + dz, .32, .55, .68, '#272e37');
}
