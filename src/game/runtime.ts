import type { Vector3 } from 'three';
import { SPEED, START, moving, setVec, type Intent } from './motion';
import { useGame } from './store';
import { flowSpeed, type CaptureState } from './flowFlight';
import { aimGain, createShooter, engaged, resetShooterInput, lookGain, releaseFire } from './combat';
import { clearGesture, gesture } from './gesture/bus';
import { gestureIntent, type GestureIntentOut } from './gesture/applyGesture';
// The landing page imports this module, so vectors stay plain objects and three.js is imported for types only; a value import would load the 3D bundle with the page.
export const runtime = {
  position: { ...START }, velocity: { x: 0, y: 0, z: 0 },
  yaw: 0, pitch: -0.12, surge: false, lift: false, reset: false,
  poseEpoch: 0, cameraDistance: 0,
  turn: { lateral: 0, guard: 0 },
  clearance: { active: false, boundary: false, point: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 1, z: 0 } },
  thumb: { active: false, throttle: 0, strafe: 0, edgeTurn: 0, edgePitch: 0, bank: 0 }, keys: new Set<string>(),
  trackpad: { active: false, throttle: 8 / SPEED.surge, edgeTurn: 0, edgePitch: 0, edgeAge: 0, unlocking: false,
    /** How the cursor left the window while cruising: 0 inside, 1 through a side (keeps turning), 2 top or bottom; outsideAge in s. */
    outside: 0 as 0 | 1 | 2, outsideAge: 0,
    capture: 'idle' as CaptureState, held: false, selectedSpeed: 0, brakeEpoch: 0, brakedAt: -Infinity, cancelEpoch: 0, captureFailed: false },
  flowPractice: { step: 'idle' as 'idle' | 'look' | 'glide' | 'brake' | 'done', yaw: 0, pitch: 0 },
  tap: { forward: 0, strafe: 0, vertical: 0 },
  landTarget: null as Vector3 | null, landGoal: null as Vector3 | null,
  speed: 0, altitude: START.y, frames: [] as number[], elapsed: 0, location: 'Arrival terrace',
  frameIndex: 0, skipSample: true, resources: { drawCalls: 0, triangles: 0, geometries: 0, textures: 0 },
  peakResources: { drawCalls: 0, triangles: 0, geometries: 0, textures: 0 },
  shooter: createShooter(),
  /** Seconds each arrow axis has been held in one direction (physics clock), and that direction. Blaster only. */
  keyHold: { yaw: 0, pitch: 0, yawSign: 0, pitchSign: 0 },
  /** Twin-stick touch input, written by the touch controls. rise/descend are 0 or 1; moves, climbs and lookTravel only count up.
   *  edgeTurn: the look thumb's edge rest, a signed yaw direction x depth (+ turns left), applied by edgeTurn.ts. */
  stick: { forward: 0, strafe: 0, rise: 0, descend: 0, descendUsed: false, active: false, boost: false, cruise: false,
    moves: 0, climbs: 0, lookTravel: 0, edgeTurn: 0 },
  /** Bumped by clearInput and releaseHeldInput: a touch control whose stored epoch differs is dead until its finger lifts. */
  touchEpoch: 0,
};
/** Held Descend sinks at this fraction of full flight speed (0.7 x 13 = 9.1 m/s). */
export const DESCEND_RATE = .7;
const lookScratch = { x: 0, y: 0 };
/** Rise and Descend: both held hover; a Descend already spent on a landing approach no longer sinks. */
function stickVertical() {
  const st = runtime.stick;
  return st.rise && st.descend ? 0 : st.rise - (st.descendUsed ? 0 : st.descend * DESCEND_RATE);
}
const clamp1 = (v: number) => Math.max(-1, Math.min(1, v));
const labIntent: GestureIntentOut = { forward: 0, strafe: 0, vertical: 0, precise: false };
/**
 * Keys, thumbs, sticks, tap pad and trackpad, plus the Gesture Lab's intent (spec 2.8: added only while live or with no landGoal,
 * precise only while live). Any movement from the other sources sets gesture.override, so a lab scheme drops its path or program.
 */
