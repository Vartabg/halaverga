// Conduct scheme (spec 5): rest to steer, stir for tempo, lift to glide, flick to dash, circle to roll. Phone strokes come from
// the arbiter; desktop hovers steer while cruising (a click on empty space toggles cruise, a press-drag looks). Writes only the
// gesture bus (intent, rates, offset, spin, lift request). Pure apart from the guarded exitPointerLock at creation.
import { flowSpeed } from '../flowFlight';
import { FOOT, type Vec } from '../motion';
import { gesture, LIFT_REQUEST } from './bus';
import { ConductMotion, HoverTrail, Pulse, steerRates } from './conduct';
import { OneEuro2 } from './oneEuro';
import { labAimFrame } from './screenRay';
import type { Action, AimFrame, ArbiterOut, GestureCtx, Scheme, StrokeClass, StrokeView } from './types';
import {
  DASH_COOLDOWN, DASH_MAX, DASH_MIN, DASH_S, FLICK_SPEED, FLICK_SPEED_MAX, LIFT_TAU,
  RM_OFFSET_SCALE, ROLL_OFFSET_M, ROLL_PEAK, ROLL_S, SNAP_INTENT, STEER_GRACE_MS, SURGE_SPEED, THROTTLE_FLOOR, THROTTLE_RISE,
} from './tuning';

export type ConductCue = 'sparkle' | 'roll' | 'dash';
export interface ConductOptions {
  /** The camera frame the steer point is cast through, or null. Default: labAimFrame once GestureTrack has published it. */
  frame?(): AimFrame | null;
  /** Shot outputs routed through handle() (burst / blastNow / sustain). Omit when the surface fires them itself. */
  fire?(drone: number, x: number, y: number, t: number, sustained: boolean): void;
  /** Feedback hook for the ink layer and chime. */
  cue?(kind: ConductCue, dir: number): void;
  reduced?(): boolean;
}
export interface ConductScheme extends Scheme {
  readonly id: 'conduct';
  hover(x: number, y: number, t: number): void;
  /** Desktop: a click on empty space. Returns the new cruise state. */
  toggleCruise(): boolean;
  /** Routes the arbiter outputs Conduct owns; returns false for the ones it leaves to the surface (look, strokes). */
  handle(out: ArbiterOut): boolean;
  /** Desktop hover gain for tempo, flick and circle (1 = raw px). */
  setGain(g: number): void;
  readonly state: { readonly throttle: number; readonly forward: number; readonly cruising: boolean; readonly touching: boolean };
}

/** Roll sidestep: a sine envelope whose integral is ROLL_OFFSET_M (peak 3*PI/(2*0.7) = 6.7 m/s, under ROLL_PEAK). */
const SIDESTEP_PEAK = Math.min(ROLL_PEAK, ROLL_OFFSET_M * Math.PI / (2 * ROLL_S));
const GROUNDED_M = FOOT + 0.3, FALLBACK_STEP = 0.25, FALLBACK_DASH = (DASH_MIN + DASH_MAX) / 2;
const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
/** Throttle u for a forward intent (inverse of flowSpeed / SURGE), so a new contact picks up the glide seamlessly. */
const uFor = (fwd: number) => (fwd > 0 ? (-0.25 + Math.sqrt(0.0625 + 3 * fwd)) / 1.5 : 0);
const CARD = { right: [1, 0], left: [-1, 0], up: [0, 1], down: [0, -1] } as const;

export function releasePointerLock(doc: { exitPointerLock?: () => void } | undefined =
  typeof document === 'undefined' ? undefined : document) {
  try { doc?.exitPointerLock?.(); } catch { /* not locked, or unsupported */ }
}

const labFrame = () => (labAimFrame.t > 0 ? labAimFrame : null);

