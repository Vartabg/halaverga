// Screen <-> world through the published camera frame (runtime.shooter.aim + the cached canvas rect), and the drone screen
// history GestureTrack writes each frame. Pure and allocation-free per call: no three.js, no DOM. Screen units are CSS px in
// client coordinates (the rect's left/top included), time is performance.now ms.
import type { DroneTarget } from '../combat';
import type { Vec } from '../motion';
import { TRACK_DRONES, TRACK_FRAMES } from './tuning';
import type { AimFrame } from './types';

export type ScreenPoint = { x: number; y: number };
export type ScreenRect = { left: number; top: number; width: number; height: number };
type AimLike = { origin: Vec; dir: Vec; right: Vec; up: Vec; fov: number };
const DEG = Math.PI / 180;
const cp = (o: Vec, a: Vec) => { o.x = a.x; o.y = a.y; o.z = a.z; };

export function createAimFrame(): AimFrame {
  return { origin: { x: 0, y: 0, z: 0 }, dir: { x: 0, y: 0, z: -1 }, right: { x: 1, y: 0, z: 0 }, up: { x: 0, y: 1, z: 0 },
    fov: 65, aspect: 1, left: 0, top: 0, width: 1, height: 1, t: 0 };
}
/** The frame the lab's taps, pick and ink project through: GestureTrack refreshes it each frame (latest aim + canvas rect). */
export const labAimFrame = createAimFrame();
/** Copies the published aim (vertical fov in degrees) and the canvas rect into out; aspect = width / height. */
export function aimFrameFrom(aim: AimLike, rect: ScreenRect, t: number, out: AimFrame): AimFrame {
  cp(out.origin, aim.origin); cp(out.dir, aim.dir); cp(out.right, aim.right); cp(out.up, aim.up);
  out.fov = aim.fov; out.left = rect.left; out.top = rect.top;
  out.width = rect.width > 0 ? rect.width : 1; out.height = rect.height > 0 ? rect.height : 1;
  out.aspect = out.width / out.height; out.t = t;
  return out;
}
const tanHalf = (f: AimFrame) => Math.tan(f.fov * DEG / 2);

/** World point -> screen px. Returns false (out untouched) when the point is at or behind the camera plane. */
export function project(f: AimFrame, p: Vec, out: ScreenPoint): boolean {
  const x = p.x - f.origin.x, y = p.y - f.origin.y, z = p.z - f.origin.z;
  const depth = x * f.dir.x + y * f.dir.y + z * f.dir.z;
  if (!(depth > 1e-6)) return false;
  const th = tanHalf(f);
  const nx = (x * f.right.x + y * f.right.y + z * f.right.z) / (depth * th * f.aspect);
  const ny = (x * f.up.x + y * f.up.y + z * f.up.z) / (depth * th);
  out.x = f.left + (nx + 1) / 2 * f.width; out.y = f.top + (1 - ny) / 2 * f.height;
  return true;
}
/** Screen px -> the unit direction of the camera ray through it (the tap ray). */
export function unproject(f: AimFrame, px: number, py: number, out: Vec): Vec {
  const th = tanHalf(f), nx = ((px - f.left) / f.width * 2 - 1) * th * f.aspect, ny = (1 - (py - f.top) / f.height * 2) * th;
  const x = f.dir.x + f.right.x * nx + f.up.x * ny, y = f.dir.y + f.right.y * nx + f.up.y * ny, z = f.dir.z + f.right.z * nx + f.up.z * ny;
  const l = Math.hypot(x, y, z) || 1;
  out.x = x / l; out.y = y / l; out.z = z / l;
  return out;
}
/** The world point on the ray through (px, py) at view depth `depth` m (measured along f.dir, as Draw's d_i). */
export function pointAt(f: AimFrame, px: number, py: number, depth: number, out: Vec): Vec {
  unproject(f, px, py, out);
  const k = depth / Math.max(1e-6, out.x * f.dir.x + out.y * f.dir.y + out.z * f.dir.z);
  out.x = f.origin.x + out.x * k; out.y = f.origin.y + out.y * k; out.z = f.origin.z + out.z * k;
  return out;
}
/** Screen radius in px of an angular radius (rad) seen at the view centre. */
export const angularRadiusPx = (f: AimFrame, rad: number) => Math.tan(Math.min(rad, 1.5)) / tanHalf(f) * f.height / 2;
/** Projected silhouette radius (px) of a sphere of radius r at c (by distance, as seen at the view centre); the full height inside it. */
export function sphereRadiusPx(f: AimFrame, c: Vec, r: number): number {
  const d = Math.hypot(c.x - f.origin.x, c.y - f.origin.y, c.z - f.origin.z);
  return d <= r ? f.height : angularRadiusPx(f, Math.asin(r / d));
}

