// Writes the shot choreography onto the 21-bone rig inside Suit's frame. applyShotBodyPre runs before the aim solve and touches only
// spine, chest, pelvis and legs, which the solve keeps (it adds pitch to chest and spine, re-aims the gaze and never touches the
// legs): breathing, the grounded brace, the torso kick and the hover reaction. The barrel-exact shoulder swing then keeps the cannon
// on the crosshair line while the body moves under it, so the body's delayed motion never adds a second, late rise to the cannon
// (visual review r3). applyShotBodyPost runs after the solve and the gameplay-muzzle publish: the arm snap (elbow, shoulder,
// clavicle), sway, the head's roll cancel and nod, the kill beat, the vent pose, the head lead and the off arm. Local XYZ Euler signs
// are verified on the real rig (tests/shot-body-pose.test.ts). When every output is exactly 0 neither function touches a joint, so
// idle is bit-identical. Module scratch only: no allocation per call.
import { Quaternion, Vector3, type Object3D } from 'three';
import { BONE_COUNT, LIMITS } from './suitSkeleton';
import { CH } from './shotSprings';
import type { ShotBody } from './shotBody';

export const BONE = { pelvis: 0, head: 1, upperarm_l: 2, upperarm_r: 3, thigh_l: 4, thigh_r: 5, forearm_l: 6, forearm_r: 7, shin_l: 8,
  shin_r: 9, spine: 10, chest: 11, neck: 12, clavicle_r: 14, hand_l: 15, hand_r: 16, foot_l: 17, foot_r: 18 } as const;
const B = BONE, DEG = Math.PI / 180;
/** Joints applyShotBodyPre may write. */
export const PRE_JOINTS: readonly number[] = [B.spine, B.chest, B.pelvis, B.thigh_l, B.thigh_r, B.shin_l, B.shin_r, B.foot_l, B.foot_r];
/**
 * Grounded brace at B = 1 (degrees; drop in m; right side, the left mirrors y and z): a knees-out athletic stance. A knee bent
 * straight forward is invisible from the chase camera behind the body (review r3: "legs read straight"), so the thighs turn out
 * as they flex. Review r4 found the first 5 cm stance (thigh 18.6/-14.3/4.7, knee 38.1) too deep at 9 shots/s, a 6 px dip. This one
 * was searched on the rig (thigh .4828 m, shin .4320 m) for a 1.6-2.1 cm drop with the feet planted (slide .3 cm) and the most knee
 * bow: the thighs turn out 18 deg, abduct 4 and flex 12.25, the knees 24.5, so the hips sit 2.08 cm lower and the knees bow 5.3 px
 * at chase portrait. The foot keeps the sole flat (x) and turns back in within its limit (y).
 */
export const BRACE = { chest: -3, thigh: [12.25, -18, 4], shin: -24.5, foot: [13.5, 8.5], drop: .0208 } as const;
/**
 * Per-channel peak angles (degrees) and the other pose gains, sized in chase-portrait pixels (390 x 844; single peaks measured by
 * tests/shot-body-pose.test.ts). The arm snap (elbow 5, shoulder 2.5, clavicle lift 3) lifts the whole cannon on the shot frame:
 * muzzle about 10 px at chase, 15 in portrait ADS. The chest/spine roll 4 + 2 moves the head about 6 px; the off arm 9 + 12 swings
 * the left hand out. In the air the pelvis pitches back 8 and rolls 2.5 (the feet swing forward and sideways, about 12 px) and the
 * leg trail tucks the knees (thighs 18 up, knees 30 folded: the feet rise about 8 px; a knee fold alone moves them along the view
 * line and a pitch alone barely reads: review r3). Head lead 28 / 12 in the vent. In ADS (bold cannon r5, the muzzle ring sits about 2 px
 * under the screen's centre third in portrait) the combined rise cap blends to adsRiseCap and the torso roll fades out: the roll
 * raises the right shoulder, which lifted the cannon about 3 px under the second shot of a burst, and the arm snap stacked on it.
 */
