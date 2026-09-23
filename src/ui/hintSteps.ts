// Progressive controls hints: pure track selection, copy and step completion. One hint at a time (Hick's law, progressive
// disclosure); each step appears only after the previous action is done, and progress persists (store.hintProgress), so a
// finished step never repeats. Imported only by ControlsHint and tests: never by the landing first load. Times are seconds.
import { HINT_STEPS, type HintSeries } from '@/game/store';

export type HintTrack = HintSeries | 'tap' | 'line' | 'none';
export type HintEnv = { shooter: boolean; coarse: boolean; tapControls: boolean; desktopMode: string; steering: string };
/** 'tap' and 'line' are single 6 s lines once per page load; the series tracks are progressive and persisted. */
export function hintTrack(env: HintEnv): HintTrack {
  if (!env.shooter) return 'none';
  if (env.tapControls) return 'tap';
  if (env.coarse) return 'touch';
  if (env.desktopMode === 'mouse') return 'mouse';
  return env.steering === 'simple' ? 'simple' : 'line';
}

/** Every string is 30 characters or fewer, so each hint fits one line at 320 px. */
export const HINT_TEXT = {
  touch: ['Drag to fly', 'Point at a drone to fire'] as [string, string],
  touchButton: 'Point at a drone, hold Fire',
  simple: ['Click the scene to start', 'Slide to look', 'Click to shoot', 'WASD to fly · Space lifts'],
  mouse: ['Click the scene to start', 'Move the mouse to look', 'Click to shoot', 'WASD to fly · Space lifts'],
  tap: 'Tap pad: Fire and Aim toggle',
  line: 'Hold C to fire',
};

/**
 * The text to show, or null. simple/mouse: step 0 while captured shows step 1's text (it covers the poll gap before the capture
 * advances the step); the look and shoot steps while not captured show step 0's text (display only, progress is unchanged). The
 * keys step needs no capture, so it keeps its own text.
 */
export function hintText(track: HintTrack, step: number, o: { autoFire: boolean; captured: boolean }): string | null {
  if (track === 'none') return null;
  if (track === 'tap') return HINT_TEXT.tap;
  if (track === 'line') return HINT_TEXT.line;
  if (step >= HINT_STEPS[track]) return null;
  if (track === 'touch') return step === 0 ? HINT_TEXT.touch[0] : o.autoFire ? HINT_TEXT.touch[1] : HINT_TEXT.touchButton;
  const copy = HINT_TEXT[track];
  if (step === 0) return o.captured ? copy[1] : copy[0];
  return o.captured || step >= 3 ? copy[step] : copy[0];
}

/**
 * One poll. look: captured look travel (rad) since the series began in this page load; moved: a move key was held, or flying
 * changed, at any poll since then. The rest are instantaneous (thumb, flying, capture) or running totals (hits, shots).
 */
export type HintObs = { thumbActive: boolean; flying: boolean; captured: boolean; look: number; hits: number; shots: number; moved: boolean };
export const MIN_VISIBLE = 1, LOOK_TRAVEL = .2, SHOTS_FALLBACK = 5, STEP_TIMEOUT = 20, LINE_MS = 6000;
export type HintVerdict = false | 'done' | 'timeout';

/**
 * True when the step's action has been done since `since` (the observation when the series began in this page load), in any
 * order: shooting or moving before the hint that names it still counts. Look: LOOK_TRAVEL of captured look, or a hit (a hit is
 * aimed). Shoot: a hit or SHOTS_FALLBACK shots. Keys: moved. The capture step (simple/mouse 0) is the pointer being captured now.
 */
export function actionDone(series: HintSeries, step: number, now: HintObs, since: HintObs): boolean {
  const hit = now.hits > since.hits, shot = hit || now.shots - since.shots >= SHOTS_FALLBACK;
  if (series === 'touch') return step === 0 ? now.thumbActive || (now.flying && !since.flying) : shot;
  if (step === 0) return now.captured;
  if (step === 1) return now.look - since.look >= LOOK_TRAVEL || hit;
  if (step === 2) return shot;
  return now.moved;
}

/**
 * The verdict for the shown step. visibleFor is how long it has been shown. Every step needs MIN_VISIBLE except the capture step
 * (simple/mouse 0), which advances the moment the pointer is captured. The shoot steps and the final keys step also end after
 * STEP_TIMEOUT, as 'timeout': ControlsHint hides such a step for this page load only and never saves it, so the lesson returns
 * on the next visit. The first touch step never times out.
 */
export function hintDone(series: HintSeries, step: number, now: HintObs, since: HintObs, visibleFor: number): HintVerdict {
  if (series !== 'touch' && step === 0) return now.captured ? 'done' : false;
  if (visibleFor < MIN_VISIBLE) return false;
  if (actionDone(series, step, now, since)) return 'done';
  const timed = series === 'touch' ? step === 1 : step >= 2;
  return timed && visibleFor >= STEP_TIMEOUT ? 'timeout' : false;
}

/** The first step at or after `from` whose action is not done yet (a step done out of order is skipped without ever showing). */
export function nextStep(series: HintSeries, from: number, now: HintObs, since: HintObs): number {
  let k = from;
  while (k < HINT_STEPS[series] && k > 0 && actionDone(series, k, now, since)) k++;
  return k;
}

/** The progress to save: the step reached, but never past the first step that only timed out in this page load (-1: none). */
export const progressToSave = (reached: number, firstTimeout: number) => firstTimeout >= 0 ? Math.min(reached, firstTimeout) : reached;
