import type { Vec } from './motion';
import { angleDelta } from './presentation';
/**
 * The turn the controls make, gathered once per physics step for the whole-body turn roll (src/world/suitRoll.ts), which drains it
 * once per frame. `lateral` is the travel's sideways velocity change (m/s) since the last drain; `guard` (s) counts down after the
 * last step in which the flight safety (softenBounds, FlightSafety.anticipate, the controller's wall slide) turned the travel.
 */
export type TurnSweep = { lateral: number; guard: number };
/**
 * `cap`: the largest lateral acceleration (m/s^2) counted per step (active flight changes velocity by at most 42 m/s^2 in
 * motion.ts; a landing approach or a wall turns it far faster); `hold`: how long (s) a safety turn keeps the sweep closed, longer
 * than the gaps between the steps in which anticipate corrects a slide; `moving`: the horizontal speed (m/s) below which the
 * travel heading goes stale.
 */
export const SWEEP = { cap: 45, hold: .2, moving: 2 } as const;
export const createTurnSweep = (): TurnSweep => ({ lateral: 0, guard: 0 });
const heading = (v: Vec) => Math.atan2(-v.x, -v.z);
/**
 * One physics step: `from` is the velocity the step started with, `chosen` the one the controls chose (advanceVelocity or the
 * landing approach) and `flown` the one left after the flight safety. `yaw` is the body's heading: only speed along it counts, so a
 * side-slip does not roll and backward flight braces instead of banking. Clamped per step, so a one-step turn weighs the same at
 * every frame rate. A turn the safety makes is not the player's: the body does not bank away from a wall it slides along.
 */
export function sweepTurn(s: TurnSweep, from: Vec, chosen: Vec, flown: Vec, yaw: number, dt: number) {
  const steered = Math.abs(chosen.x - flown.x) + Math.abs(chosen.z - flown.z) > 1e-9;
  s.guard = steered ? SWEEP.hold : Math.max(0, s.guard - dt);
  if (s.guard > 0 || Math.hypot(from.x, from.z) <= SWEEP.moving || Math.hypot(flown.x, flown.z) <= SWEEP.moving) return;
  // The heading's turn rate times the full speed along it: in a climbing or diving turn the body carries its whole speed round.
  const level = Math.hypot(flown.x, flown.z), along = Math.max(0, -flown.x * Math.sin(yaw) - flown.z * Math.cos(yaw)) / level;
  const forward = along * Math.hypot(flown.x, flown.y, flown.z), budget = SWEEP.cap * dt;
  s.lateral += Math.min(budget, Math.max(-budget, angleDelta(heading(from), heading(flown)) * forward)) || 0;
}
