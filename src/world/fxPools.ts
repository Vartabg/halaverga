// Pure effect math and pool bookkeeping (no three): tracer timing, ballistic debris, oldest-slot rings and timed sprite puffs.
import type { EventKind, Vec3 } from '@/game/combat';
export type Rgb = { r: number; g: number; b: number };
/** The seven outcomes a shot can end in (one event per shot). */
export const isShotKind = (k: EventKind) => k === 'miss' || k === 'world' || k === 'water' || k === 'hit' || k === 'weak'
  || k === 'kill' || k === 'blocked';
/** Arrives within 33 ms at any range <= 250 m. */
export const tracerSpeed = (d: number) => Math.max(600, d / .033);
/** Head and tail distance along the shot. The tail keeps its bullet speed after arrival, so the streak leaves through the target. */
export function tracerSpan(age: number, dist: number, out: { head: number; tail: number; alive: boolean }) {
  const speed = tracerSpeed(dist), run = speed * Math.max(0, age);
  out.head = Math.min(dist, run); out.tail = Math.min(dist, Math.max(0, run - Math.min(dist, 18)));
  out.alive = out.tail < dist && age <= dist / speed + .07;
  return out;
}
/** World width at `dist` that covers 1.5 px, never below .05 m (no sub-pixel shimmer). */
export const tracerWidth = (dist: number, fovDeg: number, heightPx: number) =>
  Math.max(.05, 1.5 * dist * 2 * Math.tan(fovDeg * Math.PI / 360) / heightPx);
