// Draw the flight, stroke to 3D (spec 4.2), the inking half of DrawPath: each screen sample becomes a control point on its own camera
// ray, blended from the hero over the first DRAW_BLEND_M of world arc; a centripetal Catmull-Rom walk emits ring points about
// DRAW_SPACING apart, turn-limited to DRAW_MIN_R and clamped inside the flight space. Once the screen winding reaches 150 degrees
// the WrapTurtle owns the controls (drawWrap.ts) and the ring turns down to WRAP_MIN_R. drawPath.ts adds the end ray and the sweep.
import { FOOT, type Vec } from '../motion';
import type { AimFrame } from './types';
import { pointAt } from './screenRay';
import { PathRing, catmullRom, clampInside, turnMax } from './drawRing';
import { WRAP_MIN_R, WrapTurtle, headingOf } from './drawWrap';
import { wrapAngle } from './strokeBuffer';
import { DRAW_BLEND_M, DRAW_D0, DRAW_D_MAX, DRAW_M_PER_PX, DRAW_MAX_PTS, DRAW_MIN_R, DRAW_SPACING, FLIGHT_SPEED, FOLLOW_BASE,
  SURGE_SPEED, SWEEP_RADIUS } from './tuning';

const FACTOR_MIN = FLIGHT_SPEED / FOLLOW_BASE, FACTOR_MAX = SURGE_SPEED / FOLLOW_BASE;
/** Controls closer than this are skipped (pointer jitter); the spline walk samples every SUBSTEP_M. */
const CTL_MIN_M = 0.5, SUBSTEP_M = 0.25, PEN_TAU_MS = 60;
/**
 * Near the ground (within FLOOR_NEAR_M): the controls keep FLOOR_CLEAR_M above the sweep ball resting on the ground, so ink drawn
 * below the hero (whose rays run under the terrace) skims instead of diving into it. The floor rises from the hero over the same
 * smoothstep window as the ink blend, so the first segment never points down. Hovering low, it fades out over the next
 * DRAW_BLEND_M; standing (ground under FOOT + GROUNDED_EPS) it holds for the whole stroke, a take-off: ink below a standing hero
 * cannot mean "into the terrace" (a dive off a roof is the next stroke, once airborne). A standing start also skips the sweep for
 * the first GROUND_SKIP_M, where the ball already touches the ground. A blocked sweep keeps an amber stub of up to STUB_M on show.
 */
export const GROUNDED_EPS = 0.1, FLOOR_NEAR_M = 6, FLOOR_CLEAR_M = 1.5, GROUND_SKIP_M = 1.5, STUB_M = 2;
export const smooth = (u: number) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
export const vec = (): Vec => ({ x: 0, y: 0, z: 0 });

export class DrawStroke {
  readonly ring = new PathRing();
  /** The wrap turtle: it takes the controls over once the stroke has wound WRAP_ENTER_DEG on the screen. */
  readonly turtle = new WrapTurtle();
  /** The pen is down and the turtle owns the controls. */
  get wrapping() { return this.inking && this.turtle.on; }
  /** This stroke wrapped: true for the rest of the stroke and its flight, until the next begin or reset. */
  get wrapped() { return this.turtle.on; }
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
  /** Lowest control y once the floor has risen (-Infinity: no floor), and the blocked stub's far point and block time (ms). */
  floorY = -Infinity; floorHold = false; readonly stub = vec(); blockedAt = 0;
  private dHero = 0; private lastPx = 0; private lastPy = 0; private lastT = 0; private t0 = 0; private penSpeed = 0;
  private readonly ray = vec(); private readonly lastRay = vec(); private readonly q = new Float64Array(12);
  protected factorNow = 1; protected readonly ctl = new Float64Array(12); protected nCtl = 0;
  protected readonly a = vec(); protected readonly b = vec(); protected readonly s = vec(); protected readonly tg = vec();

  reset() {
    this.ring.reset(); this.inking = this.dead = this.wantsLand = this.blocked = this.full = false;
    this.pendingEnd = this.flyPending = false; this.sweptArc = this.sweeps = this.keepFrom = 0;
    this.samples = this.nCtl = 0; this.arcPx = this.worldArc = 0; this.floorY = -Infinity; this.floorHold = false; this.turtle.reset();
  }
  /** A new stroke: the path restarts at the hero (chained strokes append from where the hero is now). ground: ctx.groundBelow. */
  begin(hero: Vec, ground = Infinity) {
    this.reset(); this.inking = true;
    const an = this.anchor; an.x = hero.x; an.y = hero.y; an.z = hero.z;
    this.ring.push(hero.x, hero.y, hero.z, 1, false);
    if (ground < FLOOR_NEAR_M) this.floorY = hero.y - ground + FOOT + SWEEP_RADIUS + FLOOR_CLEAR_M;
    if (ground < FOOT + GROUNDED_EPS) { this.sweptArc = GROUND_SKIP_M; this.floorHold = true; }
  }

