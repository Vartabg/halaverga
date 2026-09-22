// Pure shot geometry (landing-safe): plain {x,y,z}, no allocation after module load.
import { WATER_LEVEL, type DroneTarget, type Vec3 } from './combat';
export type Span = { enter: number; exit: number };
export type DroneHit = { index: number; t: number; weak: boolean };

/** o + d * max(0, (head - o)·d): starts the camera ray level with the hero, so props between camera and hero are skipped. */
export function projectedStart(o: Vec3, d: Vec3, head: Vec3, out: Vec3): Vec3 {
  const t = Math.max(0, (head.x - o.x) * d.x + (head.y - o.y) * d.y + (head.z - o.z) * d.z);
  out.x = o.x + d.x * t; out.y = o.y + d.y * t; out.z = o.z + d.z * t; return out;
}
/** Entry and exit distances along a unit ray; enter clamps to 0 when the origin is inside. False on a miss or behind. */
export function raySphereSpan(o: Vec3, d: Vec3, c: Vec3, r: number, out: Span): boolean {
  const x = c.x - o.x, y = c.y - o.y, z = c.z - o.z, b = x * d.x + y * d.y + z * d.z, disc = b * b - (x * x + y * y + z * z - r * r);
  if (disc < 0) return false;
  const s = Math.sqrt(disc), exit = b + s;
  if (exit <= 0) return false;
  out.enter = Math.max(0, b - s); out.exit = exit; return true;
}
const span: Span = { enter: 0, exit: 0 }, body: Span = { enter: 0, exit: 0 }, eye: Span = { enter: 0, exit: 0 };
export const raySphere = (o: Vec3, d: Vec3, c: Vec3, r: number) => raySphereSpan(o, d, c, r, span) ? span.enter : Infinity;
export const rayWater = (o: Vec3, d: Vec3, level = WATER_LEVEL) => d.y < -1e-6 && o.y > level ? (level - o.y) / d.y : Infinity;

/** Centre-weighted sample (radius rng()^1.5 * half) inside the cone of half-angle `half` around unit `dir`. */
export function coneSample(dir: Vec3, half: number, rng: () => number, out: Vec3): Vec3 {
  if (!(half > 0)) { out.x = dir.x; out.y = dir.y; out.z = dir.z; return out; }
  const ax = Math.abs(dir.x), ay = Math.abs(dir.y), az = Math.abs(dir.z);
  // u = normalize(dir x h), h = the world axis least aligned with dir; v = dir x u.
  let ux: number, uy: number, uz: number;
  if (ax <= ay && ax <= az) { ux = 0; uy = dir.z; uz = -dir.y; }
  else if (ay <= az) { ux = -dir.z; uy = 0; uz = dir.x; }
  else { ux = dir.y; uy = -dir.x; uz = 0; }
  const ul = Math.hypot(ux, uy, uz); ux /= ul; uy /= ul; uz /= ul;
  const vx = dir.y * uz - dir.z * uy, vy = dir.z * ux - dir.x * uz, vz = dir.x * uy - dir.y * ux;
  const angle = Math.pow(rng(), 1.5) * half, phi = 2 * Math.PI * rng(), ca = Math.cos(angle), sa = Math.sin(angle);
  const cp = Math.cos(phi) * sa, sp = Math.sin(phi) * sa;
  const x = dir.x * ca + ux * cp + vx * sp, y = dir.y * ca + uy * cp + vy * sp, z = dir.z * ca + uz * cp + vz * sp, l = Math.hypot(x, y, z);
  out.x = x / l; out.y = y / l; out.z = z / l; return out;
}
/** Angle (rad) between unit d and the direction from o to p. */
export function angleTo(o: Vec3, d: Vec3, p: Vec3): number {
  const x = p.x - o.x, y = p.y - o.y, z = p.z - o.z, l = Math.hypot(x, y, z);
  return l === 0 ? 0 : Math.acos(Math.min(1, Math.max(-1, (x * d.x + y * d.y + z * d.z) / l)));
}
export const angularRadius = (r: number, dist: number) => dist <= r ? Math.PI / 2 : Math.asin(r / dist);

/**
 * Nearest alive drone whose body sphere, or front-facing eye sphere, the ray enters before maxT. The eye wins (t = eye entry)
 * whenever the ray enters it before leaving the body and the eye faces the shooter: it protrudes only .14 m, so nearest-t alone
 * would score body hits. A ray that clips only the protruding eye rim (outside the body) is also a weak hit.
 */
export function hitDrones(o: Vec3, d: Vec3, targets: readonly DroneTarget[], count: number, maxT: number, out: DroneHit): boolean {
  let best = -1, bestEnter = maxT, bestT = 0, bestWeak = false;
  for (let i = 0; i < count; i++) {
    const g = targets[i];
    if (!g.alive) continue;
    const front = (g.eye.x - g.c.x) * d.x + (g.eye.y - g.c.y) * d.y + (g.eye.z - g.c.z) * d.z < 0;
    if (raySphereSpan(o, d, g.c, g.r, body)) {
      if (body.enter >= bestEnter) continue;
      const weak = front && raySphereSpan(o, d, g.eye, g.eyeR, eye) && eye.enter < body.exit && eye.enter < maxT;
      best = i; bestEnter = body.enter; bestWeak = weak; bestT = weak ? eye.enter : body.enter;
    } else if (front && raySphereSpan(o, d, g.eye, g.eyeR, eye) && eye.enter < bestEnter) {
      best = i; bestEnter = eye.enter; bestWeak = true; bestT = eye.enter;
    }
  }
  if (best < 0) return false;
  out.index = best; out.t = bestT; out.weak = bestWeak; return true;
}
