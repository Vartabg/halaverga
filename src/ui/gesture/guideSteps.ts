// Gesture Lab onboarding (spec 7): per-scheme ghost steps, one ghost at a time, retire-on-success, the hintProgress pattern
// (a persisted step index per scheme; a skipped step is never saved past). Pure and three-free, so the lab chunk, the world
// feedback meshes and node tests share it. Times are performance.now ms.
import { BOTTOM_BAND, ONBOARD_GHOST_MS, ONBOARD_LOOPS, ONBOARD_REPLAY_S } from '@/game/gesture/tuning';
import type { GestureScheme } from '@/game/gesture/types';

export type LabScheme = Exclude<GestureScheme, 'off'>;
/** What a scheme reports when the player does a step's action (reportGuide). */
export type GuideEvent = 'curve' | 'chain' | 'tap-drone' | 'rooftop' | 'rest-steer' | 'stir' | 'lift-glide' | 'flick' | 'circle'
  | 'up' | 'turn' | 'down' | 'lasso';
/** The ghost shape GhostGuide draws for a step. */
export type GhostShape = 'curve' | 'chain' | 'tap' | 'rooftop' | 'rest' | 'stir' | 'lift' | 'flick' | 'circle' | 'up' | 'turn' | 'down' | 'lasso';
/** label: touch copy; desk: desktop copy (click-to-ink). Both are 30 characters or fewer. */
export type GuideStep = { readonly id: GuideEvent; readonly shape: GhostShape; readonly label: string; readonly desk: string };

const step = (id: GuideEvent, shape: GhostShape, label: string, desk = label): GuideStep => ({ id, shape, label, desk });
export const GUIDE_STEPS: Readonly<Record<LabScheme, readonly GuideStep[]>> = {
  draw: [step('curve', 'curve', 'Draw a curve to fly it', 'Click, move: ink a curve'), step('chain', 'chain', 'Draw again to chain', 'Ink again to chain'),
    step('tap-drone', 'tap', 'Tap a drone to blast', 'Click a drone to blast'), step('rooftop', 'rooftop', 'End on a roof to land')],
  conduct: [step('rest-steer', 'rest', 'Rest a finger to steer', 'Click sky, point to steer'), step('stir', 'stir', 'Stir small circles: faster', 'Stir the pointer: faster'),
    step('lift-glide', 'lift', 'Lift your finger to glide', 'Click again to glide'), step('flick', 'flick', 'Flick to dash'),
    step('circle', 'circle', 'Circle fast to roll'), step('tap-drone', 'tap', 'Tap a drone to blast', 'Click a drone to blast')],
  brush: [step('up', 'up', 'Swipe up to soar', 'Click, sweep up: soar'), step('turn', 'turn', 'Swipe sideways to turn', 'Click, sweep sideways: turn'),
    step('down', 'down', 'Swipe down to dive', 'Click, sweep down: dive'), step('lasso', 'lasso', 'Circle a drone to lock', 'Click, circle a drone')],
};

/** One loop: draw at real speed, then hold the finished ghost briefly. The next step waits NEXT_MS after a success. */
export const GHOST_HOLD_MS = 400, GHOST_LOOP_MS = ONBOARD_GHOST_MS + GHOST_HOLD_MS, NEXT_MS = 800;
const LOOPS_MS = GHOST_LOOP_MS * ONBOARD_LOOPS, REPLAY_MS = ONBOARD_REPLAY_S * 1000;

export type GhostRunner = {
  scheme: LabScheme;
  /** Current step index; === steps.length when every step is done or skipped. */
  step: number;
  /** Bitmasks over the scheme's steps: done (saved progress or a success) and skipped (this page load only). */
  done: number; skipped: number;
  /** When the current ghost's loops start (a replay moves it). */
  shownAt: number;
  /** Set by a retire; the owner saves and clears it. */
  dirty: boolean;
  /** Called on any report or skip, so a sleeping owner loop wakes. */
  wake: (() => void) | null;
};
export type GhostFrame = { visible: boolean; step: GuideStep | null; progress: number; loop: number; dotted: boolean; wakeIn: number };
export const createGhostFrame = (): GhostFrame => ({ visible: false, step: null, progress: 0, loop: 0, dotted: false, wakeIn: Infinity });

const steps = (r: GhostRunner) => GUIDE_STEPS[r.scheme];
const settled = (r: GhostRunner, i: number) => ((r.done | r.skipped) >> i & 1) === 1;
function advance(r: GhostRunner, at: number) {
  let k = r.step;
  while (k < steps(r).length && settled(r, k)) k++;
  if (k !== r.step) { r.step = k; r.shownAt = at; }
}

/** saved: the persisted step index (steps before it are done). The first ghost starts at `now`. */
export function createRunner(scheme: LabScheme, saved: number, now: number): GhostRunner {
  const n = GUIDE_STEPS[scheme].length, s = Math.max(0, Math.min(n, Math.floor(Number.isFinite(saved) ? saved : 0)));
  const r: GhostRunner = { scheme, step: 0, done: (1 << s) - 1, skipped: 0, shownAt: now, dirty: false, wake: null };
  advance(r, now); r.shownAt = now;
  return r;
}

