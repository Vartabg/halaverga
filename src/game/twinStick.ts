// Floating move stick (pure, landing-safe). The base appears exactly where the thumb lands (throw 0), follows on overshoot and stays
// inside the stick zone. Output: scaled radial dead zone, then out = s^1.5; forward/strafe are screen up/right, relative to camera yaw.
// Boost is a deliberate gesture, as in mobile shooters' sprint: push past the ring into the sprint zone (1.5 R or more, within 35 deg
// of up; a chevron marks it). A thumb resting on the rim is full normal speed. In that cone the base only follows past 2 R, so the
// sprint zone cannot be dragged away; elsewhere it follows at the rim. Boost holds until release, pulling back below .7 or past 50 deg.
import type { Rect } from './touchLayout';
const deg = Math.PI / 180;
export const STICK = { deadzone: .12, curve: 1.5, sprint: 1.5, sprintFollow: 2, boostOff: .7, boostCone: 35 * deg, boostExit: 50 * deg,
  boostMs: 120, tapMs: 200, tapPx: 12, doubleMs: 300, doublePx: 32 } as const;
export type StickState = {
  id: number | null; baseX: number; baseY: number; x: number; y: number; R: number; zone: Rect;
  /** Curved output magnitude 0..1 and its screen angle from straight up (radians, 0..PI). */
  out: number; angle: number; forward: number; strafe: number; active: boolean;
  /** Finger distance from the base in stick radii (not clamped: above 1 the thumb is past the ring). */
  reach: number;
  boost: boolean; boostSince: number | null; cruise: boolean;
  downAt: number; downX: number; downY: number; travel: number;
  /** The last qualifying tap (for the double tap), or lastTapAt = -Infinity. */
  lastTapAt: number; lastTapX: number; lastTapY: number;
};
export function createStick(): StickState {
  return { id: null, baseX: 0, baseY: 0, x: 0, y: 0, R: 64, zone: { l: 0, t: 0, r: 0, b: 0 }, out: 0, angle: 0, reach: 0, forward: 0, strafe: 0,
    active: false, boost: false, boostSince: null, cruise: false, downAt: 0, downX: 0, downY: 0, travel: 0,
    lastTapAt: -Infinity, lastTapX: 0, lastTapY: 0 };
}
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
/** Curved magnitude for a throw of d px on a stick of radius R: 0 inside the dead zone, 1 at the rim. */
export function stickCurve(d: number, R: number): number {
  const m = Math.min(d, R) / R, s = m < STICK.deadzone ? 0 : (m - STICK.deadzone) / (1 - STICK.deadzone);
  return Math.pow(s, STICK.curve);
}
function idleOutput(s: StickState) {
  s.forward = s.cruise ? 1 : 0; s.strafe = 0;
}
/** Boost: on after the finger sits in the sprint zone (reach >= 1.5 within 35 deg of up) for 120 ms; off below .7 or past 50 deg. */
function updateBoost(s: StickState, now: number) {
  if (s.boost) {
    if (s.out < STICK.boostOff || s.angle > STICK.boostExit) { s.boost = false; s.boostSince = null; }
    return;
  }
  if (s.reach >= STICK.sprint && s.angle <= STICK.boostCone) {
    if (s.boostSince === null) s.boostSince = now;
    if (now - s.boostSince >= STICK.boostMs) s.boost = true;
  } else s.boostSince = null;
}
export function stickDown(s: StickState, id: number, x: number, y: number, now: number, R: number, zone: Rect, flying: boolean): void {
  if (s.id !== null) return; // one owner per stick; a second finger is ignored
  s.id = id; s.R = R; s.zone = zone; s.active = true;
  s.baseX = clamp(x, zone.l, zone.r); s.baseY = clamp(y, zone.t, zone.b); s.x = x; s.y = y;
  s.out = 0; s.angle = 0; s.reach = 0; s.boost = false; s.boostSince = null;
  s.downAt = now; s.downX = x; s.downY = y; s.travel = 0;
  if (!flying) s.cruise = false;
  idleOutput(s);
}
export function stickMove(s: StickState, id: number, x: number, y: number, now: number): void {
  if (id !== s.id) return;
  s.x = x; s.y = y; s.travel = Math.max(s.travel, Math.hypot(x - s.downX, y - s.downY));
  let dx = x - s.baseX, dy = y - s.baseY, d = Math.hypot(dx, dy);
  const lead = d > 0 && Math.atan2(Math.abs(dx), -dy) <= STICK.boostCone ? STICK.sprintFollow * s.R : s.R;
  if (d > lead) { // follow: drag the base so the thumb sits at the rim (2 R in the sprint cone), then keep it inside the zone
    const f = 1 - lead / d;
    s.baseX = clamp(s.baseX + dx * f, s.zone.l, s.zone.r); s.baseY = clamp(s.baseY + dy * f, s.zone.t, s.zone.b);
    dx = x - s.baseX; dy = y - s.baseY; d = Math.hypot(dx, dy);
  }
  s.out = d > 0 ? stickCurve(d, s.R) : 0; s.reach = d / s.R;
  s.angle = d > 0 ? Math.atan2(Math.abs(dx), -dy) : 0;
  if (s.out > 0) {
    s.cruise = false; // held travel past the dead zone takes over from cruise
    s.forward = -dy / d * s.out; s.strafe = dx / d * s.out;
  } else idleOutput(s);
  updateBoost(s, now);
}
/** Re-evaluates the boost timer without a move event (a thumb held perfectly still at full throw). */
export function stickTick(s: StickState, now: number): void { if (s.id !== null) updateBoost(s, now); }
export function stickUp(s: StickState, id: number, now: number, flying: boolean): void {
  if (id !== s.id) return;
  const tap = now - s.downAt <= STICK.tapMs && s.travel <= STICK.tapPx;
  if (tap && flying && s.downAt - s.lastTapAt <= STICK.doubleMs &&
    Math.hypot(s.downX - s.lastTapX, s.downY - s.lastTapY) <= STICK.doublePx) {
    s.cruise = !s.cruise; s.lastTapAt = -Infinity;
  } else if (tap) { s.lastTapAt = now; s.lastTapX = s.downX; s.lastTapY = s.downY; }
  else s.lastTapAt = -Infinity;
  if (!flying) s.cruise = false;
  s.id = null; s.active = false; s.out = 0; s.angle = 0; s.reach = 0; s.boost = false; s.boostSince = null;
  s.baseX = s.x = s.downX; s.baseY = s.y = s.downY;
  idleOutput(s);
}
/** Drops everything, cruise included (cancel, blur, releaseHeldInput, clearInput). */
export function stickCancel(s: StickState): void {
  s.id = null; s.active = false; s.out = 0; s.angle = 0; s.reach = 0; s.forward = 0; s.strafe = 0;
  s.boost = false; s.boostSince = null; s.cruise = false; s.travel = 0; s.lastTapAt = -Infinity;
}
/** Knob position relative to the base: the throw clamped to R, so the knob tracks the thumb 1:1 inside the rim. */
export function knobOffset(s: StickState): { x: number; y: number } {
  if (s.id === null) return { x: 0, y: 0 };
  const dx = s.x - s.baseX, dy = s.y - s.baseY, d = Math.hypot(dx, dy);
  const f = d > s.R ? s.R / d : 1;
  return { x: dx * f, y: dy * f };
}
