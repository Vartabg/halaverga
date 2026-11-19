import { BufferGeometry, Float32BufferAttribute, Vector3 } from 'three';
import { hash2, heightAt, type Bounds } from './massifData';

export type TerrainChunk = {
  id: string; geometry: BufferGeometry; vertices: Float32Array; indices: Uint32Array; triangles: number;
  bounds?: Bounds; step?: number;
};
const clamp = (x: number) => Math.min(1, Math.max(0, x));
const smooth = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
/** Expand source triangles into shaded facets while retaining the exact arrays Rapier consumes. */
export function facetedChunk(id: string, vertices: Float32Array, indices: Uint32Array) {
  const triCount = indices.length / 3, vCount = vertices.length / 3;
  const positions = new Float32Array(indices.length * 3), normals = new Float32Array(indices.length * 3);
  const vNormals = new Float32Array(vCount * 3);
  const a = new Vector3(), b = new Vector3(), c = new Vector3(), ab = new Vector3(), ac = new Vector3();
  const normal = new Vector3(), nOther = new Vector3();
  const faceNormals = new Float32Array(triCount * 3);
  for (let t = 0; t < triCount; t++) {
    const i = t * 3, ia = indices[i], ib = indices[i + 1], ic = indices[i + 2];
    a.fromArray(vertices, ia * 3); b.fromArray(vertices, ib * 3); c.fromArray(vertices, ic * 3);
    normal.copy(ab.subVectors(b, a).cross(ac.subVectors(c, a))).normalize();
    faceNormals.set([normal.x, normal.y, normal.z], t * 3);
    for (const v of [ia, ib, ic]) {
      vNormals[v * 3] += normal.x; vNormals[v * 3 + 1] += normal.y; vNormals[v * 3 + 2] += normal.z;
    }
  }
  for (let v = 0; v < vCount; v++) {
    normal.fromArray(vNormals, v * 3).normalize();
    vNormals.set([normal.x, normal.y, normal.z], v * 3);
  }
  const isArch = id === 'cloven-arch';
  for (let t = 0; t < triCount; t++) {
    const i = t * 3, va = indices[i], vb = indices[i + 1], vc = indices[i + 2];
    a.fromArray(vertices, va * 3); b.fromArray(vertices, vb * 3); c.fromArray(vertices, vc * 3);
    normal.fromArray(faceNormals, t * 3);
    const facet = isArch ? .48 : .34 * (1 - smooth(.25, .7, normal.y));
    for (const [corner, point, vi] of [[0, a, va], [1, b, vb], [2, c, vc]] as const) {
      const at = (i + corner) * 3;
      normal.fromArray(vNormals, vi * 3).lerp(nOther.fromArray(faceNormals, t * 3), facet).normalize();
      positions.set([point.x, point.y, point.z], at); normals.set([normal.x, normal.y, normal.z], at);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3));
  geometry.computeBoundingSphere();
  return { id, geometry, vertices, indices, triangles: triCount } satisfies TerrainChunk;
}

export function massifBorderHeight(x: number, z: number, seed: number, step: number) {
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
    vertices.set([x, border ? massifBorderHeight(x, z, seed, step) : heightAt(x, z, seed), z], at);
  }
  for (let iz = 0; iz < nz; iz++) for (let ix = 0; ix < nx; ix++) {
    const a = iz * (nx + 1) + ix, b = a + 1, c = a + nx + 1, d = c + 1, at = (iz * nx + ix) * 6;
    if (hash2(ix + bounds.minX / step, iz + bounds.minZ / step, seed + 71) > .5) indices.set([a, c, d, a, d, b], at);
    else indices.set([a, c, b, b, c, d], at);
  }
  return { ...facetedChunk(id, vertices, indices), bounds, step };
}
