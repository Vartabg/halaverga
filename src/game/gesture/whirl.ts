// Brush whirl (turn-360 spec 1.7c): a big loop or spiral in open sky spins the flyer around, 180 to 720 deg in half-turn steps.
// Pure and allocation-free: whirlAngle reads the stroke's running totals, and the program shape (a trapezoid yaw rate with a
// bank envelope) lives here so maneuvers.ts only samples it. Also the swipe length that counts as a full turn per screen width.
import type { StrokeView } from './types';

/**
 * A whirl needs this mean loop radius (px), this much signed winding (deg), and a curved path: straightness (chord / arc) at most
 * this. A half circle is 2/PI = 0.64, so a half loop counts; a flatter arc (under about 165 deg) does not.
 */
export const WHIRL_R_MIN = 85, WHIRL_ENTER_DEG = 150, WHIRL_STRAIGHT_MAX = 0.68;
/** Peak yaw rate the duration allows, rad/s, and under reduced motion (the lab cap there). */
export const WHIRL_PEAK = 6.5, WHIRL_PEAK_RM = 2.5;
/** Body bank at full envelope (rad), forward intent cut, and the gentle rise (vertical intent at mid-program). */
export const WHIRL_BANK = 0.9, WHIRL_SLOW = 0.3, WHIRL_RISE = 0.25;
/** Stacked same-direction swipes (maneuvers.extendTurn): the peak yaw rate they allow, rad/s, and under reduced motion. */
export const STACK_PEAK = 5.5, STACK_PEAK_RM = 2.5;
/** The rate ramps up over the first quarter and down over the last quarter, so the plateau holds 75% of the time. */
const RAMP = 0.25, PLATEAU_AREA = 1 - RAMP;
const DEG = Math.PI / 180, HALF = 180;

const clamp01 = (u: number) => (u < 0 ? 0 : u > 1 ? 1 : u);
const smooth = (u: number) => { const k = clamp01(u); return k * k * (3 - 2 * k); };

/**
 * Signed yaw for a whirl stroke, rad (+ turns left, as runtime.yaw), or 0 when the stroke is not a whirl. Clockwise on screen
 * (positive winding, y down) turns right. No closure is needed, so spirals count. The loop radius is arc / |winding|, which is
 * exact for any circular arc (a half loop included) and gives the mean radius of a spiral, with no pass over the samples.
 */
export function whirlAngle(s: StrokeView): number {
  const w = s.winding, aw = Math.abs(w);
  if (!(aw >= WHIRL_ENTER_DEG) || s.straightness > WHIRL_STRAIGHT_MAX) return 0;
  if (s.arc / (aw * DEG) < WHIRL_R_MIN) return 0;
  const deg = Math.min(720, Math.max(HALF, Math.round(aw / HALF) * HALF));
  return -Math.sign(w) * deg * DEG;
}

/** Program length for |angle| A: 0.9 s for a half turn, 1.3 s for a full one, longer when the peak rate would exceed the cap. */
export function whirlDuration(A: number, reduced = false): number {
  const a = Math.abs(A), base = 0.9 + 0.4 * Math.min(1, Math.max(0, (a - Math.PI) / Math.PI));
  const d = Math.max(base, a / (PLATEAU_AREA * WHIRL_PEAK));
  return reduced ? Math.max(d, a / (PLATEAU_AREA * WHIRL_PEAK_RM)) : d;
}

/** Unsigned yaw rate at program fraction u; it integrates to A over dur. */
export function whirlRate(u: number, A: number, dur: number): number {
  if (!(dur > 0)) return 0;
  const k = Math.min(1, u / RAMP, (1 - u) / RAMP);
  return k > 0 ? (A / (PLATEAU_AREA * dur)) * k : 0;
}

/** Bank and slow-down envelope: eases in over the first 20% and back out over the last 20%, 0 at both ends. */
export const whirlEnvelope = (u: number) => smooth(u / 0.2) * (1 - smooth((u - 0.8) / 0.2));

/** The swipe length that gives a full (90 deg) turn on a surface this wide: 45% of the width, 160-300 px. */
export const turnMaxPx = (w: number) => Math.min(300, Math.max(160, 0.45 * (Number.isFinite(w) && w > 0 ? w : 852)));
