import { WORLD } from '@/game/motion';
import { heightAt, reliefHeightAt } from '@/world/massifData';
import { passHeight } from './passLandforms';

// A finer grid along the flight stays aligned to the surveyed perimeter's five-metre vertices.
function axis(min: number, max: number, near: number, far: number) {
  const points: number[] = [];
  for (let p = min; p <= max; p += p >= near && p < far ? 2.5 : 5) points.push(p);
  const first = (near - min) / 5, last = first + (far - near) / 2.5;
  function cell(p: number) {
    const i = p < near ? (p - min) / 5 : p < far ? first + (p - near) / 2.5 : last + (p - far) / 5;
    return Math.min(points.length - 2, Math.max(0, Math.floor(i)));
  }
  return { points, cell };
}
const east = axis(WORLD.minX, WORLD.maxX, -80, 85);
const north = axis(WORLD.minZ, WORLD.maxZ, -70, 150);
export const groundX = east.points, groundZ = north.points;
const heights = new Float32Array(groundX.length * groundZ.length).fill(NaN);

/** The SRTM ring inherits linear half-steps between the original ten-metre edge samples. */
function edgeHeight(x: number, z: number) {
  const side = x === WORLD.minX || x === WORLD.maxX, along = side ? z : x;
  const lo = Math.floor(along / 10) * 10, t = (along - lo) / 10;
  const a = side ? heightAt(x, lo) : heightAt(lo, z);
  if (t === 0) return a;
  const b = side ? heightAt(x, lo + 10) : heightAt(lo + 10, z);
  return a + (b - a) * t;
}

export function groundVertex(ix: number, iz: number) {
  const at = iz * groundX.length + ix;
  if (Number.isNaN(heights[at])) {
    const x = groundX[ix], z = groundZ[iz];
    const edge = ix === 0 || iz === 0 || ix === groundX.length - 1 || iz === groundZ.length - 1;
    heights[at] = edge ? edgeHeight(x, z) : passHeight(x, z, reliefHeightAt(x, z));
  }
  return heights[at];
}

/** Barycentric height on the actual displayed triangle, including the floor of the dry drainage. */
export function passGroundAt(x: number, z: number) {
  if (x < WORLD.minX || x > WORLD.maxX || z < WORLD.minZ || z > WORLD.maxZ) return heightAt(x, z);
  const ix = east.cell(x), iz = north.cell(z);
  const u = (x - groundX[ix]) / (groundX[ix + 1] - groundX[ix]);
  const v = (z - groundZ[iz]) / (groundZ[iz + 1] - groundZ[iz]);
  const a = groundVertex(ix, iz), b = groundVertex(ix + 1, iz);
  const c = groundVertex(ix, iz + 1), d = groundVertex(ix + 1, iz + 1);
  if ((ix + iz) % 2 === 0) return u < v ? a + (d - c) * u + (c - a) * v : a + (b - a) * u + (d - b) * v;
  return u + v < 1 ? a + (b - a) * u + (c - a) * v : d + (c - d) * (1 - u) + (b - d) * (1 - v);
}
