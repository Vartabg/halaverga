import { BufferGeometry, Color, Float32BufferAttribute } from 'three';
import { FOOT, START } from '../game/motion';
import { INK } from './paintInk';

/** The court's rings: muted bronze, not saturated gold. */
export const BRONZE = '#b9803e';
type Point = [number, number];
type Patch = { points: Point[]; y: number; color: string };
const polar = (rx: number, rz: number, a: number, cx = 0, cz = 65): Point => [cx + Math.cos(a) * rx, cz + Math.sin(a) * rz];
function patches(): Patch[] {
  // Thin finish layers above the walkable plateau. Keep enough separation for
  // overlapping faces without raising the visible floor above the sandals.
  const floor = START.y - FOOT;
  const out: Patch[] = [], sides = 12;
  const outer = Array.from({ length: sides }, (_, i) => {
    const a = i / sides * Math.PI * 2 + .12, chip = 1 + Math.sin(i * 4.7) * .055;
    return polar(11.4 * chip, 9.2 * chip, a);
  });
  out.push({ points: outer, y: floor + .003, color: INK.plinth });
  for (let i = 0; i < sides; i++) {
    const a = i / sides * Math.PI * 2 + .12, b = (i + 1) / sides * Math.PI * 2 + .12;
    out.push({ points: [polar(8.6, 7.0, a), outer[i], outer[(i + 1) % sides], polar(8.6, 7.0, b)], y: floor + .006,
      color: i % 3 === 0 ? INK.lit : i % 2 ? INK.shaft : INK.rock });
  }
  out.push({ points: Array.from({ length: 10 }, (_, i) => polar(6.2, 5.4, i / 10 * Math.PI * 2 + Math.PI / 10)), y: floor + .009, color: BRONZE });
  out.push({ points: Array.from({ length: 10 }, (_, i) => polar(5.65, 4.9, i / 10 * Math.PI * 2 + Math.PI / 10)), y: floor + .012, color: INK.plinth });
  out.push({ points: Array.from({ length: 8 }, (_, i) => polar(3.8, 3.4, i / 8 * Math.PI * 2 + Math.PI / 8)), y: floor + .015, color: INK.rock });
  return out;
}

/** Compact hand-cut oath court: irregular Cyclopean polygons, never a rectangular runway. */
export function courtGeometry() {
  const positions: number[] = [], normals: number[] = [], colors: number[] = [], uvs: number[] = [];
  for (const patch of patches()) {
    const { points, y, color } = patch, centre = points.reduce((c, p) => [c[0] + p[0] / points.length, c[1] + p[1] / points.length], [0, 0]);
    const area = points.reduce((sum, p, i) => { const q = points[(i + 1) % points.length]; return sum + p[0] * q[1] - q[0] * p[1]; }, 0);
    const c = new Color(color);
    for (let i = 0; i < points.length; i++) {
      const a = points[i], b = points[(i + 1) % points.length], triangle = area > 0 ? [centre, b, a] : [centre, a, b];
      for (const p of triangle) {
        const x = p[0] * .86, z = 65 + (p[1] - 65) * .86;
        positions.push(x, y, z); normals.push(0, 1, 0); colors.push(c.r, c.g, c.b); uvs.push(x / 4, z / 4);
      }
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3));
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  geometry.computeBoundingSphere();
  return geometry;
}
