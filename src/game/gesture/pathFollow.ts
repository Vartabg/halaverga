// Draw the flight, following (spec 4.5): pure pursuit along the drawn ring, the speed profile under the curvature cap and the
// ACCEL ramp, the four aborts to a glide, the rooftop hand-off and the exit decay. Writes only the gesture bus (velocity,
// rates, facing, spin, offset, request, landArmed). Pure: no three.js, no Rapier, no store; nothing allocates per step.
import { FOOT, type Vec } from '../motion';
import { gesture, LIFT_REQUEST } from './bus';
import type { DrawPath } from './drawPath';
import type { GestureCtx } from './types';
import { ABORT_CLEAR_S, ABORT_DEV_M, ABORT_DEV_S, ABORT_SLOW_FRAC, ABORT_SLOW_S, ACCEL, CURVE_K, DASH_S, DRAW_EASE_CAP, DRAW_LAG_M,
  DRAW_MAX_PTS, DRAW_PITCH_K, DRAW_PITCH_MAX, DRAW_PITCH_MIN, EXIT_DECAY_S, EXIT_SPEED, FOLLOW_BASE, FOLLOW_LOOKAHEAD_K,
  FOLLOW_LOOKAHEAD_MIN, HEADING_EASE, LAND_HANDOFF_M, OFFSET_JERK, SURGE_SPEED, WRAP_HEADING_EASE, YAW_GAIN_WRAP } from './tuning';

export type AbortReason = 'none' | 'deviation' | 'clearance' | 'slow' | 'override' | 'scrub' | 'cancel' | 'brake';
export const PATH_BLOCKED = 'Path blocked';
/** The view the heading easing reads (runtime satisfies it). */
export interface FollowView { readonly yaw: number; readonly pitch: number }
export const IDLE = 0, FOLLOW = 1, EXIT = 2, LANDING = 3;

const N = DRAW_MAX_PTS, YAW_GAIN = 4, PITCH_GAIN = 3, END_M = 0.5, PEN_TAU = 0.1, CAP_WINDOW = 24;
/** Curves are anticipated at 0.6 ACCEL, leaving ramp budget for the turn itself (sqrt(25^2 + 33.6^2) < 42). */
const BRAKE = 0.6 * ACCEL;
/** Grounded when the ground is this close below the body centre (only then is a lift requested). */
const GROUNDED_M = FOOT + 0.1;
/** Largest nudge: a raised-cosine offset over DASH_S peaks at 2 pi D / T^2, which stays under OFFSET_JERK. */
const NUDGE_MAX_M = OFFSET_JERK * DASH_S * DASH_S / (2 * Math.PI);
const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

export class PathFollow {
  mode = IDLE;
  /** Arc position of the hero on the path; it only moves forward. */
  s = 0; seg = 0;
  lastAbort: AbortReason = 'none';
  /** The commanded velocity (what gesture.velocity carries while velocityOn). */
  readonly vcmd = { x: 0, y: 0, z: 0 };
  private devT = 0; private clearT = 0; private slowT = 0; private exitT = 0; private exitV0 = 0;
  private penSpeed = 0; private lastEnd = 0; private gapOpen = false; private landTried = false; private liftChecked = false;
  private blockedSaid = false;
  private nudgeT = DASH_S; private readonly nudge = { x: 0, y: 0, z: 0 };
  private readonly exitDir = { x: 0, y: 0, z: -1 }; private readonly p = { x: 0, y: 0, z: 0 }; private readonly t = { x: 0, y: 0, z: 0 };
  private readonly landReq = { kind: 'land' as const, x: 0, y: 0, z: 0 };
  constructor(readonly path: DrawPath, private readonly view: FollowView) {}

