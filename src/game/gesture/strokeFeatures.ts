// Stroke recogniser (spec 2.5): the ONE tap definition, hold, flick, swipe and circle (Conduct and Brush variants), mid-stroke
// probes and a tolerant point-in-polygon. Pure: reads a StrokeView, writes one reused StrokeClass, allocates nothing.
// Lasso is decided by lasso.ts (it needs drone tracks); a stroke that fails every class is a 'nudge' carrying its chord.
import {
  CIRCLE_BRUSH_DEG, CIRCLE_CONDUCT_DEG, CIRCLE_CONDUCT_RATE, CIRCLE_R_MAX, CIRCLE_R_MIN, CLOSURE_FRAC, CLOSURE_PX,
  FLICK_MIN_PX, FLICK_SNAP_DEG, FLICK_SPEED, FLICK_SPEED_MAX, HOLD_MS, PX_PER_MM, SPEED_WIN_LONG_MS,
  SPEED_WIN_SHORT_MS, SWIPE_MAX_MS, SWIPE_MIN_PX, SWIPE_STRAIGHT, TAP_MS, TAP_SLOP_MOUSE, TAP_SLOP_TOUCH, TURN_MAX_PX,
  WINDING_SEG,
} from './tuning';
import { WINDING_CUSP, wrapAngle as wrap } from './strokeBuffer';
import type { Cardinal, PointerKind, Scheme, StrokeClass, StrokeView } from './types';
import { releaseSpeed } from './releaseSpeed';
export { pointInPolygon } from './resample';

/** A flick's last 150 ms may step back this far along its release direction (jitter), px. */
export const FLICK_REVERSAL_PX = 4;
/** straightFast: mean speed floor (px/ms), and the release is "settling" once speed60 <= this fraction of the mean. */
export const STRAIGHT_FAST_MEAN = 0.3, STRAIGHT_FAST_SETTLE = 0.5;
/** Closure also admits the gap a circle of exactly the minimum sweep leaves, times this slack. */
export const CLOSURE_SLACK = 1.15;
/** Circle magnitude is its sweep rate over this, deg/s. */
export const CIRCLE_RATE_FULL = 1100;

export type Variant = Scheme['id'];
const DEG = 180 / Math.PI, RAD = Math.PI / 180;
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

export const tapSlop = (kind: PointerKind) => (kind === 'mouse' ? TAP_SLOP_MOUSE : TAP_SLOP_TOUCH);
/** Still enough to be a tap or a hold (the same per-kind slop for both). */
export const isStill = (s: StrokeView) => s.travel <= tapSlop(s.kind);
/** THE tap definition for every scheme: still and released within TAP_MS. Push the up sample first, or pass upT. */
export const isTap = (s: StrokeView, upT = s.lastT) => s.count > 0 && isStill(s) && Math.max(upT, s.lastT) - s.startT <= TAP_MS;
/** Hold: still and pressed for HOLD_MS by `now` (the arbiter's tick time mid-press, or the up time). */
export const isHold = (s: StrokeView, now = s.lastT) => s.count > 0 && isStill(s) && Math.max(now, s.lastT) - s.startT >= HOLD_MS;

/** Index of the oldest sample inside the trailing window, never the last one while two or more exist. */
export function windowStart(s: StrokeView, ms: number): number {
  const from = s.lastT - ms;
  let i = s.count - 2;
  while (i > 0 && s.t(i - 1) >= from) i--;
  return Math.max(i, 0);
}

/** Path speed over the trailing window, px/ms. */
export function speedSince(s: StrokeView, ms: number): number {
  const last = s.count - 1, i = windowStart(s, ms);
  if (last <= i) return 0;
  let arc = 0;
  for (let k = i + 1; k <= last; k++) arc += Math.hypot(s.x(k) - s.x(k - 1), s.y(k) - s.y(k - 1));
  const span = s.t(last) - s.t(i);
  return span > 1e-6 ? arc / span : 0;
}

/** Result of the last trail() walk: signed degrees, time span (ms) and the oldest sample index reached. */
const tr = { deg: 0, span: 0, i0: 0 };
/** Walk back from the last sample over >= 4 px segments, summing signed turning until |deg| >= stopDeg or span > stopMs. */
function trail(s: StrokeView, stopDeg: number, stopMs: number) {
  const last = s.count - 1;
  tr.deg = 0; tr.span = 0; tr.i0 = Math.max(last, 0);
  if (last < 2) return tr;
  let ax = s.x(last), ay = s.y(last), dir = 0, has = false;
  const lastT = s.t(last), seg2 = WINDING_SEG * WINDING_SEG;
  for (let i = last - 1; i >= 0; i--) {
    const span = lastT - s.t(i);
    if (span > stopMs) break;
    tr.i0 = i; tr.span = span;
    const dx = ax - s.x(i), dy = ay - s.y(i);
    if (dx * dx + dy * dy < seg2) continue;
    const d = Math.atan2(dy, dx), turn = wrap(dir - d);
    if (has && Math.abs(turn) <= WINDING_CUSP) tr.deg += turn * DEG;
    dir = d; has = true; ax = s.x(i); ay = s.y(i);
    if (Math.abs(tr.deg) >= stopDeg) break;
  }
  return tr;
}

