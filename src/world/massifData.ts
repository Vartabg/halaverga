import { WORLD } from '@/game/motion';

export type Bounds = { minX: number; maxX: number; minZ: number; maxZ: number };
export const MASSIF = {
  seed: 6606, step: 5, arrivalY: 20, summitY: 61.415,
  near: { minX: -225, maxX: 225, minZ: -205, maxZ: 130 } as Bounds,
} as const;
export const OUTER_BOUNDS: Record<string, Bounds> = {
  'hermon-north': { minX: WORLD.minX, maxX: WORLD.maxX, minZ: WORLD.minZ, maxZ: MASSIF.near.minZ },
  'hermon-south': { minX: WORLD.minX, maxX: WORLD.maxX, minZ: MASSIF.near.maxZ, maxZ: WORLD.maxZ },
  'hermon-west': { minX: WORLD.minX, maxX: MASSIF.near.minX, minZ: MASSIF.near.minZ, maxZ: MASSIF.near.maxZ },
  'hermon-east': { minX: MASSIF.near.maxX, maxX: WORLD.maxX, minZ: MASSIF.near.minZ, maxZ: MASSIF.near.maxZ },
};
const clamp = (x: number) => Math.min(1, Math.max(0, x));
const smooth = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const fract = (x: number) => x - Math.floor(x);
export const hash2 = (x: number, z: number, seed: number) => fract(Math.sin(x * 127.1 + z * 311.7 + seed * .013) * 43758.5453);
function noise(x: number, z: number, seed: number) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz, seed), b = hash2(ix + 1, iz, seed), c = hash2(ix, iz + 1, seed), d = hash2(ix + 1, iz + 1, seed);
  return (a + (b - a) * u) + ((c + (d - c) * u) - (a + (b - a) * u)) * v;
}
const gauss = (value: number, width: number) => Math.exp(-((value / width) ** 2));
type Plateau = [number, number, number, number, number, number];
const PLATEAUS: Plateau[] = [
  [0, 65, 19, 18, 20, .72], [30, -38, 18, 16, 61.415, .72],
  [-24, 48, 6, 8, 2.05, .62], [24, 48, 6, 8, 2.05, .62],
  [0, -260, 13, 12, 3.2, .64], [-230, -40, 13, 12, 3.2, .64],
  [230, -30, 13, 12, 3.2, .64], [0, 165, 13, 12, 3.2, .64],
];
function terrace(y: number, x: number, z: number, p: Plateau) {
  const [cx, cz, rx, rz, top, flat] = p;
  const dx = (x - cx) / rx, dz = (z - cz) / rz;
  const angle = Math.atan2(dz, dx), irregular = 1 + .055 * Math.sin(angle * 5 + cx) + .035 * Math.sin(angle * 9 + cz);
  const d = Math.hypot(dx, dz) * irregular;
  if (d <= flat) return top;
  const blend = smooth(flat, 1.28, d);
  return top + (y - top) * blend;
}

/** One world-space Hermon sampler drives every near, outer and distant triangle. */
export function heightAt(x: number, z: number, seed: number = MASSIF.seed) {
  const broad = noise(x * .025, z * .025, seed), detail = noise(x * .09, z * .09, seed + 19);
  const gorge = 3.8 * Math.sin(z * .027) + 1.7 * Math.sin(z * .061), distance = Math.abs(x - gorge);
  let y = -3.4 + (broad - .5) * 2.4 + (detail - .5) * .8;
  const shelves = 13 + 8 * (.5 + .5 * Math.sin(z * .037)) + broad * 7;
  y += smooth(9, 59, distance) * shelves;
  const east = 124 + 22 * Math.sin(z * .019), west = -164 - 20 * Math.sin(z * .023 + 1.2);
  const saddle = .68 + noise(0, z * .045, seed + 44) * .32;
  const southernShelving = 1 - .55 * smooth(-15, 35, z);
  y += (gauss(x - east, 60) * (22 + broad * 22) + gauss(x - west, 62) * (21 + detail * 22)) * saddle * southernShelving;
  const spineZ = -48 - Math.sin(x * .025) * 11;
  y += gauss(z - spineZ, 19) * gauss(x - 94, 79) * 38 * smooth(11, 34, x);
  const summitR = Math.hypot((x - 30) * 1.08, (z + 38) * .94);
  y += gauss(summitR, 32) * 28 * smooth(8, 22, x) + gauss(summitR, 15) * 14;
  const promontory = gauss(z - 65, 30) * smooth(-8, 85, x) * 14;
  y += promontory;
  const edge = Math.max(smooth(215, 405, Math.abs(x)), smooth(200, 370, Math.abs(z + 55)));
  y += edge * (24 + broad * 39);
  const outside = Math.max(0, WORLD.minX - x, x - WORLD.maxX, WORLD.minZ - z, z - WORLD.maxZ);
  y += smooth(0, 155, outside) * (37 + broad * 48 + detail * 12);
  y = Math.min(124, y);
  for (const plateau of PLATEAUS) y = terrace(y, x, z, plateau);
  return y;
}