  /** A new path (stroke or fly-to) starts at the hero, keeping the current velocity: chained strokes never stop. */
  start(vel: Vec) {
    this.mode = FOLLOW; this.s = 0; this.seg = this.path.ring.first; this.lastAbort = 'none';
    this.vcmd.x = vel.x; this.vcmd.y = vel.y; this.vcmd.z = vel.z;
    this.devT = this.clearT = this.slowT = 0; this.lastEnd = this.path.ring.endArc;
    this.penSpeed = Math.hypot(vel.x, vel.y, vel.z); this.gapOpen = this.landTried = this.liftChecked = this.blockedSaid = false;
    gesture.landArmed = false;
  }
  /** Abort to a glide (exit decay); the rest of this path takes no more ink. */
  abort(reason: AbortReason) {
    if (this.mode !== FOLLOW) return;
    this.lastAbort = reason; this.path.dead = true; this.path.inking = false; this.enterExit();
  }
  /** Stop now and hand the velocity back (override, brake): no glide. */
  cancel(reason: AbortReason) {
    if (this.mode === FOLLOW || this.mode === EXIT) this.lastAbort = reason;
    this.mode = IDLE; this.path.dead = true; this.path.inking = false; this.idle();
  }
  /** A stroke that turned out to be a nudge: forget the path without a glide or an abort. */
  drop() { this.mode = IDLE; this.path.reset(); this.idle(); }
  reset() { this.mode = IDLE; this.lastAbort = 'none'; this.nudgeT = DASH_S; this.idle(); gesture.offset.x = gesture.offset.y = gesture.offset.z = 0; }
  /** The failed-tap chord nudge: a raised-cosine offset envelope over DASH_S that integrates to (dx, dy, dz), capped. */
  nudgeBy(dx: number, dy: number, dz: number) {
    const l = Math.hypot(dx, dy, dz), k = l > NUDGE_MAX_M ? NUDGE_MAX_M / l : 1;
    this.nudge.x = dx * k; this.nudge.y = dy * k; this.nudge.z = dz * k; this.nudgeT = 0;
  }

  step(dt: number, pos: Vec, vel: Vec, ctx: GestureCtx, clearance = false) {
    if (gesture.override) { if (this.mode !== IDLE) this.cancel('override'); this.nudgeT = DASH_S; }
    this.stepNudge(dt);
    if (this.mode === LANDING) { if (!gesture.landArmed) this.enterExit(); else this.idle(); }
    if (this.mode === EXIT) this.stepExit(dt);
    else if (this.mode === FOLLOW) this.stepFollow(dt, pos, vel, ctx, clearance);
  }

