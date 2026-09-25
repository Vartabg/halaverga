// Draw the flight, stroke to 3D (spec 4.2-4.4). Each screen sample becomes a control point on its own camera ray, blended from
// the hero over the first DRAW_BLEND_M of world arc; a centripetal Catmull-Rom walk emits ring points about DRAW_SPACING apart,
// turn-limited to DRAW_MIN_R and clamped inside the flight space. Pure: DrawProbe supplies the Rapier casts.
import { FOOT, type Vec } from '../motion';
import type { AimFrame } from './types';
import { pointAt, unproject } from './screenRay';
import { PathRing, catmullRom, clampInside } from './drawRing';
import { DRAW_BLEND_M, DRAW_D0, DRAW_D_MAX, DRAW_M_PER_PX, DRAW_MAX_PTS, FLIGHT_SPEED, FOLLOW_BASE, LAND_LIFT_M, LAND_NORMAL_Y, LAND_RETARGET_FRAC, SURGE_SPEED, SWEEP_LAND_EXCLUDE_M,
  SWEEP_MAX_FRAME, SWEEP_MAX_PATH, SWEEP_STEP_M } from './tuning';

/** The end-ray hit DrawProbe hands to finish: a world point and its surface normal. */
export type DrawHit = { point: Vec; normal: Vec };
/** Fraction of the segment a -> b a ball sweep travels before a hit (>= 1: clear). */
export type SweepCast = (a: Vec, b: Vec) => number;

const FACTOR_MIN = FLIGHT_SPEED / FOLLOW_BASE, FACTOR_MAX = SURGE_SPEED / FOLLOW_BASE;
/** Controls closer than this are skipped (pointer jitter); the spline walk samples every SUBSTEP_M. */
const CTL_MIN_M = 0.5, SUBSTEP_M = 0.25, PEN_TAU_MS = 60;
/** Open-sky release continues this far along the exit tangent; fly-to open sky goes this far; a blocked sweep backs off this far. */
const TANGENT_M = 12, FLY_OPEN_M = 60, FLY_SHORT_M = 3, CUT_BACK_M = 0.5;
const smooth = (u: number) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
const vec = (): Vec => ({ x: 0, y: 0, z: 0 });

export class DrawPath {
  readonly ring = new PathRing();
  /** The pen is down and extending the path. */
  inking = false;
  /** No further ink is taken for this path (scrubbed, cancelled, blocked or braked). */
  dead = false;
  wantsLand = false; blocked = false; full = false;
  /** An end ray waits for DrawProbe's castShot (release, or a pending fly-to). */ pendingEnd = false; flyPending = false;
  readonly endO = vec(); readonly endD = vec();
  /** The landing surface point (feet) when wantsLand. */
  readonly land = vec();
  /** Swept up to this arc, and the casts spent on this path. */
  sweptArc = 0; sweeps = 0;
  /** pathFollow's segment: ring slots before it may be overwritten. */
  keepFrom = 0;
  readonly anchor = vec();
  /** The latest sample's control point (on its ray once past the blend) and its ray depth. */
  readonly control = vec(); depth = 0;
  arcPx = 0; worldArc = 0; samples = 0;
  private dHero = 0; private lastPx = 0; private lastPy = 0; private lastT = 0; private t0 = 0;
  private penSpeed = 0; private factorNow = 1;
  private readonly ray = vec(); private readonly lastRay = vec();
  private readonly ctl = new Float64Array(12); private nCtl = 0;
  private readonly q = new Float64Array(12);
  private readonly a = vec(); private readonly b = vec(); private readonly s = vec(); private readonly tg = vec();

  reset() {
    this.ring.reset(); this.inking = this.dead = this.wantsLand = this.blocked = this.full = false;
    this.pendingEnd = this.flyPending = false; this.sweptArc = this.sweeps = this.keepFrom = 0;
    this.samples = this.nCtl = 0; this.arcPx = this.worldArc = 0;
  }
  /** A new stroke: the path restarts at the hero (chained strokes append from where the hero is now). */
  begin(hero: Vec) {
    this.reset(); this.inking = true;
    this.anchor.x = hero.x; this.anchor.y = hero.y; this.anchor.z = hero.z;
    this.ring.push(hero.x, hero.y, hero.z, 1, false);
  }

