// Gesture Lab ink look (spec 7): pure width, alpha and colour functions for InkCanvas. No DOM, no allocation, node-testable.
import { INK_COLOR, INK_W_FAST, INK_W_SLOW, REJECT_MS, RM_INK_FADE_MS, SET_GAIN, SET_MS } from '@/game/gesture/tuning';

/** Live: being drawn. Set: recognised (brief 1.3x flash, then fades). Reject: greyed and dissolving. */
export type InkPhase = 'idle' | 'live' | 'set' | 'reject';
export type RingKind = 'arm' | 'lock' | 'brake';

/** Pen speed (px/ms) at or below which the ink is widest, and at or above which it is thinnest. */
export const INK_SPEED_SLOW = 0.1, INK_SPEED_FAST = 1.5;
/** How long a recognised stroke stays after its flash, ms (reduced motion uses RM_INK_FADE_MS for the whole fade). */
export const SET_FADE_MS = 250;
export const INK_SET_COLOR = '#c4f6ff', INK_REJECT_COLOR = '#8f9aa1', RING_COLOR = '#e9fbff', BRAKE_COLOR = '#ffd36b';
export const SPARKLE_MS = 420, SPARKLE_COUNT = 10, SPARKLE_REACH = 34;

const clamp01 = (v: number) => v < 0 ? 0 : v > 1 ? 1 : v;
const smooth = (v: number) => { const u = clamp01(v); return u * u * (3 - 2 * u); };

/** Stroke width in CSS px from pen speed: 10 px slow to 4 px fast, never increasing with speed. */
export function inkWidth(speed: number): number {
  if (!(speed > INK_SPEED_SLOW)) return INK_W_SLOW;
  const u = clamp01((speed - INK_SPEED_SLOW) / (INK_SPEED_FAST - INK_SPEED_SLOW));
  return INK_W_SLOW + (INK_W_FAST - INK_W_SLOW) * u;
}

/** Width eases between samples so a single fast sample does not notch the line. */
export function easeWidth(prev: number, next: number): number {
  return prev > 0 ? prev * 0.6 + next * 0.4 : next;
}

/** Taper along the visible stroke: u = 0 at its oldest visible end, 1 at the pen. Thin tail, full body. */
export function inkTaper(u: number): number {
  return 0.3 + 0.7 * smooth(u / 0.35);
}

/** Age fade of the screen ink: full for the first half of the tail window, then linear to 0. An infinite tail never fades. */
export function tailAlpha(ageMs: number, tailMs: number): number {
  if (!Number.isFinite(tailMs)) return 1;
  if (ageMs <= tailMs * 0.5) return 1;
  return clamp01((tailMs - ageMs) / (tailMs * 0.5));
}

/**
 * Brightness gain of the whole stroke by phase and time since the phase began (ms). A value above 1 is the recognition flash
 * (the renderer draws it in INK_SET_COLOR at full alpha); 0 means the stroke is gone.
 */
export function phaseGain(phase: InkPhase, sinceMs: number, reduced: boolean): number {
  if (phase === 'live') return 1;
  if (phase === 'idle') return 0;
  if (phase === 'reject') return clamp01(1 - sinceMs / (reduced ? RM_INK_FADE_MS : REJECT_MS));
  if (reduced) return clamp01(1 - sinceMs / RM_INK_FADE_MS);
  if (sinceMs < SET_MS) return SET_GAIN;
  return clamp01(1 - (sinceMs - SET_MS) / SET_FADE_MS);
}

export function inkColor(phase: InkPhase, gain: number): string {
  if (phase === 'reject') return INK_REJECT_COLOR;
  return gain > 1 ? INK_SET_COLOR : INK_COLOR;
}

/** Ring radius in CSS px: the arm ring breathes in as it arms, lock rings are tight, the brake ring is wide. */
export function ringRadius(kind: RingKind, progress: number): number {
  if (kind === 'brake') return 34;
  if (kind === 'lock') return 22;
  return 30 - 4 * smooth(progress);
}

/** Deterministic value in [0, 1) from a seed and an index (seeded randomness: the sparkle looks the same every replay). */
export function hash01(seed: number, i: number): number {
  let h = (seed * 374761393 + i * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Sparkle particle i at time since start (ms): writes x, y offsets (px) and alpha into out[0..2]. Returns false once done. */
export function sparkleAt(seed: number, i: number, sinceMs: number, out: Float32Array): boolean {
  const u = sinceMs / SPARKLE_MS;
  if (u >= 1 || u < 0) return false;
  const a = hash01(seed, i) * Math.PI * 2, reach = SPARKLE_REACH * (0.5 + 0.5 * hash01(seed, i + 101));
  const r = reach * (1 - (1 - u) * (1 - u));
  out[0] = Math.cos(a) * r; out[1] = Math.sin(a) * r; out[2] = 1 - u;
  return true;
}