/** Signed winding (deg, + clockwise) over the trailing window of `ms`. */
export const windingSince = (s: StrokeView, ms: number) => trail(s, Infinity, ms).deg;
/** Mid-stroke probe: winding over the last 300 ms (divide by 0.3 for a rate in deg/s). */
export const winding300 = (s: StrokeView) => windingSince(s, 300);

const fit = { r: 0, diag: 0 };
/** Mean radius about the centroid, and bbox diagonal, over samples i0..last. */
function fitCircle(s: StrokeView, i0: number) {
  const last = s.count - 1, n = last - i0 + 1;
  let cx = 0, cy = 0, x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = i0; i <= last; i++) {
    const x = s.x(i), y = s.y(i);
    cx += x; cy += y; x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
  }
  let r = 0; cx /= n; cy /= n;
  for (let i = i0; i <= last; i++) r += Math.hypot(s.x(i) - cx, s.y(i) - cy);
  fit.r = r / n; fit.diag = Math.hypot(x1 - x0, y1 - y0);
  return fit;
}

const closes = (gap: number, r: number, diag: number, minDeg: number) =>
  gap <= Math.max(CLOSURE_PX, CLOSURE_FRAC * diag, CLOSURE_SLACK * 2 * r * Math.sin((360 - minDeg) * RAD / 2));

/** Conduct circle: the last 330 deg swept at >= 550 deg/s, radius 15-70 px, closed. Signed winding, or 0. */
export function fastCircle(s: StrokeView): number {
  const t = trail(s, CIRCLE_CONDUCT_DEG, Infinity);
  if (Math.abs(t.deg) < CIRCLE_CONDUCT_DEG || t.span <= 0 || Math.abs(t.deg) / (t.span / 1000) < CIRCLE_CONDUCT_RATE) return 0;
  const deg = t.deg, i0 = t.i0, f = fitCircle(s, i0);
  return f.r < CIRCLE_R_MIN || f.r > CIRCLE_R_MAX ? 0 : closes(Math.hypot(s.lastX - s.x(i0), s.lastY - s.y(i0)), f.r, f.diag, CIRCLE_CONDUCT_DEG) ? deg : 0;
}

/** Brush circle: >= 300 deg over the stroke, radius >= 15 px, closed. Signed winding, or 0. */
export function brushCircle(s: StrokeView): number {
  if (Math.abs(s.winding) < CIRCLE_BRUSH_DEG || s.count < 3) return 0;
  const f = fitCircle(s, 0);
  return f.r >= CIRCLE_R_MIN && closes(s.chord, f.r, f.diag, CIRCLE_BRUSH_DEG) ? s.winding : 0;
}

/** Swipe geometry so far: straight, long enough and quick enough (duration measured to `now`). */
const swipeShape = (s: StrokeView, now: number) =>
  s.chord >= SWIPE_MIN_PX && s.straightness >= SWIPE_STRAIGHT && now - s.startT <= SWIPE_MAX_MS;

/** Mid-stroke swipe commit: swipe geometry at a fast mean pace, and the finger is settling (or the length is maxed). */
export function straightFast(s: StrokeView): boolean {
  const dur = s.lastT - s.startT;
  if (s.count < 3 || dur <= 0 || !swipeShape(s, s.lastT)) return false;
  const mean = s.chord / dur;
  return mean >= STRAIGHT_FAST_MEAN && (s.chord >= TURN_MAX_PX || speedSince(s, SPEED_WIN_SHORT_MS) <= STRAIGHT_FAST_SETTLE * mean);
}

/** Tangential speed around (cx, cy), |cross(p - c, v)| / |p - c| in mm/s (px/s / PX_PER_MM), v the chord of the last 50 ms and
 * p its midpoint (so a stir's chord is measured square to its own radius). */
