// Brush strokes (spec 6): the scheme's contracts, split from brushScheme.ts to keep both under 200 lines. What Brush needs from the
// game (BrushHost: LabControls wires it over runtime, tests mock it), what the ink and guides read (BrushView), and the pure
// stroke helpers and thresholds. Types and plain numbers only.
import type { Vec } from '../motion';
import type { Cardinal, Scheme, StrokeView } from './types';
import type { CancelReason, ManeuverId } from './maneuvers';
import { CLOSURE_FRAC, CLOSURE_PX } from './tuning';

/**
 * A swipe down counts as a landing request when the ground is closer than this (with a landTarget in view), or when the swipe
 * ends on the land target (BrushHost.landAt). Higher up a swipe down is always a dive.
 */
export const BRUSH_LAND_LOW_M = 5;
/** A dive pulls out early enough to level off at least this high, m (its vertical speed's braking distance included). */
export const BRUSH_PULLOUT_M = 8;
/**
 * The mid-stroke swipe commit (strokeFeatures.straightFast, which waits for the finger to settle so the full length sets the
 * magnitude) also needs little turning so far and no lasso lock, so the opening arc of a large circle never commits.
 */
export const SWIPE_COMMIT_WIND_DEG = 15;
export const NO_DRONE = 'No drone in view';
/** Onboarding events Brush reports (guideSteps.reportGuide). */
export type BrushGuide = 'up' | 'turn' | 'down' | 'lasso';

export interface BrushHost {
  flying(): boolean;
  /** runtime.yaw (the offset basis: camera right = (cos yaw, 0, -sin yaw)). */
  yaw(): number;
  /** runtime.pitch: the cruise cancels its sink so it holds altitude. Default 0. */
  pitch?(): number;
  /** FlightSafety clearance is pushing the hero away from geometry. */
  clearance(): boolean;
  /** runtime.clearance.normal (out of the obstacle): a program is cancelled only when it pushes into it. Absent: always cancel. */
  clearanceNormal?(): Vec;
  /** runtime.landTarget (surface point) or null. */
  landTarget(): Vec | null;
  /** The screen point lies on the land target (a swipe down that ends on a roof lands there). */
  landAt?(x: number, y: number): boolean;
  /** lasso.ts: lassoBegin, lassoSample (locks so far, for mid-stroke rings) and lassoClose(closed) (final locks). */
  lassoBegin(x: number, y: number, t: number): void;
  lassoAdd(x: number, y: number, t: number): number;
  lassoEnd(closed: boolean): number;
  /** aimedShot.lockBurst on the locked drones. */
  lockBurst(): void;
  /** Fallback: lock and burst the nearest visible drone; false when there is none. */
  lockNearest(): boolean;
  /** A recognised stroke did its step's action (onboarding). */
  guide?(ev: BrushGuide): void;
}
/** What the ink and guides read (U2/U7). Mutated in place. */
export interface BrushView {
  guide: boolean;
  /** Brake-fill ring 0..1 between HOLD_MS and BRAKE_HOLD_MS. */
  ring: number;
  locks: number;
  /** A swipe was committed mid-stroke: the arbiter should end the ink (desktop hover ink commits here). */
  committed: boolean;
  /** Bumped on every recognised stroke (the ink 'sets' and the chime plays); speed is its release speed, px/ms. */
  recognized: number; speed: number;
  /** The last stroke was unknown: the ink greys out. */
  grey: boolean;
  program: ManeuverId;
  lastCancel: CancelReason | null;
}
export interface BrushScheme extends Scheme {
  readonly view: BrushView;
  /** Still-press time from the arbiter's guide/brakeRing/brake outputs: the guide from HOLD_MS, the brake at BRAKE_HOLD_MS. */
  hold(ms: number): void;
  readonly cruising: boolean;
}

/** Chord direction in ±45 deg sectors (screen y down). */
export function cardinalOf(dx: number, dy: number): Cardinal {
  return Math.abs(dx) >= Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'down');
}
/** Closure as the recogniser defines it: the end is back within max(40 px, 30% of the bbox diagonal) of the start. */
export const closedStroke = (s: StrokeView) =>
  s.chord <= Math.max(CLOSURE_PX, CLOSURE_FRAC * Math.hypot(s.maxX - s.minX, s.maxY - s.minY));
