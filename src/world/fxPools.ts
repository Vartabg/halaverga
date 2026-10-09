// Pure effect math and pool bookkeeping (no three): tracer timing, ballistic debris, oldest-slot rings and timed sprite puffs.
import type { EventKind, ShotEvent, Vec3 } from '@/game/combat';
import type { Socket } from './cannonContract';
import { ATTENUATE_FROM } from '../game/burst';
export type Rgb = { r: number; g: number; b: number };
/** The seven outcomes a shot can end in (one event per shot). */
export const isShotKind = (k: EventKind) => k === 'miss' || k === 'world' || k === 'water' || k === 'hit' || k === 'weak'
  || k === 'kill' || k === 'blocked';
/** Arrives within 33 ms at any range <= 250 m. */
export const tracerSpeed = (d: number) => Math.max(600, d / .033);
export const TRACER_FADE = .07;
export type TracerSpan = { head: number; tail: number; alive: boolean; fade?: number };
/**
 * Head and tail distance along the shot, and the fade (1 in flight, then (1 - k)^2 over the last 70 ms). A retracting beam, not a
 * slug: the head reaches the point within 33 ms and the tail eases in from the muzzle over the whole life (arrival + 70 ms), so the
 * beam starts at the arm for the first frames at any range (a 250 m miss draws muzzle to near-crosshair, not a far sub-pixel dash).
 * first: the tracer's first drawn frame (see below).
 */
export function tracerSpan(age: number, dist: number, out: TracerSpan, first = false) {
  const a = Math.max(0, age), arrive = dist / tracerSpeed(dist), life = arrive + TRACER_FADE, k = Math.min(1, a / life);
  out.head = Math.min(dist, tracerSpeed(dist) * a); out.tail = Math.min(out.head, dist * k * k);
  out.alive = age <= life && out.tail < dist;
  out.fade = a <= arrive ? 1 : Math.max(0, 1 - (a - arrive) / TRACER_FADE) ** 2;
  if (first) {
    // The shot frame: at age 0 the beam had no length, so it first showed on N+1 with its tail already out along the line. It is
    // drawn from the muzzle itself on its first frame, with the head one 60 Hz frame of flight out.
    out.head = Math.max(out.head, Math.min(dist, tracerSpeed(dist) * FIRST_FRAME)); out.tail = 0; out.alive = true; out.fade = 1;
  }
  return out;
}
/** The head's minimum flight on a tracer's first drawn frame (s). */
export const FIRST_FRAME = 1 / 60;
/** World width at `dist` that covers floorPx (1.5 px; 2 px for touch and tap look), never below .05 m (no sub-pixel shimmer). */
export const tracerWidth = (dist: number, fovDeg: number, heightPx: number, floorPx = 1.5) =>
  Math.max(.05, floorPx * dist * 2 * Math.tan(fovDeg * Math.PI / 360) / heightPx);
export type TracerOrigin = { from: Vec3; dir: Vec3; dist: number };
/**
 * Where a tracer's tail starts. A shot fired this frame (e.t === clock) starts at the live kicked cannon muzzle `fx` when it is
 * valid, so the flash, the tail and the cannon kick land on the same frame; dir and dist are re-derived to e.point. Otherwise the
 * event's own origin. Returns false when the tracer has no length (nothing to draw).
 */
export function tracerOrigin(e: ShotEvent, clock: number, fx: Socket, out: TracerOrigin): boolean {
  const f = e.t === clock && fx.valid ? fx : e.from;
  out.from.x = f.x; out.from.y = f.y; out.from.z = f.z;
  const dx = e.point.x - f.x, dy = e.point.y - f.y, dz = e.point.z - f.z, d = Math.hypot(dx, dy, dz);
  out.dist = d;
  if (!(d >= 1e-3)) { out.dir.x = 0; out.dir.y = 0; out.dir.z = 0; return false; }
  out.dir.x = dx / d; out.dir.y = dy / d; out.dir.z = dz / d;
  return true;
}
/** CSS px around the screen centre kept clear of muzzle sprites, and the smallest the flash core may shrink to. */
export const CLEAR_PX = 40, CORE_FLOOR_PX = 16;
/**
 * Halo diameter (px) whose edge stays at least CLEAR_PX from the screen centre, given the muzzle's distance from the centre in CSS px.
 * Never larger than haloPx, and never below the core floor (min(corePx, 16)); the caller draws the core at min(corePx, halo).
 */