export const POSE = { elbow: 5, shoulder: 2.5, shoulderYaw: 1.2, clavLift: 3, clavRetract: 2, chestPitch: 1, chestYaw: 2.5, chestRoll: 4,
  spinePitch: .5, spineRoll: 2, headNod: 1, offArmOut: 9, offElbow: 12, hoverPitch: 8, hoverRoll: 2.5, legThigh: 18, legShin: 30,
  breathChest: .5, breathSpine: .25, breathClav: .3, ventElbow: 30, ventClav: 2, flick: 8, killNod: 1.5, killExhale: 1, leadYaw: 28,
  leadPitch: 12, leadNeck: .4, riseCap: 10, adsRiseCap: 2.4 } as const;
/** Upper-arm roll about its own long axis at full vent pose (rad). Sign measured: it turns the cannon's top face toward the camera. */
export const VENT_ROLL = 12 * DEG;
const qa = new Quaternion(), X = new Vector3(1, 0, 0), Y = new Vector3(0, 1, 0), touched = new Uint8Array(BONE_COUNT);

function add(joints: Object3D[], b: number, x: number, y: number, z: number) {
  if (x === 0 && y === 0 && z === 0) return;
  const e = joints[b].rotation; e.set(e.x + x, e.y + y, e.z + z); touched[b] = 1;
}
/** Clamps every joint touched this call to its LIMITS range (writes only when a value is out of range). */
function limitTouched(joints: Object3D[]) {
  for (let b = 0; b < BONE_COUNT; b++) {
    if (!touched[b]) continue;
    touched[b] = 0;
    const e = joints[b].rotation, r = LIMITS[b];
    const x = Math.min(r[1], Math.max(r[0], e.x)), y = Math.min(r[3], Math.max(r[2], e.y)), z = Math.min(r[5], Math.max(r[4], e.z));
    if (x !== e.x || y !== e.y || z !== e.z) e.set(x, y, z);
  }
}
/** Channel values after the motion gain, the hover weight and the combined cannon-rise cap (module scratch, read by tests). */
export const shotOut = { elbow: 0, shoulder: 0, yaw: 0, clav: 0, torso: 0, roll: 0, offArm: 0, head: 0, hover: 0, trail: 0, cap: 1 };
function channels(b: ShotBody) {
  const x = b.springs.x, m = b.m, air = 1 - b.gw, o = shotOut;
  o.elbow = x[CH.elbow] * m; o.shoulder = x[CH.shoulder] * m; o.yaw = x[CH.shoulderYaw] * m; o.clav = x[CH.clav] * m;
  o.torso = x[CH.torso] * m; o.roll = o.torso * (1 - b.ads); o.offArm = x[CH.offArm] * m; o.head = x[CH.head] * m;
  o.hover = air === 0 ? 0 : x[CH.hoverPitch] * m * air; o.trail = air === 0 ? 0 : x[CH.legTrail] * m * air;
  // Only the arm lifts the cannon: the body layers run before the solve, which keeps the barrel on the line.
  const rise = Math.max(0, POSE.elbow * o.elbow) + Math.max(0, POSE.shoulder * o.shoulder) + Math.max(0, 1.5 * o.clav);
  const cap = POSE.riseCap + (POSE.adsRiseCap - POSE.riseCap) * b.ads;
  o.cap = rise > cap ? cap / rise : 1;
  if (o.cap < 1) { o.elbow *= o.cap; o.shoulder *= o.cap; o.clav *= o.cap; }
  return o;
}
/** Before the aim solve: breathing, the grounded brace, the torso kick and the hover reaction. Also writes b.offset (visual only). */
export function applyShotBodyPre(joints: Object3D[], b: ShotBody) {
  const br = b.breath, brace = b.B * b.gw, o = channels(b), t = o.torso, rl = o.roll, hv = o.hover, tr = o.trail;
  b.offset.x = 0; b.offset.y = brace === 0 ? 0 : -BRACE.drop * brace; b.offset.z = 0;
  if ((br === 0 && brace === 0 && t === 0 && hv === 0 && tr === 0) || joints.length < BONE_COUNT) return;
  add(joints, B.chest, (POSE.breathChest * br + BRACE.chest * brace + POSE.chestPitch * t) * DEG, -POSE.chestYaw * t * DEG, POSE.chestRoll * rl * DEG);
  add(joints, B.spine, (POSE.breathSpine * br + POSE.spinePitch * t) * DEG, 0, POSE.spineRoll * rl * DEG);
  add(joints, B.pelvis, POSE.hoverPitch * hv * DEG, 0, POSE.hoverRoll * hv * DEG);
  const th = BRACE.thigh, x = (th[0] * brace + POSE.legThigh * tr) * DEG, y = th[1] * brace * DEG, z = th[2] * brace * DEG;
  const s = (BRACE.shin * brace - POSE.legShin * tr) * DEG, fx = BRACE.foot[0] * brace * DEG, fy = BRACE.foot[1] * brace * DEG;
  add(joints, B.thigh_r, x, y, z); add(joints, B.thigh_l, x, -y, -z); add(joints, B.shin_r, s, 0, 0); add(joints, B.shin_l, s, 0, 0);
  add(joints, B.foot_r, fx, fy, 0); add(joints, B.foot_l, fx, -fy, 0);
  limitTouched(joints);
}
/** After the aim solve (and the gameplay muzzle publish): the arm snap, sway, head, kill beat, vent pose and head lead, the off arm. */
export function applyShotBodyPost(joints: Object3D[], b: ShotBody) {
  if (joints.length < BONE_COUNT) return;
  const o = channels(b), v = b.v, hl = b.headLead, kill = b.killK, br = b.breath;
  if (o.elbow === 0 && o.shoulder === 0 && o.yaw === 0 && o.clav === 0 && o.torso === 0 && o.offArm === 0 && o.head === 0
    && b.swayX === 0 && b.swayY === 0 && v === 0 && b.flickK === 0 && br === 0 && kill === 0 && hl === 0) return;
  // The vent pose plus its flick never opens the elbow past where the aim left it (the flick's small undershoot rides on v).
  add(joints, B.forearm_r, (POSE.elbow * o.elbow + Math.max(0, POSE.ventElbow * v + POSE.flick * b.flickK)) * DEG, 0, 0);
  const ax = POSE.shoulder * o.shoulder * DEG + b.swayX, ay = POSE.shoulderYaw * o.yaw * DEG + b.swayY;
  const arm = joints[B.upperarm_r].quaternion;
  if (ax !== 0) arm.premultiply(qa.setFromAxisAngle(X, ax));
  if (ay !== 0) arm.premultiply(qa.setFromAxisAngle(Y, ay));
  if (v !== 0) arm.multiply(qa.setFromAxisAngle(Y, VENT_ROLL * v));
  if (ax !== 0 || ay !== 0 || v !== 0) touched[B.upperarm_r] = 1;
  add(joints, B.clavicle_r, 0, -POSE.clavRetract * o.clav * DEG, (POSE.clavLift * o.clav + POSE.breathClav * br - POSE.ventClav * v) * DEG);
  add(joints, B.chest, -POSE.killExhale * kill * DEG, 0, 0);
  // The head cancels the torso kick: the gaze solve already undid its pitch and yaw by the aim weight, so the rest (1 - aw) and the
  // whole roll are cancelled here. Then it nods late, looks toward a kill and leads toward the venting cannon.
  const lead = 1 - POSE.leadNeck, un = (1 - b.aw) * o.torso;
  add(joints, B.neck, -POSE.leadPitch * POSE.leadNeck * hl * DEG, -POSE.leadYaw * POSE.leadNeck * hl * DEG, 0);
  add(joints, B.head, -((POSE.chestPitch + POSE.spinePitch) * un + POSE.headNod * o.head + POSE.killNod * kill + POSE.leadPitch * lead * hl) * DEG,
    (POSE.chestYaw * un - POSE.leadYaw * lead * hl) * DEG + b.killYaw * kill, -(POSE.chestRoll + POSE.spineRoll) * o.roll * DEG);
  add(joints, B.upperarm_l, 0, 0, -POSE.offArmOut * o.offArm * DEG);
  add(joints, B.forearm_l, POSE.offElbow * o.offArm * DEG, 0, 0);
  limitTouched(joints);
}