/** A success. Any step of this scheme retires when its event arrives, in any order; returns true when one retired. */
export function report(r: GhostRunner, ev: GuideEvent, now: number): boolean {
  const list = steps(r);
  let hit = false;
  for (let i = 0; i < list.length; i++) if (list[i].id === ev && !(r.done >> i & 1)) { r.done |= 1 << i; hit = true; }
  if (!hit) return false;
  // Retiring the current step shows the next one NEXT_MS later; an out-of-order success leaves the current ghost's timing alone.
  advance(r, now + NEXT_MS);
  r.dirty = true; r.wake?.();
  return true;
}

/** Skip the current ghost for this page load (never saved as done). */
export function skip(r: GhostRunner, now: number) {
  if (r.step >= steps(r).length) return;
  r.skipped |= 1 << r.step; advance(r, now); r.wake?.();
}

/** The ghost to draw at `now`. Reduced motion: the same windows, drawn as a static dotted path with arrowheads (progress 1). */
export function ghostFrame(r: GhostRunner, now: number, reduced: boolean, out: GhostFrame): GhostFrame {
  const list = steps(r);
  out.step = r.step < list.length ? list[r.step] : null;
  out.dotted = reduced; out.visible = false; out.progress = 0; out.loop = 0; out.wakeIn = Infinity;
  if (!out.step) return out;
  let age = now - r.shownAt;
  if (age < 0) { out.wakeIn = -age; return out; }
  // Two loops, then a replay every REPLAY_MS after the loops end while the step is still not done.
  const cycle = LOOPS_MS + REPLAY_MS;
  age %= cycle;
  if (age >= LOOPS_MS) { out.wakeIn = cycle - age; return out; }
  out.visible = true;
  out.loop = Math.floor(age / GHOST_LOOP_MS);
  out.progress = reduced ? 1 : Math.min(1, (age - out.loop * GHOST_LOOP_MS) / ONBOARD_GHOST_MS);
  out.wakeIn = reduced ? LOOPS_MS - age : 0;
  return out;
}

/** The step index to persist: the contiguous done prefix (a skipped step stops it, as progressToSave does for hints). */
export function progressToSave(r: GhostRunner): number {
  let k = 0;
  while (k < steps(r).length && (r.done >> k & 1)) k++;
  return k;
}

/** Where the ghost sits. Touch: the right thumb zone above the bottom band; desktop: centre-right. size is the box edge, px. */
export type GhostBox = { x: number; y: number; size: number };
export function ghostAnchor(touch: boolean, w: number, h: number, safeBottom: number, out: GhostBox): GhostBox {
  const short = Math.min(w, h);
  out.size = touch ? Math.min(160, .38 * short) : Math.min(200, .26 * short);
  const half = out.size / 2;
  out.x = Math.min(w - half - 16, Math.max(half + 16, w * (touch ? .7 : .68)));
  out.y = touch ? h - BOTTOM_BAND - Math.max(0, safeBottom) - half - 56 : h * .5;
  out.y = Math.max(half + 16, out.y);
  return out;
}

// Persistence: its own key, every access in try/catch, injectable storage for node tests.
export const LAB_GUIDE_KEY = 'halaverga.lab.guides.v1';
export type GuideProgress = Record<LabScheme, number>;
type Store = Pick<Storage, 'getItem' | 'setItem'>;
const local = (): Store | null => { try { return globalThis.localStorage ?? null; } catch { return null; } };
export function loadGuideProgress(storage: Store | null = local()): GuideProgress {
  const out: GuideProgress = { draw: 0, conduct: 0, brush: 0 };
  try {
    const o = JSON.parse(storage?.getItem(LAB_GUIDE_KEY) || '{}') as Record<string, unknown>;
    for (const k of ['draw', 'conduct', 'brush'] as const) {
      const v = o?.[k];
      if (typeof v === 'number' && Number.isFinite(v)) out[k] = Math.max(0, Math.min(GUIDE_STEPS[k].length, Math.floor(v)));
    }
  } catch { /* unreadable: start fresh */ }
  return out;
}
export function saveGuideProgress(scheme: LabScheme, value: number, storage: Store | null = local()) {
  try {
    const p = loadGuideProgress(storage);
    if (value <= p[scheme]) return;
    p[scheme] = value; storage?.setItem(LAB_GUIDE_KEY, JSON.stringify(p));
  } catch { /* storage full or blocked: progress stays for this page load */ }
}

/**
 * The drawn path as GestureRibbon reads it (drawPath's ring, adapted by the Draw scheme). Indices are ring-relative, oldest first.
 * t(i) is the performance.now ms of the ink sample that made point i; flown is the hero's fractional index (points below it are
 * spent); blocked is the first blocked index (the amber tail) or -1; seq0 is the absolute number of point 0 (it grows when the
 * ring drops its oldest point), so a spent point keeps its fade clock.
 */
export interface RibbonPath {
  readonly count: number; readonly seq0: number; readonly flown: number; readonly blocked: number;
  x(i: number): number; y(i: number): number; z(i: number): number; t(i: number): number;
}
/** The Draw scheme publishes its path here (null when there is none); GestureRibbon reads it unless given its own reader. */
export const ribbonLink = { path: null as RibbonPath | null };

/** The live runner (GhostGuide installs it). Schemes call reportGuide on success; with no ghost mounted it does nothing. */
export const guideLink = { runner: null as GhostRunner | null };
export function reportGuide(ev: GuideEvent, now = performance.now()): boolean {
  const r = guideLink.runner;
  return r ? report(r, ev, now) : false;
}
