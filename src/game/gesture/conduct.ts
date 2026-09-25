// Conduct (spec 5), the pure motion model under conductScheme: screen samples (CSS px, ms) in; the steer centroid, the
// position-invariant stir tempo, the mid-stroke roll circle and the steering rates out. No DOM, no three.js, no allocation.
import type { Vec } from '../motion';
import type { AimFrame } from './types';
import { unproject } from './screenRay';
import {
  CIRCLE_CONDUCT_DEG, CIRCLE_CONDUCT_RATE, CIRCLE_R_MAX, CIRCLE_R_MIN, PX_PER_MM, ROLL_FREEZE_DEG, ROLL_SPARKLE_DEG,
  STEER_DEADZONE_DEG, STEER_DEPTH, STEER_GAIN, STEER_PITCH_MAX, STEER_TAU, STEER_YAW_MAX, STIR_FULL_MMS, WINDING_SEG,
} from './tuning';
export { HoverTrail, Pulse } from './conductFx';

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
 * Pitch is position control, not rate control: the pitch goal follows the steer point's vertical offset from the view centre
 * beyond a PITCH_DEAD band (a fraction of the height; phone landscape is only ~390 px tall, so a 4 deg deadzone was always
 * exceeded and pitch drifted to the clamp), up to +-PITCH_REACH around PITCH_REST at PITCH_FULL. The view eases there, so a
 * resting finger holds a pitch instead of winding it up. With no steer point the view levels back to PITCH_REST.
 */
export const PITCH_REST = -0.12, PITCH_REACH = 0.6, PITCH_DEAD = 0.12, PITCH_FULL = 0.45, PITCH_EASE = 2.5;
/** Desktop yaw: dead within DESK_DEAD of the width around the centre, up to DESK_YAW_MAX rad/s at DESK_FULL (fractions of width). */
export const DESK_DEAD = 0.08, DESK_FULL = 0.42, DESK_YAW_MAX = 0.8;
const band = (off: number, dead: number, full: number) => { const a = Math.abs(off) - dead; return a > 0 ? Math.sign(off) * Math.min(1, a / (full - dead)) : 0; };
/** Pitch rate (+ climbs) easing viewPitch toward the goal for screen y; y NaN levels toward PITCH_REST. */
export function pitchRate(f: AimFrame, sy: number, viewPitch: number): number {
  const goal = sy === sy && f.height > 0 ? PITCH_REST - PITCH_REACH * band((sy - f.top - f.height / 2) / f.height, PITCH_DEAD, PITCH_FULL) : PITCH_REST;
  return clamp(PITCH_EASE * (goal - viewPitch), -STEER_PITCH_MAX, STEER_PITCH_MAX);
}
/** Desktop yaw rate (+ turns left) from the pointer's horizontal offset: a steady turn, never a spin in place. */
export const deskYaw = (f: AimFrame, sx: number) => (f.width > 0 ? 0 - DESK_YAW_MAX * band((sx - f.left - f.width / 2) / f.width, DESK_DEAD, DESK_FULL) : 0);
