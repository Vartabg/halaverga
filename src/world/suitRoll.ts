import type { Vec } from '../game/motion';
import { CHASE_BOOM, CHASE_HEAD, settle, type Pose } from '../game/presentation';
import { SWEEP, type TurnSweep } from '../game/turnSweep';
/**
 * Whole-body turn roll, visual only: the suit banks toward the centre of the travel's curve. The presentation pose, the camera and
 * physics never read it; it is shared as a plain number for telemetry. Advanced once per frame, after the flight mix.
 */
export type SuitRoll = { epoch: number; held: boolean; lateral: number; angle: number };
/** `turn` is the sweep Player.tsx gathers per physics step (src/game/turnSweep.ts); the roll drains it each frame. */
export type RollInput = { paused: boolean; reduced: boolean; flying: boolean; velocity: Vec; turn: TurnSweep };
/**
 * `hero`/`classic`: peak roll (rad) with hero and classic poses; `soft`: lateral acceleration (m/s^2) at tanh 1; `signal`/`ease`:
 * settle rates (1/s) of the acceleration and of the angle; `from`/`full`: speeds (m/s) over which the roll fades in.
 */
export const ROLL = { hero: .8, classic: .55, soft: 22, signal: 10, ease: 10, from: 2, full: 6 } as const;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
/**
 * 0 below 2 m/s, 1 from 6 m/s, smooth between. The roll fades in with the full speed, so a steep dive still banks; Suit.tsx fades the
 * hover side tilt out with the horizontal speed.
 */
export function speedFade(speed: number) {
  const u = clamp((speed - ROLL.from) / (ROLL.full - ROLL.from), 0, 1) || 0;
  return u * u * (3 - 2 * u);
}
export const createSuitRoll = (): SuitRoll => ({ epoch: Number.NaN, held: false, lateral: 0, angle: 0 });
/**
 * Returns the roll (rad, positive rolls left) for orientSuit. `hero` is the settled hero-pose weight and `flare` the landing flare
 * weight: the roll gives way to the flare and to touchdown, where the ground plant reads the root orientation.
 */
export function advanceSuitRoll(r: SuitRoll, pose: Pose & { epoch: number }, input: RollInput, hero: number, flare: number, elapsed: number) {
  const real = Number.isFinite(elapsed) ? clamp(elapsed, 0, .25) : 0, dt = Math.min(real, .05), v = input.velocity;
  // The lateral velocity change of the travel since the last frame, gathered and clamped per physics step.
  const swept = input.turn.lateral; input.turn.lateral = 0;
  if (r.epoch !== pose.epoch || (r.held && !input.paused)) {
    // A teleport, reset or resume restarts upright instead of rolling across the gap.
    r.epoch = pose.epoch; r.held = false; r.lateral = r.angle = 0;
    return 0;
  }
  if (input.paused) { r.held = true; return r.angle; }
  // Reduced motion drops the signal rather than the angle, so a roll switched off mid-turn eases out without a jolt.
  if (real > 0) r.lateral = settle(r.lateral, input.reduced ? 0 : swept / real || 0, ROLL.signal, dt);
  const base = (ROLL.classic + (ROLL.hero - ROLL.classic) * hero) * pose.flight * (1 - clamp(flare, 0, 1)), aim = pose.aim ?? 0;
  // Aiming steadies the body; skipped at exactly 0 so the shooter-off roll stays bit-identical.
  const reach = aim === 0 ? base : base * (1 - .7 * aim);
  const fade = speedFade(Math.hypot(v.x, v.y, v.z));
  const target = !input.flying ? 0 : reach * fade * Math.tanh(clamp(r.lateral, -SWEEP.cap, SWEEP.cap) / ROLL.soft);
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
