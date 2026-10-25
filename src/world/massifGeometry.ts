import { BufferGeometry, Color, Float32BufferAttribute, Vector3 } from 'three';
import { INK } from './paintInk';
import { hash2, heightAt, type Bounds } from './massifData';
import { SUN_DIRECTION } from './atmospherePalette';

export type TerrainChunk = {
  id: string; geometry: BufferGeometry; vertices: Float32Array; indices: Uint32Array; triangles: number;
  bounds?: Bounds; step?: number;
};
const clamp = (x: number) => Math.min(1, Math.max(0, x));
const smooth = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const rock = new Color(INK.rock), shaft = new Color(INK.shaft), snow = new Color(INK.cap), limestone = new Color('#c4ae96');
function pigment(x: number, y: number, z: number, normal: Vector3, seed: number, out: Color) {
  const variation = hash2(Math.round(x * .7), Math.round(z * .7), seed);
  const sun = Math.max(0, normal.x * SUN_DIRECTION[0] + normal.y * SUN_DIRECTION[1] + normal.z * SUN_DIRECTION[2]);
  const high = smooth(34, 76, y), lying = smooth(.32, .86, normal.y);
  out.copy(rock).lerp(shaft, .25 + variation * .45);
  out.lerp(limestone, Math.max(0, normal.y) * .24 + sun * .12);
  out.lerp(snow, high * lying * .92);
  out.multiplyScalar(.78 + variation * .15 + sun * .25);
  return out.setRGB(Math.min(1, out.r), Math.min(1, out.g), Math.min(1, out.b));
}

/** Expand source triangles into flat facets while retaining the exact arrays Rapier consumes. */
export function facetedChunk(id: string, vertices: Float32Array, indices: Uint32Array, seed: number = 6606) {
  const positions = new Float32Array(indices.length * 3), normals = new Float32Array(indices.length * 3);
  const colors = new Float32Array(indices.length * 3), uvs = new Float32Array(indices.length * 2);
  const a = new Vector3(), b = new Vector3(), c = new Vector3(), ab = new Vector3(), ac = new Vector3();
  const normal = new Vector3(), color = new Color();
  for (let i = 0; i < indices.length; i += 3) {
    const ia = indices[i] * 3, ib = indices[i + 1] * 3, ic = indices[i + 2] * 3;
    a.fromArray(vertices, ia); b.fromArray(vertices, ib); c.fromArray(vertices, ic);
    normal.copy(ab.subVectors(b, a).cross(ac.subVectors(c, a))).normalize();
    const cx = (a.x + b.x + c.x) / 3, cy = (a.y + b.y + c.y) / 3, cz = (a.z + b.z + c.z) / 3;
    pigment(cx, cy, cz, normal, seed, color);
    for (const [corner, point] of [[0, a], [1, b], [2, c]] as const) {
      const at = (i + corner) * 3, uv = (i + corner) * 2;
      positions.set([point.x, point.y, point.z], at); normals.set([normal.x, normal.y, normal.z], at);
      colors.set([color.r, color.g, color.b], at); uvs.set([point.x / 8, point.z / 8], uv);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3));
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  geometry.computeBoundingSphere();
  return { id, geometry, vertices, indices, triangles: indices.length / 3 } satisfies TerrainChunk;
}

function borderHeight(x: number, z: number, seed: number, step: number) {
  const mid = (v: number) => Math.abs(v / 10 - Math.round(v / 10)) > 1e-6;
  if (step === 5 && mid(x)) return (heightAt(x - 5, z, seed) + heightAt(x + 5, z, seed)) / 2;
  if (step === 5 && mid(z)) return (heightAt(x, z - 5, seed) + heightAt(x, z + 5, seed)) / 2;
  return heightAt(x, z, seed);
}

/** Aligned source grids plus coarse-linear borders make equal- and mixed-resolution chunks watertight. */
export function makeMassifChunk(id: string, bounds: Bounds, step = 5, seed: number = 6606): TerrainChunk {
  const width = bounds.maxX - bounds.minX, depth = bounds.maxZ - bounds.minZ;
  const nx = Math.round(width / step), nz = Math.round(depth / step);
  if (nx < 1 || nz < 1 || Math.abs(width / step - nx) > 1e-6 || Math.abs(depth / step - nz) > 1e-6) {
    throw new Error(`massif bounds are not aligned to the ${step} m grid: ${id}`);
  }
  const dx = width / nx, dz = depth / nz;
  const vertices = new Float32Array((nx + 1) * (nz + 1) * 3), indices = new Uint32Array(nx * nz * 6);
  for (let iz = 0; iz <= nz; iz++) for (let ix = 0; ix <= nx; ix++) {
    const border = ix === 0 || iz === 0 || ix === nx || iz === nz;
    const gx = bounds.minX + ix * dx, gz = bounds.minZ + iz * dz;
    const jx = border ? 0 : (hash2(gx, gz, seed + 31) - .5) * step * .28;
    const jz = border ? 0 : (hash2(gx, gz, seed + 47) - .5) * step * .28;
    const x = gx + jx, z = gz + jz, at = (iz * (nx + 1) + ix) * 3;
    vertices.set([x, border ? borderHeight(x, z, seed, step) : heightAt(x, z, seed), z], at);
  }
  for (let iz = 0; iz < nz; iz++) for (let ix = 0; ix < nx; ix++) {
    const a = iz * (nx + 1) + ix, b = a + 1, c = a + nx + 1, d = c + 1, at = (iz * nx + ix) * 6;
    if (hash2(ix + bounds.minX / step, iz + bounds.minZ / step, seed + 71) > .5) indices.set([a, c, d, a, d, b], at);
    else indices.set([a, c, b, b, c, d], at);
  }
  return { ...facetedChunk(id, vertices, indices, seed), bounds, step };
}
