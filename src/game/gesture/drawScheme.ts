// Draw the flight, the scheme (spec 4 and the Draw column of 2.6): a drag past the tap slop starts a live path from the hero and
// every sample extends it; release queues the end ray; a scrub back over the last 30% within 300 ms drops the unflown tail. A
// short failed-tap stroke nudges; the arbiter's taps fire, fly to the point (blaster off) or brake. Pure; writes only the bus.
import type { Vec } from '../motion';
import { gesture } from './bus';
import { drawPath, type DrawPath } from './drawPath';
import { EXIT, FOLLOW, LANDING, PathFollow, type FollowView } from './pathFollow';
import { labAimFrame, pointAt } from './screenRay';
import type { Action, AimFrame, ArbiterOut, GestureCtx, Scheme, StrokeClass, StrokeView } from './types';
import { DRAW_D0, DRAW_MAX_PTS, INK_WORLD_MS, NUDGE_FRAC, SCRUB_FRAC, SCRUB_MS, STROKE_RING, TAP_SLOP_MOUSE, TAP_SLOP_TOUCH } from './tuning';

export interface DrawOptions {
  /** The camera frame samples are unprojected through. Default: labAimFrame once GestureTrack has published it. */
  frame?(): AimFrame | null;
  /** The view the release heading eases from. Pass runtime; the default reads it off the frame's look direction. */
  view?: FollowView;
  /** runtime.clearance.active, for the clearance abort. Default: never. */
  clearance?(): boolean;
  /** Shot outputs (burst / blastNow / sustain). Omit when the surface fires them itself. */
  fire?(drone: number, x: number, y: number, t: number, sustained: boolean): void;
  /** A miss shot along the tap ray (blaster on, empty tap). Omit when the surface fires it. */
  miss?(x: number, y: number, t: number): void;
  /** Onboarding successes (guideSteps.reportGuide): a first path, a chained stroke, a rooftop hand-off. */
  guide?(ev: 'curve' | 'chain' | 'rooftop'): void;
  /** The suit is flying (store.flying): a landing approach that touched down drops its path. Default: always. */
  flying?(): boolean;
}
export interface DrawScheme extends Scheme {
  readonly id: 'draw';
  readonly path: DrawPath;
  readonly follow: PathFollow;
  /** The 'Fly to where I tap' toggle: an empty tap flies there even with the blaster on. */
  flyToMode: boolean;
  /** Routes the arbiter outputs Draw owns; false for the ones it leaves to the surface. */
  handle(out: ArbiterOut): boolean;
  flyTo(x: number, y: number): void;
  brake(): void;
  /** The path as the world ribbon reads it (guideSteps.RibbonPath, structurally): assign it to ribbonLink.path while Draw is on. */
  readonly ribbon: DrawRibbon;
}
/** Ring-relative view of the drawn path: flown is the hero's fractional index, blocked the amber end index or -1. */
export interface DrawRibbon {
  readonly count: number; readonly seq0: number; readonly flown: number; readonly blocked: number;
  x(i: number): number; y(i: number): number; z(i: number): number; t(i: number): number;
}

/** A stroke shorter than this (px of arc) that failed the tap is a nudge, not a path. */
export const DRAW_NUDGE_PX = 40;
const SCRUB_NEAR_PX = 14, SCRUB_TIP_PX = 40, INK_MIN_PX = 2, TELEPORT_M = 5;
/** A blocked path's amber stub (the ink past the cut) stays on show this long, ms. */
export const STUB_MS = 1500;
const labFrame = () => (labAimFrame.t > 0 ? labAimFrame : null);

