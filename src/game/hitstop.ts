/** Authoritative time-based hitstop micro-freeze for high-impact combat feel.
 * Decoupled from rendering: freezes animation delta and physics integration for 80ms on heavy strikes. */

export const HITSTOP_DEFAULT_DURATION = 0.08; // 80ms

export interface HitstopState {
  active: boolean;
  timer: number;
  duration: number;
}

export const hitstopState: HitstopState = {
  active: false,
  timer: 0,
  duration: HITSTOP_DEFAULT_DURATION,
};

/** Trigger a hitstop freeze frame. */
export function applyHitstop(duration: number = HITSTOP_DEFAULT_DURATION): void {
  hitstopState.active = true;
  hitstopState.timer = Math.max(hitstopState.timer, duration);
  hitstopState.duration = duration;
}

/** Step the hitstop clock by delta seconds. Suspended while paused.
 * Returns true if the frame is frozen by hitstop. */
export function stepHitstop(dt: number, paused: boolean): boolean {
  if (paused) return false;
  if (!hitstopState.active) return false;

  hitstopState.timer -= dt;
  if (hitstopState.timer <= 0) {
    hitstopState.timer = 0;
    hitstopState.active = false;
    return false;
  }
  return true;
}

/** Reset hitstop state (e.g. on scene reset). */
export function resetHitstop(): void {
  hitstopState.active = false;
  hitstopState.timer = 0;
}
