// Conduct (spec 5), the pure motion model under conductScheme: screen samples (CSS px, ms) in; the steer centroid, the
// position-invariant stir tempo, the mid-stroke roll circle and the steering rates out. No DOM, no three.js, no allocation.
import type { Vec } from '../motion';
import type { AimFrame } from './types';
import { unproject } from './screenRay';
import {
  CIRCLE_CONDUCT_DEG, CIRCLE_CONDUCT_RATE, CIRCLE_R_MAX, CIRCLE_R_MIN, FLICK_MIN_PX, FLICK_SNAP_DEG, FLICK_SPEED, PX_PER_MM,
  ROLL_FREEZE_DEG, ROLL_SPARKLE_DEG, SPEED_WIN_LONG_MS, SPEED_WIN_SHORT_MS, STEER_DEADZONE_DEG, STEER_DEPTH, STEER_GAIN,
  STEER_PITCH_MAX, STEER_TAU, STEER_YAW_MAX, STIR_FULL_MMS, WINDING_SEG,
} from './tuning';

const DEG = Math.PI / 180;
const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
const wrap = (a: number) => (a > Math.PI ? a - 2 * Math.PI : a < -Math.PI ? a + 2 * Math.PI : a);
/** Model-local shaping (not spec thresholds): stir smoothing, stir-centre hand-off, run breaks. */
const STIR_TAU = 0.15, LOOP_CENTRE_DEG = 270, LOOP_R_MAX = 200, REVERSE_DEG = 90, GAP_S = 0.2, MIN_ARM_PX = 10;
const ROLL_CANDIDATE_DEG = 90, RATE_GRACE_MS = 250;

/** Signed winding run over >= 4 px segments. A loss of REVERSE_DEG against its own sense ends it. */
class Run {
  w = 0; arc = 0; peak = 0; sense = 0; t0 = 0;
  clear(t: number) { this.w = this.arc = this.peak = this.sense = 0; this.t0 = t; }
  /** Adds a turn of d degrees over len px; returns false when the run reversed (and restarted at t). */
  add(d: number, len: number, t: number): boolean {
    this.w += d; this.arc += len;
    if (!this.sense && Math.abs(this.w) >= 30) this.sense = Math.sign(this.w);
    const along = this.w * this.sense;
    if (along > this.peak) this.peak = along;
    if (this.sense && along < this.peak - REVERSE_DEG) { this.clear(t); return false; }
    return true;
  }
  radius() { const a = Math.abs(this.w) * DEG; return a > 1e-3 ? this.arc / a : Infinity; }
}

export class ConductMotion {
  /** Smoothed centroid (steer point on touch; the stir's pivot everywhere). */
  cx = 0; cy = 0;
  /** Signed tangential speed around the centroid, mm/s, smoothed (a stir keeps its sign, a sweep's jitter cancels). */
  stir = 0;
  /** Steering holds while a fast small circle is past ROLL_FREEZE_DEG. */
  frozen = false;
  /** One-shot events, consumed by the scheme: sparkle at 300 deg, roll +1 (CW, right) / -1 (CCW, left). */
  sparkle = false; roll = 0;
  private px = 0; private py = 0; private ax = 0; private ay = 0; private at = 0;
  private dir = NaN; private idle = 0; private tx = 0; private ty = 0; private candidate = false; private sparkled = false;
  private readonly loop = new Run(); private readonly spin = new Run();

  reset() { this.stir = 0; this.sparkle = false; this.roll = 0; this.clearRuns(0); }
  private clearRuns(t: number) {
    this.loop.clear(t); this.spin.clear(t); this.dir = NaN; this.frozen = this.candidate = this.sparkled = false;
  }
  /** A new contact (or cruise start) at (x, y): the centroid starts under the finger. */
  begin(x: number, y: number, t: number) {
    this.reset(); this.clearRuns(t); this.at = t; this.idle = 0;
    this.px = this.ax = this.cx = this.tx = x; this.py = this.ay = this.cy = this.ty = y;
  }
  /** Stir strength in [0, 1] (u* = f / 120 mm/s). */
  get stirLevel() { return clamp(Math.abs(this.stir) / STIR_FULL_MMS, 0, 1); }