  /** One screen sample through its frame. Returns false when it adds nothing (dead, or under half a pixel of travel). */
  append(px: number, py: number, t: number, f: AimFrame): boolean {
    if (!this.inking || this.dead) return false;
    const o = f.origin, d = f.dir;
    if (this.samples === 0) {
      this.dHero = (this.anchor.x - o.x) * d.x + (this.anchor.y - o.y) * d.y + (this.anchor.z - o.z) * d.z; this.t0 = t;
      this.ring.time[this.ring.first % DRAW_MAX_PTS] = t;
    } else {
      const step = Math.hypot(px - this.lastPx, py - this.lastPy), dt = t - this.lastT;
      if (step < 0.5) return false;
      this.arcPx += step;
      if (dt > 0) this.penSpeed += (step / dt - this.penSpeed) * Math.min(1, dt / PEN_TAU_MS);
    }
    this.depth = Math.min(DRAW_D_MAX, this.dHero + DRAW_D0 + DRAW_M_PER_PX * this.arcPx);
    const r = pointAt(f, px, py, this.depth, this.ray), l = this.lastRay;
    if (this.samples > 0) this.worldArc += Math.hypot(r.x - l.x, r.y - l.y, r.z - l.z);
    l.x = r.x; l.y = r.y; l.z = r.z;
    const w = smooth(this.worldArc / DRAW_BLEND_M), c = this.control, an = this.anchor;
    c.x = an.x + (r.x - an.x) * w; c.y = an.y + (r.y - an.y) * w; c.z = an.z + (r.z - an.z) * w;
    const mean = this.arcPx / Math.max(1, t - this.t0);
    this.factorNow = mean > 1e-6 ? clamp(this.penSpeed / mean, FACTOR_MIN, FACTOR_MAX) : 1;
    this.lastPx = px; this.lastPy = py; this.lastT = t; this.samples++; this.ring.stamp = t;
    const k = Math.min(this.nCtl, 4) - 1, g = this.ctl;
    if (this.nCtl === 0 || Math.hypot(c.x - g[k * 3], c.y - g[k * 3 + 1], c.z - g[k * 3 + 2]) >= CTL_MIN_M) this.addControl(c);
    return true;
  }

  private addControl(c: Vec) {
    const g = this.ctl;
    if (this.nCtl >= 4) g.copyWithin(0, 3);
    const k = Math.min(this.nCtl, 3) * 3;
    g[k] = c.x; g[k + 1] = c.y; g[k + 2] = c.z; this.nCtl++;
    if (this.nCtl >= 3) this.walk(false);
  }
  /** Walks the spline segment between the two controls before the newest (tail: the last segment, end reflected). */
  private walk(tail: boolean) {
    const g = this.ctl, q = this.q, n = Math.min(this.nCtl, 4);
    const i1 = tail ? n - 2 : n - 3, i2 = i1 + 1;
    for (let a = 0; a < 3; a++) {
      const p1 = g[i1 * 3 + a], p2 = g[i2 * 3 + a];
      q[a] = i1 > 0 ? g[(i1 - 1) * 3 + a] : 2 * p1 - p2;
      q[3 + a] = p1; q[6 + a] = p2;
      q[9 + a] = tail ? 2 * p2 - p1 : g[(i2 + 1) * 3 + a];
    }
    const len = Math.hypot(q[6] - q[3], q[7] - q[4], q[8] - q[5]), m = clamp(Math.ceil(len / SUBSTEP_M), 1, 32);
    for (let j = 1; j <= m; j++) this.emitToward(catmullRom(q, j / m, this.s));
  }
  private emitToward(t: Vec, exact = false) { if (!this.ring.emitToward(t, exact, this.factorNow, this.keepFrom)) this.full = true; }

  /** Pen up: completes the spline to the last control and queues the end ray for DrawProbe (castShot then finish). */
  release(f: AimFrame | null, px: number, py: number) {
    if (!this.inking) return;
    if (this.nCtl >= 2) { this.walk(true); const t = this.tg, c = this.control; t.x = c.x; t.y = c.y; t.z = c.z; this.emitToward(t, true); }
    this.inking = false;
    if (!f) { this.finish(null); return; }
    this.endO.x = f.origin.x; this.endO.y = f.origin.y; this.endO.z = f.origin.z;
    unproject(f, px, py, this.endD); this.pendingEnd = true;
  }
  /** A straight path from the hero toward the tap ray (blaster-off empty tap, or the 'Fly to where I tap' fallback). */
  flyTo(hero: Vec, f: AimFrame, px: number, py: number) {
    this.begin(hero); this.inking = false; this.flyPending = true;
    this.endO.x = f.origin.x; this.endO.y = f.origin.y; this.endO.z = f.origin.z;
    unproject(f, px, py, this.endD); this.pendingEnd = true;
  }