  private stepFollow(dt: number, pos: Vec, vel: Vec, ctx: GestureCtx, clearance: boolean) {
    const path = this.path, rg = path.ring, end = rg.endArc, inking = path.inking, v = this.vcmd;
    if (!this.liftChecked) { this.liftChecked = true; if (ctx.groundBelow(pos) < GROUNDED_M) gesture.request = LIFT_REQUEST; }
    if (path.blocked && !this.blockedSaid) { this.blockedSaid = true; ctx.say(PATH_BLOCKED); }
    this.penSpeed += ((end - this.lastEnd) / Math.max(dt, 1e-6) - this.penSpeed) * Math.min(1, dt / PEN_TAU);
    this.lastEnd = end;
    // Projection onto segments [seg, seg + 3]: s only moves forward, and never past (drawn arc - lag) while inking.
    let dev = 0;
    if (rg.count >= 2) {
      let best = Infinity, bestS = this.s;
      for (let i = Math.max(this.seg, rg.first); i <= Math.min(this.seg + 3, rg.count - 2); i++) {
        const a = i % N, b = (i + 1) % N, ex = rg.x[b] - rg.x[a], ey = rg.y[b] - rg.y[a], ez = rg.z[b] - rg.z[a];
        const l2 = ex * ex + ey * ey + ez * ez, u = l2 > 1e-9 ? clamp(((pos.x - rg.x[a]) * ex + (pos.y - rg.y[a]) * ey + (pos.z - rg.z[a]) * ez) / l2, 0, 1) : 0;
        const d = Math.hypot(rg.x[a] + ex * u - pos.x, rg.y[a] + ey * u - pos.y, rg.z[a] + ez * u - pos.z);
        if (d < best) { best = d; bestS = rg.arc[a] + u * Math.sqrt(l2); }
      }
      dev = best;
      this.s = Math.max(this.s, inking ? Math.min(bestS, end - DRAW_LAG_M) : bestS);
      while (this.seg + 1 < rg.count - 1 && rg.arcOf(this.seg + 1) <= this.s) this.seg++;
      path.keepFrom = this.seg;
    }
    // Aborts: a tap to blast never aborts; the slow abort waits while a landing is armed.
    const prev = Math.hypot(v.x, v.y, v.z), speed = Math.hypot(vel.x, vel.y, vel.z);
    this.devT = dev > ABORT_DEV_M ? this.devT + dt : 0;
    this.clearT = clearance ? this.clearT + dt : 0;
    this.slowT = prev > 2 && speed < ABORT_SLOW_FRAC * prev && !gesture.landArmed ? this.slowT + dt : 0;
    if (this.devT > ABORT_DEV_S) { this.abort('deviation'); return; }
    if (this.clearT > ABORT_CLEAR_S) { this.abort('clearance'); return; }
    if (this.slowT > ABORT_SLOW_S) { ctx.say(PATH_BLOCKED); this.abort('slow'); return; }
    if (!inking && !path.pendingEnd && this.handoff(pos, ctx)) return;
    if (!inking && !path.pendingEnd && this.s >= end - END_M) { if (path.blocked) this.cancel('none'); else this.enterExit(); return; }
    // Speed: profile x base, under the curvature cap (braking-distance aware), SURGE and the ink / end caps.
    const gap = end - DRAW_LAG_M - this.s;
    if (gap > 0) this.gapOpen = true;
    let cap = SURGE_SPEED;
    const horizon = this.s + prev * prev / (2 * BRAKE) + FOLLOW_LOOKAHEAD_MIN;
    for (let i = this.seg; i < rg.count && i < this.seg + CAP_WINDOW; i++) {
      const ai = rg.arcOf(i);
      if (ai > horizon && i > this.seg) break;
      cap = Math.min(cap, Math.sqrt(CURVE_K * rg.radius[i % N] + 2 * BRAKE * Math.max(0, ai - this.s)));
    }
    if (inking && this.gapOpen) cap = Math.min(cap, Math.max(0, this.penSpeed) + Math.sqrt(2 * ACCEL * Math.max(0, gap)));
    if (!inking && path.blocked) cap = Math.min(cap, Math.sqrt(2 * ACCEL * Math.max(0, end - this.s)));
    let target = Math.min(FOLLOW_BASE * rg.factor[this.seg % N], cap);
    // Pure pursuit toward the look-ahead point; with nothing drawn ahead yet, hold the current heading and speed.
    const q = this.p, dir = this.t;
    rg.at(Math.min(this.s + Math.max(FOLLOW_LOOKAHEAD_MIN, FOLLOW_LOOKAHEAD_K * prev), end), this.seg, q);
    let dx = q.x - pos.x, dy = q.y - pos.y, dz = q.z - pos.z, dl = Math.hypot(dx, dy, dz);
    if (end - this.s < 1 || dl < 0.3 || (!this.gapOpen && inking)) {
      if (prev < 1e-6) { dx = dy = dz = 0; dl = 1; target = 0; } else { dx = v.x; dy = v.y; dz = v.z; dl = prev; target = Math.min(prev, cap); }
    }
    dir.x = dx / dl; dir.y = dy / dl; dir.z = dz / dl;
    // The ACCEL ramp, speed first: shed what the cap demands along v, then turn toward the target with the budget left.
    let budget = ACCEL * dt;
    if (prev > cap) { const k = cap / prev; v.x *= k; v.y *= k; v.z *= k; budget = Math.max(0, budget - (prev - cap)); }
    let cx = dir.x * target - v.x, cy = dir.y * target - v.y, cz = dir.z * target - v.z;
    const cl = Math.hypot(cx, cy, cz);
    if (cl > budget) { cx *= budget / cl; cy *= budget / cl; cz *= budget / cl; }
    v.x += cx; v.y += cy; v.z += cz;
    const sp = Math.hypot(v.x, v.y, v.z);
    // Hard stop at the lag point while inking (the pen paused): never fly past (drawn arc - lag).
    if (inking && this.gapOpen && sp * dt > Math.max(0, gap)) { const k = Math.max(0, gap) / dt / sp; v.x *= k; v.y *= k; v.z *= k; }
    this.out(true, inking);
    if (inking && !path.wrapping) { gesture.yawRate = gesture.pitchRate = 0; } else if (rg.tangent(this.seg, dir)) this.ease(dir);
    gesture.spin = rg.spinAt(this.s);
  }