  sample(x: number, y: number, t: number) {
    this.px = x; this.py = y;
    const dx = x - this.ax, dy = y - this.ay, len = Math.hypot(dx, dy);
    if (!this.loopActive()) { this.tx = x; this.ty = y; }
    if (len < WINDING_SEG) return;
    const dtMs = t - this.at, ang = Math.atan2(dy, dx);
    if (!(dtMs > 0) || dtMs > GAP_S * 1000) this.clearRuns(t);
    else if (this.dir === this.dir) this.turn(wrap(ang - this.dir) / DEG, len, t, ang);
    this.dir = ang; this.idle = 0;
    if (dtMs > 0 && dtMs <= GAP_S * 1000 && !this.candidate) {
      const rx = x - this.cx, ry = y - this.cy, r = Math.hypot(rx, ry);
      const f = r >= MIN_ARM_PX ? (rx * dy - ry * dx) / r / (dtMs / 1000) / PX_PER_MM : 0;
      this.stir += (f - this.stir) * (1 - Math.exp(-dtMs / 1000 / STIR_TAU));
    }
    this.ax = x; this.ay = y; this.at = t;
  }

  private turn(d: number, len: number, t: number, ang: number) {
    if (!this.loop.add(d, len, t)) this.spin.clear(t);
    else if (!this.spin.add(d, len, t)) this.sparkled = false;
    const s = this.spin, aw = Math.abs(s.w), el = t - s.t0;
    if (el > RATE_GRACE_MS && aw / (el / 1000) < CIRCLE_CONDUCT_RATE) { s.clear(t); this.sparkled = false; }
    const rate = aw / Math.max(el / 1000, 1e-3), r = s.radius();
    const fast = rate >= CIRCLE_CONDUCT_RATE && r >= CIRCLE_R_MIN && r <= CIRCLE_R_MAX;
    this.candidate = fast && aw >= ROLL_CANDIDATE_DEG;
    this.frozen = fast && aw >= ROLL_FREEZE_DEG;
    if (this.frozen && aw >= ROLL_SPARKLE_DEG && !this.sparkled) { this.sparkled = this.sparkle = true; }
    if (this.frozen && aw >= CIRCLE_CONDUCT_DEG) {
      this.roll = Math.sign(s.w); s.clear(t); this.frozen = this.candidate = this.sparkled = false;
    }
    if (this.loopActive()) {
      // A wound stir pivots on its own centre (osculating circle), so stirring does not drag the steer point around.
      const lr = this.loop.radius(), k = Math.sign(this.loop.w);
      this.tx = this.px - Math.sin(ang) * lr * k; this.ty = this.py + Math.cos(ang) * lr * k;
    } else { this.tx = this.px; this.ty = this.py; }
  }
  private loopActive() { return Math.abs(this.loop.w) >= LOOP_CENTRE_DEG && this.loop.radius() <= LOOP_R_MAX; }

  /** Once per physics step: the centroid eases (tau 0.3 s) toward its target; a rest ends the runs and bleeds the stir. */
  advance(dt: number) {
    this.idle += dt;
    if (this.idle > GAP_S && this.dir === this.dir) { this.clearRuns(this.at); this.tx = this.px; this.ty = this.py; }
    if (this.idle > GAP_S / 2) this.stir *= Math.exp(-dt / STIR_TAU);
    const k = 1 - Math.exp(-dt / STEER_TAU);
    this.cx += (this.tx - this.cx) * k; this.cy += (this.ty - this.cy) * k;
  }
}

const ray = { x: 0, y: 0, z: 0 };
/** Steering rates out: yaw (+ turns left, as runtime.yaw) and pitch (+ climbs), rad/s. */
export type SteerRates = { yaw: number; pitch: number };
const dead = (e: number) => { const a = Math.abs(e) - STEER_DEADZONE_DEG * DEG; return a > 0 ? Math.sign(e) * a : 0; };
/**
 * Casts the steer point and the view centre 30 m through the camera and compares them as seen from the hero, so a centred
 * finger never steers despite the camera sitting behind and above. err -> 2.5 x err (after the 4 deg deadzone), saturated.
 */
export function steerRates(f: AimFrame, sx: number, sy: number, hero: Vec, out: SteerRates): SteerRates {
  unproject(f, sx, sy, ray);
  const ax = f.origin.x + ray.x * STEER_DEPTH - hero.x, ay = f.origin.y + ray.y * STEER_DEPTH - hero.y;
  const az = f.origin.z + ray.z * STEER_DEPTH - hero.z;
  const bx = f.origin.x + f.dir.x * STEER_DEPTH - hero.x, by = f.origin.y + f.dir.y * STEER_DEPTH - hero.y;
  const bz = f.origin.z + f.dir.z * STEER_DEPTH - hero.z;
  const yawErr = wrap(Math.atan2(-ax, -az) - Math.atan2(-bx, -bz));
  const pitchErr = Math.atan2(ay, Math.hypot(ax, az)) - Math.atan2(by, Math.hypot(bx, bz));
  out.yaw = clamp(STEER_GAIN * dead(yawErr), -STEER_YAW_MAX, STEER_YAW_MAX);
  out.pitch = clamp(STEER_GAIN * dead(pitchErr), -STEER_PITCH_MAX, STEER_PITCH_MAX);
  return out;
}

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