export function readIntent(): Intent {
  const k = runtime.keys, st = runtime.stick;
  const profile = useGame.getState().trackpadSteering;
  const flow = runtime.trackpad.active && profile === 'flow';
  const cruise = runtime.trackpad.active && profile !== 'simple';
  const forward = Number(k.has('KeyW')) - Number(k.has('KeyS')) + runtime.thumb.throttle + (flow ? runtime.trackpad.selectedSpeed / SPEED.surge : cruise ? runtime.trackpad.throttle : 0) + runtime.tap.forward + st.forward;
  const strafe = Number(k.has('KeyD')) - Number(k.has('KeyA')) + runtime.thumb.strafe + runtime.tap.strafe + st.strafe;
  const vertical = Number(k.has('KeyR')) - Number(k.has('KeyF')) + runtime.tap.vertical + stickVertical();
  const base: Intent = { forward: clamp1(forward), strafe: clamp1(strafe), vertical: clamp1(vertical), ...(flow ? { precise: true as const } : {}) };
  gesture.override = moving(base);
  const g = gestureIntent(runtime.landGoal, labIntent);
  if (!g.forward && !g.strafe && !g.vertical && !g.precise) return base;
  return { forward: clamp1(forward + g.forward), strafe: clamp1(strafe + g.strafe), vertical: clamp1(vertical + g.vertical),
    ...(flow || g.precise ? { precise: true as const } : {}) };
}
/** Arrow-key fine aim: while the blaster is engaged a fresh press turns at 30% for 150 ms, so a tap is about 1.3-1.5 deg. */
export const KEY_FINE = .3, KEY_RAMP = .15;
export const keyTurnRate = (held: number, blend: number, fine: boolean) =>
  aimGain(blend) * (fine && held < KEY_RAMP - 1e-9 ? KEY_FINE : 1);
const clearKeyHold = () => { const h = runtime.keyHold; h.yaw = h.pitch = h.yawSign = h.pitchSign = 0; };
/**
 * Arrow look with the blaster on (Player calls main's fixed-rate lines instead when it is off). The hold time is counted per axis on
 * the physics step (auto-repeat and pause cannot reset or advance it). Idle, blend 0 and not engaged, the rate is exactly main's.
 */
export function arrowLook(dt: number) {
  const k = runtime.keys, h = runtime.keyHold, s = runtime.shooter, fine = engaged(s), a = s.aim.blend;
  const sy = Number(k.has('ArrowLeft')) - Number(k.has('ArrowRight')), sp = Number(k.has('ArrowUp')) - Number(k.has('ArrowDown'));
  if (sy !== h.yawSign) { h.yawSign = sy; h.yaw = 0; }
  if (sp !== h.pitchSign) { h.pitchSign = sp; h.pitch = 0; }
  runtime.yaw += sy * dt * 1.5 * keyTurnRate(h.yaw, a, fine);
  runtime.pitch = Math.max(-1.3, Math.min(1.25, runtime.pitch + sp * dt * 1.2 * keyTurnRate(h.pitch, a, fine)));
  if (sy) h.yaw += dt;
  if (sp) h.pitch += dt;
}
export function clearInput(stop = false, keepShooter = false) {
  // The lab's aimed burst ends too (trackAimed drops its state once 'gesture' no longer holds the trigger).
  releaseFire(runtime.shooter, 'gesture'); clearGesture();
  if (!keepShooter) resetShooterInput(runtime.shooter);
  runtime.keys.clear(); clearKeyHold(); releaseThumb(); stopTrackpad(); zeroStick();
  runtime.tap = { forward: 0, strafe: 0, vertical: 0 };
  runtime.surge = false; runtime.lift = false; runtime.landGoal = null; runtime.touchEpoch++;
  useGame.setState({ landing: false });
  if (stop) setVec(runtime.velocity, 0, 0, 0);
}
/** Zeroes the live stick values; the counters (moves, climbs, lookTravel) are kept. */
function zeroStick() {
  const st = runtime.stick;
  st.forward = st.strafe = st.rise = st.descend = st.edgeTurn = 0; st.descendUsed = st.active = st.boost = st.cruise = false;
}
/**
 * Touch-mode blur, rotation or a lost gesture: lets go of everything held without pausing. Velocity, a latched Aim, the trackpad
 * state and a landing in progress stay; only a manual touch Fire is released (an auto-fire hold is auto-fire's to drop).
 */
