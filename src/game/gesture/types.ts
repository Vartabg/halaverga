// Gesture Lab contracts shared by every lab unit. Types only: nothing here exists at runtime, so it is safe for any graph.
import type { Vec } from '../motion';
import type { GestureScheme } from './bus';

export type { GestureScheme, GestureFacing, GestureRequest, GestureStep, GestureBus } from './bus';
export type PointerKind = 'touch' | 'mouse' | 'pen';
export type Cardinal = 'left' | 'right' | 'up' | 'down';

/**
 * Read-only view of the current stroke (strokeBuffer.ts implements it over a preallocated ring). Screen CSS px, time in ms
 * (performance.now clock). Index 0 is the oldest sample still in the ring; count <= the ring size.
 */
export interface StrokeView {
  readonly pointerId: number;
  readonly kind: PointerKind;
  readonly count: number;
  x(i: number): number;
  y(i: number): number;
  t(i: number): number;
  readonly startX: number; readonly startY: number; readonly startT: number;
  readonly lastX: number; readonly lastY: number; readonly lastT: number;
  /** Path length and start-to-last distance, px. */
  readonly arc: number; readonly chord: number;
  readonly minX: number; readonly minY: number; readonly maxX: number; readonly maxY: number;
  /** Signed winding in degrees over segments >= 4 px; positive is clockwise on screen (y down). */
  readonly winding: number;
  /** chord / arc in [0, 1]. */
  readonly straightness: number;
  /** Speed over the last 60 ms and the last 150 ms, px/ms. */
  readonly speed60: number; readonly speed150: number;
  /** Largest distance from the start, px (the tap and hold slop test). */
  readonly travel: number;
}

export type StrokeKind = 'none' | 'tap' | 'hold' | 'flick' | 'swipe' | 'circle' | 'lasso' | 'nudge';
/** The recogniser's verdict (strokeFeatures.ts). One mutable instance is reused; read it before the next stroke. */
export interface StrokeClass {
  kind: StrokeKind;
  /** Snapped direction for flick and swipe, else null. */
  dir: Cardinal | null;
  /** Chord angle, rad, screen space (0 = right, +PI/2 = down). */
  angle: number;
  /** Analog tier in [0, 1] (length, speed or sweep, per kind). */
  magnitude: number;
  /** Signed winding, degrees (circle and lasso). */
  winding: number;
  /** Release speed, px/ms. */
  speed: number;
  /** Chord vector for the 30% nudge, px. */
  chordX: number; chordY: number;
}

/** Fallback buttons under More controls (spec section 9), dispatched to Scheme.fallback. */
export type Action = 'fly-to' | 'brake' | 'faster' | 'slower' | 'dash' | 'roll-left' | 'roll-right'
  | 'soar' | 'dive' | 'turn-left' | 'turn-right' | 'roll' | 'lock-burst' | 'whirl-left' | 'whirl-right';

/**
 * The camera frame a screen point is projected through: runtime.shooter.aim (published by CameraRig) plus the cached canvas
 * rect. fov is the vertical field of view in DEGREES (as AimState.fov); aspect = width / height.
 */
export interface AimFrame {
  origin: Vec; dir: Vec; right: Vec; up: Vec;
  fov: number; aspect: number;
  left: number; top: number; width: number; height: number;
  /** performance.now ms of the frame that was published. */
  t: number;
}

/**
 * Host services handed to gesture.step and gestureBefore. Player builds it once (useMemo) over FlightSafety; nothing allocates.
 * canLand takes a surface point (the feet). land() sets runtime.landGoal (surface + FOOT) and the landing state; say() posts the
 * throttled message. clock is the physics clock in seconds, advanced by gestureBefore.
 */
export interface GestureCtx {
  canLand(pt: Vec): boolean;
  pathClear(a: Vec, b: Vec): boolean;
  /** Metres from p down to the ground, or Infinity when nothing is below within the probe range. */
  groundBelow(p: Vec): number;
  clock: number;
  land(pt: Vec): void;
  say(text: string): void;
}

/** A lab scheme (Draw, Conduct or Brush). The arbiter's stroke outputs map onto down/move/up/cancel. */
export interface Scheme {
  readonly id: Exclude<GestureScheme, 'off'>;
  down(s: StrokeView): void;
  move(s: StrokeView): void;
  up(s: StrokeView, c: StrokeClass): void;
  cancel(): void;
  /** Desktop hover with no stroke (Conduct steering while cruising). */
  hover?(x: number, y: number, t: number): void;
  /** The desktop pointer left the play surface (the window, or onto the header): stop steering from its last point. */
  leave?(): void;
  /** Desktop Conduct: a click here starts the cruise even over a drone (stopped, below the horizon). */
  clickStarts?(x: number, y: number): boolean;
  step(dt: number, pos: Vec, ctx: GestureCtx): void;
  reset(): void;
  fallback(a: Action): void;
}

export type ArbiterEventType = 'down' | 'move' | 'up' | 'cancel' | 'epoch' | 'tick' | 'escape';
/**
 * Input to pointerArbiter (pure reducer). 'tick' advances time for the hold, brake, sustain and rest timers with no pointer
 * event; 'escape' is Escape or right-click on desktop. buttons follows PointerEvent.buttons (0 = hover).
 */
export interface ArbiterEvent {
  type: ArbiterEventType;
  id: number; x: number; y: number; t: number;
  kind: PointerKind;
  buttons: number;
  /** runtime.touchEpoch at the time of the event. */
  epoch: number;
}

export type ArbiterOutType = 'none'
  | 'begin' | 'extend' | 'commit' | 'cancel'
  | 'armBlast' | 'disarm' | 'burst' | 'sustain' | 'sustainEnd' | 'blastNow' | 'miss' | 'flyTo'
  | 'guide' | 'brakeRing' | 'brake' | 'clickToggle' | 'look' | 'reject';
/** One output slot, reused. drone is the picked drone index or -1; progress is 0..1 for guide and brakeRing. */
export interface ArbiterOut {
  type: ArbiterOutType;
  id: number; x: number; y: number; t: number;
  drone: number;
  progress: number;
}
