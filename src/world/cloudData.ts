import { CLOUD, skyDirection, type Rgb } from './atmospherePalette';
/** Baked cloud noise. Pure and deterministic (integer hash, no Math.random, no sin), tileable, Node-safe: the dome samples it with
 * three texture taps instead of hashing per pixel. RGBA8: R coarse billow, G finer detail, B a broad weather map (banks and clear gaps), A opaque. */
const hash = (x: number, y: number, seed: number) => {
  let h = Math.imul(x, 0x27d4eb2d) ^ Math.imul(y, 0x165667b1) ^ Math.imul(seed, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
type Lattice = { nx: number; ny: number; v: Float32Array };
const lattice = (nx: number, ny: number, seed: number): Lattice => {
  const v = new Float32Array(nx * ny);
  for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) v[y * nx + x] = hash(x, y, seed);
  return { nx, ny, v };
};
/** Value noise on a periodic lattice: x and y are in lattice cells and wrap, so the result tiles. */
function sample({ nx, ny, v }: Lattice, x: number, y: number) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const u = fx * fx * (3 - 2 * fx), w = fy * fy * (3 - 2 * fy);
  let x0 = ix % nx, y0 = iy % ny;
  if (x0 < 0) x0 += nx;
  if (y0 < 0) y0 += ny;
  const x1 = x0 + 1 === nx ? 0 : x0 + 1, y1 = y0 + 1 === ny ? 0 : y0 + 1, r0 = y0 * nx, r1 = y1 * nx;
  const a = v[r0 + x0], b = v[r0 + x1], c = v[r1 + x0], d = v[r1 + x1];
  return a + (b - a) * u + (c - a) * w + (a - b - c + d) * u * w;
}
/** Octaves doubling from a base lattice of (nx, ny) cells over the whole texture; octaves from billowFrom up are folded into rounded
 * bumps, which gives the fine lumpy edge of a cumulus without putting creases in the broad shapes. */
function octaves(nx: number, ny: number, count: number, seed: number, billowFrom = count) {
  return Array.from({ length: count }, (_, o) => ({ lat: lattice(nx << o, ny << o, seed + o * 131), amp: .5 ** (o + 1), billow: o >= billowFrom }));
}
function fbm(layers: ReturnType<typeof octaves>, tx: number, ty: number) {
  let sum = 0, norm = 0;
  for (const { lat, amp, billow } of layers) {
    const n = sample(lat, tx * lat.nx, ty * lat.ny);
    sum += (billow ? Math.abs(n * 2 - 1) : n) * amp; norm += amp;
  }
  return sum / norm;
}
/** A broad field baked once on a grid and read back bilinearly (wrapping): the warp and weather layers are smooth, so this is far
 * cheaper than evaluating their octaves at every texel. */
function baked(layers: ReturnType<typeof octaves>, grid: number) {
  const v = new Float32Array(grid * grid);
  for (let y = 0; y < grid; y++) for (let x = 0; x < grid; x++) v[y * grid + x] = fbm(layers, x / grid, y / grid);
  return (tx: number, ty: number) => {
    const fx = tx * grid, fy = ty * grid, x0 = Math.floor(fx), y0 = Math.floor(fy), ax = fx - x0, ay = fy - y0;
    const xa = ((x0 % grid) + grid) % grid, xb = (xa + 1) % grid, ya = ((y0 % grid) + grid) % grid, yb = (ya + 1) % grid;
    const top = v[ya * grid + xa] * (1 - ax) + v[ya * grid + xb] * ax, bottom = v[yb * grid + xa] * (1 - ax) + v[yb * grid + xb] * ax;
    return top * (1 - ay) + bottom * ay;
  };
}
const stretch = (field: Float32Array) => {
  let lo = Infinity, hi = -Infinity;
  for (const v of field) { if (v < lo) lo = v; if (v > hi) hi = v; }
  return (v: number) => Math.round(255 * (v - lo) / (hi - lo));
};

