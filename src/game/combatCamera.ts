// Combat framing requests live here; CameraRig is the only camera writer. Plain state, no React or per-frame allocations.
import type { Vec3 } from './combat';
import { MODE } from './banishState';
import { isElite } from './encounter';
const angle = (a: number, b: number) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
const clamp = (v: number, n: number) => Math.max(-n, Math.min(n, v));
export function createCombatCamera() {
  return { ready: false, epoch: -1, yaw: 0, pitch: 0, scale: 1, weight: 0, manual: 0, pilotYaw: 0, pilotPitch: 0,
    target: -1, age: 0, hold: 0, engageYaw: 0, engagePitch: 0, tracking: false };
}
export type CombatCamera = ReturnType<typeof createCombatCamera>;
export type CombatCameraInput = { yaw: number; pitch: number; pilotYaw: number; pilotPitch: number; epoch: number; enabled: boolean;
  reduced: boolean; phase: number; target: number; aim: Vec3; hero: Vec3; aspect: number; dt: number;
  /** A watch on a cast-down demon was dropped this frame: let go of it now, so the held heading cannot turn the pilot toward it. */
  release?: boolean };
/** Retarget from the current view, hold the contact heading, then hand back to the pilot without following a falling victim. */
export function stepCombatCamera(s: CombatCamera, i: CombatCameraInput) {
  const dt = Math.max(0, Math.min(.05, i.dt));
  if (!s.ready || s.epoch !== i.epoch || !i.enabled || i.reduced) {
    s.ready = true; s.epoch = i.epoch; s.yaw = i.yaw; s.pitch = i.pitch; s.scale = 1; s.weight = 0; s.manual = 0;
    s.pilotYaw = i.pilotYaw; s.pilotPitch = i.pilotPitch; s.target = -1; s.age = 0; s.hold = 0; s.tracking = false;
    if (!i.enabled || i.reduced || dt === 0) return s;
  }
  if (dt === 0) return s;
  const dy = angle(s.pilotYaw, i.pilotYaw), dp = i.pilotPitch - s.pilotPitch;
  if (Math.abs(dy) + Math.abs(dp) > 1e-5) {
    s.manual = .65; s.yaw += dy; s.pitch = clamp(s.pitch + dp, 1.3);
  } else s.manual = Math.max(0, s.manual - dt);
  s.pilotYaw = i.pilotYaw; s.pilotPitch = i.pilotPitch;
  const launching = i.phase === 1 && i.target >= 0;
  if (i.release) s.hold = 0;
  if (launching) {
    if (s.target !== i.target) { s.target = i.target; s.age = 0; }
    s.age += dt; s.hold = .16;
    const x = i.aim.x - i.hero.x, y = i.aim.y - i.hero.y - .65, z = i.aim.z - i.hero.z;
    if (Math.hypot(x, y, z) > 2) {
      s.engageYaw = Math.atan2(-x, -z); s.engagePitch = clamp(Math.atan2(y, Math.hypot(x, z)), 1.2);
    }
  } else { s.hold = i.phase === 2 ? Math.max(0, s.hold - dt) : 0; s.age = 0; }
  const wanted = (launching || s.hold > 0) && s.manual === 0;
  s.tracking = wanted;
  if (!wanted && s.weight === 0) { s.yaw = i.yaw; s.pitch = i.pitch; s.scale = 1; s.target = -1; return s; }
  s.weight += ((wanted ? 1 : 0) - s.weight) * (1 - Math.exp(-(wanted ? 18 : 10) * dt));
  const yaw = wanted ? s.engageYaw : i.yaw, pitch = wanted ? s.engagePitch : i.pitch;
  const blend = 1 - Math.exp(-(wanted ? 20 : 12) * dt);
  s.yaw += clamp(angle(s.yaw, yaw) * blend, (wanted ? 10 : 6) * dt);
  s.pitch += clamp((pitch - s.pitch) * blend, 6 * dt);
  const distance = Math.hypot(i.aim.x - i.hero.x, i.aim.y - i.hero.y, i.aim.z - i.hero.z);
  const framing = 1 + s.weight * (.25 + Math.min(.3, distance / 100) + (i.aspect < 1 ? .35 : .1));
  s.scale += (framing - s.scale) * (1 - Math.exp(-8 * dt));
  if (!wanted && s.weight < .001 && Math.abs(angle(s.yaw, i.yaw)) + Math.abs(s.pitch - i.pitch) < .001 && Math.abs(s.scale - 1) < .001) {
    s.yaw = i.yaw; s.pitch = i.pitch; s.weight = 0; s.scale = 1; s.target = -1;
  }
  return s;
}
/** CameraRig records the heading it handed to flight, so only subsequent pilot changes trigger manual override. */
export function rememberCombatPilot(s: CombatCamera, yaw: number, pitch: number) { s.pilotYaw = yaw; s.pilotPitch = pitch; }
export const combatCameraReadout = { target: -1, phase: 0, age: 0, weight: 0, manual: 0, yaw: 0, pitch: 0, heroX: 0, heroY: 0, targetX: 0, targetY: 0, finisher: -1 };

