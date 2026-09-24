// Draw the flight: the resampled 3D path (spec 4.2) as a preallocated ring of DRAW_MAX_PTS points at about DRAW_SPACING m,
// with running arc length, curvature radius, the pen-speed factor, amber (clamped) flags and the body-spin stretches. Also the
// centripetal Catmull-Rom evaluator drawPath walks. Pure: plain numbers and {x,y,z}, no three.js, nothing allocates after load.
import { WORLD, type Vec } from '../motion';
import { DRAW_AMBER_M, DRAW_BOUNDS_PAD, DRAW_MAX_PTS, DRAW_MIN_R, DRAW_SPACING, DRAW_Y_MAX, DRAW_Y_MIN, SPIN_TURN_DEG } from './tuning';

const N = DRAW_MAX_PTS, SPINS = 4, STRAIGHT = 1e6;
/** A bend below this per point ends a spin stretch (the path is running straight again). */
const STRAIGHT_RAD = 1.5 * Math.PI / 180, SPIN_RAD = SPIN_TURN_DEG * Math.PI / 180;
/** Largest turn between successive DRAW_SPACING segments that keeps the curvature radius at DRAW_MIN_R or more. */
const H = DRAW_SPACING, TURN_MAX = 2 * Math.asin(H / (2 * DRAW_MIN_R));
const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
/** Clamps p in place to DRAW_BOUNDS_PAD inside the district and y in [DRAW_Y_MIN, DRAW_Y_MAX]. */
export function clampInside(p: Vec) {
  p.x = clamp(p.x, WORLD.minX + DRAW_BOUNDS_PAD, WORLD.maxX - DRAW_BOUNDS_PAD);
  p.z = clamp(p.z, WORLD.minZ + DRAW_BOUNDS_PAD, WORLD.maxZ - DRAW_BOUNDS_PAD);
  p.y = clamp(p.y, DRAW_Y_MIN, DRAW_Y_MAX);
}

export class PathRing {
  readonly x = new Float32Array(N); readonly y = new Float32Array(N); readonly z = new Float32Array(N);
  readonly arc = new Float64Array(N);
  /** Stroke speed profile at the point, normalised to the stroke mean (pathFollow multiplies it by FOLLOW_BASE). */
  readonly factor = new Float32Array(N);
  /** Curvature radius at the point, m (1e6 when straight or not yet known). */
  readonly radius = new Float32Array(N);
  /** 1 where the bounds clamp moved the point more than DRAW_AMBER_M. */
  readonly amber = new Uint8Array(N);
  /** performance.now ms of the ink sample that emitted the point (stamp at push time), for the world ribbon's fade. */
  readonly time = new Float64Array(N); stamp = 0;
  /** Spin stretches [from, to] in arc metres and their roll sign (+1 = left, as yaw), the last SPINS kept. */
  readonly spinArc = new Float64Array(SPINS * 2); readonly spinSign = new Int8Array(SPINS);
  /** Points ever pushed since the last reset; absolute index i lives in slot i % N. */
  count = 0; spins = 0;
  private turnAcc = 0; private turnSign = 0; private spinFrom = 0;
  private readonly L = { x: 0, y: 0, z: 0 }; private readonly P = { x: 0, y: 0, z: 0 };

  get first() { return this.count > N ? this.count - N : 0; }
  get endArc() { return this.count ? this.arc[(this.count - 1) % N] : 0; }
  reset() { this.count = 0; this.spins = 0; this.turnAcc = 0; this.turnSign = 0; this.spinFrom = 0; }
  arcOf(i: number) { return this.arc[i % N]; }
  get(i: number, out: Vec): Vec { const k = i % N; out.x = this.x[k]; out.y = this.y[k]; out.z = this.z[k]; return out; }
  last(out: Vec): Vec { return this.get(this.count - 1, out); }

  push(px: number, py: number, pz: number, factor: number, amber: boolean) {
    const k = this.count % N;
    let a = 0;
    if (this.count > 0) { const j = (this.count - 1) % N; a = this.arc[j] + Math.hypot(px - this.x[j], py - this.y[j], pz - this.z[j]); }
    this.x[k] = px; this.y[k] = py; this.z[k] = pz; this.arc[k] = a;
    this.factor[k] = factor; this.amber[k] = amber ? 1 : 0; this.radius[k] = STRAIGHT; this.time[k] = this.stamp;
    this.count++;
    if (this.count >= 3) this.bend(this.count - 2, true);
  }