export function releaseHeldInput() {
  runtime.keys.clear(); clearKeyHold(); releaseThumb(); zeroStick();
  runtime.tap = { forward: 0, strafe: 0, vertical: 0 };
  runtime.surge = false; runtime.lift = false;
  const s = runtime.shooter;
  if (s.input.fireSource === 'touch' && !s.input.auto) releaseFire(s, 'touch');
  releaseFire(s, 'gesture'); clearGesture();
  s.input.touchId = null;
  runtime.touchEpoch++;
}
/**
 * Touch-mode window blur: only the keyboard can miss its keyup while focus is away, so only keys (and a keyboard-held Fire) are
 * dropped. Fingers keep their controls: iOS sends pointercancel itself when the system takes the touches (Control Center,
 * Notification Center), and a blur from focus moving into an iframe (such as a preview toolbar) is no interruption at all.
 */
export function releaseKeys() {
  runtime.keys.clear(); clearKeyHold(); runtime.surge = false;
  const s = runtime.shooter;
  if (s.input.fireSource === 'keys') releaseFire(s, 'keys');
}
export function toggleSurge() { runtime.surge = !runtime.surge; }
export function look(dx: number, dy: number, sensitivity = 1) {
  lookGain(runtime.shooter, dx, dy, lookScratch);
  runtime.yaw -= lookScratch.x * 0.003 * sensitivity;
  runtime.pitch = Math.max(-1.3, Math.min(1.25, runtime.pitch - lookScratch.y * 0.003 * sensitivity));
}
export function releaseThumb() {
  runtime.thumb = { active: false, throttle: 0, strafe: 0, edgeTurn: 0, edgePitch: 0, bank: 0 };
}
export function startTrackpad() {
  releaseThumb();
  Object.assign(runtime.trackpad, { active: true, throttle: useGame.getState().cruiseSpeed / SPEED.surge, edgeTurn: 0, edgePitch: 0, edgeAge: 0, outside: 0, outsideAge: 0 });
  useGame.setState({ trackpadFlying: true });
}
export function stopTrackpad() {
  runtime.trackpad.cancelEpoch++;
  if (runtime.trackpad.capture !== 'idle') runtime.trackpad.brakeEpoch++;
  Object.assign(runtime.trackpad, { active: false, edgeTurn: 0, edgePitch: 0, outside: 0, outsideAge: 0, capture: 'idle', held: false, selectedSpeed: 0 });
  runtime.trackpad.brakedAt = performance.now();
  if (useGame.getState().trackpadFlying) useGame.setState({ trackpadFlying: false });
}
export function setFlowThrottle(u: number) {
  runtime.trackpad.throttle = u;
  runtime.trackpad.selectedSpeed = flowSpeed(u);
}
/** Neutralize all translation without giving up the view or restarting on button release. */
export function brakeFlow() {
  runtime.keys.clear(); clearKeyHold(); releaseThumb(); runtime.tap = { forward: 0, strafe: 0, vertical: 0 };
  runtime.surge = runtime.lift = false; runtime.landGoal = null;
  setFlowThrottle(0);
  if (runtime.trackpad.capture !== 'idle') runtime.trackpad.brakeEpoch++;
  runtime.trackpad.brakedAt = performance.now();
  useGame.setState({ landing: false });
}
export function startFlow() {
  clearInput();
  Object.assign(runtime.trackpad, { active: true, capture: 'engaged', edgeAge: 0 });
  setFlowThrottle(0);
  // One finger + keyboard with the blaster: keys fly, so the capture click only frees the view and never lifts off the ground.
  const g = useGame.getState();
  runtime.lift = !g.flying && !(g.trackpadSteering === 'simple' && g.shooter);
  useGame.setState({ trackpadFlying: true });
}
