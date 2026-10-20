import type { Vec3 } from './combat';
/** Steer the requested view during an assisted launch; CameraRig remains the only camera writer. */
export function strikeLook(view: { yaw: number; pitch: number }, from: Vec3, to: Vec3, dt: number) {
  const x = to.x - from.x, y = to.y - from.y, z = to.z - from.z;
  const yaw = Math.atan2(-x, -z), pitch = Math.max(-1.1, Math.min(1.1, Math.atan2(y, Math.hypot(x, z))));
  const angle = Math.atan2(Math.sin(yaw - view.yaw), Math.cos(yaw - view.yaw));
  const blend = 1 - Math.exp(-7 * Math.max(0, dt));
  view.yaw += Math.max(-4 * dt, Math.min(4 * dt, angle * blend));
  view.pitch += Math.max(-2 * dt, Math.min(2 * dt, (pitch - view.pitch) * blend));
}