  /**
   * Emits points DRAW_SPACING apart toward t (clamped in place; amber when that moved it more than DRAW_AMBER_M), each turn
   * slerped down to TURN_MAX. exact also lands a final shorter step on t. False when the ring is full ahead of keepFrom.
   */
  emitToward(t: Vec, exact: boolean, factor: number, keepFrom: number): boolean {
    const ox = t.x, oy = t.y, oz = t.z; clampInside(t);
    const amber = Math.hypot(t.x - ox, t.y - oy, t.z - oz) > DRAW_AMBER_M, L = this.L, P = this.P;
    for (let n = 0; n < 8; n++) {
      this.last(L);
      let dx = t.x - L.x, dy = t.y - L.y, dz = t.z - L.z;
      const dist = Math.hypot(dx, dy, dz);
      if (dist < (exact ? 0.25 : H)) return true;
      if (this.count - keepFrom >= N - 1) return false;
      dx /= dist; dy /= dist; dz /= dist;
      if (this.count >= 2 && this.tangent(this.count - 2, P)) {
        const th = Math.acos(clamp(dx * P.x + dy * P.y + dz * P.z, -1, 1)), sn = Math.sin(th);
        if (th > TURN_MAX && sn > 1e-6) {
          const wa = Math.sin(th - TURN_MAX) / sn, wb = Math.sin(TURN_MAX) / sn;
          dx = P.x * wa + dx * wb; dy = P.y * wa + dy * wb; dz = P.z * wa + dz * wb;
        }
      }
      const step = exact ? Math.min(dist, H) : H;
      P.x = L.x + dx * step; P.y = L.y + dy * step; P.z = L.z + dz * step; clampInside(P);
      this.push(P.x, P.y, P.z, factor, amber);
    }
    return true;
  }

  /** Curvature radius at interior point i from its neighbours; with track, the spin bookkeeping too (+ = a left turn). */
  private bend(i: number, track: boolean) {
    const a = (i - 1) % N, b = i % N, c = (i + 1) % N;
    const ux = this.x[b] - this.x[a], uy = this.y[b] - this.y[a], uz = this.z[b] - this.z[a];
    const vx = this.x[c] - this.x[b], vy = this.y[c] - this.y[b], vz = this.z[c] - this.z[b];
    const lu = Math.hypot(ux, uy, uz), lv = Math.hypot(vx, vy, vz);
    if (lu < 1e-6 || lv < 1e-6) return;
    const cos = Math.min(1, Math.max(-1, (ux * vx + uy * vy + uz * vz) / (lu * lv))), th = Math.acos(cos);
    this.radius[b] = th > 1e-5 ? (lu + lv) / 4 / Math.sin(th / 2) : STRAIGHT;
    if (!track) return;
    const sign = uz * vx - ux * vz >= 0 ? 1 : -1;
    if (th < STRAIGHT_RAD || sign !== this.turnSign) { this.turnAcc = 0; this.turnSign = sign; this.spinFrom = this.arc[b]; }
    if (th < STRAIGHT_RAD) return;
    this.turnAcc += th;
    if (this.turnAcc >= SPIN_RAD) {
      const s = this.spins % SPINS;
      this.spinArc[s * 2] = this.spinFrom; this.spinArc[s * 2 + 1] = this.arc[b]; this.spinSign[s] = sign;
      this.spins++; this.turnAcc = 0; this.spinFrom = this.arc[b];
    }
  }

  /** Arc and curvature from absolute index `from` on, after points there were moved in place (the landing retarget). */
  recompute(from: number) {
    const lo = Math.max(1, from, this.first + 1);
    for (let i = lo; i < this.count; i++) {
      const k = i % N, j = (i - 1) % N;
      this.arc[k] = this.arc[j] + Math.hypot(this.x[k] - this.x[j], this.y[k] - this.y[j], this.z[k] - this.z[j]);
    }
    for (let i = Math.max(lo - 1, this.first + 1); i < this.count - 1; i++) this.bend(i, false);
  }

