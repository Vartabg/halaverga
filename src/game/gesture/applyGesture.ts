// The Gesture Lab's hooks into the flight step (spec 2.8). Pure: no Rapier, no three.js, no store. Player calls it in a few lines
// and passes runtime as the host; readIntent adds gestureIntent. Nothing here allocates per step.
import type { Vec } from '../motion';
import type { GestureCtx } from './types';
import { gesture } from './bus';
import { GOAL_PITCH_MAX, GOAL_PITCH_MIN, MAX_PITCH_RATE, MAX_YAW_RATE, PITCH_MAX, PITCH_MIN, SNAP_INTENT } from './tuningCore';

/** The runtime fields gestureBefore writes (runtime satisfies it structurally). */
export interface GestureHost { yaw: number; pitch: number; lift: boolean }
/** gestureIntent's output slot: the gesture contribution to readIntent. */
export interface GestureIntentOut { forward: number; strafe: number; vertical: number; precise: boolean }
export const NO_LANDING = 'No landing there';

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
/** The offset added on the previous step (gestureOffset), so gestureBase can take back only what survived safety. */
const prevOffset = { x: 0, y: 0, z: 0 };

/** Forgets the previous step's offset (remount, reset, tests). */
export function resetGestureApply() { prevOffset.x = prevOffset.y = prevOffset.z = 0; }

/**
 * Start of the physics step: advances ctx.clock, runs the scheme's step, consumes one request (lift, or land gated by canLand)
 * and applies the clamped yaw/pitch rates. A pitch rate never drives pitch past the gesture goal band, but a pitch already
 * outside it (keyboard, drag look) is not pulled back.
 */
export function gestureBefore(dt: number, p: Vec, ctx: GestureCtx, host: GestureHost) {
  ctx.clock += dt;
  if (gesture.scheme === 'off') return;
  if (gesture.step) gesture.step(dt, p, ctx);
  const r = gesture.request;
  if (r) {
    gesture.request = null;
    if (r.kind === 'lift') host.lift = true;
    else if (ctx.canLand(r)) ctx.land(r);
    else { gesture.landArmed = false; ctx.say(NO_LANDING); }
  }
  const yr = clamp(gesture.yawRate, -MAX_YAW_RATE, MAX_YAW_RATE), pr = clamp(gesture.pitchRate, -MAX_PITCH_RATE, MAX_PITCH_RATE);
  if (yr !== 0) host.yaw += yr * dt;
  if (pr !== 0) {
    const from = host.pitch;
    let next = from + pr * dt;
    next = pr > 0 ? Math.min(next, Math.max(from, GOAL_PITCH_MAX)) : Math.max(next, Math.min(from, GOAL_PITCH_MIN));
    host.pitch = clamp(next, PITCH_MIN, PITCH_MAX);
  }
}

/**
 * The velocity the mode branches build on: runtimeVelocity minus the part of last step's offset that survived safety,
 * keep = clamp(dot(v, prev) / |prev|^2, 0, 1). Offsets never compound, and a wall brake never subtracts more than is left.
 * out may be the same object as runtimeVelocity.
 */
export function gestureBase(runtimeVelocity: Vec, out: Vec): Vec {
  const v = runtimeVelocity, o = prevOffset;
  const m2 = o.x * o.x + o.y * o.y + o.z * o.z;
  const keep = m2 > 1e-12 ? clamp((v.x * o.x + v.y * o.y + v.z * o.z) / m2, 0, 1) : 0;
  out.x = v.x - keep * o.x; out.y = v.y - keep * o.y; out.z = v.z - keep * o.z;
  return out;
}

/**
 * Draw's desired velocity replaces the mode branch while velocityOn, the suit flies and no landGoal is set (pathFollow ramps it
 * at ACCEL). Grounded, it never applies: a path velocity left over after touchdown would skip softenBounds and anticipate.
 * Writes it into v and returns true when it applies; otherwise leaves v alone.
 */
export function gestureVelocity(v: Vec, landGoal: unknown, flying = true): boolean {
  if (gesture.scheme === 'off' || !gesture.velocityOn || landGoal || !flying) return false;
  v.x = gesture.velocity.x; v.y = gesture.velocity.y; v.z = gesture.velocity.z;
  return true;
}

/**
 * Adds the offset envelope before softenBounds and anticipate, and remembers it for the next gestureBase. Pass apply = false
 * (landing approach) to add nothing; the remembered offset is then cleared too.
 */
export function gestureOffset(v: Vec, apply = true): Vec {
  const o = gesture.offset, on = apply && gesture.scheme !== 'off';
  prevOffset.x = on ? o.x : 0; prevOffset.y = on ? o.y : 0; prevOffset.z = on ? o.z : 0;
  v.x += prevOffset.x; v.y += prevOffset.y; v.z += prevOffset.z;
  return v;
}

/** Hip clamp: only mode 1 is exempt, only while a lab scheme is on and exemptHip is set. Mode 2 (ADS) always stays. */
export function labMode(m: 0 | 1 | 2): 0 | 1 | 2 {
  return m === 1 && gesture.scheme !== 'off' && gesture.exemptHip ? 0 : m;
}

const snap = (c: number) => (Math.abs(c) < SNAP_INTENT ? 0 : c);
/**
 * The gesture contribution to readIntent. Added only when live || !landGoal (a decay tail never cancels a Land), precise only
 * while live, and components below SNAP_INTENT snap to 0.
 */
export function gestureIntent(landGoal: unknown, out: GestureIntentOut): GestureIntentOut {
  const g = gesture, on = g.scheme !== 'off' && (g.live || !landGoal);
  out.forward = on ? snap(g.intent.forward) : 0;
  out.strafe = on ? snap(g.intent.strafe) : 0;
  out.vertical = on ? snap(g.intent.vertical) : 0;
  out.precise = on && g.live;
  return out;
}
