import { AXIS_ORIGIN, BARREL_AXIS, STATION, type V3 } from './cannonContract';
/**
 * Pure skin-weight rules for the blaster-on suit (no three import). All positions are bind world space (metres, three.js axes);
 * skin arrays are flat, 4 slots per vertex, written in place so each vertex keeps its original slots and influence set.
 * R1 hand: hand_r vertices go rigid inside the cannon (anatomy past STATION.collapse to hand_r, which collapses to its head;
 *   everything else to forearm_r). R2 legs: a vertex with right-arm and leg weight drops the leg weight. R3 armpit/sleeve:
 *   inside the region, the arm share a/(a+t) is relaxed to the harmonic interpolant of its welded neighbours (SOR), and the arm
 *   and trunk joints are rescaled to it, keeping each group's internal proportions. The seam ring: pure-arm vertices next to the
 *   region are solved too and gain one trunk slot (the neighbours' main trunk joint) on write-back.
 */
export type Joints = { hand: number; forearm: number; arm: readonly number[]; trunk: readonly number[];
  rightArm: readonly number[]; legs: readonly number[] };
/** Indices into the suit skeleton (src/world/suitSkeleton.ts BONE_NAMES). */
export const SUIT_JOINTS: Joints = { hand: 16, forearm: 7, arm: [3, 7], trunk: [0, 10, 11, 14], rightArm: [14, 3, 7, 16],
  legs: [4, 5, 8, 9, 17, 18, 19, 20] };
/** R3 region radius about the upperarm_r bind head (m), SOR relaxation factor, tolerance and iteration cap. */
export const REGION_RADIUS = .45, OMEGA = 1.8, TOLERANCE = 1e-5, MAX_ITERATIONS = 400;
/** Rings of pure-arm nodes around the region that are freed as well (they gain a trunk slot). */
export const RING_DEPTH = 1;
const slotFree = (sw: Num, v: number) => sw[v * 4] === 0 || sw[v * 4 + 1] === 0 || sw[v * 4 + 2] === 0 || sw[v * 4 + 3] === 0;
export type Kind = 'anatomy' | 'undersuit' | 'other';
type Num = { [i: number]: number; readonly length: number };
/** Station along the barrel axis of a bind world point, given the forearm_r bind head. */
export function station(x: number, y: number, z: number, forearm: V3) {
  return (x - forearm.x - AXIS_ORIGIN.x) * BARREL_AXIS.x + (y - forearm.y - AXIS_ORIGIN.y) * BARREL_AXIS.y
    + (z - forearm.z - AXIS_ORIGIN.z) * BARREL_AXIS.z;
}
/** Weight of joint group `g` on vertex `v`. */
export function share(si: Num, sw: Num, v: number, g: readonly number[]) {
  let s = 0;
  for (let c = 0; c < 4; c++) if (g.includes(si[v * 4 + c])) s += sw[v * 4 + c];
  return s;
}
/** The R3 region: right side, near the shoulder, carrying both arm and trunk weight, and no hand weight. */
export function inBlasterRegion(kind: Kind, x: number, dist: number, arm: number, trunk: number, hand: number, radius = REGION_RADIUS) {
  return kind !== 'other' && x > 0 && dist <= radius && arm > 0 && trunk > 0 && hand === 0;
}
export type RuleCounts = { hand: number; legs: number };
/** R1 and R2 on one mesh, in place on `si`/`sw` (copies of the originals). */
export function blasterWeights(kind: Kind, pos: Num, si: Num, sw: Num, forearm: V3, j: Joints = SUIT_JOINTS): RuleCounts {
  const n = pos.length / 3, out = { hand: 0, legs: 0 }, one = [j.hand];
  for (let v = 0; v < n; v++) {
    const o = v * 4;
    if (share(si, sw, v, one) > 0) {
      const to = kind === 'anatomy' && station(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2], forearm) >= STATION.collapse ? j.hand : j.forearm;
      for (let c = 0; c < 4; c++) { si[o + c] = to; sw[o + c] = c === 0 ? 1 : 0; }
      out.hand++; continue;
    }
    const legs = share(si, sw, v, j.legs);
    if (legs <= 0 || share(si, sw, v, j.rightArm) <= 0) continue;
    const keep = 1 - legs;
    for (let c = 0; c < 4; c++) sw[o + c] = j.legs.includes(si[o + c]) ? 0 : sw[o + c] / keep;
    out.legs++;
  }
  return out;
}
/** Position weld: vertex -> representative (the lowest index at the same position rounded to 1e-5 m). */
export function weld(pos: Num) {
  const n = pos.length / 3, rep = new Int32Array(n), seen = new Map<string, number>();
  for (let v = 0; v < n; v++) {
    const k = `${Math.round(pos[v * 3] * 1e5)},${Math.round(pos[v * 3 + 1] * 1e5)},${Math.round(pos[v * 3 + 2] * 1e5)}`;
    const r = seen.get(k);
    if (r === undefined) { seen.set(k, v); rep[v] = v; } else rep[v] = r;
  }
  return rep;
}
export type Relaxed = { free: number; iterations: number; residual: number };
/**
 * R3 on one mesh, in place on `si`/`sw` (after R1/R2). `free[v]` marks region vertices (see inBlasterRegion); every other vertex
 * with arm + trunk weight is a fixed boundary at its own share. Solved on welded nodes in index order, so it is deterministic and
 * welded duplicates end with identical fractions.
 */
