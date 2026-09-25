// Brush maneuvers (spec 6): one timed program at a time with smoothstep envelopes. Pure and allocation-free: the scheme owns
// the program slot and the output slot, and turns the output into bus writes (offsets along camera right and world up).
import {
  DIVE_FLOOR_M, DRAW_M_PER_PX, NUDGE_FRAC, OFFSET_JERK, ROLL_OFFSET_M, ROLL_S, SOAR_MAX_S, SOAR_MIN_S, SOAR_PITCH,
  TURN_DODGE, TURN_DUR_BASE, TURN_DUR_K, TURN_MAX_DEG, TURN_MIN_DEG, TURN_MIN_PX,
} from './tuning';
import { STACK_PEAK, STACK_PEAK_RM, turnMaxPx, WHIRL_BANK, WHIRL_RISE, WHIRL_SLOW, whirlDuration, whirlEnvelope, whirlRate } from './whirl';

export type ManeuverId = 'none' | 'turn' | 'soar' | 'dive' | 'pullout' | 'roll' | 'nudge' | 'whirl';
export type CancelReason = 'stroke' | 'brake' | 'override' | 'clearance';

// Timings the spec implies but tuning.ts does not name (kept local to this unit).
/** Soar/Dive plateau edges, and the tail after the Soar climb in which the pitch bump settles back. */
export const EDGE_S = 0.1, SOAR_SETTLE_S = 0.4;
/** Dive length range (length-scaled, as Soar), and the pull-out that follows every dive. */
export const DIVE_MIN_S = 0.5, DIVE_MAX_S = 0.9, PULLOUT_S = 0.5;
/** Soar eases the cruise forward intent by this much at full climb, so vertical 1 reads as a steep pop-up. */
export const SOAR_FORWARD_CUT = 0.5;
/** Unknown-stroke nudge: largest displacement (m) and shortest envelope (s). */
export const NUDGE_MAX_M = 4, NUDGE_MIN_S = 0.45;

const DEG = Math.PI / 180, TAU = Math.PI * 2;
/** Area under bump over u in [0, 1], and the largest |d bump / du|. */
export const BUMP_AREA = 8 / 15, BUMP_SLOPE = 3.08;
const clamp01 = (u: number) => (u < 0 ? 0 : u > 1 ? 1 : u);
export const smoothstep = (u: number) => { const k = clamp01(u); return k * k * (3 - 2 * k); };
/** 16u^2(1-u)^2: 0 with zero slope at both ends, 1 in the middle. */
export const bump = (u: number) => { const k = clamp01(u), b = 4 * k * (1 - k); return b * b; };
const bumpRate = (u: number) => { const k = clamp01(u); return 32 * k * (1 - k) * (1 - 2 * k); };
/** A plateau of 1 over [0, dur] with smoothstep edges of EDGE_S. */
const plateau = (t: number, dur: number) => smoothstep(t / EDGE_S) * (1 - smoothstep((t - dur + EDGE_S) / EDGE_S));

/** Swipe length -> analog tier: linear from TURN_MIN_PX to turnMaxPx(surface width) (60-300 px at the default 852 px). */
export const swipeMag = (px: number, w = 852) => clamp01((px - TURN_MIN_PX) / (turnMaxPx(w) - TURN_MIN_PX));
export const turnAngle = (mag: number) => (TURN_MIN_DEG + (TURN_MAX_DEG - TURN_MIN_DEG) * clamp01(mag)) * DEG;
export const turnDuration = (angle: number) => TURN_DUR_BASE + TURN_DUR_K * (angle / (TURN_MAX_DEG * DEG));
/** Lateral displacement of the turn's dodge envelope, m. */
export const turnDodgeDistance = (angle: number) => TURN_DODGE * turnDuration(angle) * BUMP_AREA;
/** The climb a Soar promises (spec 6: about 6-11 m, length-scaled); the test holds the flight model to it within 10%. */
export const soarClimb = (mag: number) => 6 + 5 * clamp01(mag);
export const soarDuration = (mag: number) => SOAR_MIN_S + (SOAR_MAX_S - SOAR_MIN_S) * clamp01(mag);
export const diveDuration = (mag: number) => DIVE_MIN_S + (DIVE_MAX_S - DIVE_MIN_S) * clamp01(mag);
export const rollPeak = () => ROLL_OFFSET_M / (ROLL_S * BUMP_AREA);
/** NUDGE_FRAC of the chord, at DRAW_M_PER_PX, capped at NUDGE_MAX_M. */
export const nudgeDistance = (chordPx: number) => Math.min(NUDGE_FRAC * chordPx * DRAW_M_PER_PX, NUDGE_MAX_M);
/** Shortest envelope whose derivative stays within OFFSET_JERK for this displacement. */
export const nudgeDuration = (d: number) => Math.max(NUDGE_MIN_S, Math.sqrt(d * BUMP_SLOPE / (BUMP_AREA * OFFSET_JERK)));