  /** One screen sample through its frame. Returns false when it adds nothing (dead, or under half a pixel of travel). */
  append(px: number, py: number, t: number, f: AimFrame): boolean {
    if (!this.inking || this.dead) return false;
    const o = f.origin, d = f.dir, tu = this.turtle;
    let step = 0;
    if (this.samples === 0) {
      this.dHero = (this.anchor.x - o.x) * d.x + (this.anchor.y - o.y) * d.y + (this.anchor.z - o.z) * d.z; this.t0 = t;
      for (let i = this.ring.first; i < this.ring.count; i++) this.ring.time[i % DRAW_MAX_PTS] = t;
    } else {
      step = Math.hypot(px - this.lastPx, py - this.lastPy); const dt = t - this.lastT;
      if (step < 0.5) return false;
      this.arcPx += step;
      if (dt > 0) this.penSpeed += (step / dt - this.penSpeed) * Math.min(1, dt / PEN_TAU_MS);
    }
    tu.feed(px, py);
    const c = this.control, an = this.anchor;
    if (tu.on) this.worldArc += tu.advance(step, py, c, clampInside);
    else {
      this.depth = Math.min(DRAW_D_MAX, this.dHero + DRAW_D0 + DRAW_M_PER_PX * this.arcPx);
      const r = pointAt(f, px, py, this.depth, this.ray), l = this.lastRay;
      if (this.samples > 0) this.worldArc += Math.hypot(r.x - l.x, r.y - l.y, r.z - l.z);
      l.x = r.x; l.y = r.y; l.z = r.z;
      const u = smooth(this.worldArc / DRAW_BLEND_M);
      c.x = an.x + (r.x - an.x) * u; c.y = an.y + (r.y - an.y) * u; c.z = an.z + (r.z - an.z) * u;
      if (tu.ready && this.ring.count >= 2) this.enterWrap(c, py);
    }
    const w = smooth(this.worldArc / DRAW_BLEND_M), floor = this.floorY > -Infinity ? an.y + (this.floorY - an.y) * w : -Infinity;
    if (c.y < floor) c.y += (floor - c.y) * (this.floorHold ? 1 : 1 - smooth((this.worldArc - DRAW_BLEND_M) / DRAW_BLEND_M));
    const mean = this.arcPx / Math.max(1, t - this.t0);
    this.factorNow = mean > 1e-6 ? clamp(this.penSpeed / mean, FACTOR_MIN, FACTOR_MAX) : 1;
    this.lastPx = px; this.lastPy = py; this.lastT = t; this.samples++; this.ring.stamp = t;
    const k = Math.min(this.nCtl, 4) - 1, g = this.ctl;
    if (this.nCtl === 0 || Math.hypot(c.x - g[k * 3], c.y - g[k * 3 + 1], c.z - g[k * 3 + 2]) >= CTL_MIN_M) this.addControl(c);
    return true;
  }

  /** Hands the controls to the turtle at c: psiStart is the ring's first segment, psiEntry its current end tangent. */
  private enterWrap(c: Vec, py: number) {
    const rg = this.ring, T = this.tg;
    if (!rg.tangent(rg.first, T)) return;
    const psiStart = headingOf(T.x, T.z);
    if (rg.tangent(rg.count - 2, T)) this.turtle.enter(c, py, psiStart, headingOf(T.x, T.z));
  }
  private addControl(c: Vec) {
    const g = this.ctl;
    if (this.nCtl >= 4) g.copyWithin(0, 3);
    const k = Math.min(this.nCtl, 3) * 3;
    g[k] = c.x; g[k + 1] = c.y; g[k + 2] = c.z; this.nCtl++;
    if (this.nCtl >= 3) this.walk(false);
  }
  /** Walks the spline segment between the two controls before the newest (tail: the last segment, end reflected). */
  protected walk(tail: boolean) {
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
  /**
   * Release of a wrapped stroke: the turn the turtle still owes (up to one revolution) flies on as a WRAP_MIN_R arc from the ring's
   * end, so a circle drawn once still turns you all the way round. The debt is counted from the ring's own end heading (it trails
   * the turtle slightly), still the way the finger circled.
   */
  protected completeWrap() {
    const rg = this.ring, T = this.b, E = this.a, t = this.s, tm = turnMax(WRAP_MIN_R), tu = this.turtle;
    if (!rg.tangent(rg.count - 2, T)) return;
    let owe = clamp(tu.owed + wrapAngle(tu.heading - headingOf(T.x, T.z)), -2 * Math.PI, 2 * Math.PI);
    for (let n = 0; n < 24 && Math.abs(owe) > 1e-3 && !this.full && rg.tangent(rg.count - 2, T); n++) {
      const th = clamp(owe, -tm, tm), c = Math.cos(th), sn = Math.sin(th), x = T.x * c + T.z * sn, z = T.z * c - T.x * sn;
      rg.last(E); t.x = E.x + x * DRAW_SPACING; t.y = E.y + T.y * DRAW_SPACING; t.z = E.z + z * DRAW_SPACING;
      const k = rg.count; this.emitToward(t, true); owe -= th; if (rg.count === k) break;
    }
  }
  protected emitToward(t: Vec, exact = false) {
    const w = this.turtle.on;
    if (!this.ring.emitToward(t, exact, this.factorNow, this.keepFrom, w ? WRAP_MIN_R : DRAW_MIN_R, w)) this.full = true;
  }
}
