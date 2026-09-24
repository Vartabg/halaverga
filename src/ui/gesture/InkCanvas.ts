// Gesture Lab screen ink (spec 7 and 10) over a fixed, pointer-events:none, aria-hidden 2D canvas that GestureSurface renders.
// Tapered ink is drawn in the pointer handler (flush), predicted points extend it faintly, and the screen tail is 150 ms by
// default (older ink is left to the world ribbon). Also arm, lock and brake-fill rings and a seeded sparkle. The rAF runs only
// while something animates; static ink and rings stay on the canvas until the next change. Nothing allocates per frame.
import { INK_DPR_MAX, INK_WORLD_MS, INK_W_SLOW } from '@/game/gesture/tuning';
import { BRAKE_COLOR, easeWidth, inkColor, inkTaper, inkWidth, phaseGain, RING_COLOR, ringRadius, SPARKLE_COUNT, SPARKLE_MS,
  sparkleAt, tailAlpha, type InkPhase, type RingKind } from './inkStyle';

const CAP = 256, PRED = 4, RINGS = 5; // ring slots: 0 arm, 1 brake, 2..4 lock
const TAU = Math.PI * 2;

export class InkCanvas {
  /** Screen-ink tail in ms: INK_WORLD_MS where a world ribbon takes over (Draw); Infinity keeps the whole stroke (Brush). */
  tailMs = INK_WORLD_MS;
  reduced = false;
  private readonly ctx: CanvasRenderingContext2D | null;
  private readonly pts = new Float32Array(CAP * 4); // x, y, t, width
  private readonly pred = new Float32Array(PRED * 2);
  private readonly rings = new Float32Array(RINGS * 3); // x, y, progress (0 = hidden)
  private readonly spark = new Float32Array(3); // x, y, start ms
  private readonly scratch = new Float32Array(3);
  private head = 0; private count = 0; private predN = 0; private seed = 1;
  private phase: InkPhase = 'idle'; private phaseT = 0;
  private raf = 0; private dpr = 1; private w = 0; private h = 0; private lost = false;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d');
    this.spark[2] = -Infinity;
    window.addEventListener('resize', this.resize);
    canvas.addEventListener('contextlost', this.onLost);
    canvas.addEventListener('contextrestored', this.onRestored);
    this.resize();
  }
  readonly resize = () => {
    this.dpr = Math.min(window.devicePixelRatio || 1, INK_DPR_MAX);
    this.w = window.innerWidth; this.h = window.innerHeight;
    this.canvas.width = Math.round(this.w * this.dpr); this.canvas.height = Math.round(this.h * this.dpr);
    this.ctx?.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.flush();
  };
  begin(x: number, y: number, t: number) {
    this.head = this.count = this.predN = 0; this.phase = 'live';
    this.push(x, y, t, INK_W_SLOW);
  }
  point(x: number, y: number, t: number) {
    if (this.phase !== 'live') return;
    this.predN = 0;
    if (this.count === 0) { this.push(x, y, t, INK_W_SLOW); return; }
    const j = this.at(this.count - 1) * 4, p = this.pts, dt = Math.max(1, t - p[j + 2]);
    this.push(x, y, t, easeWidth(p[j + 3], inkWidth(Math.hypot(x - p[j], y - p[j + 1]) / dt)));
  }
  /** Predicted pointer positions (getPredictedEvents): drawn faintly past the pen, replaced by the next point. */
  predict(x: number, y: number) {
    if (this.phase !== 'live' || this.predN >= PRED) return;
    this.pred[this.predN * 2] = x; this.pred[this.predN * 2 + 1] = y; this.predN++;
  }
  /** Recognised ('set': a brief flash, then fade) or rejected (grey, dissolving). */
  end(kind: 'set' | 'reject') {
    if (this.phase !== 'live') return;
    this.phase = kind; this.phaseT = performance.now(); this.predN = 0; this.schedule();
  }
  /** Dropped with no command: the ink clears at once. */
  cancel() { this.phase = 'idle'; this.count = this.predN = 0; this.schedule(); }
  /** progress 0 hides the ring; lock rings take index 0..2. */
  ring(kind: RingKind, x: number, y: number, progress: number, index = 0) {
    const k = (kind === 'arm' ? 0 : kind === 'brake' ? 1 : 2 + Math.min(Math.max(index, 0), 2)) * 3;
    this.rings[k] = x; this.rings[k + 1] = y; this.rings[k + 2] = Math.max(0, Math.min(1, progress));
    this.schedule();
  }
  clearRings() { for (let i = 0; i < RINGS; i++) this.rings[i * 3 + 2] = 0; this.schedule(); }
  sparkle(x: number, y: number) {
    if (this.reduced) return;
    this.spark[0] = x; this.spark[1] = y; this.spark[2] = performance.now(); this.seed++; this.schedule();
  }
  /** Draws now (call at the end of each pointer handler) and keeps the rAF going only while something animates. */
  flush() { if (this.render(performance.now())) this.schedule(); }
  destroy() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    window.removeEventListener('resize', this.resize);
    this.canvas.removeEventListener('contextlost', this.onLost);
    this.canvas.removeEventListener('contextrestored', this.onRestored);
    this.ctx?.clearRect(0, 0, this.w, this.h);
  }

  private readonly onLost = (e: Event) => { e.preventDefault(); this.lost = true; if (this.raf) cancelAnimationFrame(this.raf); this.raf = 0; };
  private readonly onRestored = () => { this.lost = false; this.resize(); };
  private readonly frame = () => { this.raf = 0; if (this.render(performance.now())) this.schedule(); };
  private schedule() { if (!this.raf && !this.lost) this.raf = requestAnimationFrame(this.frame); }
  private at(i: number) { return (this.head + i) % CAP; }
  private push(x: number, y: number, t: number, w: number) {
    let j: number;
    if (this.count < CAP) j = this.at(this.count++); else { j = this.head; this.head = (this.head + 1) % CAP; }
    const p = this.pts, o = j * 4;
    p[o] = x; p[o + 1] = y; p[o + 2] = t; p[o + 3] = w;
  }
  /** Returns true while another frame is needed (a fading tail or phase, the sparkle). */
  private render(now: number): boolean {
    const c = this.ctx;
    if (!c || this.lost) return false;
    c.clearRect(0, 0, this.w, this.h);
    const ink = this.drawInk(c, now), rings = this.drawRings(c), spark = this.drawSparkle(c, now);
    c.globalAlpha = 1;
    return ink || rings || spark;
  }
  private drawInk(c: CanvasRenderingContext2D, now: number): boolean {
    if (this.phase === 'idle' || this.count === 0) return false;
    const gain = phaseGain(this.phase, now - this.phaseT, this.reduced);
    if (gain <= 0) { this.phase = 'idle'; this.count = 0; return false; }
    // After release the tail freezes at the release time and the whole stroke fades by phase.
    const live = this.phase === 'live', ref = live ? now : this.phaseT, tail = this.tailMs, p = this.pts;
    let first = 0;
    while (first < this.count && ref - p[this.at(first) * 4 + 2] >= tail) first++;
    const n = this.count - first;
    if (n <= 0) return false;
    c.strokeStyle = c.fillStyle = inkColor(this.phase, gain); c.lineCap = 'round';
    const base = Math.min(1, gain);
    if (n === 1) {
      const o = this.at(first) * 4;
      c.globalAlpha = base; c.beginPath(); c.arc(p[o], p[o + 1], p[o + 3] / 2, 0, TAU); c.fill();
    }
    for (let i = first + 1; i < this.count; i++) {
      const a = this.at(i - 1) * 4, b = this.at(i) * 4, u = (i - first) / (n - 1);
      c.globalAlpha = base * tailAlpha(ref - p[b + 2], tail);
      c.lineWidth = p[b + 3] * inkTaper(u);
      c.beginPath(); c.moveTo(p[a], p[a + 1]); c.lineTo(p[b], p[b + 1]); c.stroke();
    }
    if (live && this.predN > 0) {
      const o = this.at(this.count - 1) * 4;
      c.globalAlpha = 0.35; c.lineWidth = p[o + 3];
      c.beginPath(); c.moveTo(p[o], p[o + 1]);
      for (let i = 0; i < this.predN; i++) c.lineTo(this.pred[i * 2], this.pred[i * 2 + 1]);
      c.stroke();
    }
    return !live || Number.isFinite(tail);
  }
  private drawRings(c: CanvasRenderingContext2D): boolean {
    const r = this.rings;
    for (let i = 0; i < RINGS; i++) {
      const o = i * 3, prog = r[o + 2];
      if (prog <= 0) continue;
      const kind: RingKind = i === 0 ? 'arm' : i === 1 ? 'brake' : 'lock', rad = ringRadius(kind, prog);
      c.globalAlpha = kind === 'brake' ? 0.35 : 0.9; c.strokeStyle = RING_COLOR; c.lineWidth = 2;
      c.beginPath(); c.arc(r[o], r[o + 1], rad, 0, TAU); c.stroke();
      if (kind === 'lock') { c.beginPath(); c.arc(r[o], r[o + 1], rad - 5, 0, TAU); c.stroke(); }
      if (kind === 'brake') {
        c.globalAlpha = 1; c.strokeStyle = BRAKE_COLOR; c.lineWidth = 4;
        c.beginPath(); c.arc(r[o], r[o + 1], rad, -Math.PI / 2, -Math.PI / 2 + TAU * prog); c.stroke();
      }
    }
    return false;
  }
  private drawSparkle(c: CanvasRenderingContext2D, now: number): boolean {
    const since = now - this.spark[2];
    if (!(since < SPARKLE_MS)) return false;
    c.fillStyle = RING_COLOR;
    for (let i = 0; i < SPARKLE_COUNT; i++) {
      if (!sparkleAt(this.seed, i, since, this.scratch)) continue;
      c.globalAlpha = this.scratch[2];
      c.fillRect(this.spark[0] + this.scratch[0] - 1.5, this.spark[1] + this.scratch[1] - 1.5, 3, 3);
    }
    return true;
  }
}