  /** The segment i (absolute) holding arc s, searched forward from hint; out gets the point at s (clamped to the ends). */
  at(s: number, hint: number, out: Vec): number {
    const c = this.count;
    if (c === 0) return 0;
    let i = Math.max(hint, this.first);
    if (i > c - 1) i = c - 1;
    while (i > this.first && this.arc[i % N] > s) i--;
    while (i + 1 < c && this.arc[(i + 1) % N] <= s) i++;
    const k = i % N;
    if (i + 1 >= c || s <= this.arc[k]) { this.get(i, out); return i; }
    const m = (i + 1) % N, span = this.arc[m] - this.arc[k], u = span > 1e-9 ? (s - this.arc[k]) / span : 0;
    out.x = this.x[k] + (this.x[m] - this.x[k]) * u; out.y = this.y[k] + (this.y[m] - this.y[k]) * u; out.z = this.z[k] + (this.z[m] - this.z[k]) * u;
    return i;
  }

  /** Unit direction of segment i (clamped into the path); false when the path has no segment. */
  tangent(i: number, out: Vec): boolean {
    if (this.count < 2) return false;
    const a = Math.min(Math.max(i, this.first), this.count - 2), k = a % N, m = (a + 1) % N;
    const x = this.x[m] - this.x[k], y = this.y[m] - this.y[k], z = this.z[m] - this.z[k], l = Math.hypot(x, y, z);
    if (l < 1e-9) return false;
    out.x = x / l; out.y = y / l; out.z = z / l;
    return true;
  }

  /** Drops everything past arc s and ends the path exactly at s. Spin stretches past s are dropped too. */
  truncate(s: number, scratch: Vec) {
    if (this.count < 2 || s >= this.endArc) return;
    const i = this.at(Math.max(s, this.arc[this.first % N]), this.first, scratch), f = this.factor[i % N];
    this.count = i + 1;
    if (s - this.arc[i % N] > 1e-3) this.push(scratch.x, scratch.y, scratch.z, f, false);
    while (this.spins > 0 && this.spinArc[((this.spins - 1) % SPINS) * 2 + 1] > s) this.spins--;
    this.turnAcc = 0; this.spinFrom = s;
  }

  /** Body roll at arc s: one full turn (2 pi) spread over each spin stretch, signed; 0 elsewhere. */
  spinAt(s: number): number {
    for (let n = Math.max(0, this.spins - SPINS); n < this.spins; n++) {
      const k = n % SPINS, a = this.spinArc[k * 2], b = this.spinArc[k * 2 + 1];
      if (s >= a && s <= b && b > a) return this.spinSign[k] * 2 * Math.PI * (s - a) / (b - a);
    }
    return 0;
  }
}

/**
 * Centripetal Catmull-Rom (alpha 0.5, Barry-Goldman) through q = [p0, p1, p2, p3] (12 numbers), at u in [0, 1] between p1 and
 * p2. Writes out; allocation-free.
 */
export function catmullRom(q: Float64Array, u: number, out: Vec): Vec {
  const d01 = Math.sqrt(Math.max(1e-8, Math.hypot(q[3] - q[0], q[4] - q[1], q[5] - q[2])));
  const d12 = Math.sqrt(Math.max(1e-8, Math.hypot(q[6] - q[3], q[7] - q[4], q[8] - q[5])));
  const d23 = Math.sqrt(Math.max(1e-8, Math.hypot(q[9] - q[6], q[10] - q[7], q[11] - q[8])));
  const t1 = d01, t2 = t1 + d12, t3 = t2 + d23, t = t1 + u * d12;
  for (let a = 0; a < 3; a++) {
    const p0 = q[a], p1 = q[3 + a], p2 = q[6 + a], p3 = q[9 + a];
    const a1 = ((t1 - t) * p0 + t * p1) / t1, a2 = ((t2 - t) * p1 + (t - t1) * p2) / d12, a3 = ((t3 - t) * p2 + (t - t2) * p3) / d23;
    const b1 = ((t2 - t) * a1 + t * a2) / t2, b2 = ((t3 - t) * a2 + (t - t1) * a3) / (t3 - t1);
    const c = ((t2 - t) * b1 + (t - t1) * b2) / d12;
    if (a === 0) out.x = c; else if (a === 1) out.y = c; else out.z = c;
  }
  return out;
}
