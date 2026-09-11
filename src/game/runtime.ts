import { Vector3 } from 'three';
import { SPEED, START, type Intent } from './motion';
import { useGame } from './store';
export const runtime = {
  position: new Vector3(START.x, START.y, START.z), velocity: new Vector3(),
  yaw: 0, pitch: -0.12, surge: false, lift: false, reset: false,
  poseEpoch: 0, cameraDistance: 0,
  clearance: { active: false, boundary: false, point: new Vector3(), normal: new Vector3(0, 1, 0) },
  thumb: { active: false, throttle: 0, strafe: 0, edgeTurn: 0, edgePitch: 0, bank: 0 }, keys: new Set<string>(),
  trackpad: { active: false, throttle: 8 / SPEED.surge, edgeTurn: 0, edgePitch: 0 },
  tap: { forward: 0, strafe: 0, vertical: 0 },
  landTarget: null as Vector3 | null, landGoal: null as Vector3 | null,
  speed: 0, altitude: START.y, frames: [] as number[], elapsed: 0, location: 'Arrival terrace',
  frameIndex: 0, skipSample: true, resources: { drawCalls: 0, triangles: 0, geometries: 0, textures: 0 },
  peakResources: { drawCalls: 0, triangles: 0, geometries: 0, textures: 0 },
};
export function readIntent(): Intent {
  const k = runtime.keys;
  return {
    forward: Math.max(-1, Math.min(1, Number(k.has('KeyW')) - Number(k.has('KeyS')) + runtime.thumb.throttle + (runtime.trackpad.active ? runtime.trackpad.throttle : 0) + runtime.tap.forward)),
    strafe: Math.max(-1, Math.min(1, Number(k.has('KeyD')) - Number(k.has('KeyA')) + runtime.thumb.strafe + runtime.tap.strafe)),
    vertical: Math.max(-1, Math.min(1, Number(k.has('KeyR')) - Number(k.has('KeyF')) + runtime.tap.vertical)),
  };
}
export function clearInput(stop = false) {
  runtime.keys.clear(); releaseThumb(); stopTrackpad();
  runtime.tap = { forward: 0, strafe: 0, vertical: 0 };
  runtime.surge = false; runtime.lift = false; runtime.landGoal = null;
  useGame.setState({ surging: false, landing: false });
  if (stop) runtime.velocity.set(0, 0, 0);
}
export function toggleSurge() { runtime.surge = !runtime.surge; useGame.setState({ surging: runtime.surge }); }
export function look(dx: number, dy: number) {
  runtime.yaw -= dx * 0.003;
  runtime.pitch = Math.max(-1.3, Math.min(1.25, runtime.pitch - dy * 0.003));
}
export function releaseThumb() {
  runtime.thumb = { active: false, throttle: 0, strafe: 0, edgeTurn: 0, edgePitch: 0, bank: 0 };
}
export function startTrackpad() {
  releaseThumb();
  Object.assign(runtime.trackpad, { active: true, throttle: 8 / SPEED.surge, edgeTurn: 0, edgePitch: 0 });
  useGame.setState({ trackpadFlying: true });
}
export function stopTrackpad() {
  Object.assign(runtime.trackpad, { active: false, edgeTurn: 0, edgePitch: 0 });
  if (useGame.getState().trackpadFlying) useGame.setState({ trackpadFlying: false });
}