/** size x size RGBA bytes. Same seed, same bytes. Coarse cells are about 32 texels wide at 256. */
export function makeCloudData(size = 256, seed = 2113): Uint8Array {
  const warpX = baked(octaves(4, 4, 2, seed + 7), 64), warpY = baked(octaves(4, 4, 2, seed + 19), 64), weather = baked(octaves(4, 4, 2, seed + 53), 64);
  const coarse = octaves(8, 8, 4, seed, 0), fine = octaves(24, 24, 3, seed + 31);
  const r = new Float32Array(size * size), g = new Float32Array(size * size), b = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const tx = (x + .5) / size, ty = (y + .5) / size, i = y * size + x;
    r[i] = fbm(coarse, tx + (warpX(tx, ty) - .5) * .12, ty + (warpY(tx, ty) - .5) * .12);
    g[i] = fbm(fine, tx, ty);
    b[i] = weather(tx, ty);
  }
  const sr = stretch(r), sg = stretch(g), sb = stretch(b), out = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) { out[i * 4] = sr(r[i]); out[i * 4 + 1] = sg(g[i]); out[i * 4 + 2] = sb(b[i]); out[i * 4 + 3] = 255; }
  return out;
}

/** The density the dome shows at a texel (matches the shader mix of R and G), 0..1. */
export const cloudDensityAt = (data: Uint8Array, i: number) => (data[i * 4] * .82 + data[i * 4 + 1] * .18) / 255;
/** Share of texels above the half-density point of the dome's ramp (threshold + ramp / 2). */
export function cloudCoverage(data: Uint8Array, threshold: number, ramp = .1) {
  let n = 0;
  const count = data.length / 4;
  for (let i = 0; i < count; i++) if (cloudDensityAt(data, i) > threshold + ramp / 2) n++;
  return n / count;
}

/** The cloud density the dome draws in a direction, 0 to 1, from the baked data alone: a CPU twin of the dome's shape, weather and gap
 * terms (without the edge roughness and the screen derivative ramp, so an edge is a little softer). `wind` is the drift in uv. Tests
 * and the offset search use it; nothing at run time does. */
export function cloudAt(data: Uint8Array, dir: Rgb, wind: [number, number] = [0, 0], size = 256): number {
  const h = Math.max(dir[1], 0);
  if (h < .02) return 0;
  const tap = (ch: number, u: number, v: number) => {
    const x = u * size - .5, y = v * size - .5, x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0, w = (a: number) => ((a % size) + size) % size;
    const at = (i: number, j: number) => data[(w(j) * size + w(i)) * 4 + ch] / 255;
    return (at(x0, y0) * (1 - fx) + at(x0 + 1, y0) * fx) * (1 - fy) + (at(x0, y0 + 1) * (1 - fx) + at(x0 + 1, y0 + 1) * fx) * fy;
  };
  const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const u = dir[0] / (h + CLOUD.lift) * CLOUD.scale + CLOUD.offset[0] + wind[0], v = dir[2] / (h + CLOUD.lift) * CLOUD.scale + CLOUD.offset[1] + wind[1];
  let gap = 0;
  for (const g of CLOUD.gaps) {
    const c = skyDirection(g.az, g.el), cos = (deg: number) => Math.cos(deg * Math.PI / 180);
    gap = Math.max(gap, smooth(cos(g.fade), cos(g.clear), dir[0] * c[0] + dir[1] * c[1] + dir[2] * c[2]));
  }
  const n = tap(0, u, v) * .82 + tap(1, u, v) * .18, cover = CLOUD.coverage + (.5 - tap(2, u * CLOUD.weatherScale, v * CLOUD.weatherScale)) * CLOUD.weatherSwing + gap * CLOUD.gapLift;
  return smooth(cover, cover + .075, n) * smooth(.02, .2, h);
}