export function haloClampPx(dxFromCentrePx: number, haloPx: number, corePx: number) {
  const room = 2 * (Math.abs(dxFromCentrePx) - CLEAR_PX);
  return Math.min(haloPx, Math.max(room > 0 ? room : 0, Math.min(corePx, CORE_FLOOR_PX)));
}
/** Per-shot muzzle halo alpha: .45, or .30 from the 4th shot of a burst. */
export const haloAlpha = (burstIndex: number) => burstIndex >= ATTENUATE_FROM ? .3 : .45;
/** Ballistic reach bound (m) of a spark: |v t + g t^2 / 2| <= v t + 11 t^2. */
export const sparkReach = (speed: number, life: number) => speed * life + 11 * life * life;
/** Spark speed (m/s) and life (s) from two uniforms. Non-kill sparks reach at most 1.35 m; the kill burst keeps its 4-9 m/s spray. */
export function sparkParams(u1: number, u2: number, kill: boolean, out: { speed: number; life: number }) {
  if (kill) { out.speed = 4 + 5 * u1; out.life = .15 + .1 * u2; } else { out.speed = 3 + 2.5 * u1; out.life = .12 + .06 * u2; }
  return out;
}
/** World metres covered by one screen pixel at `dist`; a sprite of pxSize(px, cap, m) is px pixels wide, capped at cap metres. */
export const metresPerPx = (dist: number, fovDeg: number, heightPx: number) => 2 * dist * Math.tan(fovDeg * Math.PI / 360) / heightPx;
export const pxSize = (px: number, capM: number, mPerPx: number) => Math.min(capM, px * mPerPx);
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
// Timed sprite puffs: born, life, x, y, z, rise, size0, size1, stretch, rgb0, rgb1, alpha0, alpha curve, drift xyz per slot.
// Curves: 0 = alpha (1 - u^2) (default), 1 = alpha (1 - u)^1.5 (holds, then drops: fireballs), 2 = flat (a single pop).
// Drift: an initial velocity that decays with time constant DRIFT_TAU, so a puff jets out and then hangs (travel |v| * DRIFT_TAU).
export const PUFF = 20, CURVE_HOLD = 1, CURVE_FLAT = 2, DRIFT_TAU = .1;
export type Puffs = Ring & { d: Float64Array; shown: Uint8Array };
export function makePuffs(size: number): Puffs {
  const d = new Float64Array(size * PUFF);
  for (let i = 0; i < size; i++) d[i * PUFF] = -1e9;
  return { next: 0, size, d, shown: new Uint8Array(size) };
}
export function spawnPuff(p: Puffs, t: number, at: Vec3, rise: number, life: number, s0: number, s1: number,
  stretch: number, c0: Rgb, c1: Rgb, alpha: number, curve = 0, drift: Vec3 | null = null) {
  const o = claim(p) * PUFF, d = p.d;
  d[o] = t; d[o + 1] = life; d[o + 2] = at.x; d[o + 3] = at.y; d[o + 4] = at.z; d[o + 5] = rise;
  d[o + 6] = s0; d[o + 7] = s1; d[o + 8] = stretch; d[o + 9] = c0.r; d[o + 10] = c0.g; d[o + 11] = c0.b;
  d[o + 12] = c1.r; d[o + 13] = c1.g; d[o + 14] = c1.b; d[o + 15] = alpha; d[o + 16] = curve;
  d[o + 17] = drift ? drift.x : 0; d[o + 18] = drift ? drift.y : 0; d[o + 19] = drift ? drift.z : 0;
  return o / PUFF;
}
/** Life fraction of slot i at time t: 0..1 while alive, else -1. */
export function puffU(p: Puffs, i: number, t: number) {
  const o = i * PUFF, age = t - p.d[o];
  return age >= 0 && age < p.d[o + 1] ? age / p.d[o + 1] : -1;
}
/** One sprite frame of a live puff: position, size (x, y), colour and alpha, all at life fraction u. */
export function puffFrame(p: Puffs, i: number, u: number, pos: Vec3, col: Rgb, size: { x: number; y: number }) {
  const o = i * PUFF, d = p.d, age = u * d[o + 1], s = d[o + 6] + (d[o + 7] - d[o + 6]) * u, k = DRIFT_TAU * (1 - Math.exp(-age / DRIFT_TAU));
  pos.x = d[o + 2] + d[o + 17] * k; pos.y = d[o + 3] + d[o + 5] * age + d[o + 18] * k; pos.z = d[o + 4] + d[o + 19] * k;
  size.x = s; size.y = s * d[o + 8];
  col.r = d[o + 9] + (d[o + 12] - d[o + 9]) * u; col.g = d[o + 10] + (d[o + 13] - d[o + 10]) * u; col.b = d[o + 11] + (d[o + 14] - d[o + 11]) * u;
  const curve = d[o + 16];
  return d[o + 15] * (curve === CURVE_FLAT ? 1 : curve === CURVE_HOLD ? (1 - u) ** 1.5 : 1 - u * u);
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
// Overheat steam: six puffs from the cannon's vent mouth, the first 40 ms after the overheat, 40 ms apart. Spawned lazily, each at
// the vent mouth where it is when its time comes (it is valid only once the hatch opens), else at the muzzle fallback. With the
// vent direction (world, unit) each puff jets out of the hatch at STEAM_JET m/s before it rises, so in the muzzle-up vent pose it
// reads as leaving the hatch instead of trailing up the barrel past the muzzle (visual review r2).
export const STEAM_PUFFS = 6, STEAM_LEAD = .04, STEAM_GAP = .04, STEAM_JET = 1.4;
export type SteamQueue = { t0: number; next: number };
export const makeSteam = (): SteamQueue => ({ t0: 0, next: STEAM_PUFFS });
export function startSteam(q: SteamQueue, eventT: number) { q.t0 = eventT + STEAM_LEAD; q.next = 0; }
const steamAt = { x: 0, y: 0, z: 0 }, steamV = { x: 0, y: 0, z: 0 };
/** Spawns every puff that is due by t; returns how many. */
export function stepSteam(q: SteamQueue, t: number, vent: Socket, fallback: Vec3, rng: () => number, p: Puffs, c: Rgb, dir: Vec3 | null = null) {
  let n = 0;
  for (; q.next < STEAM_PUFFS && t >= q.t0 + q.next * STEAM_GAP; q.next++, n++) {
    const o = vent.valid ? vent : fallback, j = vent.valid ? .012 : .06, jet = vent.valid && dir ? STEAM_JET * (.85 + .3 * rng()) : 0;
    steamAt.x = o.x + (rng() - .5) * 2 * j; steamAt.y = o.y + rng() * .01; steamAt.z = o.z + (rng() - .5) * 2 * j;
    steamV.x = jet ? dir!.x * jet : 0; steamV.y = jet ? dir!.y * jet : 0; steamV.z = jet ? dir!.z * jet : 0;
    // Small, soft wisps that billow out of the hatch and die within half a second (the first tune, .2 -> .8 m at alpha .45 for
    // 1.1 s rising .8 m/s, read as a glowing orb flying off and reached the 40 px clear aim zone in landscape).
    spawnPuff(p, q.t0 + q.next * STEAM_GAP, steamAt, .06, .5, .02, .14, 1, c, c, .3, 0, steamV);
  }
  return n;
}
