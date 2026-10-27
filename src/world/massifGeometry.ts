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
const deepCliff = new Color('#211834'), rock = new Color(INK.rock), shaft = new Color(INK.shaft);
const sunlitCrest = new Color(INK.cap), limestone = new Color('#d8b298'), dawnGold = new Color('#f6c98e'), warmBasalt = new Color('#32273d');
function pigment(x: number, y: number, z: number, normal: Vector3, _seed: number, out: Color) {
  const stratum = .5 + .5 * Math.sin(y * .22 + x * .035 - z * .028);
  const sun = Math.max(0, normal.x * SUN_DIRECTION[0] + normal.y * SUN_DIRECTION[1] + normal.z * SUN_DIRECTION[2]);
  const steep = 1 - clamp(normal.y);
  const high = smooth(28, 68, y), lying = smooth(.38, .84, normal.y);
  out.copy(deepCliff).lerp(rock, clamp(.22 + normal.y * .52 + stratum * .22));
  out.lerp(shaft, clamp(sun * .45 + stratum * .16));
  out.lerp(limestone, clamp((1 - steep) * .35 + sun * .28));
  out.lerp(dawnGold, clamp(sun * sun * .32 * smooth(14, 70, y)));
  out.lerp(sunlitCrest, clamp(high * lying * .48 + smooth(54, 88, y) * smooth(.28, .72, normal.y) * .25));
  out.lerp(warmBasalt, clamp(steep * .42));
  out.multiplyScalar(.68 + sun * .36 - steep * .18);
  return out.setRGB(Math.min(1, out.r), Math.min(1, out.g), Math.min(1, out.b));
}

/** Expand source triangles into flat facets while retaining the exact arrays Rapier consumes. */
export function facetedChunk(id: string, vertices: Float32Array, indices: Uint32Array, seed: number = 6606) {
  const triCount = indices.length / 3, vCount = vertices.length / 3;
  const positions = new Float32Array(indices.length * 3), normals = new Float32Array(indices.length * 3);
  const colors = new Float32Array(indices.length * 3), uvs = new Float32Array(indices.length * 2);
  const vNormals = new Float32Array(vCount * 3);
  const edgeMap = new Map<string, number>();
  const a = new Vector3(), b = new Vector3(), c = new Vector3(), ab = new Vector3(), ac = new Vector3();
  const normal = new Vector3(), nOther = new Vector3(), color = new Color();
  const faceNormals = new Float32Array(triCount * 3);
  const edgeKey = (u: number, v: number) => (u < v ? `${u}_${v}` : `${v}_${u}`);
  for (let t = 0; t < triCount; t++) {
    const i = t * 3, ia = indices[i], ib = indices[i + 1], ic = indices[i + 2];
    a.fromArray(vertices, ia * 3); b.fromArray(vertices, ib * 3); c.fromArray(vertices, ic * 3);
    normal.copy(ab.subVectors(b, a).cross(ac.subVectors(c, a))).normalize();
    faceNormals.set([normal.x, normal.y, normal.z], t * 3);
    for (const v of [ia, ib, ic]) {
      vNormals[v * 3] += normal.x; vNormals[v * 3 + 1] += normal.y; vNormals[v * 3 + 2] += normal.z;
    }
    for (const [u, v] of [[ia, ib], [ib, ic], [ic, ia]] as const) {
      const k = edgeKey(u, v), prev = edgeMap.get(k);
      edgeMap.set(k, prev === undefined ? t : -2 - prev * triCount - t);
    }
  }
  for (let v = 0; v < vCount; v++) {
    normal.fromArray(vNormals, v * 3).normalize();
    vNormals.set([normal.x, normal.y, normal.z], v * 3);
  }
  const creaseAt = (t: number, u: number, v: number) => {
    const packed = edgeMap.get(edgeKey(u, v));
    if (packed === undefined || packed >= 0) return 0;
    const enc = -2 - packed, t0 = Math.floor(enc / triCount), t1 = enc % triCount;
    const other = t === t0 ? t1 : t0;
    normal.fromArray(faceNormals, t * 3); nOther.fromArray(faceNormals, other * 3);
    return clamp((1 - normal.dot(nOther) - .04) * 6.5);
  };
  const isArch = id === 'cloven-arch';
  for (let t = 0; t < triCount; t++) {
    const i = t * 3, va = indices[i], vb = indices[i + 1], vc = indices[i + 2];
    a.fromArray(vertices, va * 3); b.fromArray(vertices, vb * 3); c.fromArray(vertices, vc * 3);
    const s0 = creaseAt(t, vb, vc), s1 = creaseAt(t, vc, va), s2 = creaseAt(t, va, vb);
    const cMax = Math.max(s0, s1, s2), eIdx = s0 >= s1 && s0 >= s2 ? 0 : s1 >= s2 ? 1 : 2;
    normal.fromArray(faceNormals, t * 3);
    const crag = isArch || normal.y < .68;
    for (const [corner, point, vi] of [[0, a, va], [1, b, vb], [2, c, vc]] as const) {
      const at = (i + corner) * 3, uv = (i + corner) * 2;
      normal.fromArray(crag ? faceNormals : vNormals, (crag ? t : vi) * 3);
      pigment(point.x, point.y, point.z, normal, seed, color);
      positions.set([point.x, point.y, point.z], at); normals.set([normal.x, normal.y, normal.z], at);
      colors.set([color.r, color.g, color.b], at); uvs.set([corner === eIdx ? 1 : 0, cMax], uv);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3));
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  geometry.computeBoundingSphere();
  return { id, geometry, vertices, indices, triangles: triCount } satisfies TerrainChunk;
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