export const impactDelay = (dist: number) => dist / tracerSpeed(dist);
/** p0 + v0 t with g = 22 (as Scene.tsx). */
export function debrisAt(p0: Vec3, v0: Vec3, t: number, out: Vec3) {
  out.x = p0.x + v0.x * t; out.y = p0.y + v0.y * t - 11 * t * t; out.z = p0.z + v0.z * t;
  return out;
}
/** Positive (descending) root of the ballistic y = level, Infinity if none. */
export function waterContactTime(p0: Vec3, v0: Vec3, level = .1) {
  const disc = v0.y * v0.y + 44 * (p0.y - level);
  if (disc < 0) return Infinity;
  const t = (v0.y + Math.sqrt(disc)) / 22;
  return t > 0 ? t : Infinity;
}
export type Ring = { next: number; size: number };
/** Oldest-slot reuse. */
export const claim = (r: Ring) => { const i = r.next; r.next = (r.next + 1) % r.size; return i; };
/** Cosine-weighted direction in the hemisphere around the unit normal n (u1, u2 uniform in [0, 1)). */
export function lobeDir(n: Vec3, u1: number, u2: number, out: Vec3) {
  const r = Math.sqrt(u1), phi = 2 * Math.PI * u2, a = r * Math.cos(phi), b = r * Math.sin(phi), c = Math.sqrt(1 - u1);
  let tx: number, ty: number, tz: number;
  if (Math.abs(n.y) < .9) { tx = -n.z; ty = 0; tz = n.x; } else { tx = 0; ty = n.z; tz = -n.y; }
  const l = Math.hypot(tx, ty, tz); tx /= l; ty /= l; tz /= l;
  const bx = n.y * tz - n.z * ty, by = n.z * tx - n.x * tz, bz = n.x * ty - n.y * tx;
  out.x = tx * a + bx * b + n.x * c; out.y = ty * a + by * b + n.y * c; out.z = tz * a + bz * b + n.z * c;
  return out;
}
// Timed sprite puffs: born, life, x, y, z, rise, size0, size1, stretch, rgb0, rgb1, alpha0 per slot.
export const PUFF = 16;
export type Puffs = Ring & { d: Float64Array; shown: Uint8Array };
export function makePuffs(size: number): Puffs {
  const d = new Float64Array(size * PUFF);
  for (let i = 0; i < size; i++) d[i * PUFF] = -1e9;
  return { next: 0, size, d, shown: new Uint8Array(size) };
}
export function spawnPuff(p: Puffs, t: number, at: Vec3, rise: number, life: number, s0: number, s1: number,
  stretch: number, c0: Rgb, c1: Rgb, alpha: number) {
  const o = claim(p) * PUFF, d = p.d;
  d[o] = t; d[o + 1] = life; d[o + 2] = at.x; d[o + 3] = at.y; d[o + 4] = at.z; d[o + 5] = rise;
  d[o + 6] = s0; d[o + 7] = s1; d[o + 8] = stretch; d[o + 9] = c0.r; d[o + 10] = c0.g; d[o + 11] = c0.b;
  d[o + 12] = c1.r; d[o + 13] = c1.g; d[o + 14] = c1.b; d[o + 15] = alpha;
  return o / PUFF;
}
/** Life fraction of slot i at time t: 0..1 while alive, else -1. */
export function puffU(p: Puffs, i: number, t: number) {
  const o = i * PUFF, age = t - p.d[o];
  return age >= 0 && age < p.d[o + 1] ? age / p.d[o + 1] : -1;
}
/** One sprite frame of a live puff: position, size (x, y), colour and alpha, all at life fraction u. */
export function puffFrame(p: Puffs, i: number, u: number, pos: Vec3, col: Rgb, size: { x: number; y: number }) {
  const o = i * PUFF, d = p.d, age = u * d[o + 1], s = d[o + 6] + (d[o + 7] - d[o + 6]) * u;
  pos.x = d[o + 2]; pos.y = d[o + 3] + d[o + 5] * age; pos.z = d[o + 4];
  size.x = s; size.y = s * d[o + 8];
  col.r = d[o + 9] + (d[o + 12] - d[o + 9]) * u; col.g = d[o + 10] + (d[o + 13] - d[o + 10]) * u; col.b = d[o + 11] + (d[o + 14] - d[o + 11]) * u;
  return d[o + 15] * (1 - u * u);
}
// Ballistic sparks: born, life, p0 xyz, v0 xyz per slot, drawn into flat position and colour arrays (Points).
export const SPARK = 8;
export type Sparks = Ring & { d: Float64Array; shown: Uint8Array };
export function makeSparks(size: number): Sparks {
  const d = new Float64Array(size * SPARK);
  for (let i = 0; i < size; i++) d[i * SPARK] = -1e9;
  return { next: 0, size, d, shown: new Uint8Array(size) };
}
export function spawnSpark(sp: Sparks, t: number, p: Vec3, dir: Vec3, speed: number, life: number) {
  const o = claim(sp) * SPARK, d = sp.d;
  d[o] = t; d[o + 1] = life; d[o + 2] = p.x; d[o + 3] = p.y; d[o + 4] = p.z;
  d[o + 5] = dir.x * speed; d[o + 6] = dir.y * speed; d[o + 7] = dir.z * speed;
}
const sp0 = { x: 0, y: 0, z: 0 }, sv0 = { x: 0, y: 0, z: 0 }, spOut = { x: 0, y: 0, z: 0 };
/** Writes live sparks (colour c0 -> c1, fading out) and blanks newly dead ones once; returns the highest live slot + 1. */
export function drawSparks(sp: Sparks, t: number, pos: Float32Array, col: Float32Array, c0: Rgb, c1: Rgb) {
  let top = 0;
  for (let i = 0; i < sp.size; i++) {
    const o = i * SPARK, d = sp.d, age = t - d[o], k = i * 3;
    if (!(age >= 0 && age < d[o + 1])) { if (sp.shown[i]) { col[k] = col[k + 1] = col[k + 2] = 0; sp.shown[i] = 0; } continue; }
    sp0.x = d[o + 2]; sp0.y = d[o + 3]; sp0.z = d[o + 4]; sv0.x = d[o + 5]; sv0.y = d[o + 6]; sv0.z = d[o + 7];
    debrisAt(sp0, sv0, age, spOut); pos[k] = spOut.x; pos[k + 1] = spOut.y; pos[k + 2] = spOut.z;
    const u = age / d[o + 1], f = 1 - u * u;
    col[k] = (c0.r + (c1.r - c0.r) * u) * f; col[k + 1] = (c0.g + (c1.g - c0.g) * u) * f; col[k + 2] = (c0.b + (c1.b - c0.b) * u) * f;
    sp.shown[i] = 1; top = i + 1;
  }
  return top;
}
