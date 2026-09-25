// Progressive controls hints: pure track selection, copy and step completion. One hint at a time (Hick's law, progressive
// disclosure); each step appears only after the previous action is done, and progress persists (store.hintProgress), so a
// finished step never repeats. Imported only by ControlsHint and tests: never by the landing first load. Times are seconds.
import { HINT_STEPS, type HintSeries } from '@/game/store';

export type HintTrack = HintSeries | 'tap' | 'line' | 'classic' | 'none';
/** scheme: the touch scheme ('twin' or 'classic'); it only matters on a coarse pointer. */
export type HintEnv = { shooter: boolean; coarse: boolean; tapControls: boolean; desktopMode: string; steering: string; scheme: string };
/**
 * 'tap', 'line' and 'classic' are single 6 s lines once per page load; the series tracks are progressive and persisted.
 * Touch twin sticks teach flight too, so the touch series also runs with the blaster off; desktop keeps its order and shows
 * nothing with the blaster off. Classic one-thumb with the blaster off, and tap controls with it off, are main's own hints.
 * The free cursor (the desktop default again, Garo 2026-09-24) gets no hint: its trackpad pill states the whole mapping.
 * Captured and flow keep the 'Hold C to fire' line.
 */
export function hintTrack(env: HintEnv): HintTrack {
  if (env.tapControls) return env.shooter ? 'tap' : 'none';
  if (env.coarse) return env.scheme === 'classic' ? env.shooter ? 'classic' : 'none' : 'touch';
  if (!env.shooter) return 'none';
  if (env.desktopMode === 'mouse') return 'mouse';
  if (env.steering === 'free') return 'none';
  return env.steering === 'simple' ? 'simple' : 'line';
}

/** Every string is 30 characters or fewer, so each hint fits one line at 320 px. */
export const HINT_TEXT = {
  touch: ['Left thumb: move', 'Right thumb: look', 'Tap Lift off to fly'] as [string, string, string],
  /** Touch step 3: blaster on with auto-fire, blaster on without it, blaster off. */
  touchAuto: 'Aim at drones · Fire to shoot',
  touchButton: 'Hold Fire to shoot',
  touchLand: 'Hold Descend to land',
  simple: ['Click the scene to start', 'Slide to look', 'Click to shoot', 'WASD to fly · Space lifts'],
  mouse: ['Click the scene to start', 'Move the mouse to look', 'Click to shoot', 'WASD to fly · Space lifts'],
  tap: 'Tap pad: Fire and Aim toggle',
  line: 'Hold C to fire',
  classic: 'One thumb: drag to fly',
};

export type HintTextOptions = { autoFire: boolean; captured: boolean; shooter?: boolean };
/**
 * The text to show, or null. simple/mouse: step 0 while captured shows step 1's text (it covers the poll gap before the capture
 * advances the step); the look and shoot steps while not captured show step 0's text (display only, progress is unchanged). The
 * keys step needs no capture, so it keeps its own text. Touch needs no capture: each step shows its own text.
 */
export function hintText(track: HintTrack, step: number, o: HintTextOptions): string | null {
  if (track === 'none') return null;
  if (track === 'tap' || track === 'line' || track === 'classic') return HINT_TEXT[track];
  if (step >= HINT_STEPS[track]) return null;
  if (track === 'touch') {
    if (step < 3) return HINT_TEXT.touch[step];
    return o.shooter === false ? HINT_TEXT.touchLand : o.autoFire ? HINT_TEXT.touchAuto : HINT_TEXT.touchButton;
  }
  const copy = HINT_TEXT[track];
  if (step === 0) return o.captured ? copy[1] : copy[0];
  return o.captured || step >= 3 ? copy[step] : copy[0];
}

/**
 * One poll. look: captured look travel (rad) since the series began in this page load; moved: a move key was held, or flying
 * changed, at any poll since then; landed: flying went from true to false at any poll since then. moves, climbs and touchLook
 * (rad of touch look applied) are runtime.stick's running totals; hits and shots are the blaster's. flying and captured are
 * instantaneous.
 */
export type HintObs = {
  flying: boolean; captured: boolean; look: number; hits: number; shots: number; moved: boolean;
  moves: number; climbs: number; touchLook: number; landed: boolean;
};
export const MIN_VISIBLE = 1, LOOK_TRAVEL = .2, SHOTS_FALLBACK = 5, STEP_TIMEOUT = 20, LINE_MS = 6000;
export type HintVerdict = false | 'done' | 'timeout';

/**
 * True when the step's action has been done since `since` (the observation when the series began in this page load), in any
 * order: shooting or moving before the hint that names it still counts. `shooter` only changes touch step 3.
 * Touch: 0 the stick moved; 1 LOOK_TRAVEL of touch look, or a hit; 2 Rise or Descend pressed, or lift-off; 3 with the blaster a
 * hit or SHOTS_FALLBACK shots, without it a landing.
 * Desktop: 0 (capture) the pointer is captured now; 1 LOOK_TRAVEL of captured look, or a hit; 2 a hit or SHOTS_FALLBACK shots;
 * 3 moved.
 */
export function actionDone(series: HintSeries, step: number, now: HintObs, since: HintObs, shooter = true): boolean {
  const hit = now.hits > since.hits, shot = hit || now.shots - since.shots >= SHOTS_FALLBACK;
  if (series === 'touch') {
    if (step === 0) return now.moves > since.moves;
    if (step === 1) return now.touchLook - since.touchLook >= LOOK_TRAVEL || hit;
    if (step === 2) return now.climbs > since.climbs || (now.flying && !since.flying);
    return shooter ? shot : now.landed;
  }
  if (step === 0) return now.captured;
  if (step === 1) return now.look - since.look >= LOOK_TRAVEL || hit;
  if (step === 2) return shot;
  return now.moved;
}

/**
 * The verdict for the shown step. visibleFor is how long it has been shown. Every step needs MIN_VISIBLE except the capture step
 * (simple/mouse 0), which advances the moment the pointer is captured. Steps 2 and 3 of every series also end after
 * STEP_TIMEOUT, as 'timeout': ControlsHint hides such a step for this page load only and never saves it, so the lesson returns
 * on the next visit. Steps 0 and 1 never time out.
 */
export function hintDone(series: HintSeries, step: number, now: HintObs, since: HintObs, visibleFor: number, shooter = true): HintVerdict {
  if (series !== 'touch' && step === 0) return now.captured ? 'done' : false;
  if (visibleFor < MIN_VISIBLE) return false;
  if (actionDone(series, step, now, since, shooter)) return 'done';
  return step >= 2 && visibleFor >= STEP_TIMEOUT ? 'timeout' : false;
}

/** The first step at or after `from` whose action is not done yet (a step done out of order is skipped without ever showing). */
export function nextStep(series: HintSeries, from: number, now: HintObs, since: HintObs, shooter = true): number {
  let k = from;
  while (k < HINT_STEPS[series] && k > 0 && actionDone(series, k, now, since, shooter)) k++;
  return k;
}

/** The progress to save: the step reached, but never past the first step that only timed out in this page load (-1: none). */
export const progressToSave = (reached: number, firstTimeout: number) => firstTimeout >= 0 ? Math.min(reached, firstTimeout) : reached;