/** How far (m) a point lies ahead of a pilot heading, on the ground plane; negative once it is behind. The view only follows a
 * cast-down demon while it is ahead, so it never swings round to look backward when the angel flies past where it struck. */
export const aheadOf = (yaw: number, from: Vec3, to: Vec3) => (to.x - from.x) * -Math.sin(yaw) + (to.z - from.z) * -Math.cos(yaw);
export const WATCH_AHEAD = 2, WATCH_LINGER = .45;
export const createWatch = () => ({ linger: 0, skip: -1, falling: false, watching: false, dropped: false });
export type Watch = ReturnType<typeof createWatch>;
/**
 * Whether the view follows a lesser demon that has been cast down (CameraRig frames it without turning the pilot). cast: the demon
 * last struck; casting: it is falling now; open: no finisher, string or dive owns the view; ahead: how far ahead of the pilot it
 * is, or once it has struck, the place is (aheadOf). The view follows it while it falls ahead, and stays a beat on where it struck.
 * While the angel is being flown the view stays on its heading (Garo 2026-11-11: "I lose track of where I am heading"): asking for
 * movement (flown), or looking elsewhere (looked), drops this cast's watch for good, so it never swings away and back. dropped: a
 * watch ended on this frame, which the planner is told (CombatCameraInput.release).
 */
export function stepWatch(w: Watch, i: { cast: number; casting: boolean; flown: boolean; looked: boolean; open: boolean; ahead: number; dt: number }) {
  if (!i.casting) w.skip = -1; else if (i.flown || i.looked) w.skip = i.cast;
  const free = i.open && !i.flown && i.cast !== w.skip;
  w.falling = free && i.casting && i.ahead > WATCH_AHEAD;
  w.linger = w.falling ? WATCH_LINGER : free && i.ahead > WATCH_AHEAD ? Math.max(0, w.linger - i.dt) : 0;
  const watching = w.falling || w.linger > 0;
  w.dropped = w.watching && !watching; w.watching = watching;
  return w;
}
export const createFinisherFocus = () => ({ target: -1, active: false, cancelled: false });
/** Keep the opening, rather than a falling victim, in view. A deliberate exit cancels this finisher's framing until it ends. */
export function stepFinisherFocus(s: ReturnType<typeof createFinisherFocus>, i: { last: number; mode: number; phase: number; brake: boolean; steering: boolean; manual: boolean }) {
  const target = isElite(i.last) && (i.mode === MODE.bound || i.mode === MODE.cast) ? i.last : -1;
  if (target !== s.target) { s.target = target; s.cancelled = false; s.active = false; }
  if (target < 0) { s.active = false; return -1; }
  if (i.brake || i.steering || s.active && i.manual || i.phase === 1) s.cancelled = true;
  s.active = !s.cancelled && !i.manual && i.phase === 0;
  return s.active ? target : -1;
}
