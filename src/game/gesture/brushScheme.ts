// Brush strokes (spec 6): cruise after Lift, and each recognised stroke runs one timed maneuver. Pure: the host injects flight
// state and the U3 lasso/lockBurst, so node tests drive it directly. Allocation-free after createBrushScheme.
import type { Vec } from '../motion';
import type { Action, Cardinal, GestureCtx, Scheme, StrokeClass, StrokeView } from './types';
import { gesture, LIFT_REQUEST } from './bus';
import { BRAKE_HOLD_MS, CLOSURE_FRAC, CLOSURE_PX, HOLD_MS, TAP_SLOP_MOUSE, TAP_SLOP_TOUCH } from './tuning';
import { straightFast } from './strokeFeatures';
import {
  cancelManeuver, createManeuver, createManeuverOut, setRollBlocked, startDive, startNudge, startRoll, startSoar, startTurn,
  stepManeuver, swipeMag, type CancelReason, type ManeuverId,
} from './maneuvers';

/** A swipe down counts as a landing request when the ground is closer than this (with a landTarget in view). */
export const BRUSH_LAND_LOW_M = 12;
/**
 * The mid-stroke swipe commit (strokeFeatures.straightFast, which waits for the finger to settle so the full length sets the
 * magnitude) also needs little turning so far and no lasso lock, so the opening arc of a large circle never commits.
 */
export const SWIPE_COMMIT_WIND_DEG = 15;
/** Lateral reach checked with pathClear before a roll sidesteps (ROLL_OFFSET_M plus a margin). */
const ROLL_CHECK_M = 3.5, FALLBACK_MAG = 0.5;
export const NO_DRONE = 'No drone in view';

/** What Brush needs from the game (LabControls wires it; tests mock it). */
export interface BrushHost {
  flying(): boolean;
  /** runtime.yaw (the offset basis: camera right = (cos yaw, 0, -sin yaw)). */
  yaw(): number;
  /** FlightSafety clearance is pushing the hero away from geometry. */
  clearance(): boolean;
  /** runtime.landTarget (surface point) or null. */
  landTarget(): Vec | null;
  /** lasso.ts: lassoBegin, lassoSample (locks so far, for mid-stroke rings) and lassoClose(closed) (final locks). */
  lassoBegin(x: number, y: number, t: number): void;
  lassoAdd(x: number, y: number, t: number): number;
  lassoEnd(closed: boolean): number;
  /** aimedShot.lockBurst on the locked drones. */
  lockBurst(): void;
  /** Fallback: lock and burst the nearest visible drone; false when there is none. */
  lockNearest(): boolean;
}
/** What the ink and guides read (U2/U7). Mutated in place. */
export interface BrushView {
  guide: boolean;
  /** Brake-fill ring 0..1 between HOLD_MS and BRAKE_HOLD_MS. */
  ring: number;
  locks: number;
  /** A swipe was committed mid-stroke: the arbiter should end the ink (desktop hover ink commits here). */
  committed: boolean;
  /** Bumped on every recognised stroke (the ink 'sets' and the chime plays); speed is its release speed, px/ms. */
  recognized: number; speed: number;
  /** The last stroke was unknown: the ink greys out. */
  grey: boolean;
  program: ManeuverId;
  lastCancel: CancelReason | null;
}
export interface BrushScheme extends Scheme {
  readonly view: BrushView;
  /** Still-press time from the arbiter's guide/brakeRing/brake outputs: the guide from HOLD_MS, the brake at BRAKE_HOLD_MS. */
  hold(ms: number): void;
  readonly cruising: boolean;
}

/** Chord direction in ±45 deg sectors (screen y down). */
export function cardinalOf(dx: number, dy: number): Cardinal {
  return Math.abs(dx) >= Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'down');
}
/** Closure as the recogniser defines it: the end is back within max(40 px, 30% of the bbox diagonal) of the start. */
const closed = (s: StrokeView) => s.chord <= Math.max(CLOSURE_PX, CLOSURE_FRAC * Math.hypot(s.maxX - s.minX, s.maxY - s.minY));

