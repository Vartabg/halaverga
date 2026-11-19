import { BoxGeometry, Color, Float32BufferAttribute, Matrix4, Quaternion, Euler, Vector3, BufferGeometry } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { INK } from './paintInk';
import { megalithGeometry } from './megalithGeometry';
import type { Stone } from '@/game/obstacles';
export type Triple = [number, number, number];
/** Frame colliders let the camera boom pass while still blocking flight and shots. */
export type Solid = { position: Triple; size: Triple; rotation: Triple; kind?: 'building' | 'frame' };
export type Kit = ReturnType<typeof createKit>;
/** A megalith's radii name the circle its seven corners stand on. The stone itself (flat between corners, chipped, fluted) lies
 * inside that circle: on average this share of it, which is what a thrown body strikes (game/obstacles.ts). */
export const STONE_FIT = .92;
export function createKit() {
  const pieces: BufferGeometry[] = [], solids: Solid[] = [];
  /** Every megalith as it is drawn, for what a thrown body strikes (game/obstacles.ts). */
  const stones: Stone[] = [];
  /** `shade` (optional) gives a vertex its colour from its world position and normal; otherwise the whole piece is `color`. */
  function add(g: BufferGeometry, color: string, shade?: (p: Vector3, n: Vector3) => Color) {
    const c = new Color(color), p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
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
    pieces.push(g);
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
    const geometry = mergeGeometries(pieces);
    if (!geometry) throw new Error('sanctuary geometry merge failed');
    pieces.forEach(piece => piece.dispose());
    geometry.computeBoundingSphere();
    return { geometry, solids };
  }
  /** A faceted Watcher megalith: an irregular seven-sided worked-stone silhouette, never a smooth cylinder or brick stack. */
  function pillar(x: number, y: number, z: number, h: number, rTop: number, rBot: number, seed: number, ry: number,
    lift = 1, flute = { depth: .05, course: 3.2 }) {
    const source = megalithGeometry(h, rTop, rBot, seed), p = source.attributes.position;
    stones.push({ x, y, z, h, top: rTop * STONE_FIT, bottom: rBot * STONE_FIT });
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
    add(g, INK.shaft, (pw, nw) => {
      const t = Math.min(1, Math.max(0, (pw.y - botY) / Math.max(h, 0.1)));
      const base = new Color(INK.plinth).lerp(new Color(INK.rock), Math.min(1, t * 1.4));
      base.lerp(new Color(INK.shaft), Math.max(0, nw.y + 0.35 * -nw.x) * 0.55);
      const band = Math.abs(t - 0.72) < 0.035 || Math.abs(t - 0.84) < 0.022;
      if (band && h >= 3.2) return new Color(INK.crown);
      const snowCap = Math.min(1, Math.max(0, (t - 0.82) * 3.8 + Math.max(0, nw.y) * 0.55));
      return base.lerp(new Color(INK.cap), snowCap * 0.85).multiplyScalar(warm);
    });
  }
  return { box, pillar, finish, solids, stones };
}
/** A snow-capped alpine boulder & Watcher waystone along the Hermon gorge (preserves the exact base solid). */
export function addWaystone(k: Kit, x: number, y: number, z: number, ry: number) {
  k.solids.push({ position: [x, y + 1.95, z], size: [1.85, 2.05, 1.85], rotation: [0, ry, 0] });
  k.pillar(x, y + 1.8, z, 3.8, .9, 1.85, Math.round(Math.abs(x * 7 + z)), ry, .95, { depth: .16, course: 1.9 });
  k.box(x, y + 3.8, z, 1.35, .45, 1.35, INK.lit, false, ry, .08);
}
