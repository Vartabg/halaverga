// Right-thumb look (landing-safe). Relative drag, no smoothing, no slop, no inertia. Slow drags turn exactly radPerPx per pixel;
// fast swipes turn further (velocity gain, on by default, off under reduced motion). It goes through runtime.look(), so CameraRig
// stays the only camera writer and aim-assist friction and the ADS gain still apply.
import { look, runtime } from './runtime';
import { useGame } from './store';
/**
 * radPerPx: yaw per pixel at gain 1 (0.298 deg/px, a design choice, not a published number). Pitch runs at 0.8x.
 * Look acceleration (turn-360 spec 1.2a): v in px/ms. Below accelLow the gain is exactly 1 (fine aim unchanged); it eases up to
 * `gain` at accelLow + accelSpan (1.6 px/ms). Pitch gets 40% of the extra, so a fast horizontal swipe does not flip the view.
 * Narrow screens (review 2026-09-25): a portrait thumb has far less room to swipe, so the yaw EXTRA (never the fine-aim gain of 1)
 * scales by refWidth / width, at most widthMax: 1x at 700 px and wider, 1.78x on a 393 px portrait phone. Pitch ignores it.
 */
export const TOUCH_LOOK = { radPerPx: .0052, pitchRatio: .8, accelLow: .35, accelSpan: 1.25, gain: 2.75, refWidth: 700, widthMax: 1.8 } as const;
/** look() turns 0.003 rad per unit; this rescales a pixel so one pixel is radPerPx at every setting of 1. */
const BASE = TOUCH_LOOK.radPerPx / .003;
/** The yaw extra's width factor for a touch surface w px wide: 1 when unknown (NaN) or at least refWidth wide. */
export const lookWidthScale = (w: number) => (w > 0 ? Math.min(TOUCH_LOOK.widthMax, Math.max(1, TOUCH_LOOK.refWidth / w)) : 1);
/** Yaw acceleration g(v): 1 when off (or under reduced motion); a non-finite speed counts as 0. w: the surface width, px. */
export function lookAccelGain(on: boolean, v: number, w = NaN): number {
  if (!on) return 1;
  const t = Math.max(0, Math.min(1, ((Number.isFinite(v) ? v : 0) - TOUCH_LOOK.accelLow) / TOUCH_LOOK.accelSpan));
  return 1 + (TOUCH_LOOK.gain - 1) * lookWidthScale(w) * t * t * (3 - 2 * t);
}
type LookPrefs = { touchLook: number; touchAim: number; lookAccel: boolean; reduced: boolean };
/** Sensitivity and ADS blend only (no acceleration). */
const baseGain = (p: LookPrefs, aimBlend: number) => BASE * p.touchLook * (1 + (p.touchAim - 1) * aimBlend);
/** The yaw gain for one drag at speed v px/ms on a surface w px wide (reduced motion forces the acceleration off). */
export function touchLookGain(p: LookPrefs, v: number, aimBlend: number, w = NaN): number {
  return baseGain(p, aimBlend) * lookAccelGain(p.lookAccel && !p.reduced, v, w);
}
/**
 * One look drag of (dx, dy) px at speed v px/ms on a touch surface w px wide (NaN: no width scaling). Adds the turn actually
 * applied (|dyaw| + |dpitch|, rad) to runtime.stick.lookTravel.
 */
export function touchLook(dx: number, dy: number, v: number, w = NaN): void {
  const g = useGame.getState(), base = baseGain(g, runtime.shooter.aim.blend), on = g.lookAccel && !g.reduced;
  const a = lookAccelGain(on, v, w), p = lookAccelGain(on, v);
  const yaw = runtime.yaw, pitch = runtime.pitch;
  look(dx * base * a, dy * base * (1 + (p - 1) * .4) * TOUCH_LOOK.pitchRatio * (g.invertY ? -1 : 1));
  runtime.stick.lookTravel += Math.abs(runtime.yaw - yaw) + Math.abs(runtime.pitch - pitch);
}
