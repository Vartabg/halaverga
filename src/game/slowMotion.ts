// Slow motion (Garo 2026-10-20). A counter drops game time to SLOW.scale for a beat and eases it back.
// Only game time slows: flight, demons, darts, strikes and the angel's animation take scaled steps; look, turning, the camera and
// the hit-stop keep real time, so the player stays in control. Reduced motion keeps normal speed. Pure, allocation-free.
import { counterState } from './counterState';

/** stale: milliseconds without a step after which readers see normal time again. */
export const SLOW = { scale: .2, attack: .06, hold: .45, release: .3, stale: 250 } as const;
const t = { since: 1e9, stamp: -1e9 };
const smooth = (x: number) => x * x * (3 - 2 * x);
const clock = () => performance.now();

/** Starts a slow-motion beat (a counter). */
export function startSlowMotion() { t.since = 0; }
export function resetSlowMotion() { t.since = 1e9; counterState.scale = 1; }

/** Advances by real seconds and returns the game-time scale for this frame. Paused holds the current scale. */
export function stepSlowMotion(realDt: number, paused: boolean, reduced: boolean, now = clock()) {
  t.stamp = now;
  if (paused) return counterState.scale;
  t.since += Math.max(0, Math.min(.1, realDt));
  const s = t.since, { scale: low, attack, hold, release } = SLOW;
  let scale = 1;
  if (!reduced && s < attack + hold + release) {
    scale = s < attack ? 1 - (1 - low) * s / attack
      : s < attack + hold ? low
      : low + (1 - low) * smooth((s - attack - hold) / release);
  }
  counterState.scale = scale;
  return scale;
}
/** The scale a reader may use now. It is 1 again once the stepper has not run for SLOW.stale ms (the fight faulted or left the
 * scene), so flight can never be left slow with nothing to ease it back. */
export const timeScale = (now = clock()) => now - t.stamp > SLOW.stale ? 1 : counterState.scale;
/** Game seconds for real seconds dt this frame. */
export const gameDt = (dt: number, now?: number) => dt * timeScale(now);
