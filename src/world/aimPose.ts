import { Euler, Quaternion, Vector3, type Object3D } from 'three';
import { SNAP, type Vec3 } from '../game/combat';
import { BARREL_AXIS, MUZZLE } from './cannonContract';
import { BONE_COUNT, LIMITS } from './suitSkeleton';
import { createPose, mixPose } from './clipSampler';
/**
 * XYZ Euler; an upright arm pointing forward on the GLB heads with the elbow straight. The hand is hidden inside the arm cannon.
 * The clavicle is lowered .1 (z): at 0 the raised deltoid met the trapezius in a sharp peak in the chase/ADS silhouette, and lifting
 * it (+.15) sharpened the peak; lowered, the shoulder line runs into the arm as a rounded corner.
 */
export const AIM_BASE = { clavicle_r: [0, .1, -.1], upperarm_r: [1.571, 0, -.124], forearm_r: [0, 0, 0], hand_r: [-.2, 0, 0] } as const;
/**
 * The carry pose while the blaster is on (third person): the cannon held out beside the right hip-to-chest line, elbow bent 80 deg.
 * upperarm_r x also takes clamp(view pitch, +-CARRY_PITCH). The upper arm is abducted (+z, .4 rad) so the chase camera, which sees
 * the body from behind, sees the cannon beside the torso, and turned out (y -.2) so the barrel lies across the view instead of along it:
 * at least 42 deg to the view ray (33 with the old .9 elbow and no turn-out), so the whole .40 m outline reads as a weapon (owner
 * feedback 2026-09-23, "too small on my phone"; a measured sweep of 60 carry poses at 393 x 852 put every best silhouette turned out
 * with the elbow at 1.4). Upper-arm pitch .45, not the sweep's best .7: at .7 the cannon rests so high that the press frame drops the
 * muzzle 34 px at chase portrait (the raise must never dip before the kick; limit 12 px). Turn-out .2, not .3: at .3 the barrel drew
 * up to 15.6 deg off the crosshair line on screen, at .2 3.8 deg (tests/suit-aim.test.ts).
 */
export const CARRY = { clavicle_r: [0, .05, 0], upperarm_r: [.45, -.2, .4], forearm_r: [1.4, 0, 0], hand_r: [0, 0, 0] } as const;
export const CARRY_PITCH = .4;
/** The arm converges on a point at least this far along the camera ray (m); nearer, it would have to reach behind the shoulder. */
export const NEAR_IK = 8;
/**
 * Rates (1/s): the aim weight both ways and the carry weight. At 18/s the punch-out reads as motion at chase: .26 of the way on the
 * press frame at 60 Hz, .45 / .59 / .70 on the next three, 95% by 166 ms (35/s showed carry on N-1 and a nearly straight arm on N).
 */
export const AIM_RATE = 18, CARRY_RATE = 8;
/**
 * The blaster arm layer: aim weight (0..1), shoulder swing weight (the weight), the press snap (fireHold x vent, 0 under reduced
 * motion: see SNAP_FROM), carry weight and the smoothed IK distance (m).
 */
export type SuitAim = { epoch: number; weight: number; swing: number; snap: number; carry: number; dist: number };
export const createSuitAim = (): SuitAim => ({ epoch: NaN, weight: 0, swing: 0, snap: 0, carry: 0, dist: 30 });
/**
 * A press snaps the barrel onto the crosshair only when the arm is far off the line: the snap weight ramps in from SNAP_FROM to
 * SNAP_FROM + SNAP_SPAN of swing correction (rad). The bold carry (r5) rests about 33 deg off the line in 3D, so a press from it
 * snaps most of the way on the shot frame; smaller corrections (a nearly raised arm) keep the unsnapped punch-out.
 */
