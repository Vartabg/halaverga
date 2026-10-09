import { BoxGeometry, Color, Float32BufferAttribute, Matrix4, Quaternion, Euler, Vector3, BufferGeometry } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
export type Triple = [number, number, number];
/** `building` marks a core's exterior volume; `frame` is bare ruin steel, which the chase camera's boom looks through (City.tsx). */
export type Solid = { position: Triple; size: Triple; rotation: Triple; kind?: 'building' | 'frame' };
export type Kit = ReturnType<typeof createKit>;
export const surfaces = ['stone', 'glass', 'metal', 'ground', 'paint', 'calm'] as const;
/** The calm group (index into `surfaces`): the stone texture with its marbling halved, for big plain concrete faces, so the district-edge
 * hills and the terrace parapets read as weathered concrete and not as slabs of marble. */
export const CALM_GROUP = 5;
export function surface(color: string) {
  if (color === colors.glass || color === '#2d3742') return 1;
  if ([colors.steel, colors.edge, '#44434d', '#272e37'].includes(color)) return 2;
  if ([colors.road, '#6c7a6b'].includes(color)) return 3;
  if ([colors.white, '#6f5d4b', '#b8e8b0'].includes(color)) return 4;
  return 0;
}
export function createKit() {
  const pieces: BufferGeometry[][] = surfaces.map(() => []), solids: Solid[] = [];
  /** `shade` (optional) gives a vertex its colour from its world position and normal; otherwise the whole piece is `color`. */
  function add(g: BufferGeometry, color: string, lift = 1, shade?: (p: Vector3, n: Vector3) => Color, group?: number) {
    const c = new Color(color).multiplyScalar(lift), p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
    const shaded = new Float32Array(p.count * 3), at = new Vector3(), up = new Vector3();
    for (let i = 0; i < p.count; i++) {
      const v = shade ? shade(at.fromBufferAttribute(p, i), up.fromBufferAttribute(n, i)) : c;
      shaded.set([v.r, v.g, v.b], i * 3);
      // Meter-based UVs prevent a 100 m wall stretching one texture across itself.
      if (Math.abs(n.getY(i)) > .5) uv.setXY(i, p.getX(i) / 4, p.getZ(i) / 4);
      else if (Math.abs(n.getX(i)) > .5) uv.setXY(i, p.getZ(i) / 4, p.getY(i) / 4);
      else uv.setXY(i, p.getX(i) / 4, p.getY(i) / 4);
    }
    g.setAttribute('color', new Float32BufferAttribute(shaded, 3));
    pieces[group ?? surface(color)].push(g);
  }
  /** `lift` multiplies the baked vertex colour past 1: a dark texture (the moss) needs more than a white tint can give. */
  function box(x: number, y: number, z: number, w: number, h: number, d: number,
    color: string, solid = false, ry = 0, rz = 0, lift = 1, group?: number) {
    const g = new BoxGeometry(w, h, d);
    g.applyMatrix4(new Matrix4().compose(new Vector3(x, y, z),
      new Quaternion().setFromEuler(new Euler(0, ry, rz)), new Vector3(1, 1, 1)));
    add(g, color, lift, undefined, group);
    if (solid) solids.push({ position: [x, y, z], size: [w / 2, h / 2, d / 2], rotation: [0, ry, rz] });
  }
  /** A district-edge hill: the same solid box (the collider is the plain box), drawn as 16 m cells whose corners each carry their own
   * tone, so a 200 m face is mottled instead of one flat colour. Overgrown moss on top, concrete grey on the walls, darker and
   * wetter toward the water. `lift` is [walls, tops]. Drawn in the calm group (the stone texture, less marbled, in cityMaterials). */
  function hill(x: number, y: number, z: number, w: number, h: number, d: number, wall: string, top: string, lift: [number, number] = [1, 1], solid = true) {
    const g = new BoxGeometry(w, h, d, Math.ceil(w / 16), Math.ceil(h / 16), Math.ceil(d / 16)), out = new Color(), moss = new Color(top), rock = new Color(wall);
    g.translate(x, y, z);
    const noise = (a: number, b: number) => { const t = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return t - Math.floor(t); };
    add(g, wall, lift[0], (p, n) => {
      const cell = .8 + .4 * noise(Math.round(p.x / 16) + Math.round(p.y / 16) * 7.3, Math.round(p.z / 16));
      if (n.y > .5) return out.copy(moss).multiplyScalar(lift[1] * cell);
      const t = Math.min(1, Math.max(0, (p.y - (y - h / 2)) / h));
      return out.copy(rock).multiplyScalar(lift[0] * cell * (.8 + .2 * t * t * (3 - 2 * t)));
    }, CALM_GROUP);
    if (solid) solids.push({ position: [x, y, z], size: [w / 2, h / 2, d / 2], rotation: [0, 0, 0] });
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
  return { box, hill, block, slab, add, finish, solids };
}
/** Ash-dulled concrete, faded markings, dirty glass and rusted steel (the 2026-10-06 ruins). */
export const colors = { concrete: '#a8a598', edge: '#33302c', glass: '#3c4542', warm: '#8f6a58',
  light: '#a99a86', moss: '#4f4b40', road: '#85857c', white: '#a39d88', steel: '#4a4038' };
/** A burned-out car: a rusted body, the cabin a black hollow, sitting on its rims. */
export function car(k: Kit, x: number, y: number, z: number, color: string, ry = 0) {
  k.box(x, y + .45, z, 1.9, .6, 4.3, color, true, ry);
  k.box(x, y + .93, z - .2, 1.65, .45, 2, '#1d1b19', false, ry);
  for (const dx of [-1, 1]) for (const dz of [-1.35, 1.35]) k.box(x + dx * .86, y + .2, z + dz, .2, .4, .5, '#2b2723');
}
