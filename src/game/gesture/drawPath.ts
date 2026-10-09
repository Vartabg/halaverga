// Draw the flight, stroke to 3D (spec 4.2-4.4). DrawStroke turns the ink into the ring; this half ends it: release queues the end
// ray, finish retargets a landable end or runs on along the tangent, dropTail and sweep cut it. Pure: DrawProbe supplies the Rapier
// casts.
import { FOOT, type Vec } from '../motion';
import type { AimFrame } from './types';
import { unproject } from './screenRay';
import { clampInside } from './drawRing';
import { DrawStroke, smooth } from './drawStroke';
import { DRAW_MAX_PTS, LAND_LIFT_M, LAND_NORMAL_Y, LAND_RETARGET_FRAC, SWEEP_LAND_EXCLUDE_M, SWEEP_MAX_FRAME, SWEEP_MAX_PATH,
  SWEEP_STEP_M } from './tuning';
export { FLOOR_CLEAR_M, FLOOR_NEAR_M, GROUND_SKIP_M, GROUNDED_EPS, STUB_M } from './drawStroke';
import { STUB_M } from './drawStroke';

/** The end-ray hit DrawProbe hands to finish: a world point and its surface normal. */
export type DrawHit = { point: Vec; normal: Vec };
/** Fraction of the segment a -> b a ball sweep travels before a hit (>= 1: clear). */
export type SweepCast = (a: Vec, b: Vec) => number;
/** Open-sky release continues this far along the exit tangent; fly-to open sky goes this far; a blocked sweep backs off this far. */
const TANGENT_M = 12, FLY_OPEN_M = 60, FLY_SHORT_M = 3, CUT_BACK_M = 0.5;
/** Largest smoothstep slope: a landing warp moves consecutive points apart by at most this x displacement / retargeted arc. */
const WARP_SLOPE = 1.5;

export class DrawPath extends DrawStroke {
  /** Pen up: completes the spline to the last control and queues the end ray for DrawProbe (castShot then finish). */
  release(f: AimFrame | null, px: number, py: number) {
    if (!this.inking) return;
    if (this.nCtl >= 2) { this.walk(true); const t = this.tg, c = this.control; t.x = c.x; t.y = c.y; t.z = c.z; this.emitToward(t, !this.wrapped); }
    if (this.wrapped) this.completeWrap();   // no short exact step first: the arc goes on from a full segment
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
    const dx = T.x - E.x, dy = T.y - E.y, dz = T.z - E.z;
    this.sweptArc = Math.min(this.sweptArc, a0);
    // A roof far past the ink: fly the last 20% on to it at the normal spacing (a warp that far would stretch the ring's segments).
    if (Math.hypot(dx, dy, dz) * WARP_SLOPE > A - a0) { rg.truncate(a0, this.b); this.runTo(T, DRAW_MAX_PTS); return; }
    const i0 = rg.at(a0, this.keepFrom, this.b) + 1;
    for (let i = i0; i < rg.count; i++) {
      const k = i % DRAW_MAX_PTS, w = smooth((rg.arc[k] - a0) / Math.max(1e-6, A - a0));
      rg.x[k] += dx * w; rg.y[k] += dy * w; rg.z[k] += dz * w;
    }
    rg.recompute(i0);
  }
  /** Emits toward t (exact) until it lands there, stops making progress, or the ring is full. */
  private runTo(t: Vec, max: number) {
    for (let n = 0; n < max && !this.full; n++) { const c = this.ring.count; this.emitToward(t, true); if (this.ring.count === c) break; }
  }
  private fly(hit: DrawHit | null, landable: boolean) {
    const o = this.endO, d = this.endD, t = this.tg;
    if (landable) { /* tg already holds the retarget point */ }
    else if (hit) { const k = Math.max(0, Math.hypot(hit.point.x - o.x, hit.point.y - o.y, hit.point.z - o.z) - FLY_SHORT_M);
      t.x = o.x + d.x * k; t.y = o.y + d.y * k; t.z = o.z + d.z * k; }
    else { const an = this.anchor; t.x = an.x + d.x * FLY_OPEN_M; t.y = an.y + d.y * FLY_OPEN_M; t.z = an.z + d.z * FLY_OPEN_M; }
    clampInside(t); this.factorNow = 1; this.runTo(t, DRAW_MAX_PTS);
  }
  private extend(len: number) {
    const rg = this.ring, T = this.b;
    if (!rg.tangent(rg.count - 2, T)) return;
    const E = rg.last(this.a), t = this.s;
    t.x = E.x + T.x * len; t.y = E.y + T.y * len; t.z = E.z + T.z * len; this.runTo(t, 16);
  }

  /** Drops the unflown tail past arc s (scrub back, cancel); no more ink for this path. */
  dropTail(s: number) {
    this.ring.truncate(s, this.a); this.inking = false; this.dead = true;
    this.pendingEnd = this.flyPending = this.wantsLand = false; this.sweptArc = Math.min(this.sweptArc, s);
  }

  /**
   * Sweeps newly final segments every SWEEP_STEP_M (at most max casts now, SWEEP_MAX_PATH per path), stopping short of the
   * last SWEEP_LAND_EXCLUDE_M when wantsLand. The first block cuts the path there, keeps the stub and sets blocked (at `now`, ms).
   * Returns the casts made.
   */
  sweep(cast: SweepCast, max = SWEEP_MAX_FRAME, now = 0): number {
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
        const hit = this.sweptArc + step * Math.max(0, f);
        rg.at(Math.min(rg.endArc, hit + STUB_M), this.keepFrom, this.stub); rg.truncate(Math.max(0, hit - CUT_BACK_M), this.a);
        this.blocked = this.dead = true; this.inking = this.wantsLand = false; this.blockedAt = now; break;
      }
      this.sweptArc += step;
    }
    return casts;
  }
}

/** The one path the lab draws: drawScheme extends it, pathFollow flies it, DrawProbe sweeps it and casts its end ray. */
export const drawPath = new DrawPath();