export const SNAP_FROM = 18 * Math.PI / 180, SNAP_SPAN = 22 * Math.PI / 180;
const HEAD = 1, UPPER = 3, FORE = 7, SPINE = 10, CHEST = 11, NECK = 12, CLAV = 14, HAND = 16;
const ARM = [CLAV, UPPER, FORE, HAND] as const, TORSO = [SPINE, CHEST, NECK, HEAD] as const;
const AIM = createPose(), CARRIED = createPose(), MASK = new Float32Array(BONE_COUNT), buf = createPose();
const qa = new Quaternion(), qb = new Quaternion(), pq = new Quaternion(), pqi = new Quaternion(), euler = new Euler();
const target = new Vector3(), point = new Vector3(), shoulder = new Vector3(), va = new Vector3(), vb = new Vector3(), base = new Quaternion();
const AXIS = new Vector3(BARREL_AXIS.x, BARREL_AXIS.y, BARREL_AXIS.z).normalize(), TIP = new Vector3(MUZZLE.x, MUZZLE.y, MUZZLE.z);
const NAMES = [['clavicle_r', CLAV], ['upperarm_r', UPPER], ['forearm_r', FORE], ['hand_r', HAND]] as const;
NAMES.forEach(([name, b]) => {
  const e = AIM_BASE[name], c = CARRY[name];
  MASK[b] = 1; qa.setFromEuler(euler.set(e[0], e[1], e[2])).toArray(AIM, b * 4); qa.setFromEuler(euler.set(c[0], c[1], c[2])).toArray(CARRIED, b * 4);
});
const clamp = (v: number, low: number, high: number) => Math.min(high, Math.max(low, v));
/** Exponential approach that lands exactly on the target inside SNAP. */
function ease(value: number, to: number, rate: number, dt: number) {
  const next = value + (to - value) * (1 - Math.exp(-rate * dt));
  return Math.abs(next - to) < SNAP ? to : next;
}
const unit = (v: number) => Number.isFinite(v) ? clamp(v, 0, 1) : 0;
/**
 * Advances the layer. blend: the ADS blend; hold: the hip-fire hold (1 on the press frame); carry: the carry goal (0 with the blaster
 * off or in first person); vent: ventAimScale (1 - .6 v) during the overheat vent pose; origin and point: the camera ray origin and the
 * resolved crosshair point. The weight eases at AIM_RATE toward max(blend, hold) x vent in both directions, also under reduced motion.
 */
export function advanceSuitAim(a: SuitAim, epoch: number, blend: number, hold: number, carry: number, vent: number, origin: Vec3, point: Vec3,
  paused: boolean, reduced: boolean, elapsed: number) {
  if (paused) return;
  const v = unit(vent), goal = Math.max(unit(blend), unit(hold)) * v, carried = unit(carry);
  const r = Math.hypot(point.x - origin.x, point.y - origin.y, point.z - origin.z), range = r >= 0 ? clamp(r, NEAR_IK, 250) : a.dist;
  if (a.epoch !== epoch) {
    // A teleport or resume starts from the new state instead of animating across the gap.
    a.epoch = epoch; a.weight = goal; a.carry = carried; a.dist = range; a.swing = goal; a.snap = 0; return;
  }
  const dt = Number.isFinite(elapsed) ? clamp(elapsed, 0, .05) : 0;
  a.weight = ease(a.weight, goal, AIM_RATE, dt);
  a.carry = ease(a.carry, carried, CARRY_RATE, dt);
  // The swing follows the weight; the press snap is gated by how far off the line the arm is (see SNAP_FROM). Reduced motion never snaps.
  a.swing = a.weight; a.snap = reduced ? 0 : unit(hold) * v;
  // Only the IK distance is smoothed; the gameplay ray never is.
  a.dist = ease(a.dist, range, 12, dt);
}
/** Euler XYZ clamp of one joint to its LIMITS range (a hinge to pure x). */
function limit(joints: Object3D[], b: number) {
  const e = joints[b].rotation, r = LIMITS[b];
  const x = clamp(e.x, r[0], r[1]), y = clamp(e.y, r[2], r[3]), z = clamp(e.z, r[4], r[5]);
  if (x !== e.x || y !== e.y || z !== e.z) e.set(x, y, z);
}
/** Unit direction from `at` to the target in the frame of `frame` (its world rotation inverted), into `out`. */
function toward(frame: Object3D, at: Vector3, out: Vector3) {
  frame.getWorldQuaternion(qa).invert();
  return out.subVectors(target, at).applyQuaternion(qa).normalize();
}
/** Torso pitch toward the target (spine and chest 35% each, no yaw) and the gaze (neck and head), weighted by w. */
function torso(joints: Object3D[], w: number) {
  toward(joints[SPINE], joints[CHEST].getWorldPosition(va), vb);
  const pitch = Math.atan2(vb.y, Math.hypot(vb.x, vb.z)) * .35 * w;
  const spine = joints[SPINE].rotation, chest = joints[CHEST].rotation;
  spine.x = clamp(spine.x + pitch, LIMITS[SPINE][0], LIMITS[SPINE][1]); chest.x = clamp(chest.x + pitch, LIMITS[CHEST][0], LIMITS[CHEST][1]);
  toward(joints[CHEST], joints[HEAD].getWorldPosition(va), vb);
  const up = Math.atan2(vb.y, Math.hypot(vb.x, vb.z)), yaw = Math.atan2(-vb.x, -vb.z), n = LIMITS[NECK], h = LIMITS[HEAD];
  const nx = clamp(up * .4, n[0], n[1]), ny = clamp(yaw * .4, n[2], n[3]), hx = clamp(up - nx, h[0], h[1]), hy = clamp(yaw - ny, h[2], h[3]);
  const neck = joints[NECK].rotation, head = joints[HEAD].rotation;
  neck.set(neck.x + (nx - neck.x) * w, neck.y + (ny - neck.y) * w, neck.z);
  head.set(head.x + (hx - head.x) * w, head.y + (hy - head.y) * w, head.z);
}
/** The cannon muzzle (world) and barrel direction (world, unit) from the current forearm_r world matrix. */
export function barrelOf(joints: Object3D[], muzzle: Vector3, dir: Vector3) {
  joints[FORE].localToWorld(muzzle.copy(TIP));
  return dir.copy(AXIS).applyQuaternion(joints[FORE].getWorldQuaternion(qb));
}
/**
 * Lays the arm cannon on the camera ray after the suit animation layers: torso pitch and gaze (by the weight), the arm mixed toward
 * CARRY (by carry) and then AIM_BASE (by the weight), then a barrel-exact shoulder swing (by the swing weight) that puts the cannon's
 * barrel axis through the target from its own muzzle. Rotations only, from values earlier layers wrote this frame, so nothing
 * accumulates. With carry and weight both 0, or on the rigid ten-joint rig, it writes no joint and returns false.
 */
