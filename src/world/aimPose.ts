import { Euler, Quaternion, Vector3, type Object3D } from 'three';
import { SNAP, springStep, type Muzzle, type Vec3 } from '../game/combat';
import { BONE_COUNT, LIMITS } from './suitSkeleton';
import { createPose, mixPose } from './clipSampler';
/** XYZ Euler; an upright arm pointing forward on the GLB heads. */
export const AIM_BASE = { clavicle_r: [0, .1, 0], upperarm_r: [1.571, 0, -.124], forearm_r: [.2, 0, 0], hand_r: [0, 0, 0] } as const;
/** The right-forearm emitter layer: weight (0..1), the smoothed IK distance (m), the recoil spring and the last shot count seen. */
export type SuitAim = { epoch: number; weight: number; dist: number; kick: number; kickV: number; shots: number };
export const createSuitAim = (): SuitAim => ({ epoch: NaN, weight: 0, dist: 30, kick: 0, kickV: 0, shots: 0 });
const HEAD = 1, UPPER = 3, FORE = 7, SPINE = 10, CHEST = 11, NECK = 12, CLAV = 14, HAND = 16;
const ARM = [CLAV, UPPER, FORE, HAND] as const, TOUCHED = [SPINE, CHEST, NECK, HEAD, CLAV, UPPER, FORE, HAND] as const;
const KICK_W = 40, KICK_Z = .5, RAD = Math.PI / 180;
/** Velocity impulse that peaks an at-rest spring at exactly 1: the impulse response peaks at v/w · e^(-z·acos z / sqrt(1 - z²)). */
const IMPULSE = KICK_W * Math.exp(KICK_Z * Math.acos(KICK_Z) / Math.sqrt(1 - KICK_Z * KICK_Z));
const AIM = createPose(), MASK = new Float32Array(BONE_COUNT), buf = createPose();
const qa = new Quaternion(), qb = new Quaternion(), ID = new Quaternion(), X = new Vector3(1, 0, 0);
const target = new Vector3(), shoulder = new Vector3(), tip = new Vector3(), point = new Vector3(), va = new Vector3(), vb = new Vector3();
const spring = { x: 0, v: 0 };
([['clavicle_r', CLAV], ['upperarm_r', UPPER], ['forearm_r', FORE], ['hand_r', HAND]] as const).forEach(([name, b]) => {
  const e = AIM_BASE[name]; MASK[b] = 1; qa.setFromEuler(new Euler(e[0], e[1], e[2])).toArray(AIM, b * 4);
});
const clamp = (v: number, low: number, high: number) => Math.min(high, Math.max(low, v));
/** Exponential approach that lands exactly on the target inside SNAP. */
function ease(value: number, to: number, rate: number, dt: number) {
  const next = value + (to - value) * (1 - Math.exp(-rate * dt));
  return Math.abs(next - to) < SNAP ? to : next;
}
/**
 * Advances the layer. `target` is 0..1 (the integration passes max(ADS blend, hip fire hold), and 0 in first person); `origin` and
 * `point` are the camera ray origin and resolved crosshair point; `shots` is the weapon's shot count, whose increases kick the arm.
 */
export function advanceSuitAim(a: SuitAim, epoch: number, target: number, origin: Vec3, point: Vec3, shots: number, paused: boolean, reduced: boolean, elapsed: number) {
  if (paused) return;
  const goal = Number.isFinite(target) ? clamp(target, 0, 1) : 0;
  const r = Math.hypot(point.x - origin.x, point.y - origin.y, point.z - origin.z), range = r >= 0 ? clamp(r, 2, 250) : a.dist;
  if (a.epoch !== epoch) {
    // A teleport or resume starts from the new state instead of animating across the gap.
    a.epoch = epoch; a.weight = goal; a.kick = a.kickV = 0; a.dist = range; a.shots = shots; return;
  }
  const dt = Number.isFinite(elapsed) ? clamp(elapsed, 0, .05) : 0;
  a.weight = reduced ? goal : ease(a.weight, goal, 20, dt);
  // Only the IK distance is smoothed; the gameplay ray never is.
  a.dist = ease(a.dist, range, 12, dt);
  if (reduced) a.kick = a.kickV = 0;
  else {
    if (shots > a.shots) a.kickV += IMPULSE * (shots - a.shots);
    springStep(a.kick, a.kickV, KICK_W, KICK_Z, dt, spring); a.kick = spring.x; a.kickV = spring.v;
    if (Math.abs(a.kick) < 1e-5 && Math.abs(a.kickV) < 1e-4) a.kick = a.kickV = 0;
  }
  a.shots = shots;
}
/** Euler XYZ clamp of one joint to its LIMITS range (a hinge to pure x). */
function limit(joints: Object3D[], b: number) {
  const e = joints[b].rotation, r = LIMITS[b];
  const x = clamp(e.x, r[0], r[1]), y = clamp(e.y, r[2], r[3]), z = clamp(e.z, r[4], r[5]);
  if (x !== e.x || y !== e.y || z !== e.z) e.set(x, y, z);
}
/** Premultiplies the joint by the minimum arc from `from` to `to` (both unit, in its parent frame), scaled by `w`. */
function swing(joint: Object3D, from: Vector3, to: Vector3, w: number) {
  qa.setFromUnitVectors(from, to);
  if (w < 1) qa.slerpQuaternions(ID, qb.copy(qa), w);
  joint.quaternion.premultiply(qa);
}
/** Unit direction from `at` to the target in the frame of `frame` (its world rotation inverted), into `out`. */
function toward(frame: Object3D, at: Vector3, out: Vector3) {
  frame.getWorldQuaternion(qa).invert();
  return out.subVectors(target, at).applyQuaternion(qa).normalize();
}
/**
 * Points the right forearm emitter along the camera ray after the suit animation layers: a small torso pitch and gaze, the arm base
 * pose, a shoulder swing that puts the muzzle on the shoulder-to-target line, and a wrist correction that aims the hand's rest
 * forearm axis at the target. Rotations only, from values earlier layers wrote this frame, so nothing accumulates. Publishes the
 * muzzle world point. At weight 0, or on the rigid ten-joint rig, it writes no joint.
 */
