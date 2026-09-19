import type { Vec } from '../game/motion';
import { angleDelta, CHASE_BOOM, CHASE_HEAD, settle, type Pose } from '../game/presentation';
/**
 * Whole-body turn roll, visual only: the suit banks toward the centre of the travel's curve. The presentation pose, the camera and
 * physics never read it; it is shared as a plain number for telemetry. Advanced once per frame, after the flight mix.
 */
export type SuitRoll = { epoch: number; held: boolean; travel: number; tracking: boolean; lateral: number; angle: number };
export type RollInput = { paused: boolean; reduced: boolean; flying: boolean; velocity: Vec };
/**
 * `hero`/`classic`: peak roll (rad) with hero and classic poses; `soft`: lateral acceleration (m/s^2) at tanh 1; `signal`/`ease`:
 * settle rates (1/s) of the acceleration and of the angle; `cap`: the largest lateral acceleration counted (active flight changes
 * velocity by at most 42 m/s^2 in motion.ts; a wall slide turns it far faster); `from`/`full`: horizontal speeds (m/s) over which
 * the roll fades in.
 */
export const ROLL = { hero: .8, classic: .55, soft: 22, signal: 10, ease: 10, cap: 45, from: 2, full: 6 } as const;
/** Rapier's fixed step (Scene.tsx): a frame can carry at most one step more than its own length of travel change. */
const STEP = 1 / 60;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
/** 0 below 2 m/s of horizontal speed, 1 from 6 m/s, smooth between: the roll fades in and the hover side tilt fades out. */
export function speedFade(horizontal: number) {
  const u = clamp((horizontal - ROLL.from) / (ROLL.full - ROLL.from), 0, 1) || 0;
  return u * u * (3 - 2 * u);
}
export const createSuitRoll = (): SuitRoll => ({ epoch: Number.NaN, held: false, travel: 0, tracking: false, lateral: 0, angle: 0 });
/**
 * Returns the roll (rad, positive rolls left) for orientSuit. `hero` is the settled hero-pose weight and `flare` the landing flare
 * weight: the roll gives way to the flare and to touchdown, where the ground plant reads the root orientation.
 */
export function advanceSuitRoll(r: SuitRoll, pose: Pose & { epoch: number }, input: RollInput, hero: number, flare: number, elapsed: number) {
  const real = Number.isFinite(elapsed) ? clamp(elapsed, 0, .25) : 0, dt = Math.min(real, .05), v = input.velocity;
  const horizontal = Math.sqrt(v.x * v.x + v.z * v.z), moving = horizontal > 2, travel = moving ? Math.atan2(-v.x, -v.z) : r.travel;
  if (r.epoch !== pose.epoch || (r.held && !input.paused)) {
    // A teleport, reset or resume restarts upright instead of rolling across the gap.
    r.epoch = pose.epoch; r.held = false; r.travel = travel; r.tracking = moving; r.lateral = r.angle = 0;
  }
  if (input.paused) { r.held = true; return r.angle; }
  // Lateral acceleration of the travel (turn rate times speed), counted only for speed along the body's heading: a side-slip does
  // not roll, and backward flight braces (the brake clip) instead of banking. The heading goes stale below 2 m/s.
  const forward = Math.max(0, -v.x * Math.sin(pose.yaw) - v.z * Math.cos(pose.yaw));
  // Reduced motion drops the signal rather than the angle, so a roll switched off mid-turn eases out without a jolt.
  const change = moving && r.tracking && !input.reduced ? angleDelta(r.travel, travel) * forward : 0, budget = ROLL.cap * (real + STEP);
  r.travel = travel; r.tracking = moving;
  if (real > 0) r.lateral = settle(r.lateral, clamp(change, -budget, budget) / real || 0, ROLL.signal, dt);
  const reach = (ROLL.classic + (ROLL.hero - ROLL.classic) * hero) * pose.flight * (1 - clamp(flare, 0, 1));
  const target = !input.flying ? 0 : reach * speedFade(horizontal) * Math.tanh(clamp(r.lateral, -ROLL.cap, ROLL.cap) / ROLL.soft);
  // Never past the reach, so the roll gives way to a rising flare or a switch to classic poses at once.
  r.angle = clamp(settle(r.angle, target || 0, ROLL.ease, dt), -reach, reach) || 0;
  return r.angle;
}
/** Unit direction from the anchor toward the chase camera: CHASE_BOOM in the view frame, hung from the head as CameraRig hangs it. */
export function sightLine<T extends Vec>(pose: Pick<Pose, 'viewYaw' | 'viewPitch'>, out: T): T {
  const cp = Math.cos(pose.viewPitch), sp = Math.sin(pose.viewPitch), cy = Math.cos(pose.viewYaw), sy = Math.sin(pose.viewYaw);
  const y = CHASE_BOOM.y * cp - CHASE_BOOM.z * sp + CHASE_HEAD, z = CHASE_BOOM.y * sp + CHASE_BOOM.z * cp;
  const x = CHASE_BOOM.x * cy + z * sy, w = -CHASE_BOOM.x * sy + z * cy, length = Math.hypot(x, y, w);
  out.x = x / length; out.y = y / length; out.z = w / length;
  return out;
}
