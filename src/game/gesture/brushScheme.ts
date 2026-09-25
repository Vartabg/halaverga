// Brush strokes (spec 6): cruise after Lift, and each recognised stroke runs one timed maneuver. Pure: the host injects flight
// state and the U3 lasso/lockBurst, so node tests drive it directly. Allocation-free after createBrushScheme.
import type { Vec } from '../motion';
import type { Action, Cardinal, GestureCtx, StrokeClass, StrokeView } from './types';
import { gesture, LIFT_REQUEST } from './bus';
import { ACCEL, BRAKE_HOLD_MS, DIVE_FLOOR_M, HOLD_MS, TAP_SLOP_MOUSE, TAP_SLOP_TOUCH } from './tuning';
import { straightFast } from './strokeFeatures';
import {
  cancelManeuver, createManeuver, createManeuverOut, setRollBlocked, startDive, startNudge, startRoll, startSoar, startTurn,
  stepManeuver, swipeMag, type CancelReason,
} from './maneuvers';
import { BRUSH_LAND_LOW_M, BRUSH_PULLOUT_M, NO_DRONE, SWIPE_COMMIT_WIND_DEG, cardinalOf, closedStroke as closed, type BrushHost,
  type BrushScheme, type BrushView } from './brushHost';
export { BRUSH_LAND_LOW_M, BRUSH_PULLOUT_M, NO_DRONE, SWIPE_COMMIT_WIND_DEG, cardinalOf, type BrushHost, type BrushScheme,
  type BrushView } from './brushHost';

/** Lateral reach checked with pathClear before a roll sidesteps (ROLL_OFFSET_M plus a margin). */
const ROLL_CHECK_M = 3.5, FALLBACK_MAG = 0.5;
/** Under clearance, a program is cancelled only when its push points this far into the obstacle (dot with the surface normal). */
const INTO = -0.3;

export function createBrushScheme(host: BrushHost): BrushScheme {
  const m = createManeuver(), out = createManeuverOut(), g = gesture;
  const landReq = { kind: 'land' as const, x: 0, y: 0, z: 0 };
  const probeA = { x: 0, y: 0, z: 0 }, probeB = { x: 0, y: 0, z: 0 };
  const view: BrushView = { guide: false, ring: 0, locks: 0, committed: false, recognized: 0, speed: 0, grey: false,
    program: 'none', lastCancel: null };
  let cruise = false, flying = false, wasFlying: boolean | null = null, ground = Infinity, epoch = g.epoch;
  let active = false, real = false, braked = false, lastT = 0, lastY = NaN, vy = 0;
  /** The host ctx, remembered from step so the lock fallback can announce a miss. */
  let ctxRef: GestureCtx | null = null;

  function cancel(reason: CancelReason) {
    const r = cancelManeuver(m, reason);
    if (r) view.lastCancel = r;
    stepManeuver(m, 0, ground, out);
  }
  /** Soar, dive and the pull-out own the vertical; otherwise the cruise cancels the view pitch's sink and holds altitude. */
  const holds = () => m.id !== 'soar' && m.id !== 'dive' && m.id !== 'pullout';
  function write() {
    const i = g.intent, yaw = host.yaw();
    view.program = m.id;
    g.live = active && real;
    i.forward = cruise && flying ? out.forward : 0; i.strafe = 0;
    i.vertical = out.vertical - (i.forward > 0 && holds() ? Math.sin(host.pitch?.() ?? 0) * i.forward : 0);
    g.surge = out.surge; g.yawRate = out.yawRate; g.pitchRate = out.pitchRate; g.spin = out.spin;
    g.offset.x = Math.cos(yaw) * out.right; g.offset.y = out.up; g.offset.z = -Math.sin(yaw) * out.right;
    g.velocityOn = false; g.facing = 0;
  }
  function brake() { cancel('brake'); cruise = false; write(); }
  function recognized(speed: number) { view.recognized++; view.speed = speed; view.grey = false; }
  /**
   * Replaces any running program (turn, soar, dive, roll) and resumes cruise, lifting off when grounded. A swipe down while
   * flying low, or ending on the land target (ex, ey), lands instead; standing, a swipe down lifts and dives.
   */
  function run(kind: Cardinal | 'roll', value: number, ex = NaN, ey = NaN) {
    cancel('stroke');
    const lt = host.landTarget();
    if (kind !== 'roll') host.guide?.(kind === 'left' || kind === 'right' ? 'turn' : kind);
    if (kind === 'down' && flying && lt && (ground < BRUSH_LAND_LOW_M || (ex === ex && !!host.landAt?.(ex, ey)))) {
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
  /** Whether the running program pushes into the obstacle whose surface normal (out of it) is n. */
  function into(n: Vec) {
    const yaw = host.yaw(), rx = Math.cos(yaw), rz = -Math.sin(yaw), side = rx * n.x + rz * n.z;
    const d = m.id === 'turn' ? -m.sign * side : m.id === 'roll' ? (m.blocked ? 0 : m.sign * side)
      : m.id === 'soar' || m.id === 'pullout' ? n.y : m.id === 'dive' ? -n.y : m.id === 'nudge' ? m.rx * side + m.uy * n.y : 0;
    return d < INTO;
  }

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
        run(cardinalOf(s.lastX - s.startX, s.lastY - s.startY), swipeMag(s.chord), s.lastX, s.lastY);
      }
    },
    up(s: StrokeView, c: StrokeClass) {
      if (!active) return;
      const wasReal = real;
      endStroke();
      if (!wasReal || view.committed) { write(); return; }
      view.locks = host.lassoEnd(c.kind === 'circle' || c.kind === 'lasso' || closed(s));
      if (view.locks > 0) { host.lockBurst(); recognized(c.speed); host.guide?.('lasso'); }
      else if (c.kind === 'circle' || c.kind === 'lasso') { recognized(c.speed); run('roll', c.winding); }
      else if ((c.kind === 'swipe' || c.kind === 'flick') && c.dir) {
        recognized(c.speed); run(c.dir, swipeMag(Math.hypot(c.chordX, c.chordY)), s.lastX, s.lastY);
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
      // Clearance cancels only a program that pushes into the obstacle: soaring off a floor or turning away from a wall still runs.
      if (host.clearance() && (!host.clearanceNormal || into(host.clearanceNormal()))) cancel('clearance');
      ground = ctx.groundBelow(p);
      vy = lastY === lastY && dt > 0 ? (p.y - lastY) / dt : 0; lastY = p.y;
      if (m.id === 'roll' && m.pending) {
        const yaw = host.yaw(), r = m.sign * ROLL_CHECK_M;
        probeA.x = p.x; probeA.y = p.y; probeA.z = p.z;
        probeB.x = p.x + Math.cos(yaw) * r; probeB.y = p.y; probeB.z = p.z - Math.sin(yaw) * r;
        setRollBlocked(m, !ctx.pathClear(probeA, probeB));
      }
      // The dive pulls out at DIVE_FLOOR_M of this ground: its braking distance and the pull-out margin keep it BRUSH_PULLOUT_M up.
      const brake = vy < 0 ? vy * vy / (2 * ACCEL) : 0;
      stepManeuver(m, dt, ground - brake - (BRUSH_PULLOUT_M - DIVE_FLOOR_M), out);
      write();
    },
    reset() {
      cancelManeuver(m, 'stroke'); stepManeuver(m, 0, Infinity, out);
      cruise = false; wasFlying = null; ground = Infinity; epoch = g.epoch; lastY = NaN; vy = 0; endStroke();
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
