// Blade contact (docs/plans/2026-11-16-real-fight.md A1). A cut lands when the sword can reach the body, not when the angel is
// near the demon's centre: each demon is a vertical capsule around its centre, and the angel's chest sweeps a segment every step
// (relative to the demon, which may be flying too), so a fast dive cannot skip a body between frames. Decided in the game step from
// plain values; nothing is read back from the render layer. Pure: plain {x,y,z}, no allocation per frame.
import type { Vec3 } from './combat';
import { isElite } from './encounter';

/** Body capsules (m) from watcher.glb's rest bounds in the game rig (tests/blade-reach.test.ts re-measures them): `radius` about
 * the vertical axis, `half` the half-length of the axis, so the capsule spans half + radius above and below its middle, which sits
 * `y` from the demon's centre (the pelvis: the 2 m body's long legs put its middle .1 m below it). Wardens are drawn from the same
 * model at the same size, so the two kinds measure the same. */
export const BODY = { lesser: { radius: .35, half: .67, y: -.1 }, warden: { radius: .35, half: .67, y: -.1 } } as const;
/** From archangel.glb: `chest`, the chest bone above the angel's centre at rest; `reach`, chest to sword tip at a cut's impact
 * (cutClips.ts), arm plus the 1.22 m blade: the least of the three cuts (cross 1.78, rising 1.37, casting 1.73 m, 2026-11-17). */
export const BLADE = { reach: 1.37, chest: .4 } as const;
export const bodyOf = (i: number) => isElite(i) ? BODY.warden : BODY.lesser;
/** How near demon i's capsule axis the angel's chest must come for the blade to land. Replaces the old flat STRIKE.contact. */
export const contactAt = (i: number) => BLADE.reach + bodyOf(i).radius;

const clamp = (v: number) => v < 0 ? 0 : v > 1 ? 1 : v;
/**
 * Closest distance between segment a-b and the vertical axis segment from (0, -h, 0) to (0, h, 0) (Ericson, Real-Time Collision
 * Detection 5.1.9, with the second segment fixed).
 */
export function axisGap(ax: number, ay: number, az: number, bx: number, by: number, bz: number, h: number) {
  const dx = bx - ax, dy = by - ay, dz = bz - az, rx = ax, ry = ay + h, rz = az, e = 4 * h * h, f = 2 * h * ry;
  const a = dx * dx + dy * dy + dz * dz;
  let s = 0, t = 0;
  if (a <= 1e-12) t = e > 1e-12 ? clamp(f / e) : 0;
  else {
    const c = dx * rx + dy * ry + dz * rz;
    if (e <= 1e-12) s = clamp(-c / a);
    else {
      const b = 2 * h * dy, denom = a * e - b * b;
      s = denom > 1e-12 ? clamp((b * f - c * e) / denom) : 0;
      t = (b * s + f) / e;
      if (t < 0) { t = 0; s = clamp(-c / a); } else if (t > 1) { t = 1; s = clamp((b - c) / a); }
    }
  }
  return Math.hypot(ax + dx * s, ay + dy * s - (-h + 2 * h * t), az + dz * s);
}

/** Where the last check left the chest, relative to the middle of the demon's capsule, and the strike it belongs to (strike.serial). */
const path = { x: 0, y: 0, z: 0, serial: -1 };
/**
 * True when the angel's chest path since the last check of this strike comes within contactAt(i) of demon i's axis (centre c).
 * The first check of a strike tests the chest where it is. Called once per game step while a strike dives or steps in.
 */
export function bladeReaches(i: number, c: Vec3, player: Vec3, serial: number) {
  const body = bodyOf(i), x = player.x - c.x, y = player.y + BLADE.chest - c.y - body.y, z = player.z - c.z, fresh = path.serial !== serial;
  const gap = axisGap(fresh ? x : path.x, fresh ? y : path.y, fresh ? z : path.z, x, y, z, body.half);
  path.x = x; path.y = y; path.z = z; path.serial = serial;
  return gap <= contactAt(i);
}