  /** Within LAND_HANDOFF_M of a landable end: canLand && pathClear arms the landing and requests it (surface point). */
  private handoff(pos: Vec, ctx: GestureCtx): boolean {
    const path = this.path;
    if (!path.wantsLand || this.landTried) return false;
    const e = path.ring.last(this.p);
    if (Math.hypot(e.x - pos.x, e.y - pos.y, e.z - pos.z) > LAND_HANDOFF_M) return false;
    this.landTried = true;
    if (!ctx.canLand(path.land) || !ctx.pathClear(pos, e)) return false;
    const r = this.landReq; r.x = path.land.x; r.y = path.land.y; r.z = path.land.z;
    gesture.request = r; gesture.landArmed = true; this.mode = LANDING; this.idle();
    return true;
  }
  private enterExit() {
    const v = this.vcmd, sp = Math.hypot(v.x, v.y, v.z);
    if (sp < 0.5) { this.mode = IDLE; this.idle(); return; }
    this.mode = EXIT; this.exitT = 0; this.exitV0 = sp;
    this.exitDir.x = v.x / sp; this.exitDir.y = v.y / sp; this.exitDir.z = v.z / sp;
    this.stepExit(0);
  }
  /** Exit velocity decays to EXIT_SPEED over EXIT_DECAY_S along the exit direction, then the hero hovers. */
  private stepExit(dt: number) {
    this.exitT += dt;
    const u = Math.min(1, this.exitT / EXIT_DECAY_S), e = u * u * (3 - 2 * u), v0 = this.exitV0;
    const sp = v0 + (Math.min(v0, EXIT_SPEED) - v0) * e, d = this.exitDir;
    this.vcmd.x = d.x * sp; this.vcmd.y = d.y * sp; this.vcmd.z = d.z * sp;
    if (u >= 1) { this.mode = IDLE; this.idle(); return; }
    this.out(true, false); this.ease(d); gesture.spin = 0;
  }
  /** Heading eases toward d at <= DRAW_EASE_CAP (a wrapped stroke: gain 8, <= 6 rad/s); pitch toward clamp(0.8 x its pitch). */
  private ease(d: Vec) {
    const yawErr = wrap(Math.atan2(-d.x, -d.z) - this.view.yaw), wr = this.path.wrapped;
    const cap = wr ? WRAP_HEADING_EASE : Math.min(HEADING_EASE, DRAW_EASE_CAP);
    const goal = clamp(DRAW_PITCH_K * Math.atan2(d.y, Math.hypot(d.x, d.z)), DRAW_PITCH_MIN, DRAW_PITCH_MAX);
    gesture.yawRate = clamp((wr ? YAW_GAIN_WRAP : YAW_GAIN) * yawErr, -cap, cap);
    gesture.pitchRate = clamp(PITCH_GAIN * (goal - this.view.pitch), -HEADING_EASE, HEADING_EASE);
  }
  private stepNudge(dt: number) {
    const o = gesture.offset;
    if (this.nudgeT >= DASH_S) { o.x = o.y = o.z = 0; return; }
    this.nudgeT = Math.min(DASH_S, this.nudgeT + dt);
    const k = (1 - Math.cos(2 * Math.PI * this.nudgeT / DASH_S)) / DASH_S;
    o.x = this.nudge.x * k; o.y = this.nudge.y * k; o.z = this.nudge.z * k;
  }
  private out(on: boolean, live: boolean) {
    const g = gesture, v = this.vcmd;
    g.velocity.x = v.x; g.velocity.y = v.y; g.velocity.z = v.z; g.velocityOn = on; g.live = live; g.facing = on ? 1 : 0;
  }
  private idle() {
    const g = gesture;
    g.velocityOn = false; g.live = false; g.facing = 0; g.spin = 0; g.yawRate = g.pitchRate = 0;
  }
}
