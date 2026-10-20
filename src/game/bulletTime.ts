// Slow motion (Garo 2026-10-20: Batman Arkham / God of War). A counter drops game time to SLOW for a beat and eases it back.
// Only game time slows: flight, demons, darts, strikes and the angel's animation take scaled steps; look, turning and the camera
// keep real time, so the player stays in control. Reduced motion keeps normal speed. Pure, allocation-free.
import { counterState } from './counterState';

export const BULLET = { slow: .2, attack: .06, hold: .45, release: .3 } as const;
const t = { since: 1e9 };

/** Starts a slow-motion beat (a counter). */
export function startBulletTime() { t.since = 0; }
export function resetBulletTime() { t.since = 1e9; counterState.scale = 1; }

/** Advances by real seconds and returns the game-time scale for this frame. Paused holds the current scale. */
export function stepBulletTime(realDt: number, paused: boolean, reduced: boolean) {
  if (paused) return counterState.scale;
  t.since += Math.max(0, Math.min(.1, realDt));
  const s = t.since, { slow, attack, hold, release } = BULLET;
  let scale = 1;
  if (!reduced && s < attack + hold + release) {
    scale = s < attack ? 1 - (1 - slow) * s / attack
      : s < attack + hold ? slow
      : slow + (1 - slow) * smooth((s - attack - hold) / release);
  }
  counterState.scale = scale;
  return scale;
}
const smooth = (x: number) => x * x * (3 - 2 * x);
/** Game seconds for real seconds dt this frame. */
export const gameDt = (dt: number) => dt * counterState.scale;
