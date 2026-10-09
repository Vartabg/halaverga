// Where the chest turns during a Gesture Lab aimed burst (spec 3.6): toward the tapped drone itself, seen from the hero's head, not
// along the camera ray. The camera sits right of and behind the hero, so a near drone 45 deg off-centre on screen is more than 45
// deg off the hero's heading; aiming the chest at the drone keeps the arm cannon inside its reach. Pure and landing-safe.
import type { ShooterState } from '../combat';
import type { Vec } from '../motion';
import { angleDelta } from '../presentation';
import { aimed } from './aimedShot';
import { gesture, type GestureFacing } from './bus';

/** Metres along the tap ray a miss shot's chest turn aims at. */
export const MISS_REACH = 30;
export type AimFacing = { yaw: number; pitch: number };

/** Yaw and pitch of the aimed target from `head`, relative to the view (0, 0 while no aimed burst runs). Writes and returns out. */
export function aimFacing(s: Pick<ShooterState, 'aim' | 'targets'>, head: Vec, viewYaw: number, viewPitch: number, out: AimFacing): AimFacing {
  out.yaw = 0; out.pitch = 0;
  if (!aimed.active) return out;
  const d = aimed.drone, g = d >= 0 && d < s.targets.length && s.targets[d].alive ? s.targets[d].c : null, o = s.aim.origin, r = aimed.dir;
  const x = (g ? g.x : o.x + r.x * MISS_REACH) - head.x, y = (g ? g.y : o.y + r.y * MISS_REACH) - head.y, z = (g ? g.z : o.z + r.z * MISS_REACH) - head.z;
  const h = Math.hypot(x, z);
  if (!(h > 1e-6)) return out;
  out.yaw = angleDelta(viewYaw, Math.atan2(-x, -z));
  out.pitch = Math.atan2(y, h) - viewPitch;
  return out;
}

/**
 * The facing bounds FlightPresentation hands the pose: 2 (FACING_AIM) while an aimed burst runs, whatever the scheme's step wrote
 * to gesture.facing that frame (Brush writes 0 and Draw's follower 1 on every step, after aimedShot set 2); otherwise the scheme's
 * own facing; 0 outside the lab.
 */
export const labFacing = (): GestureFacing => (gesture.scheme === 'off' ? 0 : aimed.active ? 2 : gesture.facing);
