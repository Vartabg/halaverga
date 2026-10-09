// Conduct (spec 5): the scheme's contracts and constants, split from conductScheme.ts to keep both under 200 lines.
import { DASH_MAX, DASH_MIN, FLICK_SPEED, FLICK_SPEED_MAX, ROLL_OFFSET_M, ROLL_PEAK, ROLL_S } from './tuning';
import { FOOT } from '../motion';
import type { AimFrame, ArbiterOut, Scheme } from './types';

export type ConductCue = 'sparkle' | 'roll' | 'dash';
export type ConductGuide = 'rest-steer' | 'stir' | 'lift-glide' | 'flick' | 'circle';
export interface ConductOptions {
  /** The camera frame the steer point is cast through, or null. Default: labAimFrame once GestureTrack has published it. */
  frame?(): AimFrame | null;
  /** The view pitch the pitch goal eases (pass runtime). Default: read off the frame's look direction. */
  view?: { readonly pitch: number };
  /** Shot outputs routed through handle() (burst / blastNow / sustain). Omit when the surface fires them itself. */
  fire?(drone: number, x: number, y: number, t: number, sustained: boolean): void;
  /** Feedback hook for the ink layer and chime. */
  cue?(kind: ConductCue, dir: number): void;
  /** Onboarding successes (guideSteps.reportGuide), each reported once per scheme. */
  guide?(ev: ConductGuide): void;
  reduced?(): boolean;
}
export interface ConductScheme extends Scheme {
  readonly id: 'conduct';
  hover(x: number, y: number, t: number): void;
  leave(): void;
  clickStarts(x: number, y: number): boolean;
  /** Desktop: a click on empty space. Returns the new cruise state. */
  toggleCruise(): boolean;
  /** Routes the arbiter outputs Conduct owns; returns false for the ones it leaves to the surface (look, strokes). */
  handle(out: ArbiterOut): boolean;
  /** Desktop hover gain for tempo, flick and circle (1 = raw px). */
  setGain(g: number): void;
  readonly state: { readonly throttle: number; readonly forward: number; readonly cruising: boolean; readonly touching: boolean };
}

/** Roll sidestep: a sine envelope whose integral is ROLL_OFFSET_M (peak 3*PI/(2*0.7) = 6.7 m/s, under ROLL_PEAK). */
export const SIDESTEP_PEAK = Math.min(ROLL_PEAK, ROLL_OFFSET_M * Math.PI / (2 * ROLL_S));
export const GROUNDED_M = FOOT + 0.3, FALLBACK_STEP = 0.25, FALLBACK_DASH = (DASH_MIN + DASH_MAX) / 2;
/**
 * Desktop cruise floor: flowSpeed(0.45) is about 9 m/s, the Standard cruise, so pointing steers a moving hero (the phone floor,
 * 0.25, is about 3.7 m/s: resting there is slow flight and stirring adds speed). A straight (swipe) release dashes at SWIPE_DASH of
 * a flick's peak. Hover samples within EDGE_PX of the frame edge never stir or flick (the pointer leaving the window).
 */
export const DESK_FLOOR = 0.45, SWIPE_DASH = 0.6, EDGE_PX = 24;
export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
/** Throttle u for a forward intent (inverse of flowSpeed / SURGE), so a new contact picks up the glide seamlessly. */
export const uFor = (fwd: number) => (fwd > 0 ? (-0.25 + Math.sqrt(0.0625 + 3 * fwd)) / 1.5 : 0);

export function releasePointerLock(doc: { exitPointerLock?: () => void } | undefined =
  typeof document === 'undefined' ? undefined : document) {
  try { doc?.exitPointerLock?.(); } catch { /* not locked, or unsupported */ }
}

/** Release speed 0.9..3 px/ms -> the flick dash peak 6..14 m/s, linear. */
export const dashPeak = (speed: number) => DASH_MIN + (DASH_MAX - DASH_MIN) * clamp((speed - FLICK_SPEED) / (FLICK_SPEED_MAX - FLICK_SPEED), 0, 1);