export interface Maneuver {
  id: ManeuverId;
  /** Seconds into the program, and its length (Soar includes SOAR_SETTLE_S). */ t: number; dur: number;
  /** Turn and whirl: +1 left (positive yaw, as runtime.yaw). Roll: +1 right (clockwise stroke). */ sign: number;
  /** Turn: profile angle, rad (the carry adds the rest); whirl: |angle|; Soar/Dive climb length, s. */ angle: number;
  /** A stacked turn carries the running yaw rate (rad/s) and dodge speed (m/s) in, decaying as (1 - u)^2 so nothing jumps. */
  rc: number; dc: number;
  /** Peak offset speed, m/s. */ peak: number;
  /** Roll: the sidestep was refused by pathClear (a pure body roll); pending: waiting for the scheme's pathClear check. */
  blocked: boolean; pending: boolean;
  /** Nudge direction: camera right and world up components (unit). */ rx: number; uy: number;
  mag: number;
}
export interface ManeuverOut {
  /** Multiplies the cruise forward intent (Soar eases it so the climb is steep). */
  forward: number;
  vertical: number; surge: boolean;
  yawRate: number; pitchRate: number;
  /** Offset speeds: along camera right (+ right) and world up, m/s. */
  right: number; up: number;
  /** Body-only roll, rad (+ rolls right). */
  spin: number;
}

export const createManeuver = (): Maneuver =>
  ({ id: 'none', t: 0, dur: 0, sign: 1, angle: 0, rc: 0, dc: 0, peak: 0, blocked: false, pending: false, rx: 0, uy: 0, mag: 0 });
export const createManeuverOut = (): ManeuverOut =>
  ({ forward: 1, vertical: 0, surge: false, yawRate: 0, pitchRate: 0, right: 0, up: 0, spin: 0 });

function begin(m: Maneuver, id: ManeuverId, dur: number, sign: number, mag: number): Maneuver {
  m.id = id; m.t = 0; m.dur = dur; m.sign = sign; m.mag = mag;
  m.angle = 0; m.rc = 0; m.dc = 0; m.peak = 0; m.blocked = false; m.pending = false; m.rx = 0; m.uy = 0;
  return m;
}
/** sign +1 turns left. The dodge slides toward the turn at TURN_DODGE peak. */
export function startTurn(m: Maneuver, sign: 1 | -1, mag: number): Maneuver {
  const a = turnAngle(mag);
  begin(m, 'turn', turnDuration(a), sign, mag);
  m.angle = a; m.peak = TURN_DODGE;
  return m;
}
/** A same-direction turn still running grows by this swipe's angle (up to a full circle) and restarts from the rate it has
 * now, so four quick swipes make a 360 in about 2 s. Anything else starts a fresh turn. */
