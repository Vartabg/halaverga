import { facetedChunk, type TerrainChunk } from './massifGeometry';
import { hash2, MASSIF } from './massifData';

/** A custom faceted natural rock sweep, not a highway deck or a cylinder primitive. */
export function makeHermonArch(): TerrainChunk {
  const segments = 18, sides = 9, ring = sides + 1;
  const vertices = new Float32Array((segments + 1) * ring * 3), indices: number[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments, x = -31 + t * 62, lift = Math.sin(t * Math.PI);
    const cy = 3.2 + lift * 8.4, cz = -1 + Math.sin(t * Math.PI * 2) * .8;
    for (let j = 0; j <= sides; j++) {
      const a = j / sides * Math.PI * 2, chip = .82 + hash2(i, j % sides, MASSIF.seed + 90) * .32;
      const ry = (3.8 - lift * 1.25) * chip, rz = (4.8 - lift * .8) * chip;
      vertices.set([x + Math.sin(a * 3 + i) * .35, cy + Math.cos(a) * ry, cz + Math.sin(a) * rz], (i * ring + j) * 3);
    }
  }
  for (let i = 0; i < segments; i++) for (let j = 0; j < sides; j++) {
    const a = i * ring + j, b = a + ring;
    indices.push(a, a + 1, b, a + 1, b + 1, b);
  }
  const start = 0, end = segments * ring;
  for (let j = 1; j < sides - 1; j++) {
    indices.push(start, start + j + 1, start + j);
    indices.push(end, end + j, end + j + 1);
  }
  return facetedChunk('cloven-arch', vertices, new Uint32Array(indices));
}