export function createConductScheme(opts: ConductOptions = {}): ConductScheme {
  releasePointerLock();
  const frame = opts.frame ?? labFrame;
  const m = new ConductMotion(), euro = new OneEuro2(), dash = new Pulse(), side = new Pulse(), trail = new HoverTrail();
  const rates = { yaw: 0, pitch: 0 }, off = { x: 0, y: 0, z: 0 }, probe = { x: 0, y: 0, z: 0 };
  let hovered = false, gain = 1, hx = 0, hy = 0, ht = 0, seenT = -Infinity;
  let touching = false, cruising = false, braked = false, lifted = true, now = 0, downAt = 0, epoch = gesture.epoch;
  let u = 0, fwd = 0, lastDash = -Infinity, spinT = 0, spinDir = 0, pendRoll = 0, pendDash = 0, dashX = 0, dashY = 0;
  const live = () => touching || cruising;
  const state = { get throttle() { return u; }, get forward() { return fwd; }, get cruising() { return cruising; },
    get touching() { return touching; } };
  function toggleCruise() {
    if (cruising) cruising = false;
    else { cruising = true; start(hx * gain, hy * gain, ht); }
    return cruising;
  }
  function start(x: number, y: number, t: number) { downAt = now; lifted = braked = false; u = uFor(fwd); m.begin(x, y, t); }
  function stopMotion() { dash.stop(); side.stop(); spinT = 0; spinDir = 0; pendRoll = pendDash = 0; }
  function brake() { u = fwd = 0; cruising = false; braked = touching; stopMotion(); rates.yaw = rates.pitch = 0; }
  function reset() {
    touching = cruising = hovered = false; u = fwd = 0; seenT = -Infinity; stopMotion(); m.reset(); euro.reset(); trail.reset();
  }
  /** Flick release speed 0.9..3 px/ms -> 6..14 m/s, linear; cooldown 0.6 s from the last dash. */
  function queueDash(speed: number, cx: number, cy: number, peak = -1) {
    if (now - lastDash < DASH_COOLDOWN) return;
    pendDash = peak >= 0 ? peak
      : DASH_MIN + (DASH_MAX - DASH_MIN) * clamp((speed - FLICK_SPEED) / (FLICK_SPEED_MAX - FLICK_SPEED), 0, 1);
    dashX = cx; dashY = cy; lastDash = now;
  }
  function beginDash(f: AimFrame) {
    // Along camera right/up plus forward (horizontal), capped so cruise + dash stays within surge speed.
    const rl = Math.hypot(f.right.x, f.right.z) || 1, fl = Math.hypot(f.dir.x, f.dir.z) || 1;
    const peak = Math.min(pendDash, Math.max(0, SURGE_SPEED - fwd * SURGE_SPEED));
    dash.start(f.right.x / rl * dashX + f.dir.x / fl, dashY, f.right.z / rl * dashX + f.dir.z / fl, peak, DASH_S, true);
    opts.cue?.('dash', 0); pendDash = 0;
  }
  function beginRoll(p: Vec, ctx: GestureCtx, f: AimFrame | null) {
    spinDir = pendRoll; spinT = 0; pendRoll = 0; opts.cue?.('roll', spinDir);
    if (!f) return;
    const rl = Math.hypot(f.right.x, f.right.z) || 1, rx = f.right.x / rl * spinDir, rz = f.right.z / rl * spinDir;
    probe.x = p.x + rx * ROLL_OFFSET_M; probe.y = p.y; probe.z = p.z + rz * ROLL_OFFSET_M;
    // A blocked sidestep leaves a pure body roll.
    if (ctx.pathClear(p, probe)) side.start(rx, 0, rz, SIDESTEP_PEAK, ROLL_S, false);
  }
  function feed(x: number, y: number, t: number) {
    m.sample(x, y, t);
    if (m.sparkle) { m.sparkle = false; opts.cue?.('sparkle', 0); }
    if (m.roll) { if (!spinDir && !pendRoll) pendRoll = m.roll; m.roll = 0; }
  }
  function step(dt: number, p: Vec, ctx: GestureCtx) {
    if (gesture.epoch !== epoch) { epoch = gesture.epoch; reset(); }
    if (gesture.override) { brake(); touching = false; }
    now += dt; m.advance(dt);
    const on = live(), since = (now - downAt) * 1000, f = frame();
    if (on && !lifted && since >= STEER_GRACE_MS) {
      lifted = true;
      if (ctx.groundBelow(p) <= GROUNDED_M) gesture.request = LIFT_REQUEST;
    }
    if (on) {
      const target = since >= STEER_GRACE_MS ? Math.max(m.stirLevel, braked ? 0 : THROTTLE_FLOOR) : 0;
      if (u < target) u = Math.min(target, u + THROTTLE_RISE * dt);
      fwd = flowSpeed(u) / SURGE_SPEED;
    } else {
      fwd *= Math.exp(-dt / LIFT_TAU);
      if (fwd < SNAP_INTENT) fwd = 0;
    }
    if (pendRoll) beginRoll(p, ctx, f);
    if (pendDash && f) beginDash(f);
    // Touch steers from the centroid; desktop cruise from the 1-euro hover point (button cruise with no hover does not steer).
    const src = touching ? 1 : cruising && hovered ? 2 : 0;
    if (!src || since < STEER_GRACE_MS || !f) rates.yaw = rates.pitch = 0;
    else if (!m.frozen && !spinDir) steerRates(f, src === 1 ? m.cx : euro.x, src === 1 ? m.cy : euro.y, p, rates);
    const reduced = opts.reduced?.() ?? false, scale = reduced ? RM_OFFSET_SCALE : 1;
    off.x = off.y = off.z = 0; dash.add(dt, off, scale); side.add(dt, off, scale);
    let spin = 0;
    if (spinDir) {
      spinT = Math.min(ROLL_S, spinT + dt);
      const k = spinT / ROLL_S;
      spin = reduced || k >= 1 ? 0 : spinDir * 2 * Math.PI * k * k * (3 - 2 * k);
      if (k >= 1) spinDir = 0;
    }
    const g = gesture;
    g.live = on; g.surge = fwd > 0; g.intent.forward = fwd; g.intent.strafe = 0; g.intent.vertical = 0;
    g.yawRate = rates.yaw; g.pitchRate = rates.pitch; g.spin = spin;
    g.offset.x = off.x; g.offset.y = off.y; g.offset.z = off.z;
  }

  return {
    id: 'conduct',
    state,
    down(s: StrokeView) {
      if (s.kind === 'mouse') return; // desktop press-drag looks
      touching = true; seenT = s.lastT; start(s.lastX, s.lastY, s.lastT);
    },
    move(s: StrokeView) {
      if (s.kind === 'mouse' || !touching) return;
      let i = s.count - 1;
      while (i > 0 && s.t(i - 1) > seenT) i--;
      for (; i < s.count; i++) if (s.t(i) > seenT) { feed(s.x(i), s.y(i), s.t(i)); seenT = s.t(i); }
    },
    up(s: StrokeView, c: StrokeClass) {
      if (s.kind === 'mouse' || !touching) return;
      touching = false; // lift: glide (decay) from here; a flick release also dashes
      if (c.kind === 'flick' && c.dir) queueDash(c.speed, CARD[c.dir][0], CARD[c.dir][1]);
    },
    cancel() { touching = false; u = fwd = 0; stopMotion(); m.reset(); },
    hover(x: number, y: number, t: number) {
      hx = x; hy = y; ht = t; hovered = true; euro.filter(x, y, t); trail.push(x, y, t);
      if (!cruising || touching) return;
      feed(x * gain, y * gain, t);
      const sp = trail.flick(gain);
      if (sp > 0) queueDash(sp, trail.dx, trail.dy);
    },
    toggleCruise,
    handle(out: ArbiterOut) {
      switch (out.type) {
        case 'clickToggle':
          if (out.drone >= 0) opts.fire?.(out.drone, out.x, out.y, out.t, false); else toggleCruise();
          return true;
        case 'burst': case 'blastNow': opts.fire?.(out.drone, out.x, out.y, out.t, false); return true;
        case 'sustain': opts.fire?.(out.drone, out.x, out.y, out.t, true); return true;
        case 'brake': brake(); return true;
        default: return false;
      }
    },
    setGain(g: number) { gain = Number.isFinite(g) && g > 0 ? g : 1; },
    step,
    reset,
    fallback(a: Action) {
      if (a === 'faster') {
        if (!cruising && !touching) { cruising = true; start(hx * gain, hy * gain, ht); }
        u = Math.min(1, u + FALLBACK_STEP);
      }
      else if (a === 'slower') { u -= FALLBACK_STEP; if (u < THROTTLE_FLOOR) { u = 0; cruising = false; } }
      else if (a === 'dash') queueDash(0, 0, 0, FALLBACK_DASH);
      else if (a === 'roll-left' || a === 'roll-right') { if (!spinDir) pendRoll = a === 'roll-right' ? 1 : -1; }
      else if (a === 'brake') brake();
    },
  };
}