export function applySuitAim(joints: Object3D[], root: Object3D, a: SuitAim, origin: Vec3, dir: Vec3, muzzle: Muzzle) {
  if (!(a.weight >= 1e-4) || joints.length < BONE_COUNT) { muzzle.valid = false; muzzle.weight = 0; return; }
  const w = Math.min(1, a.weight);
  target.set(origin.x + dir.x * a.dist, origin.y + dir.y * a.dist, origin.z + dir.z * a.dist);
  root.updateMatrixWorld(true);
  // Torso: spine and chest each take 35% of the pitch toward the target, in the chest's parent frame. No yaw.
  toward(joints[SPINE], joints[CHEST].getWorldPosition(va), vb);
  const pitch = Math.atan2(vb.y, Math.hypot(vb.x, vb.z)) * .35 * w;
  const spine = joints[SPINE].rotation, chest = joints[CHEST].rotation;
  spine.x = clamp(spine.x + pitch, LIMITS[SPINE][0], LIMITS[SPINE][1]); chest.x = clamp(chest.x + pitch, LIMITS[CHEST][0], LIMITS[CHEST][1]);
  // Gaze: neck and head turn the face (-Z) toward the target, measured in the chest frame.
  toward(joints[CHEST], joints[HEAD].getWorldPosition(va), vb);
  const up = Math.atan2(vb.y, Math.hypot(vb.x, vb.z)), yaw = Math.atan2(-vb.x, -vb.z), n = LIMITS[NECK], h = LIMITS[HEAD];
  const nx = clamp(up * .4, n[0], n[1]), ny = clamp(yaw * .4, n[2], n[3]), hx = clamp(up - nx, h[0], h[1]), hy = clamp(yaw - ny, h[2], h[3]);
  const neck = joints[NECK].rotation, head = joints[HEAD].rotation;
  neck.set(neck.x + (nx - neck.x) * w, neck.y + (ny - neck.y) * w, neck.z);
  head.set(head.x + (hx - head.x) * w, head.y + (hy - head.y) * w, head.z);
  // Arm base: blend toward the aim pose with the sign-aligned nlerp the clips use.
  for (let i = 0; i < ARM.length; i++) joints[ARM[i]].quaternion.toArray(buf, ARM[i] * 4);
  mixPose(buf, AIM, w, MASK);
  for (let i = 0; i < ARM.length; i++) joints[ARM[i]].quaternion.fromArray(buf, ARM[i] * 4);
  // Swing: the shoulder turns the muzzle onto the shoulder-to-target line. The fingertip offset is read from the live joints.
  tip.copy(joints[HAND].position).normalize().multiplyScalar(.18);
  joints[UPPER].getWorldPosition(shoulder); joints[HAND].localToWorld(point.copy(tip));
  joints[CLAV].getWorldQuaternion(qa).invert();
  va.subVectors(point, shoulder).applyQuaternion(qa).normalize(); vb.subVectors(target, shoulder).applyQuaternion(qa).normalize();
  swing(joints[UPPER], va, vb, w); limit(joints, UPPER);
  // Wrist: the hand's rest forearm axis (its own frame) turns onto the wrist-to-target line, in the forearm frame.
  toward(joints[FORE], joints[HAND].getWorldPosition(point), vb);
  swing(joints[HAND], va.copy(tip).normalize().applyQuaternion(joints[HAND].quaternion), vb, w); limit(joints, HAND);
  // Recoil, visual only: the arm rises about the shoulder's x and the elbow closes. The aim ray never moves.
  const k = a.kick * w;
  if (k) { joints[UPPER].quaternion.premultiply(qa.setFromAxisAngle(X, 3 * RAD * k)); joints[FORE].rotation.x += 6 * RAD * k; }
  for (let i = 0; i < TOUCHED.length; i++) limit(joints, TOUCHED[i]);
  joints[SPINE].updateMatrixWorld(true);
  joints[HAND].localToWorld(point.copy(tip));
  muzzle.x = point.x; muzzle.y = point.y; muzzle.z = point.z; muzzle.valid = true; muzzle.weight = a.weight;
}