  /** The end-ray result: a landable hit retargets the last 20% above it (wantsLand); open sky runs on along the tangent. */
  finish(hit: DrawHit | null) {
    this.pendingEnd = false;
    const rg = this.ring, T = this.tg, landable = !!hit && hit.normal.y > LAND_NORMAL_Y;
    if (hit && landable) {
      const p = hit.point, n = hit.normal, lift = FOOT + LAND_LIFT_M;
      T.x = p.x + n.x * lift; T.y = p.y + n.y * lift; T.z = p.z + n.z * lift; clampInside(T);
      this.land.x = p.x; this.land.y = p.y; this.land.z = p.z; this.wantsLand = true;
    }
    if (this.flyPending) { this.flyPending = false; this.fly(hit, landable); return; }
    if (rg.count < 2) return;
    if (!landable) { this.extend(TANGENT_M); return; }
    const E = rg.last(this.a), A = rg.endArc, a0 = A * (1 - LAND_RETARGET_FRAC);
    const dx = T.x - E.x, dy = T.y - E.y, dz = T.z - E.z, i0 = rg.at(a0, this.keepFrom, this.b) + 1;
    for (let i = i0; i < rg.count; i++) {
      const k = i % DRAW_MAX_PTS, w = smooth((rg.arc[k] - a0) / Math.max(1e-6, A - a0));
      rg.x[k] += dx * w; rg.y[k] += dy * w; rg.z[k] += dz * w;
    }
    rg.recompute(i0); this.sweptArc = Math.min(this.sweptArc, a0);
  }
  private fly(hit: DrawHit | null, landable: boolean) {
    const o = this.endO, d = this.endD, t = this.tg;
    if (landable) { /* tg already holds the retarget point */ }
    else if (hit) { const k = Math.max(0, Math.hypot(hit.point.x - o.x, hit.point.y - o.y, hit.point.z - o.z) - FLY_SHORT_M);
      t.x = o.x + d.x * k; t.y = o.y + d.y * k; t.z = o.z + d.z * k; }
    else { const an = this.anchor; t.x = an.x + d.x * FLY_OPEN_M; t.y = an.y + d.y * FLY_OPEN_M; t.z = an.z + d.z * FLY_OPEN_M; }
    clampInside(t); this.factorNow = 1;
    for (let n = 0; n < DRAW_MAX_PTS && !this.full; n++) { const c = this.ring.count; this.emitToward(t, true); if (this.ring.count === c) break; }
  }
  private extend(len: number) {
    const rg = this.ring, T = this.b;
    if (!rg.tangent(rg.count - 2, T)) return;
    const E = rg.last(this.a), t = this.s;
    t.x = E.x + T.x * len; t.y = E.y + T.y * len; t.z = E.z + T.z * len;
    for (let n = 0; n < 16 && !this.full; n++) { const c = rg.count; this.emitToward(t, true); if (rg.count === c) break; }
  }

  /** Drops the unflown tail past arc s (scrub back, cancel); no more ink for this path. */
  dropTail(s: number) {
    this.ring.truncate(s, this.a); this.inking = false; this.dead = true;
    this.pendingEnd = this.flyPending = this.wantsLand = false; this.sweptArc = Math.min(this.sweptArc, s);
  }

  /**
   * Sweeps newly final segments every SWEEP_STEP_M (at most max casts now, SWEEP_MAX_PATH per path), stopping short of the
   * last SWEEP_LAND_EXCLUDE_M when wantsLand. The first block cuts the path there and sets blocked. Returns the casts made.
   */
  sweep(cast: SweepCast, max = SWEEP_MAX_FRAME): number {
    const rg = this.ring;
    if (this.blocked || this.pendingEnd || rg.count < 2) return 0;
    const limit = rg.endArc - (this.wantsLand ? SWEEP_LAND_EXCLUDE_M : 0);
    let casts = 0;
    while (casts < max && this.sweeps < SWEEP_MAX_PATH) {
      const left = limit - this.sweptArc;
      if (left < (this.inking ? SWEEP_STEP_M : 0.1)) break;
      const step = Math.min(SWEEP_STEP_M, left);
      rg.at(this.sweptArc, this.keepFrom, this.a); rg.at(this.sweptArc + step, this.keepFrom, this.b);
      casts++; this.sweeps++;
      const f = cast(this.a, this.b);
      if (f < 1) {
        this.ring.truncate(Math.max(0, this.sweptArc + step * Math.max(0, f) - CUT_BACK_M), this.a);
        this.blocked = this.dead = true; this.inking = this.wantsLand = false; break;
      }
      this.sweptArc += step;
    }
    return casts;
  }
}

/** The one path the lab draws: drawScheme extends it, pathFollow flies it, DrawProbe sweeps it and casts its end ray. */
export const drawPath = new DrawPath();