export function relaxArmShare(pos: Num, index: Num | null, si: Num, sw: Num, free: Uint8Array, j: Joints = SUIT_JOINTS,
  omega = OMEGA, tol = TOLERANCE, cap = MAX_ITERATIONS): Relaxed {
  const n = pos.length / 3, rep = weld(pos), frac = new Float64Array(n).fill(NaN), isFree = new Uint8Array(n);
  let freeCount = 0;
  for (let v = 0; v < n; v++) {
    const a = share(si, sw, v, j.arm), t = share(si, sw, v, j.trunk);
    if (a + t > 0 && frac[rep[v]] !== frac[rep[v]]) frac[rep[v]] = a / (a + t);
    if (free[v]) isFree[rep[v]] = 1;
  }
  // The seam ring: pure-arm nodes (no trunk slot) next to the region are freed too, gaining a trunk slot on write-back. Held at
  // arm share 1 they stood as a 17 mm ridge on top of the raised upper arm (the front armpit fold) once their neighbours relaxed.
  const ring = new Int16Array(n).fill(-1), tw = new Float64Array(j.trunk.length), tris0 = index ? index.length : n;
  for (let r = 0; r < RING_DEPTH; r++) {
    const add: number[] = [];
    for (let t = 0; t + 2 < tris0; t += 3) for (let e = 0; e < 3; e++) {
      const a = index ? index[t + e] : t + e, b = index ? index[t + (e + 1) % 3] : t + (e + 1) % 3, rb = rep[b];
      if (!isFree[rep[a]] || isFree[rb] || pos[rb * 3] <= 0 || !(share(si, sw, rb, j.arm) > 0) || share(si, sw, rb, j.trunk) > 0
        || share(si, sw, rb, [j.hand]) > 0 || !slotFree(sw, rb)) continue;
      tw.fill(0); for (let c = 0; c < 4; c++) { const q = j.trunk.indexOf(si[a * 4 + c]); if (q >= 0) tw[q] += sw[a * 4 + c]; }
      let best = -1; for (let q = 0; q < tw.length; q++) if (tw[q] > 0 && (best < 0 || tw[q] > tw[best])) best = q;
      if (best >= 0 && ring[rb] < 0) { ring[rb] = j.trunk[best]; add.push(rb); }
    }
    for (const v of add) isFree[v] = 1;
  }
  for (let v = 0; v < n; v++) if (isFree[v]) freeCount++;
  // Neighbour lists (CSR) for free nodes only, deduplicated, over welded nodes.
  const lists = new Map<number, Set<number>>();
  const link = (a: number, b: number) => {
    const ra = rep[a], rb = rep[b];
    if (ra === rb || !isFree[ra]) return;
    let s = lists.get(ra); if (!s) lists.set(ra, s = new Set());
    s.add(rb);
  };
  const tris = index ? index.length : n;
  for (let t = 0; t + 2 < tris; t += 3) for (let e = 0; e < 3; e++) {
    const a = index ? index[t + e] : t + e, b = index ? index[t + (e + 1) % 3] : t + (e + 1) % 3;
    link(a, b); link(b, a);
  }
  const nodes = new Int32Array(freeCount), start = new Int32Array(freeCount + 1);
  let k = 0, m = 0;
  for (let v = 0; v < n; v++) if (isFree[v]) { nodes[k++] = v; m += lists.get(v)?.size ?? 0; }
  const nbr = new Int32Array(m);
  for (let i = 0, w = 0; i < freeCount; i++) {
    start[i] = w;
    for (const b of [...(lists.get(nodes[i]) ?? [])].sort((p, q) => p - q)) nbr[w++] = b;
    start[i + 1] = w;
  }
  let it = 0, residual = 0;
  for (; it < cap; it++) {
    residual = 0;
    for (let i = 0; i < freeCount; i++) {
      let s = 0, c = 0;
      for (let q = start[i]; q < start[i + 1]; q++) { const f = frac[nbr[q]]; if (f === f) { s += f; c++; } }
      if (!c) continue;
      const v = nodes[i], next = frac[v] + omega * (s / c - frac[v]), d = Math.abs(next - frac[v]);
      frac[v] = Math.min(1, Math.max(0, next));
      if (d > residual) residual = d;
    }
    if (residual < tol) { it++; break; }
  }
  for (let v = 0; v < n; v++) {
    if (!isFree[rep[v]]) continue;
    const a = share(si, sw, v, j.arm), t = share(si, sw, v, j.trunk), x = frac[rep[v]], total = a + t, joint = ring[rep[v]];
    if (a > 0 && t === 0 && joint >= 0) {
      let c = 0; while (c < 4 && sw[v * 4 + c] > 0) c++;
      if (c === 4) continue;
      for (let q = 0; q < 4; q++) if (j.arm.includes(si[v * 4 + q])) sw[v * 4 + q] *= x;
      si[v * 4 + c] = joint; sw[v * 4 + c] = (1 - x) * a; continue;
    }
    if (!(a > 0 && t > 0)) continue;
    for (let c = 0; c < 4; c++) {
      const jo = si[v * 4 + c];
      if (j.arm.includes(jo)) sw[v * 4 + c] *= x * total / a; else if (j.trunk.includes(jo)) sw[v * 4 + c] *= (1 - x) * total / t;
    }
  }
  return { free: freeCount, iterations: it, residual };
}
