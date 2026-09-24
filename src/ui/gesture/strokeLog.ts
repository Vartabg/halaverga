// Gesture Lab stroke log (spec 11): a ring of the last STROKE_LOG_CAP raw strokes and their class, exported as JSON so a real
// stroke can become a test fixture. Slots and their sample arrays are reused, so a steady stream of strokes stops allocating.
// Also instrumentScheme: the wrapper that feeds finished strokes into this log and the lab stats. Local only.
import { STROKE_LOG_CAP } from '@/game/gesture/tuning';
import type { Cardinal, PointerKind, Scheme, StrokeClass, StrokeKind, StrokeView } from '@/game/gesture/types';
import type { LabId } from './labStats';

export interface LoggedStroke {
  scheme: LabId; pointer: PointerKind;
  /** performance.now ms of the first kept sample. */
  at: number;
  kind: StrokeKind; dir: Cardinal | null; angle: number; magnitude: number; winding: number; speed: number;
  /** Sample count and the packed samples: x, y (CSS px) and t (ms after `at`). */
  n: number; xyt: Float32Array;
}
export interface StrokeLog {
  readonly size: number;
  readonly cap: number;
  push(scheme: LabId, s: StrokeView, c: StrokeClass | null): void;
  /** 0 is the oldest kept stroke. */
  at(i: number): LoggedStroke | undefined;
  clear(): void;
  exportJson(): string;
}

const round = (v: number) => Math.round(v * 10) / 10;

export function createStrokeLog(cap = STROKE_LOG_CAP): StrokeLog {
  const slots: LoggedStroke[] = [];
  let head = 0, size = 0; // head = the slot the next push writes
  const at = (i: number) => i < 0 || i >= size ? undefined : slots[(head - size + i + cap) % cap];
  return {
    get size() { return size; },
    cap,
    push(scheme, s, c) {
      let e = slots[head];
      if (!e) e = slots[head] = { scheme, pointer: s.kind, at: 0, kind: 'none', dir: null, angle: 0, magnitude: 0, winding: 0, speed: 0,
        n: 0, xyt: new Float32Array(Math.max(96, s.count * 3)) };
      if (e.xyt.length < s.count * 3) e.xyt = new Float32Array(s.count * 3);
      const n = s.count, t0 = n ? s.t(0) : s.startT;
      for (let i = 0; i < n; i++) { e.xyt[i * 3] = s.x(i); e.xyt[i * 3 + 1] = s.y(i); e.xyt[i * 3 + 2] = s.t(i) - t0; }
      e.scheme = scheme; e.pointer = s.kind; e.at = t0; e.n = n;
      e.kind = c?.kind ?? 'none'; e.dir = c?.dir ?? null; e.angle = c?.angle ?? 0; e.magnitude = c?.magnitude ?? 0;
      e.winding = c?.winding ?? s.winding; e.speed = c?.speed ?? s.speed60;
      head = (head + 1) % cap; size = Math.min(cap, size + 1);
    },
    at,
    clear() { head = 0; size = 0; },
    exportJson() {
      const strokes = [];
      for (let i = 0; i < size; i++) {
        const e = at(i)!, points: number[][] = [];
        for (let j = 0; j < e.n; j++) points.push([round(e.xyt[j * 3]), round(e.xyt[j * 3 + 1]), round(e.xyt[j * 3 + 2])]);
        strokes.push({ scheme: e.scheme, pointer: e.pointer, at: Math.round(e.at), kind: e.kind, dir: e.dir, angle: round(e.angle),
          magnitude: round(e.magnitude), winding: round(e.winding), speed: Math.round(e.speed * 1000) / 1000, points });
      }
      return JSON.stringify({ v: 1, format: 'halaverga-strokes', units: { xy: 'css-px', t: 'ms' }, strokes });
    },
  };
}

/** The lab's shared log (TestPanel exports it). */
export const strokeLog = createStrokeLog();

/** Rejected strokes: the recogniser found nothing (the 30% chord nudge). */
export const rejectedKind = (k: StrokeKind) => k === 'none' || k === 'nudge';

export interface StrokeHooks {
  log: StrokeLog;
  /** Stats sink: a finished non-tap stroke, recognised or not, with its latency in ms. */
  stroke(kind: StrokeKind, ok: boolean, latencyMs: number): void;
  now(): number;
}
/**
 * Wraps a scheme so each finished stroke is logged and counted before the scheme sees it. Taps are logged but not counted as
 * gestures (the frame probe counts blast taps). Every other call passes straight through.
 */
export function instrumentScheme(inner: Scheme, id: LabId, hooks: StrokeHooks): Scheme {
  const wrapped: Scheme = {
    id: inner.id,
    down: s => inner.down(s),
    move: s => inner.move(s),
    up(s, c) {
      hooks.log.push(id, s, c);
      if (c.kind !== 'tap') hooks.stroke(c.kind, !rejectedKind(c.kind), Math.max(0, hooks.now() - s.lastT));
      inner.up(s, c);
    },
    cancel: () => inner.cancel(),
    step: (dt, pos, ctx) => inner.step(dt, pos, ctx),
    reset: () => inner.reset(),
    fallback: a => inner.fallback(a),
  };
  if (inner.hover) wrapped.hover = (x, y, t) => inner.hover!(x, y, t);
  // Scheme extras (Conduct's handle and state, Brush's hold and view, Draw's flyToMode and path) stay reachable through the
  // wrapper: methods are bound once here, every other field reads and writes through to the scheme.
  const src = inner as unknown as Record<string, unknown>;
  for (const k of Object.keys(src)) {
    if (k in wrapped) continue;
    const v = src[k];
    Object.defineProperty(wrapped, k, typeof v === 'function' ? { value: v.bind(inner), enumerable: true }
      : { get: () => src[k], set: (next: unknown) => { src[k] = next; }, enumerable: true });
  }
  return wrapped;
}