/**
 * Screen history of up to TRACK_DRONES drones over the last TRACK_FRAMES frames (about 1 s): slot k * TRACK_DRONES + i holds
 * drone i at frame k. ok is 1 when the drone was alive, in line of sight and in front of the camera on that frame.
 */
export type DroneTrack = {
  x: Float32Array; y: Float32Array; r: Float32Array; ok: Uint8Array; t: Float64Array; head: number; frames: number;
};
export function createDroneTrack(): DroneTrack {
  const n = TRACK_FRAMES * TRACK_DRONES;
  return { x: new Float32Array(n), y: new Float32Array(n), r: new Float32Array(n), ok: new Uint8Array(n),
    t: new Float64Array(TRACK_FRAMES), head: -1, frames: 0 };
}
/** The one track the lab reads (GestureTrack writes it; tapBlast and the lasso default to it). */
export const droneTrack = createDroneTrack();
export function resetTrack(tr: DroneTrack = droneTrack) { tr.head = -1; tr.frames = 0; tr.ok.fill(0); }

const scratch: ScreenPoint = { x: 0, y: 0 };
/** Appends one frame at time t: each target's screen centre and silhouette radius through f. */
export function recordTrack(tr: DroneTrack, f: AimFrame, targets: readonly DroneTarget[], count: number, t: number) {
  const head = (tr.head + 1) % TRACK_FRAMES, base = head * TRACK_DRONES, n = Math.min(count, TRACK_DRONES, targets.length);
  tr.head = head; tr.frames = Math.min(TRACK_FRAMES, tr.frames + 1); tr.t[head] = t;
  for (let i = 0; i < TRACK_DRONES; i++) {
    const k = base + i, g = i < n ? targets[i] : null;
    if (g && g.alive && g.los && project(f, g.c, scratch)) {
      tr.x[k] = scratch.x; tr.y[k] = scratch.y; tr.r[k] = sphereRadiusPx(f, g.c, g.r); tr.ok[k] = 1;
    } else tr.ok[k] = 0;
  }
}
/** Output of trackAt: screen centre and silhouette radius, px. */
export type TrackSample = { x: number; y: number; r: number };
/**
 * Drone i's screen position at time t, linearly interpolated between the two recorded frames around t (clamped to the newest
 * and oldest frames). False when nothing is recorded or the drone was not visible on a frame it needs.
 */
export function trackAt(tr: DroneTrack, i: number, t: number, out: TrackSample): boolean {
  if (tr.frames === 0 || i < 0 || i >= TRACK_DRONES) return false;
  let newer = tr.head;
  for (let n = 0; n < tr.frames; n++) {
    const k = (tr.head - n + TRACK_FRAMES) % TRACK_FRAMES;
    if (tr.t[k] <= t) {
      const a = k * TRACK_DRONES + i, b = newer * TRACK_DRONES + i;
      if (k === newer || !tr.ok[a] || !tr.ok[b]) {
        const c = tr.ok[a] ? a : k !== newer && tr.ok[b] ? b : -1;
        if (c < 0) return false;
        out.x = tr.x[c]; out.y = tr.y[c]; out.r = tr.r[c]; return true;
      }
      const span = tr.t[newer] - tr.t[k], u = span > 0 ? (t - tr.t[k]) / span : 1;
      out.x = tr.x[a] + (tr.x[b] - tr.x[a]) * u; out.y = tr.y[a] + (tr.y[b] - tr.y[a]) * u; out.r = tr.r[a] + (tr.r[b] - tr.r[a]) * u;
      return true;
    }
    newer = k;
  }
  const a = newer * TRACK_DRONES + i;   // t is older than the oldest frame: use the oldest
  if (!tr.ok[a]) return false;
  out.x = tr.x[a]; out.y = tr.y[a]; out.r = tr.r[a]; return true;
}
