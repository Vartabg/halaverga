import type { Vec3 } from './combat';
/** Spherical launch blending: even a 180-degree chain keeps its speed and follows a stable arc instead of flipping at zero. */
export function strikeArc(out: Vec3, from: Vec3, to: Vec3, blend: number, speed: number) {
  if (Math.hypot(from.x, from.y, from.z) < .5) { out.x = to.x * speed; out.y = to.y * speed; out.z = to.z * speed; return; }
  const dot = Math.max(-1, Math.min(1, from.x * to.x + from.y * to.y + from.z * to.z));
  let x = to.x - from.x * dot, y = to.y - from.y * dot, z = to.z - from.z * dot, n = Math.hypot(x, y, z);
  if (n < 1e-6) { x = -from.z; y = 0; z = from.x; n = Math.hypot(x, z); if (n < 1e-6) { x = 1; n = 1; } }
  const angle = Math.acos(dot) * blend, c = Math.cos(angle) * speed, s = Math.sin(angle) / n * speed;
  out.x = from.x * c + x * s; out.y = from.y * c + y * s; out.z = from.z * c + z * s;
}
