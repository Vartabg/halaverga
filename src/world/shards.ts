// Kill debris shape and burst sizing (pure, no three): a chunky torn lump of metal, its slot scale and tint, and the distance gain.
export type V3 = { x: number; y: number; z: number };
// A chunky torn lump of drone metal: two offset five-sided rings (upper, lower) capped by off-centre apexes, 20 flat faces. Radii, heights
// and angles are all uneven, so no view is a plate, a rectangle or a star, and it is thick (about .6 of its length) so no angle is a bar.
const N = 5, RU = [1.1, .7, .95, .6, .9], ZU = [.17, .21, .13, .2, .15], AU = [.1, -.12, .15, -.08, .12];
const RL = [.86, 1, .74, .96, .82], ZL = [-.15, -.2, -.12, -.19, -.14], AL = [-.1, .14, -.06, .12, -.14];
const LONG = .8;
/** 4 * N triangles (two cap fans, two per side), flat-shaded, centred on the bounding box, .8 m long at scale 1. */
export function shardPositions() {
  const ring = (r: number[], z: number[], j: number[], ph: number) => r.map((m, i) => {
    const a = 2 * Math.PI * (i + ph + j[i]) / N; return [Math.cos(a) * m * .5, Math.sin(a) * m * .39, z[i]];
  });
  const u = ring(RU, ZU, AU, 0), l = ring(RL, ZL, AL, .5), top = [.06, -.05, .31], bot = [-.07, .06, -.29], tri: number[][] = [];
  for (let i = 0; i < N; i++) {
    const j = (i + 1) % N;
    tri.push(top, u[i], u[j], u[i], l[i], u[j], l[i], l[j], u[j], bot, l[j], l[i]);
  }
  const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
  for (const p of tri) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], p[k]); hi[k] = Math.max(hi[k], p[k]); }
  const s = LONG / Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]), a = new Float32Array(tri.length * 3);
  tri.forEach((p, i) => { for (let k = 0; k < 3; k++) a[i * 3 + k] = (p[k] - (lo[k] + hi[k]) / 2) * s; });
  return a;
}
// Slot families (x, y, z): a broad lump, a tall wedge and a thick chip. Every extent stays within 1.4:1 of the others (no blade, no sheet).
const SHARDS = [[1.05, 1, 1.1], [.95, 1.2, 1.05], [.9, .95, 1.2]];
/** Debris shape per slot (cheap integer hash): lump, wedge or chip, each with a little jitter. Writes x/y/z scale. */
export function shardScale(i: number, out: V3) {
  const h = Math.imul(i + 1, 0x9e3779b1) ^ Math.imul(i + 7, 0x85ebca6b), f = SHARDS[(h >>> 8) % 3], j = .93 + .14 * ((h >>> 16 & 255) / 255);
  out.x = f[0] * j; out.y = f[1] * (2 - j); out.z = f[2] * (.92 + .16 * ((h >>> 24 & 255) / 255)); return out;
}
/** The largest piece scale: with the .8 m lump and its widest family a piece never passes about 1.4 m, under a drone's 1.9 m rotor span. */
export const SHARD_K_MAX = 1.35;
/** Piece scale: its share `mult` of the burst's shard gain, capped at SHARD_K_MAX. */
export const shardK = (mult: number, gain: number) => Math.min(SHARD_K_MAX, mult * gain);
/** Tint index per slot: 0 gunmetal, 1 dim worn panel, 2 scorched red (three in five are metal). */
export const shardTint = (i: number) => { const r = (Math.imul(i + 3, 0x27d4eb2f) >>> 12) % 5; return r < 3 ? 0 : r - 2; };
/**
 * Size gain for a burst `dist` m from the camera: the 3.5 m fireball keeps at least `px` CSS px across (to a cap), never below 1.
 * Shards and embers take a share of it (see shardGain).
 */
export function burstGain(dist: number, fovDeg: number, heightPx: number, px = 150, max = 2.2) {
  const mPerPx = 2 * dist * Math.tan(fovDeg * Math.PI / 360) / Math.max(1, heightPx);
  return Math.min(max, Math.max(1, px * mPerPx / 3.5));
}
export const shardGain = (g: number) => 1 + (g - 1) * .6;
/** Kill sparks: more of them than a plain hit, from two uniforms-worth of spread. */
export const killSparkCount = (u: number) => 40 + Math.floor(u * 17);
/** The smoke plume: a few offset warm-grey puffs (never lavender, never one centred smudge) that rise, spread and thin out early. */
export const PLUME = { life: .85, rise: 2.6, s0: .8, s1: 3, alpha: .5 };
