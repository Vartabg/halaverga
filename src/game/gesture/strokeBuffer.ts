// Preallocated stroke ring (spec 2.2). One Float32Array of STROKE_RING x (x, y, t - startT, cumulative arc); nothing allocates
// per push. Running values: arc, chord, bbox, travel, signed winding over >= 4 px segments. Windowed speeds are read on demand.
import { SPEED_WIN_LONG_MS, SPEED_WIN_SHORT_MS, STROKE_RING, WINDING_SEG } from './tuning';
import type { PointerKind, StrokeView } from './types';

const STRIDE = 4;
const DEG = 180 / Math.PI;
/** A turn sharper than this between two >= 4 px segments is a cusp (a reversal): it adds no winding, since its sign is
 * ambiguous near 180 deg and jitter would flip it. Real circles turn far less per segment, even at 30 Hz. */
export const WINDING_CUSP = 120 / DEG;

/** Wrap an angle difference to (-PI, PI]. */
export const wrapAngle = (a: number) => a - 2 * Math.PI * Math.floor((a + Math.PI) / (2 * Math.PI));

export class StrokeBuffer implements StrokeView {
  readonly size: number;
  private readonly d: Float32Array;
  private head = 0;
  private n = 0;
  private ax = 0; private ay = 0; private dir = 0; private hasDir = false;
  pointerId = -1;
  kind: PointerKind = 'touch';
  startX = 0; startY = 0; startT = 0;
  lastX = 0; lastY = 0; lastT = 0;
  arc = 0; travel = 0; winding = 0;
  minX = 0; minY = 0; maxX = 0; maxY = 0;

  constructor(size = STROKE_RING) {
    this.size = Math.max(2, size | 0);
    this.d = new Float32Array(this.size * STRIDE);
  }

  /** Start a stroke at the pointer-down sample. */
  begin(pointerId: number, kind: PointerKind, x: number, y: number, t: number): this {
    this.pointerId = pointerId; this.kind = kind;
    this.head = 0; this.n = 0;
    this.startX = this.lastX = this.ax = this.minX = this.maxX = x;
    this.startY = this.lastY = this.ay = this.minY = this.maxY = y;
    this.startT = this.lastT = t;
    this.arc = 0; this.travel = 0; this.winding = 0; this.hasDir = false; this.dir = 0;
    this.write(x, y, t);
    return this;
  }

  /** Drop the stroke (count becomes 0). */
  clear(): void { this.n = 0; this.head = 0; this.pointerId = -1; this.arc = this.travel = this.winding = 0; }

  /** Append a sample. Push the pointer-up sample too before classifying. Time never runs backwards. */
  push(x: number, y: number, t: number): void {
    if (this.n === 0) { this.begin(this.pointerId, this.kind, x, y, t); return; }
    if (!(t >= this.lastT)) t = this.lastT;
    this.arc += Math.hypot(x - this.lastX, y - this.lastY);
    this.travel = Math.max(this.travel, Math.hypot(x - this.startX, y - this.startY));
    if (x < this.minX) this.minX = x; else if (x > this.maxX) this.maxX = x;
    if (y < this.minY) this.minY = y; else if (y > this.maxY) this.maxY = y;
    const dx = x - this.ax, dy = y - this.ay;
    if (dx * dx + dy * dy >= WINDING_SEG * WINDING_SEG) {
      const dir = Math.atan2(dy, dx);
      const turn = wrapAngle(dir - this.dir);
      if (this.hasDir && Math.abs(turn) <= WINDING_CUSP) this.winding += turn * DEG;
      this.dir = dir; this.hasDir = true; this.ax = x; this.ay = y;
    }
    this.lastX = x; this.lastY = y; this.lastT = t;
    this.write(x, y, t);
  }

  private write(x: number, y: number, t: number): void {
    const o = this.head * STRIDE, d = this.d;
    d[o] = x; d[o + 1] = y; d[o + 2] = t - this.startT; d[o + 3] = this.arc;
    this.head = (this.head + 1) % this.size;
    if (this.n < this.size) this.n++;
  }

  private at(i: number): number { return ((this.head - this.n + i) % this.size + this.size) % this.size * STRIDE; }

  get count(): number { return this.n; }
  x(i: number): number { return this.d[this.at(i)]; }
  y(i: number): number { return this.d[this.at(i) + 1]; }
  t(i: number): number { return this.startT + this.d[this.at(i) + 2]; }
  /** Cumulative path length at sample i, px. */
  arcAt(i: number): number { return this.d[this.at(i) + 3]; }

  get chord(): number { return Math.hypot(this.lastX - this.startX, this.lastY - this.startY); }
  get straightness(): number { return this.arc > 1e-6 ? Math.min(1, this.chord / this.arc) : 1; }
  get duration(): number { return this.lastT - this.startT; }
  get speed60(): number { return this.speedOver(SPEED_WIN_SHORT_MS); }
  get speed150(): number { return this.speedOver(SPEED_WIN_LONG_MS); }

  /** Index of the oldest sample inside the trailing window of `ms`, never the last sample while two or more exist. */
  windowStart(ms: number): number {
    const last = this.n - 1;
    if (last <= 0) return 0;
    const from = this.lastT - ms;
    let i = last - 1;
    while (i > 0 && this.t(i - 1) >= from) i--;
    return i;
  }

  /** Path speed over the trailing window, px/ms. */
  speedOver(ms: number): number {
    const last = this.n - 1;
    if (last <= 0) return 0;
    const i = this.windowStart(ms);
    const span = this.lastT - this.t(i);
    return span > 1e-6 ? (this.arc - this.arcAt(i)) / span : 0;
  }
}

/** A fresh buffer (allocate once per surface, then begin/push/clear). */
export const createStrokeBuffer = (size = STROKE_RING) => new StrokeBuffer(size);
