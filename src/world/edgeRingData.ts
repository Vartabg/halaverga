import { BufferAttribute, BufferGeometry } from 'three';
import { WORLD } from '@/game/motion';
import { MASSIF } from './massifData';
import { massifBorderHeight } from './massifGeometry';
import relief from './hermonRelief.json';

const { minX, maxX, minZ, maxZ } = WORLD;
const corners = [[minX, minZ], [maxX, minZ], [maxX, maxZ], [minX, maxZ]];
const offset = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
const blendEnd = 780;
type Ring = { distance: number; start: number; count: number; segments: number[]; sides: number[] };
const vertex = (ring: Ring, side: number, i: number) => ring.start + (ring.sides[side] + i) % ring.count;

/** Join edges with unequal steps by advancing the next point along the side. */
function stitch(indices: Uint16Array, at: number, near: Ring, far: Ring, side: number) {
  const a = near.segments[side], b = far.segments[side];
  let i = 0, j = 0;
  while (i < a || j < b) {
    const u = vertex(near, side, i), v = vertex(far, side, j);
    if (i === a || (j < b && (j + 1) * a <= (i + 1) * b)) {
      indices.set([u, vertex(far, side, ++j), v], at);
    } else {
      indices.set([u, vertex(near, side, ++i), v], at);
    }
    at += 3;
  }
  return at;
}

/** Measured relief with a short blend off the playable massif's exact five-metre edge. Visual only. */
export function makeEdgeRing(seed: number = MASSIF.seed) {
  const bytes = Uint8Array.from(atob(relief.heights), char => char.charCodeAt(0));
  const heights = new DataView(bytes.buffer);
  let total = 0;
  const rings: Ring[] = relief.rows.map(([distance, width, depth]) => {
    const count = 2 * (width + depth);
    const ring = { distance, start: total, count, segments: [width, depth, width, depth], sides: [0, width, width + depth, 2 * width + depth] };
    total += count;
    return ring;
  });
  const first = rings[0], last = rings[rings.length - 1];
  if (total > 65_535 || bytes.length !== 2 * total || relief.spacing !== MASSIF.step
    || first.segments[0] * MASSIF.step !== maxX - minX || first.segments[1] * MASSIF.step !== maxZ - minZ
    || [minX, maxX, minZ, maxZ].some((v, i) => v !== relief.bounds[i])) {
    throw new Error('Hermon relief grid changed. Rebuild it with scripts/art/build_hermon_relief.py.');
  }
  const positions = new Float32Array(total * 3);
  const indices = new Uint16Array((2 * total - first.count - last.count) * 3);
  const rimHeights = new Float32Array(first.count);
  let at = 0;
  for (const [row, ring] of rings.entries()) {
    const t = Math.min(1, ring.distance / blendEnd), blend = t * t * (3 - 2 * t);
    for (let side = 0; side < 4; side++) {
      const next = (side + 1) % 4;
      const [ax, az] = corners[side], [bx, bz] = corners[next];
      const [ox, oz] = offset[side], [px, pz] = offset[next];
      for (let j = 0; j < ring.segments[side]; j++) {
        const f = j / ring.segments[side], i = vertex(ring, side, j);
        const x = ax + (bx - ax) * f, z = az + (bz - az) * f;
        if (row === 0) rimHeights[i] = massifBorderHeight(x, z, seed, MASSIF.step);
        const along = f * first.segments[side], a = Math.floor(along);
        const y0 = rimHeights[vertex(first, side, a)], y1 = rimHeights[vertex(first, side, a + 1)];
        const rim = row === 0 ? rimHeights[i] : y0 + (y1 - y0) * (along - a);
        const y = rim * (1 - blend) + heights.getInt16(i * 2, true) * blend;
        positions.set([x + (ox + (px - ox) * f) * ring.distance, y, z + (oz + (pz - oz) * f) * ring.distance], i * 3);
      }
      if (row > 0) at = stitch(indices, at, rings[row - 1], ring, side);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setIndex(new BufferAttribute(indices, 1));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}
