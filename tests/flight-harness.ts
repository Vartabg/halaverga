import { Euler, Quaternion, Vector3, type Group } from 'three';
import { CHASE_BOOM, type Pose } from '../src/game/presentation';
import { applySuitPose, orientSuit } from '../src/world/suitPose';
import { applySuitAnimation, createSuitAnimation, type AnimatedPose, type SuitAnimation } from '../src/world/suitAnimation';
import { advanceFlightMix, createFlightMix, type FlightMix } from '../src/world/flightMix';
import { applyFlightClips } from '../src/world/flightPose';
import { rig } from './suit-motion-harness';
/** Flight-layer test helpers: game-consistent flight poses, one Suit.tsx frame, and chase-camera facing measurements. */
export type Rig = ReturnType<typeof rig>;
export const idx = { head: 1, spine: 10, chest: 11, neck: 12, upperarmR: 3, forearmR: 7, handR: 16, shinL: 8, toeL: 19, toeR: 20 } as const;
/** A flying pose whose power and lean follow the speed as advanceFlightPose settles them. */
export function flightPose(patch: Partial<Pose> = {}): AnimatedPose {
  const base = { viewYaw: 0, viewPitch: 0, yaw: 0, pitch: 0, bank: 0, speed: 34, flight: 1, brake: 0, ...patch };
  const power = patch.power ?? Math.min(1, Math.max(0, (base.speed - 3) / 25)) * base.flight;
  return { ...base, power, lean: patch.lean ?? -1.35 * power + base.brake * .12, epoch: 0, position: { x: 0, y: 0, z: 0 } };
}
/** An animation state in steady flight, long after takeoff. */
export function cruising(time = 0): SuitAnimation {
  return Object.assign(createSuitAnimation(), { epoch: 0, flying: true, ground: 0, approach: 0, takeoff: Infinity, time });
}
/** A mix settled on this pose and velocity. */
export function settledMix(p: AnimatedPose, velocity: { x: number; y: number; z: number }, reduced = false, flying = true): FlightMix {
  const mix = createFlightMix(); advanceFlightMix(mix, p, { paused: false, reduced, flying, velocity }, 0); return mix;
}
/** One Suit.tsx frame: orientation, pose targets, the flight clips (unless `clips` is false), then the living layer. */
export function frame(r: Rig, p: AnimatedPose, mix: FlightMix, life: SuitAnimation, hero: number, reduced: boolean, clips = true) {
  const m = { hero, epoch: 0 };
  r.root.position.set(0, 0, 0); orientSuit(r.root, p, m); applySuitPose(r.joints, p, m, reduced);
  const authored = clips ? applyFlightClips(r.joints, mix, p, life, hero, reduced) : 0;
  r.root.position.y += applySuitAnimation(r.joints, life, p, reduced, hero, authored);
  r.root.updateMatrixWorld(true);
  return authored;
}
const view = new Euler(0, 0, 0, 'YXZ'), q = new Quaternion(), v = new Vector3(), e = new Euler();
/** Unit vector from the suit toward the chase camera (boom in the view frame, aimed at the head). */
export const toCamera = (p: Pose) => new Vector3(CHASE_BOOM.x, CHASE_BOOM.y, CHASE_BOOM.z).applyEuler(view.set(p.viewPitch, p.viewYaw, 0)).add(new Vector3(0, .65, 0)).normalize();
export function measure(r: Rig, p: Pose) {
  const camera = toCamera(p), world = (b: number) => r.joints[b].getWorldQuaternion(q);
  const chest = v.set(0, 0, 1).applyQuaternion(world(idx.chest)).dot(camera), face = v.set(0, 0, -1).applyQuaternion(world(idx.head)).dot(camera);
  // Chest yaw against the root: pelvis, spine and chest together.
  const yaw = Math.abs([0, idx.spine, idx.chest].reduce((sum, b) => sum + e.setFromQuaternion(r.joints[b].quaternion).y, 0));
  const hinges = [6, 7].every(i => r.joints[i].rotation.x >= -1e-9) && [8, 9].every(i => r.joints[i].rotation.x <= 1e-9);
  const finite = r.joints.every(j => [j.quaternion.x, j.quaternion.y, j.quaternion.z, j.quaternion.w].every(Number.isFinite));
  return { chest, face, yaw, hinges, finite };
}
export const quats = (joints: Group[]) => joints.flatMap(j => j.quaternion.toArray());
export { createFlightMix, advanceFlightMix, rig };
