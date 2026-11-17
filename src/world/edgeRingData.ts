import { WORLD } from '@/game/motion';
import { facetedChunk, type TerrainChunk } from './massifGeometry';
import { heightAt } from './massifData';

/** The land past the world edge. The massif's outer strips stop at WORLD with the rim raised 20 to 70 m, so without this the terrain
 * ends in a straight cut over the water (visible from the walls). This ring starts on the strips' own border vertices (every 5 m,
 * exactly heightAt, so it is watertight with them) and falls away to below the water over RING.reach metres, with gentle ridges. Far out
 * the scene fog (HAZE) takes it. Visual only: no collider, the flight box ends at WORLD. */
export const RING = { reach: 300, rows: [0, 10, 24, 46, 76, 115, 165, 230, 300], floor: -4, spacing: 5 };
type Pt = [number, number];
const corners: Pt[] = [[WORLD.minX, WORLD.minZ], [WORLD.maxX, WORLD.minZ], [WORLD.maxX, WORLD.maxZ], [WORLD.minX, WORLD.maxZ]];
const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** Ring height at outward distance d from a rim point (x, z) whose edge height is h0. */
export function ringHeight(h0: number, x: number, z: number, d: number) {
  const s = smooth(0, RING.reach, d);
  const ridge = Math.sin(x * .021 + z * .017) * Math.sin(x * .013 - z * .029 + 1.3) * 16 * smooth(0, .12, s) * (1 - smooth(.5, .95, s));
  return h0 + (RING.floor - h0) * s + ridge * (1 - s * .4) * (h0 > 0 ? 1 : 0);
}

/** The ring as one faceted chunk (no collider). Positions around the perimeter share the strips' 5 m border vertices at row 0. */
export function makeEdgeRing(seed: number = 6606): TerrainChunk {
  const grid: number[][] = [];  // per perimeter point, the row positions as x, z pairs
  const rim: Pt[] = [];
  const outer = (c: Pt, k: number, d: number): Pt => {
    const sx = k === 0 || k === 3 ? -1 : 1, sz = k < 2 ? -1 : 1;
    return [c[0] + sx * d, c[1] + sz * d];
  };
  for (let k = 0; k < 4; k++) {
    const a = corners[k], b = corners[(k + 1) % 4], n = Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / RING.spacing);
    for (let i = 0; i < n; i++) {
      const f = i / n;
      rim.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]);
      const oa = outer(a, k, 1), ob = outer(b, (k + 1) % 4, 1);
      grid.push(RING.rows.map(d => {
        const ca = [a[0] + (oa[0] - a[0]) * d, a[1] + (oa[1] - a[1]) * d], cb = [b[0] + (ob[0] - b[0]) * d, b[1] + (ob[1] - b[1]) * d];
        // each corner moves along its own diagonal by d; the side moves outward by d (the diagonal's component normal to it)
        return [ca[0] + (cb[0] - ca[0]) * f, ca[1] + (cb[1] - ca[1]) * f];
      }).flat());
    }
  }
  const count = rim.length, rows = RING.rows.length;
  const vertices = new Float32Array(count * rows * 3);
  for (let i = 0; i < count; i++) for (let j = 0; j < rows; j++) {
    const x = grid[i][j * 2], z = grid[i][j * 2 + 1], at = (i * rows + j) * 3;
    vertices.set([x, ringHeight(heightAt(rim[i][0], rim[i][1], seed), x, z, RING.rows[j]), z], at);
  }
  const indices: number[] = [];
  for (let i = 0; i < count; i++) for (let j = 0; j < rows - 1; j++) {
    const i2 = (i + 1) % count, a = i * rows + j, b = i * rows + j + 1, c = i2 * rows + j, d = i2 * rows + j + 1;
    indices.push(a, c, d, a, d, b);
  }
  // Wind every triangle upward (the ring turns the same way all round, but be explicit).
  for (let t = 0; t < indices.length; t += 3) {
    const [p, q, r] = [indices[t], indices[t + 1], indices[t + 2]].map(v => v * 3);
    const ny = (vertices[q + 2] - vertices[p + 2]) * (vertices[r] - vertices[p]) - (vertices[q] - vertices[p]) * (vertices[r + 2] - vertices[p + 2]);
    if (ny < 0) [indices[t + 1], indices[t + 2]] = [indices[t + 2], indices[t + 1]];
  }
  return facetedChunk('edge-ring', vertices, Uint32Array.from(indices), seed);
}