export function extendTurn(m: Maneuver, sign: 1 | -1, mag: number, reduced = false): Maneuver {
  if (m.id !== 'turn' || m.sign !== sign) return startTurn(m, sign, mag);
  const u = clamp01(m.t / m.dur), k = 1 - u;
  const rate = (m.angle / m.dur) * 6 * u * k + m.rc * k * k, dodge = m.peak * bump(u) + m.dc * k * k;
  const rest = m.angle * (1 - smoothstep(u)) + m.rc * m.dur * k * k * k / 3;
  const A = Math.min(turnAngle(mag) + rest, TAU);
  const dur = Math.max(turnDuration(Math.min(A, Math.PI / 2)), 1.5 * A / (reduced ? STACK_PEAK_RM : STACK_PEAK));
  begin(m, 'turn', dur, sign, mag);
  m.rc = Math.min(rate, 3 * A / dur); m.angle = A - m.rc * dur / 3; m.dc = dodge; m.peak = TURN_DODGE * Math.min(1, 1 / dur);
  return m;
}
/** A whirl stroke: signed angle (+ left), a trapezoid yaw rate, the body banked into the spiral and a gentle rise. */
export function startWhirl(m: Maneuver, angle: number, reduced = false): Maneuver {
  const a = Math.abs(angle);
  if (a > 0) begin(m, 'whirl', whirlDuration(a, reduced), angle > 0 ? 1 : -1, 1).angle = a;
  return m;
}
export function startSoar(m: Maneuver, mag: number): Maneuver {
  const d = soarDuration(mag);
  begin(m, 'soar', d + SOAR_SETTLE_S, 1, mag).angle = d;
  return m;
}
export function startDive(m: Maneuver, mag: number): Maneuver {
  const d = diveDuration(mag);
  begin(m, 'dive', d, -1, mag).angle = d;
  return m;
}
/** sign +1 rolls right. The scheme answers `pending` with a pathClear check (setRollBlocked). */
export function startRoll(m: Maneuver, sign: 1 | -1): Maneuver {
  begin(m, 'roll', ROLL_S, sign, 1);
  m.peak = rollPeak(); m.pending = true;
  return m;
}
export function setRollBlocked(m: Maneuver, blocked: boolean) { m.blocked = blocked; m.pending = false; }
/** Screen chord in px (x right, y down); a zero chord starts nothing. */
export function startNudge(m: Maneuver, chordX: number, chordY: number): Maneuver {
  const len = Math.hypot(chordX, chordY);
  if (len < 1e-6) return m;
  const d = nudgeDistance(len), dur = nudgeDuration(d);
  begin(m, 'nudge', dur, 1, d / NUDGE_MAX_M);
  m.peak = d / (dur * BUMP_AREA); m.rx = chordX / len; m.uy = -chordY / len;
  return m;
}
/** Stops the program at once. Returns the reason when something was running, else null. */
export function cancelManeuver(m: Maneuver, reason: CancelReason): CancelReason | null {
  if (m.id === 'none') return null;
  m.id = 'none'; m.t = 0; m.pending = false;
  return reason;
}

function zero(o: ManeuverOut) {
  o.forward = 1; o.vertical = 0; o.surge = false; o.yawRate = 0; o.pitchRate = 0; o.right = 0; o.up = 0; o.spin = 0;
}
/**
 * Advances the program by dt and writes this step's output (sampled at the step midpoint, so integrals match the envelopes).
 * groundBelow is metres to the ground under the hero; a dive under DIVE_FLOOR_M switches to the pull-out at once.
 */
export function stepManeuver(m: Maneuver, dt: number, groundBelow: number, o: ManeuverOut): ManeuverOut {
  zero(o);
  if (m.id === 'dive' && groundBelow < DIVE_FLOOR_M) begin(m, 'pullout', PULLOUT_S, 1, m.mag);
  if (m.id === 'none') return o;
  const tm = m.t + dt / 2, u = tm / m.dur;
  switch (m.id) {
    case 'turn': {
      const k = clamp01(u), tail = (1 - k) * (1 - k);
      o.yawRate = m.sign * ((m.angle / m.dur) * 6 * k * (1 - k) + m.rc * tail);
      o.right = -m.sign * (m.peak * bump(u) + m.dc * tail);
      break;
    }
    case 'whirl': {
      const env = whirlEnvelope(u);
      o.yawRate = m.sign * whirlRate(u, m.angle, m.dur); o.spin = -m.sign * WHIRL_BANK * env;
      o.forward = 1 - WHIRL_SLOW * env; o.vertical = WHIRL_RISE * bump(u);
      break;
    }
    case 'soar':
      o.vertical = tm < m.angle ? plateau(tm, m.angle) : 0;
      o.forward = 1 - SOAR_FORWARD_CUT * o.vertical;
      o.pitchRate = SOAR_PITCH * bumpRate(u) / m.dur;
      break;
    case 'dive':
      o.vertical = -plateau(tm, m.dur); o.surge = true;
      break;
    case 'pullout':
      o.vertical = bump(u);
      break;
    case 'roll':
      o.spin = m.sign * TAU * smoothstep(u);
      if (!m.blocked && !m.pending) o.right = m.sign * m.peak * bump(u);
      break;
    case 'nudge': { const s = m.peak * bump(u); o.right = m.rx * s; o.up = m.uy * s; break; }
  }
  m.t += dt;
  if (m.t >= m.dur) {
    if (m.id === 'dive') begin(m, 'pullout', PULLOUT_S, 1, m.mag);
    else { m.id = 'none'; o.spin = 0; }
  }
  return o;
}
