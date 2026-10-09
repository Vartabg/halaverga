// Carve (turn-360 spec 1.1b): during a fast view turn, travel follows the view instead of skidding. The velocity blend in motion.ts
// (1 - e^(-4 dt)) lags a steady turn of w rad/s by atan(w/4), 49 deg at 4.2 rad/s. Above 2 rad/s this rotates the horizontal
// velocity with the view (speed kept), fully from 3 rad/s, limited to CARVE.accel m/s^2 of sideways acceleration. Turns under
// 2 rad/s are left exactly as before. Player gates it on steering (thrust, surge or a live gesture), so a pure look flick while
// coasting keeps its drift. Module state only, no allocation.
import type { Vec } from './motion';
export const CARVE = { from: 2.0, full: 3.0, accel: 60, minSpeed: 2 } as const;
let lastYaw = NaN, lastEpoch = NaN;
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
export function carve(v: Vec, yaw: number, dt: number, on: boolean, epoch: number): void {
  if (!on || epoch !== lastEpoch || Number.isNaN(lastYaw) || !(dt > 0)) { lastYaw = yaw; lastEpoch = epoch; return; }
  const d = wrap(yaw - lastYaw); lastYaw = yaw;
  const u = Math.max(0, Math.min(1, (Math.abs(d) / dt - CARVE.from) / (CARVE.full - CARVE.from)));
  const c = u * u * (3 - 2 * u);
  if (c === 0) return;
  const vh = Math.hypot(v.x, v.z);
  if (vh < CARVE.minSpeed) return;
  const cap = CARVE.accel * dt / vh, r = Math.max(-cap, Math.min(cap, d * c));
  const cos = Math.cos(r), sin = Math.sin(r), x = v.x, z = v.z;
  v.x = x * cos + z * sin; v.z = -x * sin + z * cos;
}
/** Tests: forget the last yaw. */
export function resetCarve(): void { lastYaw = NaN; lastEpoch = NaN; }
