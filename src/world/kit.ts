import { BoxGeometry, Color, Float32BufferAttribute, Matrix4, Quaternion, Euler, Vector3, BufferGeometry } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { INK, INK_GROUP } from './paintInk';
import { megalithGeometry } from './megalithGeometry';
export type Triple = [number, number, number];
/** `building` marks a core's exterior volume; `frame` is bare ruin steel, which the chase camera's boom looks through (City.tsx). */
export type Solid = { position: Triple; size: Triple; rotation: Triple; kind?: 'building' | 'frame' };
export type Kit = ReturnType<typeof createKit>;
export const surfaces = ['stone', 'glass', 'metal', 'ground', 'paint', 'calm', 'ink'] as const;
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
    if (!g.index) g.setIndex(Array.from({ length: p.count }, (_, i) => i));
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
    // The three arrival-terrace boxes in cityData sit at x 0, z 65. They are the rock under the hero, so they take the paint
    // instead of the photo concrete. The thin top is the lit band; the mass under it is the stone colour.
    const rock = x === 0 && z === 65;
    add(g, rock ? (h < 0.2 ? INK.lit : INK.rock) : color, rock ? 1 : lift, undefined, rock ? INK_GROUP : group);
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
    const merged = pieces.map(group => group.length ? mergeGeometries(group) : null);
    const present = merged.filter((g): g is BufferGeometry => !!g);
    const geometry = mergeGeometries(present, false);
    if (!geometry) throw new Error('sanctuary geometry merge failed');
    geometry.clearGroups();
    let start = 0;
    merged.forEach((g, materialIndex) => {
      if (!g) return;
      const count = g.index ? g.index.count : g.attributes.position.count;
      geometry.addGroup(start, count, materialIndex); start += count;
    });
    pieces.flat().forEach(g => g.dispose()); present.forEach(g => g.dispose());
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
  /** A faceted Watcher megalith: an irregular seven-sided worked-stone silhouette, never a smooth cylinder or brick stack. */
  function pillar(x: number, y: number, z: number, h: number, rTop: number, rBot: number, seed: number, ry: number,
    lift = 1, flute = { depth: .05, course: 3.2 }) {
    const source = megalithGeometry(h, rTop, rBot, seed), p = source.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const vy = p.getY(i), vx = p.getX(i), vz = p.getZ(i), r = Math.hypot(vx, vz);
      if (r > 1e-3) {
        const a = Math.atan2(vz, vx) + ry, wy = vy + h / 2;
        const pinch = Math.pow(Math.abs(Math.cos(a * 5 + seed * .17)), 1.6) * flute.depth + Math.sin(wy * .28 + a * 2) * .018;
        p.setXYZ(i, vx * (1 - pinch), vy, vz * (1 - pinch));
      }
    }
    const g = source.toNonIndexed(); source.dispose(); g.computeVertexNormals();
    const warm = lift < 1 ? 0.92 : 1;
    g.applyMatrix4(new Matrix4().compose(new Vector3(x, y, z), new Quaternion().setFromEuler(new Euler(0, ry, 0)), new Vector3(1, 1, 1)));
    const topY = y + h / 2, botY = y - h / 2;
    add(g, INK.shaft, 1, (pw, nw) => {
      const t = Math.min(1, Math.max(0, (pw.y - botY) / Math.max(h, 0.1)));
      const base = new Color(INK.plinth).lerp(new Color(INK.rock), Math.min(1, t * 1.4));
      base.lerp(new Color(INK.shaft), Math.max(0, nw.y + 0.35 * -nw.x) * 0.55);
      const band = Math.abs(t - 0.72) < 0.035 || Math.abs(t - 0.84) < 0.022;
      if (band && h >= 3.2) return new Color(INK.crown);
      const crest = Math.min(1, Math.max(0, (t - 0.82) * 3.8 + Math.max(0, nw.y) * 0.55));
      return base.lerp(new Color(INK.cap), crest * 0.55).multiplyScalar(warm);
    }, INK_GROUP);
  }
  return { box, hill, block, slab, pillar, add, finish, solids };
}
/** Basalt, gilded limestone, worked bronze and snow-alabaster pigments for the Hermon massif. */
export const colors = { concrete: '#7d738c', edge: '#282136', glass: '#241e33', warm: '#c47d4e',
  light: '#dfba8c', moss: '#3d3752', road: '#685e78', white: '#f2b84b', steel: '#b8823c' };
/** A snow-capped alpine boulder & Watcher waystone along the Hermon gorge (preserves the exact base solid). */
export function car(k: Kit, x: number, y: number, z: number, _color: string, ry = 0) {
  k.solids.push({ position: [x, y + 1.95, z], size: [1.85, 2.05, 1.85], rotation: [0, ry, 0] });
  k.pillar(x, y + 1.8, z, 3.8, .9, 1.85, Math.round(Math.abs(x * 7 + z)), ry, .95, { depth: .16, course: 1.9 });
  k.box(x, y + 3.8, z, 1.35, .45, 1.35, INK.lit, false, ry, .08, 1, INK_GROUP);
}
