// Polyline tools (spec 2.4): RDP simplification, centripetal Catmull-Rom sampling at a spacing (px or m, 2D or 3D),
// exact-count equidistant resampling, and minRadius. Polylines are interleaved Float32Arrays with stride dim (2 or 3).
// All scratch is module-level and preallocated: nothing allocates per call.
import { CATMULL_ALPHA, LASSO_NEAR_PX, RDP_EPS, RESAMPLE_N } from './tuning';

export interface PointSeq { readonly count: number; x(i: number): number; y(i: number): number }
export type Dim = 2 | 3;

const CAP = 2048, DENSE = 4096, SUB = 16;
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const keep = new Uint8Array(CAP);
const stack = new Int32Array(CAP * 2);
const seqA = new Float32Array(CAP * 2), seqB = new Float32Array(CAP * 2), dense = new Float32Array(DENSE * 2);
const q = new Float64Array(3), e = new Float64Array(3);
const p0 = new Float64Array(3), p1 = new Float64Array(3), p2 = new Float64Array(3), p3 = new Float64Array(3);

function dist(a: ArrayLike<number>, i: number, b: ArrayLike<number>, j: number, dim: Dim): number {
  const dx = a[i] - b[j], dy = a[i + 1] - b[j + 1], dz = dim === 3 ? a[i + 2] - b[j + 2] : 0;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/** Squared distance from point p to segment ab (offsets into src). */
function segDist2(src: ArrayLike<number>, p: number, a: number, b: number, dim: Dim): number {
  let ab2 = 0, ap = 0;
  for (let k = 0; k < dim; k++) { const d = src[b + k] - src[a + k]; ab2 += d * d; ap += (src[p + k] - src[a + k]) * d; }
  const f = ab2 > 1e-12 ? Math.min(1, Math.max(0, ap / ab2)) : 0;
  let s = 0;
  for (let k = 0; k < dim; k++) { const d = src[p + k] - (src[a + k] + (src[b + k] - src[a + k]) * f); s += d * d; }
  return s;
}

/** Ramer-Douglas-Peucker with epsilon eps into out (iterative, no recursion). Returns the kept point count. */
export function rdp(src: ArrayLike<number>, count: number, dim: Dim, eps: number, out: Float32Array): number {
  const n = Math.min(count, CAP, Math.floor(out.length / dim));
  if (n <= 2) { for (let i = 0; i < n * dim; i++) out[i] = src[i]; return n; }
  keep.fill(0, 0, n); keep[0] = keep[n - 1] = 1;
  let top = 0; stack[top++] = 0; stack[top++] = n - 1;
  const eps2 = eps * eps;
  while (top > 0) {
    const b = stack[--top], a = stack[--top];
    let worst = -1, far = 0;
    for (let i = a + 1; i < b; i++) {
      const d = segDist2(src, i * dim, a * dim, b * dim, dim);
      if (d > far) { far = d; worst = i; }
    }
    if (worst > 0 && far > eps2) { keep[worst] = 1; stack[top++] = a; stack[top++] = worst; stack[top++] = worst; stack[top++] = b; }
  }
  let m = 0;
  for (let i = 0; i < n; i++) if (keep[i]) { for (let k = 0; k < dim; k++) out[m * dim + k] = src[i * dim + k]; m++; }
  return m;
}

function load(dst: Float64Array, src: ArrayLike<number>, i: number, dim: Dim) {
  for (let k = 0; k < 3; k++) dst[k] = k < dim ? src[i * dim + k] : 0;
}

/** Barry-Goldman evaluation of the centripetal segment p1 -> p2 at parameter u in [0, 1], into q. */
function evalSeg(u: number, dim: Dim) {
  const k0 = Math.max(Math.pow(dist(p0, 0, p1, 0, 3), CATMULL_ALPHA), 1e-4);
  const t1 = k0, t2 = t1 + Math.max(Math.pow(dist(p1, 0, p2, 0, 3), CATMULL_ALPHA), 1e-4);
  const t3 = t2 + Math.max(Math.pow(dist(p2, 0, p3, 0, 3), CATMULL_ALPHA), 1e-4);
  const t = t1 + (t2 - t1) * u;
  for (let k = 0; k < dim; k++) {
    const a1 = ((t1 - t) * p0[k] + t * p1[k]) / t1;
    const a2 = ((t2 - t) * p1[k] + (t - t1) * p2[k]) / (t2 - t1);
    const a3 = ((t3 - t) * p2[k] + (t - t2) * p3[k]) / (t3 - t2);
    const b1 = ((t2 - t) * a1 + t * a2) / t2;
    const b2 = ((t3 - t) * a2 + (t - t1) * a3) / (t3 - t1);
    q[k] = ((t2 - t) * b1 + (t - t1) * b2) / (t2 - t1);
  }
}

/**
 * Centripetal Catmull-Rom (alpha 0.5) through every point, sampled every `spacing` units of arc into out (stride dim).
 * The first and last points are always emitted. Returns the point count (at most maxOut).
 */
export function catmullRom(src: ArrayLike<number>, count: number, dim: Dim, spacing: number, out: Float32Array,
  maxOut = Math.floor(out.length / dim)): number {
  if (count <= 0 || maxOut <= 0) return 0;
  for (let k = 0; k < dim; k++) out[k] = src[k];
  if (count === 1) return 1;
  let m = 1, acc = 0;
  for (let k = 0; k < 3; k++) e[k] = k < dim ? src[k] : 0;
  for (let i = 0; i < count - 1 && m < maxOut; i++) {
    load(p1, src, i, dim); load(p2, src, i + 1, dim);
    if (dist(p1, 0, p2, 0, 3) < 1e-9) continue;
    if (i > 0) load(p0, src, i - 1, dim); else for (let k = 0; k < 3; k++) p0[k] = 2 * p1[k] - p2[k];
    if (i + 2 < count) load(p3, src, i + 2, dim); else for (let k = 0; k < 3; k++) p3[k] = 2 * p2[k] - p1[k];
    for (let s = 1; s <= SUB && m < maxOut; s++) {
      evalSeg(s / SUB, dim);
      let d = dist(q, 0, e, 0, 3);
      while (acc + d >= spacing && m < maxOut) {
        const f = (spacing - acc) / d;
        for (let k = 0; k < dim; k++) { e[k] += (q[k] - e[k]) * f; out[m * dim + k] = e[k]; }
        m++; acc = 0; d = dist(q, 0, e, 0, 3);
      }
      acc += d;
      for (let k = 0; k < dim; k++) e[k] = q[k];
    }
  }
  if (m < maxOut && acc > spacing * 1e-3) { for (let k = 0; k < dim; k++) out[m * dim + k] = src[(count - 1) * dim + k]; m++; }
  return m;
}

/** Exactly n points, equidistant by arc length along the polyline, into out (stride dim). Returns n (0 if count is 0). */
export function resampleEven(src: ArrayLike<number>, count: number, dim: Dim, n: number, out: Float32Array): number {
  if (count <= 0 || n <= 0) return 0;
  let total = 0;
  for (let i = 1; i < count; i++) total += dist(src, (i - 1) * dim, src, i * dim, dim);
  const step = n > 1 ? total / (n - 1) : 0;
  let j = 0, cum = 0, seg = count > 1 ? dist(src, 0, src, dim, dim) : 0;
  for (let k = 0; k < n; k++) {
    const target = k === n - 1 ? total : k * step;
    while (j < count - 2 && cum + seg < target) { cum += seg; j++; seg = dist(src, j * dim, src, (j + 1) * dim, dim); }
    const f = count > 1 && seg > 1e-12 ? Math.min(1, Math.max(0, (target - cum) / seg)) : 0;
    const a = j * dim, b = Math.min(j + 1, count - 1) * dim;
    for (let c = 0; c < dim; c++) out[k * dim + c] = src[a + c] + (src[b + c] - src[a + c]) * f;
  }
  return n;
}

/**
 * The recogniser pipeline for a screen stroke: RDP at eps px, a centripetal Catmull-Rom densify (so corners left by RDP do
 * not shorten the spacing), then n equidistant points into out as [x0, y0, x1, y1, ...]. Returns n, or 0 for an empty stroke.
 */
export function resampleStroke(s: PointSeq, out: Float32Array, n = RESAMPLE_N, eps = RDP_EPS): number {
  const c = Math.min(s.count, CAP);
  if (c === 0) return 0;
  for (let i = 0; i < c; i++) { seqA[i * 2] = s.x(i); seqA[i * 2 + 1] = s.y(i); }
  const m = rdp(seqA, c, 2, eps, seqB);
  let arc = 0;
  for (let i = 1; i < m; i++) arc += dist(seqB, (i - 1) * 2, seqB, i * 2, 2);
  const d = catmullRom(seqB, m, 2, Math.max(arc / (DENSE / 2), 0.25), dense, DENSE);
  return resampleEven(dense, d, 2, n, out);
}

/** Circumradius of three points (offsets into pts); Infinity when collinear or degenerate. */
export function circumradius(pts: ArrayLike<number>, a: number, b: number, c: number, dim: Dim): number {
  const ab = dist(pts, a, pts, b, dim), bc = dist(pts, b, pts, c, dim), ca = dist(pts, c, pts, a, dim);
  if (ab < 1e-9 || bc < 1e-9) return Infinity;
  const ux = pts[b] - pts[a], uy = pts[b + 1] - pts[a + 1], uz = dim === 3 ? pts[b + 2] - pts[a + 2] : 0;
  const vx = pts[c] - pts[a], vy = pts[c + 1] - pts[a + 1], vz = dim === 3 ? pts[c + 2] - pts[a + 2] : 0;
  const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
  const cross = Math.sqrt(cx * cx + cy * cy + cz * cz);
  return cross < 1e-12 ? Infinity : (ab * bc * ca) / (2 * cross);
}

/**
 * Spread every corner tighter than rMin (circumradius of each interior vertex with its neighbours) by relaxing that vertex
 * toward its neighbours' midpoint, pass after pass, until none is left or maxPass runs out. Endpoints stay fixed.
 * Edits pts in place and returns the smallest radius left (Infinity with fewer than three points).
 */
export function minRadius(pts: Float32Array, count: number, dim: Dim, rMin: number, maxPass = 400): number {
  let low = Infinity;
  for (let pass = 0; pass <= maxPass; pass++) {
    low = Infinity;
    let bad = false;
    for (let i = 1; i < count - 1; i++) {
      const a = (i - 1) * dim, b = i * dim, c = (i + 1) * dim;
      const r = circumradius(pts, a, b, c, dim);
      if (r >= rMin) { if (r < low) low = r; continue; }
      if (pass === maxPass) { if (r < low) low = r; continue; }
      bad = true;
      for (let k = 0; k < dim; k++) pts[b + k] += ((pts[a + k] + pts[c + k]) * 0.5 - pts[b + k]) * 0.5;
      const r2 = circumradius(pts, a, b, c, dim);
      if (r2 < low) low = r2;
    }
    if (!bad) break;
  }
  return low;
}

/** True when (px, py) is inside the closed polyline (even-odd) or within tol px of any edge, the closing edge included. */
export function pointInPolygon(p: PointSeq, px: number, py: number, tol = LASSO_NEAR_PX): boolean {
  const n = p.count;
  if (n === 0) return false;
  let inside = false, near = Infinity;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = p.x(i), yi = p.y(i), xj = p.x(j), yj = p.y(j);
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
    const ex = xj - xi, ey = yj - yi, l2 = ex * ex + ey * ey;
    const f = l2 > 1e-12 ? clamp01(((px - xi) * ex + (py - yi) * ey) / l2) : 0;
    near = Math.min(near, Math.hypot(px - xi - ex * f, py - yi - ey * f));
  }
  return inside || near <= tol;
}
