import type { Vector3 } from 'three';
import { SPEED, START, setVec, type Intent } from './motion';
import { useGame } from './store';
import { flowSpeed, type CaptureState } from './flowFlight';
import { aimGain, createShooter, engaged, resetShooterInput, lookGain } from './combat';
// The landing page imports this module, so vectors stay plain objects and three.js is imported for types only; a value import would load the 3D bundle with the page.
export const runtime = {
  position: { ...START }, velocity: { x: 0, y: 0, z: 0 },
  yaw: 0, pitch: -0.12, surge: false, lift: false, reset: false,
  poseEpoch: 0, cameraDistance: 0,
  turn: { lateral: 0, guard: 0 },
  clearance: { active: false, boundary: false, point: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 1, z: 0 } },
  thumb: { active: false, throttle: 0, strafe: 0, edgeTurn: 0, edgePitch: 0, bank: 0 }, keys: new Set<string>(),
  trackpad: { active: false, throttle: 8 / SPEED.surge, edgeTurn: 0, edgePitch: 0, edgeAge: 0, unlocking: false,
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
};
const lookScratch = { x: 0, y: 0 };
export function readIntent(): Intent {
  const k = runtime.keys;
  const profile = useGame.getState().trackpadSteering;
  const flow = runtime.trackpad.active && profile === 'flow';
  const cruise = runtime.trackpad.active && profile !== 'simple';
  return {
    forward: Math.max(-1, Math.min(1, Number(k.has('KeyW')) - Number(k.has('KeyS')) + runtime.thumb.throttle + (flow ? runtime.trackpad.selectedSpeed / SPEED.surge : cruise ? runtime.trackpad.throttle : 0) + runtime.tap.forward)),
    strafe: Math.max(-1, Math.min(1, Number(k.has('KeyD')) - Number(k.has('KeyA')) + runtime.thumb.strafe + runtime.tap.strafe)),
    vertical: Math.max(-1, Math.min(1, Number(k.has('KeyR')) - Number(k.has('KeyF')) + runtime.tap.vertical)),
    ...(flow ? { precise: true as const } : {}),
  };
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
  if (!keepShooter) resetShooterInput(runtime.shooter);
  runtime.keys.clear(); clearKeyHold(); releaseThumb(); stopTrackpad();
  runtime.tap = { forward: 0, strafe: 0, vertical: 0 };
  runtime.surge = false; runtime.lift = false; runtime.landGoal = null;
  useGame.setState({ landing: false });
  if (stop) setVec(runtime.velocity, 0, 0, 0);
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
  Object.assign(runtime.trackpad, { active: true, throttle: useGame.getState().cruiseSpeed / SPEED.surge, edgeTurn: 0, edgePitch: 0, edgeAge: 0 });
  useGame.setState({ trackpadFlying: true });
}
export function stopTrackpad() {
  runtime.trackpad.cancelEpoch++;
  if (runtime.trackpad.capture !== 'idle') runtime.trackpad.brakeEpoch++;
  Object.assign(runtime.trackpad, { active: false, edgeTurn: 0, edgePitch: 0, capture: 'idle', held: false, selectedSpeed: 0 });
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