export function applySuitAim(joints: Object3D[], root: Object3D, a: SuitAim, origin: Vec3, dir: Vec3) {
  const w = a.weight >= 1e-4 ? Math.min(1, a.weight) : 0, c = a.carry >= 1e-4 ? Math.min(1, a.carry) : 0;
  if ((w === 0 && c === 0) || joints.length < BONE_COUNT) return false;
  target.set(origin.x + dir.x * a.dist, origin.y + dir.y * a.dist, origin.z + dir.z * a.dist);
  root.updateMatrixWorld(true);
  if (w > 0) torso(joints, w);
  // Arm: the clip toward the carry (its shoulder follows the view pitch), then toward the aim base, with the clips' sign-aligned nlerp.
  for (let i = 0; i < ARM.length; i++) joints[ARM[i]].quaternion.toArray(buf, ARM[i] * 4);
  if (c > 0) {
    const u = CARRY.upperarm_r, pitch = clamp(Math.asin(clamp(dir.y, -1, 1)), -CARRY_PITCH, CARRY_PITCH);
    qa.setFromEuler(euler.set(u[0] + pitch, u[1], u[2])).toArray(CARRIED, UPPER * 4);
    mixPose(buf, CARRIED, c, MASK);
  }
  if (w > 0) mixPose(buf, AIM, w, MASK);
  for (let i = 0; i < ARM.length; i++) joints[ARM[i]].quaternion.fromArray(buf, ARM[i] * 4);
  const sw0 = Math.min(1, a.swing), snap = Math.min(1, a.snap);
  if (sw0 >= 1e-4 || snap >= 1e-4) {
    // Swing: the shoulder turns the whole arm until the barrel line (from the muzzle, along the barrel axis) runs through the target.
    // A turn about the shoulder keeps every distance to it, so the barrel point Q at the target's distance from the shoulder must
    // land on the target: one minimum arc (in the clavicle frame) from Q to the target solves it exactly; a second pass only mops up
    // rounding. Plain muzzle-direction iteration converges at only |muzzle - shoulder| / |target - muzzle| per pass (about .5 up close).
    root.updateMatrixWorld(true);
    base.copy(joints[UPPER].quaternion); joints[CLAV].getWorldQuaternion(pq); pqi.copy(pq).invert();
    for (let i = 0; i < 2; i++) {
      barrelOf(joints, point, va); joints[UPPER].getWorldPosition(shoulder);
      point.sub(shoulder); vb.subVectors(target, shoulder);
      const md = point.dot(va), reach = vb.length(), disc = md * md - point.lengthSq() + reach * reach;
      point.addScaledVector(va, -md + Math.sqrt(Math.max(0, disc))).normalize();
      qa.setFromUnitVectors(point, vb.normalize()).premultiply(pqi).multiply(pq);
      joints[UPPER].quaternion.premultiply(qa); joints[UPPER].updateMatrixWorld(true);
    }
    const off = clamp((base.angleTo(joints[UPPER].quaternion) - SNAP_FROM) / SNAP_SPAN, 0, 1), sw = Math.max(sw0, snap * off * off * (3 - 2 * off));
    if (sw < 1) joints[UPPER].quaternion.slerpQuaternions(base, qb.copy(joints[UPPER].quaternion), sw);
  }
  for (let i = 0; i < ARM.length; i++) limit(joints, ARM[i]);
  if (w > 0) for (let i = 0; i < TORSO.length; i++) limit(joints, TORSO[i]);
  return true;
}