export function createDrawScheme(opts: DrawOptions = {}, path: DrawPath = drawPath): DrawScheme {
  const frame = opts.frame ?? labFrame, clearance = opts.clearance ?? (() => false);
  const look = { yaw: 0, pitch: 0 };
  const view: FollowView = opts.view ?? {
    get yaw() { const f = frame(); return f ? Math.atan2(-f.dir.x, -f.dir.z) : look.yaw; },
    get pitch() { const f = frame(); return f ? Math.asin(Math.max(-1, Math.min(1, f.dir.y))) : look.pitch; },
  };
  const follow = new PathFollow(path, view);
  const hero = { x: 0, y: 0, z: 0 }, vel = { x: 0, y: 0, z: 0 }, a = { x: 0, y: 0, z: 0 }, b = { x: 0, y: 0, z: 0 };
  const inkX = new Float32Array(STROKE_RING), inkY = new Float32Array(STROKE_RING), inkA = new Float32Array(STROKE_RING);
  let hasPos = false, stroke = false, started = false, dead = false, epoch = gesture.epoch, stepEpoch = gesture.epoch, ground = Infinity;
  let seen = 0, lastX = NaN, lastY = NaN, lastT = NaN, nInk = 0, scrubbing = false, scrubT0 = 0, scrubJ = 0;

  const startPath = () => {
    const chained = follow.mode === FOLLOW || follow.mode === EXIT;
    started = true; path.begin(hero, ground); follow.start(vel); gesture.live = true; opts.guide?.(chained ? 'chain' : 'curve');
  };
  const dist = (j: number, x: number, y: number) => Math.hypot(inkX[j] - x, inkY[j] - y);
  /** Scrub back: returns true while the pen retraces the ink (those samples are not appended). */
  function scrub(x: number, y: number, t: number): boolean {
    if (nInk < 3) return false;
    const tip = inkA[nInk - 1], k = nInk - 1;
    if (!scrubbing) {
      const tx = inkX[k] - inkX[k - 1], ty = inkY[k] - inkY[k - 1];
      if ((x - inkX[k]) * tx + (y - inkY[k]) * ty >= 0) return false;   // still moving with the ink
      for (let j = k - 1; j >= 0 && inkA[j] >= tip - SCRUB_TIP_PX; j--) {
        if (dist(j, x, y) < SCRUB_NEAR_PX) { scrubbing = true; scrubT0 = t; scrubJ = j; return true; }
      }
      return false;
    }
    let j = scrubJ, d = dist(j, x, y);
    while (j > 0 && dist(j - 1, x, y) <= d) { j--; d = dist(j, x, y); }
    if (d > SCRUB_NEAR_PX * 1.5 || t - scrubT0 > SCRUB_MS) { scrubbing = false; return false; }
    scrubJ = j;
    if (inkA[j] <= (1 - SCRUB_FRAC) * tip) { path.dropTail(follow.s); follow.abort('scrub'); dead = true; gesture.live = false; }
    return true;
  }
  function sample(x: number, y: number, t: number) {
    lastX = x; lastY = y; lastT = t;
    const f = frame();
    if (!f || scrub(x, y, t) || dead || !path.append(x, y, t, f)) return;
    if (nInk > 0 && Math.hypot(x - inkX[nInk - 1], y - inkY[nInk - 1]) < INK_MIN_PX) return;
    if (nInk < STROKE_RING) { inkX[nInk] = x; inkY[nInk] = y; inkA[nInk] = path.arcPx; nInk++; }
  }
  function nudge(s: StrokeView) {
    const f = frame();
    if (!f) return;
    const o = f.origin, d = f.dir, depth = (hero.x - o.x) * d.x + (hero.y - o.y) * d.y + (hero.z - o.z) * d.z + DRAW_D0;
    pointAt(f, s.startX, s.startY, depth, a); pointAt(f, s.lastX, s.lastY, depth, b);
    follow.nudgeBy((b.x - a.x) * NUDGE_FRAC, (b.y - a.y) * NUDGE_FRAC, (b.z - a.z) * NUDGE_FRAC);
  }

  // The ribbon: the ring, plus the amber stub past a blocked cut for STUB_MS. Once the path is not being followed (a glide, a
  // landing approach, the end), every ring point counts as flown, so the whole ribbon fades out behind the hero.
  const rg = path.ring, slot = (i: number) => (rg.first + i) % DRAW_MAX_PTS, ringN = () => rg.count - rg.first;
  const stubOn = () => path.blocked && rg.count > 0 && performance.now() - path.blockedAt < STUB_MS;
  const ribbon: DrawRibbon = {
    get count() { return ringN() + (stubOn() ? 1 : 0); },
    get seq0() { return rg.first; },
    get flown() {
      if (follow.mode !== FOLLOW && !path.inking) return ringN();
      const i = Math.max(follow.seg, rg.first), a = rg.arcOf(i), span = i + 1 < rg.count ? rg.arcOf(i + 1) - a : 0;
      return i - rg.first + (span > 1e-9 ? Math.min(1, Math.max(0, (follow.s - a) / span)) : 0);
    },
    get blocked() { return path.blocked && rg.count > 0 ? ringN() - 1 : -1; },
    x: i => (i < ringN() ? rg.x[slot(i)] : path.stub.x), y: i => (i < ringN() ? rg.y[slot(i)] : path.stub.y),
    z: i => (i < ringN() ? rg.z[slot(i)] : path.stub.z), t: i => (i < ringN() ? rg.time[slot(i)] : path.blockedAt - INK_WORLD_MS),
  };
  const scheme: DrawScheme = {
    id: 'draw', path, follow, flyToMode: false, ribbon,
    down() {
      stroke = true; started = false; dead = false; epoch = gesture.epoch;
      seen = 0; lastX = lastY = lastT = NaN; nInk = 0; scrubbing = false;
    },
    move(s: StrokeView) {
      if (!stroke || dead) return;
      if (gesture.epoch !== epoch) { dead = true; stroke = false; return; }
      if (!started) {
        if (s.travel <= (s.kind === 'mouse' ? TAP_SLOP_MOUSE : TAP_SLOP_TOUCH)) return;
        startPath();
      }
      const n = s.count;
      if (seen < n) { for (let i = seen; i < n && !dead; i++) sample(s.x(i), s.y(i), s.t(i)); }
      else if (n > 0 && (s.lastX !== lastX || s.lastY !== lastY || s.lastT !== lastT)) sample(s.lastX, s.lastY, s.lastT);
      seen = n;
    },
    up(s: StrokeView, _c: StrokeClass) {
      if (!stroke) return;
      scheme.move(s);
      stroke = false;
      if (!started || dead || gesture.epoch !== epoch) return;   // taps and holds arrive as arbiter outputs
      gesture.live = false;
      if (s.arc < DRAW_NUDGE_PX) { follow.drop(); nudge(s); return; }
      path.release(frame(), s.lastX, s.lastY);
    },
    cancel() {
      if (stroke && started && !dead && follow.mode === FOLLOW) { path.dropTail(follow.s); follow.abort('cancel'); }
      stroke = false; dead = true; gesture.live = false;
    },
    step(dt: number, p: Vec, ctx: GestureCtx) {
      const jump = hasPos ? Math.hypot(p.x - hero.x, p.y - hero.y, p.z - hero.z) : 0;
      const k = hasPos && dt > 0 && jump < TELEPORT_M ? 1 / dt : 0;
      vel.x = (p.x - hero.x) * k; vel.y = (p.y - hero.y) * k; vel.z = (p.z - hero.z) * k;
      hero.x = p.x; hero.y = p.y; hero.z = p.z; hasPos = true; ground = ctx.groundBelow(p);
      // A host landing (Land, Space) or a reset clears the bus: stop following and drop the path, so no slow abort ('Path blocked')
      // fires on the approach and no path velocity survives touchdown. A glide already under way (pointer cancel) runs out.
      if (gesture.epoch !== stepEpoch) {
        stepEpoch = gesture.epoch;
        if (follow.mode === FOLLOW || follow.mode === LANDING) { follow.cancel('cancel'); path.reset(); dead = true; stroke = false; }
      }
      const landing = follow.mode === LANDING;
      follow.step(dt, p, vel, ctx, clearance());
      if (!landing && follow.mode === LANDING) opts.guide?.('rooftop');
      if (follow.mode === LANDING && opts.flying && !opts.flying()) { follow.reset(); path.reset(); }
    },
    reset() {
      path.reset(); follow.reset(); stroke = started = scrubbing = false; dead = true; nInk = 0; hasPos = false; stepEpoch = gesture.epoch;
    },
    fallback(act: Action) {
      if (act === 'fly-to') scheme.flyToMode = !scheme.flyToMode;
      else if (act === 'brake') scheme.brake();
    },
    handle(out: ArbiterOut) {
      switch (out.type) {
        case 'flyTo': scheme.flyTo(out.x, out.y); return true;
        case 'miss':
          if (scheme.flyToMode) { scheme.flyTo(out.x, out.y); return true; }
          if (!opts.miss) return false;
          opts.miss(out.x, out.y, out.t); return true;
        case 'burst': case 'blastNow': if (!opts.fire) return false; opts.fire(out.drone, out.x, out.y, out.t, false); return true;
        case 'sustain': if (!opts.fire) return false; opts.fire(out.drone, out.x, out.y, out.t, true); return true;
        case 'brake': scheme.brake(); return true;
        default: return false;
      }
    },
    flyTo(x: number, y: number) {
      const f = frame();
      if (!f) return;
      path.flyTo(hero, f, x, y); follow.start(vel);
    },
    brake() { path.reset(); follow.cancel('brake'); dead = true; stroke = false; },
  };
  return scheme;
}