export function createBrushScheme(host: BrushHost): BrushScheme {
  const m = createManeuver(), out = createManeuverOut(), g = gesture;
  const landReq = { kind: 'land' as const, x: 0, y: 0, z: 0 };
  const probeA = { x: 0, y: 0, z: 0 }, probeB = { x: 0, y: 0, z: 0 };
  const view: BrushView = { guide: false, ring: 0, locks: 0, committed: false, recognized: 0, speed: 0, grey: false,
    program: 'none', lastCancel: null };
  let cruise = false, flying = false, wasFlying: boolean | null = null, ground = Infinity, epoch = g.epoch;
  let active = false, real = false, braked = false, lastT = 0;
  /** The host ctx, remembered from step so the lock fallback can announce a miss. */
  let ctxRef: GestureCtx | null = null;

  function cancel(reason: CancelReason) {
    const r = cancelManeuver(m, reason);
    if (r) view.lastCancel = r;
    stepManeuver(m, 0, ground, out);
  }
  function write() {
    const i = g.intent, yaw = host.yaw();
    view.program = m.id;
    g.live = active && real;
    i.forward = cruise && flying ? out.forward : 0; i.strafe = 0; i.vertical = out.vertical;
    g.surge = out.surge; g.yawRate = out.yawRate; g.pitchRate = out.pitchRate; g.spin = out.spin;
    g.offset.x = Math.cos(yaw) * out.right; g.offset.y = out.up; g.offset.z = -Math.sin(yaw) * out.right;
    g.velocityOn = false; g.facing = 0;
  }
  function brake() { cancel('brake'); cruise = false; write(); }
  function recognized(speed: number) { view.recognized++; view.speed = speed; view.grey = false; }
  /** Replaces any running program (turn, soar, dive, roll) and resumes cruise, lifting off when grounded; low dive = land. */
  function run(kind: Cardinal | 'roll', value: number) {
    cancel('stroke');
    const lt = host.landTarget();
    if (kind === 'down' && lt && ground < BRUSH_LAND_LOW_M) {
      cruise = false; landReq.x = lt.x; landReq.y = lt.y; landReq.z = lt.z; g.request = landReq; g.landArmed = true;
    } else {
      if (kind === 'roll') startRoll(m, value >= 0 ? 1 : -1);
      else if (kind === 'down') startDive(m, value);
      else if (kind === 'up') startSoar(m, value);
      else startTurn(m, kind === 'left' ? 1 : -1, value);
      cruise = true;
      if (!flying) g.request = LIFT_REQUEST;
    }
    write();
  }
  const endStroke = () => { active = false; real = false; view.guide = false; view.ring = 0; };

  return {
    id: 'brush', view,
    get cruising() { return cruise; },
    down(s) {
      active = true; real = false; braked = false; lastT = s.startT;
      view.committed = false; view.guide = false; view.ring = 0; view.locks = 0; view.grey = false;
      host.lassoBegin(s.startX, s.startY, s.startT);
    },
    move(s) {
      if (!active) return;
      let i = s.count - 1;
      while (i > 0 && s.t(i - 1) > lastT) i--;
      for (; i < s.count; i++) if (s.t(i) > lastT) view.locks = host.lassoAdd(s.x(i), s.y(i), s.t(i));
      lastT = s.lastT;
      if (!real && s.travel > (s.kind === 'mouse' ? TAP_SLOP_MOUSE : TAP_SLOP_TOUCH)) {
        real = true; view.guide = false; view.ring = 0;
        cancel('stroke');
        if (!flying) g.request = LIFT_REQUEST;
        write();
      }
      if (real && !view.committed && view.locks === 0 && Math.abs(s.winding) <= SWIPE_COMMIT_WIND_DEG && straightFast(s)) {
        view.committed = true; recognized(s.speed150);
        run(cardinalOf(s.lastX - s.startX, s.lastY - s.startY), swipeMag(s.chord));
      }
    },
    up(s: StrokeView, c: StrokeClass) {
      if (!active) return;
      const wasReal = real;
      endStroke();
      if (!wasReal || view.committed) { write(); return; }
      view.locks = host.lassoEnd(c.kind === 'circle' || c.kind === 'lasso' || closed(s));
      if (view.locks > 0) { host.lockBurst(); recognized(c.speed); }
      else if (c.kind === 'circle' || c.kind === 'lasso') { recognized(c.speed); run('roll', c.winding); }
      else if ((c.kind === 'swipe' || c.kind === 'flick') && c.dir) {
        recognized(c.speed); run(c.dir, swipeMag(Math.hypot(c.chordX, c.chordY)));
      } else if (c.kind !== 'tap' && c.kind !== 'hold') { cancel('stroke'); startNudge(m, c.chordX, c.chordY); view.grey = true; }
      write();
    },
    cancel() { endStroke(); view.locks = 0; view.committed = false; g.live = false; },
    hold(ms) {
      if (!active || real || braked || ms < HOLD_MS) return;
      view.guide = true; view.ring = Math.min(1, (ms - HOLD_MS) / (BRAKE_HOLD_MS - HOLD_MS));
      if (ms >= BRAKE_HOLD_MS) { braked = true; view.guide = false; view.ring = 0; brake(); }
    },
    step(dt: number, p: Vec, ctx: GestureCtx) {
      ctxRef = ctx;
      if (g.epoch !== epoch) { epoch = g.epoch; cancelManeuver(m, 'stroke'); cruise = false; endStroke(); }
      flying = host.flying();
      if (wasFlying !== null && flying !== wasFlying) { cruise = flying; if (!flying) cancelManeuver(m, 'stroke'); }
      wasFlying = flying;
      if (g.override) { cancel('override'); cruise = false; }
      if (host.clearance()) cancel('clearance');
      ground = ctx.groundBelow(p);
      if (m.id === 'roll' && m.pending) {
        const yaw = host.yaw(), r = m.sign * ROLL_CHECK_M;
        probeA.x = p.x; probeA.y = p.y; probeA.z = p.z;
        probeB.x = p.x + Math.cos(yaw) * r; probeB.y = p.y; probeB.z = p.z - Math.sin(yaw) * r;
        setRollBlocked(m, !ctx.pathClear(probeA, probeB));
      }
      stepManeuver(m, dt, ground, out);
      write();
    },
    reset() {
      cancelManeuver(m, 'stroke'); stepManeuver(m, 0, Infinity, out);
      cruise = false; wasFlying = null; ground = Infinity; epoch = g.epoch; endStroke();
      view.locks = 0; view.committed = false; view.grey = false; view.program = 'none'; view.lastCancel = null;
    },
    fallback(a: Action) {
      if (a === 'brake') brake();
      else if (a === 'soar') run('up', FALLBACK_MAG);
      else if (a === 'dive') run('down', FALLBACK_MAG);
      else if (a === 'turn-left') run('left', FALLBACK_MAG);
      else if (a === 'turn-right') run('right', FALLBACK_MAG);
      else if (a === 'roll') run('roll', 1);
      else if (a === 'lock-burst' && !host.lockNearest()) ctxRef?.say(NO_DRONE);
    },
  };
}