export function tangentialSpeed(s: StrokeView, cx: number, cy: number): number {
  const last = s.count - 1, i = windowStart(s, 50);
  if (last <= i) return 0;
  const dt = s.t(last) - s.t(i), rx = (s.lastX + s.x(i)) / 2 - cx, ry = (s.lastY + s.y(i)) / 2 - cy, r = Math.hypot(rx, ry);
  if (dt <= 1e-6 || r < 1) return 0;
  const vx = (s.lastX - s.x(i)) / dt, vy = (s.lastY - s.y(i)) / dt;
  return Math.abs(rx * vy - ry * vx) / r * 1000 / PX_PER_MM;
}

const sector = (a: number, d = a * DEG): Cardinal =>
  d > -45 && d <= 45 ? 'right' : d > 45 && d <= 135 ? 'down' : d > -135 && d <= -45 ? 'up' : 'left';

const verdict: StrokeClass = { kind: 'none', dir: null, angle: 0, magnitude: 0, winding: 0, speed: 0, chordX: 0, chordY: 0 };

/** Flick test into out: fast release, >= 40 px in the last 150 ms, no reversal; dir snaps within +-10 deg of a cardinal. */
function flick(s: StrokeView, speed: number, out: StrokeClass): boolean {
  if (speed < FLICK_SPEED) return false;
  const last = s.count - 1, i60 = windowStart(s, SPEED_WIN_SHORT_MS), i150 = windowStart(s, SPEED_WIN_LONG_MS);
  let dx = s.lastX - s.x(i60), dy = s.lastY - s.y(i60);
  const len = Math.hypot(dx, dy);
  if (len < 1e-6 || Math.hypot(s.lastX - s.x(i150), s.lastY - s.y(i150)) < FLICK_MIN_PX) return false;
  dx /= len; dy /= len;
  let top = -Infinity;
  for (let i = i150; i <= last; i++) {
    const along = s.x(i) * dx + s.y(i) * dy;
    if (along > top) top = along; else if (top - along > FLICK_REVERSAL_PX) return false;
  }
  const a = Math.atan2(dy, dx), card = sector(a), axis = card === 'right' ? 0 : card === 'down' ? 90 : card === 'up' ? -90 : 180;
  out.kind = 'flick'; out.angle = a;
  out.dir = Math.abs(wrap(a - axis * RAD)) * DEG <= FLICK_SNAP_DEG ? card : null;
  out.magnitude = clamp01((speed - FLICK_SPEED) / (FLICK_SPEED_MAX - FLICK_SPEED));
  return true;
}

function swipe(s: StrokeView, now: number, out: StrokeClass): boolean {
  if (!swipeShape(s, now)) return false;
  out.kind = 'swipe'; out.dir = sector(out.angle);
  out.magnitude = clamp01((s.chord - SWIPE_MIN_PX) / (TURN_MAX_PX - SWIPE_MIN_PX));
  return true;
}

function circle(s: StrokeView, variant: Variant, now: number, out: StrokeClass): boolean {
  const w = variant === 'conduct' ? fastCircle(s) : brushCircle(s);
  if (w === 0) return false;
  const span = variant === 'conduct' ? tr.span : now - s.startT;
  out.kind = 'circle'; out.winding = w;
  out.magnitude = span > 0 ? clamp01(Math.abs(w) / (span / 1000) / CIRCLE_RATE_FULL) : 1;
  return true;
}

/**
 * Classify a finished stroke for a scheme (push the up sample first; upT defaults to the last sample's time). Order: tap,
 * hold, circle, then flick before swipe in Conduct (swipe before flick in Draw and Brush), else a 'nudge' with its chord.
 * Returns the shared verdict object, or `out` when given.
 */
export function classify(s: StrokeView, variant: Variant, upT = s.lastT, out: StrokeClass = verdict): StrokeClass {
  const now = Math.max(upT, s.lastT);
  out.dir = null; out.magnitude = 0; out.winding = 0;
  out.chordX = s.lastX - s.startX; out.chordY = s.lastY - s.startY;
  out.angle = Math.atan2(out.chordY, out.chordX);
  out.speed = s.count > 1 ? releaseSpeed(s) : 0; // skips a still pointer-up sample; reads an ease-out flick's peak
  if (s.count === 0) { out.kind = 'none'; return out; }
  if (isStill(s)) {
    out.kind = now - s.startT <= TAP_MS ? 'tap' : now - s.startT >= HOLD_MS ? 'hold' : 'nudge';
    return out;
  }
  if (circle(s, variant, now, out)) return out;
  if (variant === 'conduct' ? flick(s, out.speed, out) || swipe(s, now, out) : swipe(s, now, out) || flick(s, out.speed, out)) return out;
  out.kind = 'nudge'; out.angle = Math.atan2(out.chordY, out.chordX); out.dir = null;
  return out;
}
