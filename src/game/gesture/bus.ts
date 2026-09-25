// Gesture Lab bus: the one shared, mutable record between a lab scheme and the flight loop. It has no imports on purpose (the
// landing page and the Player graph reach it), holds only plain numbers and {x,y,z}, and never allocates after load.
export type GestureScheme = 'off' | 'draw' | 'conduct' | 'brush';
/** 0 = the view decides the body facing, 1 = a drawn path (FACING_PATH), 2 = an aimed burst (FACING_AIM). */
export type GestureFacing = 0 | 1 | 2;
/** x,y,z of a land request is the landing surface point (the feet), the same convention as runtime.landTarget. */
export type GestureRequest = null | { kind: 'lift' } | { kind: 'land'; x: number; y: number; z: number };
type Point = { x: number; y: number; z: number };
/**
 * The step a scheme installs; ctx is the host's preallocated GestureCtx (types.ts). Method syntax keeps the parameter bivariant,
 * so a step typed with GestureCtx can be installed here without bus importing types.ts.
 */
export type GestureStep = { step(dt: number, pos: Point, ctx: unknown): void }['step'];

export const gesture = {
  scheme: 'off' as GestureScheme,
  /** A pointer or a hover is actually conducting or inking right now (not a decay tail). */
  live: false,
  intent: { forward: 0, strafe: 0, vertical: 0 },
  surge: false,
  /** rad/s, applied (clamped) by gestureBefore. Positive yaw turns left, the same sign as runtime.yaw. */
  yawRate: 0, pitchRate: 0,
  /** Desired world velocity (Draw), used only while velocityOn. */
  velocity: { x: 0, y: 0, z: 0 }, velocityOn: false,
  /** Offset envelope added on top of the chosen velocity before the flight safety (dash, dodge, roll sidestep). */
  offset: { x: 0, y: 0, z: 0 },
  /** Body-only roll in radians (the camera never rolls). */
  spin: 0,
  facing: 0 as GestureFacing,
  /** Gesture shots skip the mode-1 hip clamp ('Shots slow me down' off). */
  exemptHip: true,
  /** Keyboard movement is active this step; every scheme drops its path or program on its next step. */
  override: false,
  landArmed: false,
  request: null as GestureRequest,
  step: null as GestureStep | null,
  /** Bumped by clearGesture; a scheme holding an older epoch drops its stroke. */
  epoch: 0,
  /** Reduce motion, mirrored from the store by Player before each gestureBefore; clearGesture keeps it. */
  reduced: false,
};
export type GestureBus = typeof gesture;

export const LIFT_REQUEST = { kind: 'lift' } as const;

/** Zeroes every live output. Keeps scheme, step, exemptHip and reduced; bumps epoch. */
export function clearGesture() {
  const g = gesture;
  g.live = false; g.surge = false; g.velocityOn = false; g.override = false; g.landArmed = false;
  g.intent.forward = g.intent.strafe = g.intent.vertical = 0;
  g.yawRate = g.pitchRate = g.spin = 0;
  g.velocity.x = g.velocity.y = g.velocity.z = 0;
  g.offset.x = g.offset.y = g.offset.z = 0;
  g.facing = 0; g.request = null;
  g.epoch++;
}
