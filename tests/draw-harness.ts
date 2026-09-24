// Shared fixtures for the Draw the flight tests: a camera frame builder, the hero/camera pose and straight strokes.
import type { Vec } from '../src/game/motion';
import type { DrawPath } from '../src/game/gesture/drawPath';
import { createAimFrame } from '../src/game/gesture/screenRay';
import type { AimFrame } from '../src/game/gesture/types';

/** A camera frame at o looking along (yaw, pitch) in runtime convention (yaw 0 looks down -z), 800 x 600 px. */
export function frameAt(o: Vec, yaw = 0, pitch = 0, f: AimFrame = createAimFrame()): AimFrame {
  const cp = Math.cos(pitch);
  f.origin.x = o.x; f.origin.y = o.y; f.origin.z = o.z;
  f.dir.x = -Math.sin(yaw) * cp; f.dir.y = Math.sin(pitch); f.dir.z = -Math.cos(yaw) * cp;
  f.right.x = Math.cos(yaw); f.right.y = 0; f.right.z = -Math.sin(yaw);
  const r = f.right, d = f.dir;
  f.up.x = r.y * d.z - r.z * d.y; f.up.y = r.z * d.x - r.x * d.z; f.up.z = r.x * d.y - r.y * d.x;
  f.left = 0; f.top = 0; f.width = 800; f.height = 600; f.aspect = 800 / 600; f.t = 1;
  return f;
}
export const HERO: Vec = { x: 0, y: 21, z: 62 }, CAM: Vec = { x: 0, y: 22.5, z: 70 };
/** A straight stroke from (x0, y0) to (x1, y1), n + 1 samples 1/60 s apart from t0 ms. */
export function line(p: DrawPath, f: AimFrame, x0: number, y0: number, x1: number, y1: number, n: number, t0 = 0) {
  for (let i = 0; i <= n; i++) p.append(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n, t0 + i * 1000 / 60, f);
}
