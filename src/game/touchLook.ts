// Right-thumb look (landing-safe). 1:1 relative drag, no smoothing, no slop, no inertia: the view turns exactly as far as the finger
// moves. It goes through runtime.look(), so CameraRig stays the only camera writer and aim-assist friction and the ADS gain still apply.
import { look, runtime } from './runtime';
import { useGame } from './store';
/**
 * radPerPx: yaw per pixel at gain 1 (0.298 deg/px, a design choice, not a published number). Pitch runs at 0.8x.
 * Optional acceleration: v in px/ms, gain rises from 1 at 0.4 px/ms to 1.5 at 1.6 px/ms.
 */
export const TOUCH_LOOK = { radPerPx: .0052, pitchRatio: .8, accelLow: .4, accelSpan: 1.2, accelMax: .5 } as const;
/** look() turns 0.003 rad per unit; this rescales a pixel so one pixel is radPerPx at every setting of 1. */
const BASE = TOUCH_LOOK.radPerPx / .003;
export function touchLookGain(p: { touchLook: number; touchAim: number; lookAccel: boolean }, v: number, aimBlend: number): number {
  const t = Math.max(0, Math.min(1, (v - TOUCH_LOOK.accelLow) / TOUCH_LOOK.accelSpan));
  const accel = p.lookAccel ? 1 + TOUCH_LOOK.accelMax * (Number.isFinite(t) ? t : 0) : 1;
  return BASE * p.touchLook * (1 + (p.touchAim - 1) * aimBlend) * accel;
}
/** One look drag of (dx, dy) px at speed v px/ms. Adds the turn actually applied (|dyaw| + |dpitch|, rad) to runtime.stick.lookTravel. */
export function touchLook(dx: number, dy: number, v: number): void {
  const g = useGame.getState(), G = touchLookGain(g, v, runtime.shooter.aim.blend);
  const yaw = runtime.yaw, pitch = runtime.pitch;
  look(dx * G, dy * G * TOUCH_LOOK.pitchRatio * (g.invertY ? -1 : 1));
  runtime.stick.lookTravel += Math.abs(runtime.yaw - yaw) + Math.abs(runtime.pitch - pitch);
}
