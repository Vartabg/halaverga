// Conduct (spec 5) feedback envelopes, split from conduct.ts: the offset Pulse (dash, roll sidestep) and the desktop HoverTrail
// flick detector. Pure, allocation-free after construction.
import type { Vec } from '../motion';
import { FLICK_MIN_PX, FLICK_SNAP_DEG, FLICK_SPEED, SPEED_WIN_LONG_MS, SPEED_WIN_SHORT_MS } from './tuning';

/**
 * One offset envelope along a fixed unit direction: 'hann' (peak * sin^2, the dash) or 'sine' (peak * sin, the roll sidestep,
 * integral 2 * peak * T / PI). Both start and end at 0 velocity; their largest derivative is peak * PI / T.
 */
export class Pulse {
  t = 0; dur = 0; peak = 0; x = 0; y = 0; z = 0; hann = true;
  get active() { return this.t < this.dur; }
  start(x: number, y: number, z: number, peak: number, dur: number, hann: boolean) {
    const l = Math.hypot(x, y, z) || 1;
    this.x = x / l; this.y = y / l; this.z = z / l; this.peak = peak; this.dur = dur; this.hann = hann; this.t = 0;
  }
  stop() { this.t = this.dur = 0; }
  /** Advances by dt and adds the current velocity into out. */
  add(dt: number, out: Vec, scale = 1) {
    if (!this.active) return;
    this.t = Math.min(this.dur, this.t + dt);
    const s = Math.sin(Math.PI * this.t / this.dur), v = this.peak * (this.hann ? s * s : s) * scale;
    out.x += this.x * v; out.y += this.y * v; out.z += this.z * v;
  }
}

const TRAIL_N = 16;
/**
 * Desktop hover history for the flick (spec 5: flicks work on hover motion, with their own gain). A burst fires once: speed over
 * the last 60 ms >= 0.9 px/ms and travel over 150 ms >= 40 px (both gain-scaled), within 10 deg of a cardinal; it re-arms
 * when the pointer slows below half that speed.
 */
export class HoverTrail {
  /** Cardinal of the last flick in world terms: dx +1 = right, dy +1 = up. */
  dx = 0; dy = 0;
  private readonly buf = new Float64Array(TRAIL_N * 3);
  private n = 0; private head = -1; private armed = true;
  reset() { this.n = 0; this.head = -1; this.armed = true; }
  push(x: number, y: number, t: number) {
    this.head = (this.head + 1) % TRAIL_N; this.n = Math.min(TRAIL_N, this.n + 1);
    const b = this.buf, h = this.head * 3; b[h] = x; b[h + 1] = y; b[h + 2] = t;
  }
  /** The release speed (px/ms, gain-scaled) when this sample completes a flick, else 0. */
  flick(gain: number): number {
    const b = this.buf, h = this.head * 3, t = b[h + 2];
    let i60 = -1, i150 = -1;
    for (let k = 1; k < this.n; k++) {
      const j = ((this.head - k) % TRAIL_N + TRAIL_N) % TRAIL_N * 3, age = t - b[j + 2];
      if (i60 < 0 && age >= SPEED_WIN_SHORT_MS) i60 = j;
      if (age >= SPEED_WIN_LONG_MS) { i150 = j; break; }
    }
    if (i60 < 0) return 0;
    const dx = (b[h] - b[i60]) * gain, dy = (b[h + 1] - b[i60 + 1]) * gain, o = i150 < 0 ? i60 : i150;
    const sp = Math.hypot(dx, dy) / Math.max(1, t - b[i60 + 2]);
    const travel = Math.hypot(b[h] - b[o], b[h + 1] - b[o + 1]) * gain;
    if (sp < FLICK_SPEED / 2) { this.armed = true; return 0; }
    if (!this.armed || sp < FLICK_SPEED || travel < FLICK_MIN_PX) return 0;
    const a = Math.atan2(-dy, dx) / (Math.PI / 2), q = Math.round(a);
    if (Math.abs(a - q) * 90 > FLICK_SNAP_DEG) return 0;
    this.armed = false;
    const c = ((q % 4) + 4) % 4;
    this.dx = c === 0 ? 1 : c === 2 ? -1 : 0; this.dy = c === 1 ? 1 : c === 3 ? -1 : 0;
    return sp;
  }
}
