// The blaster block of Suit's frame (priority -20), after the clip, flight and living layers. With the blaster off from the start it
// writes no joint, so the suit is bit-identical to main. Order: shot body advance and cannon drive, the pre-solve body layer, the aim
// solve, the GAMEPLAY muzzle (solved pose, before any kick: resolveShot and the HUD's blocked glyph never see recoil), the post-solve
// body layer, the visual model offset, the hand hide (blaster skin plus hand_r scale), the forearm link. ArmCannon (-19) then
// publishes the kicked effects muzzle from the cannon_muzzle node. Relative imports: node tests import this module.
import { Vector3, type Object3D } from 'three';
import type { ShooterState } from '../game/combat';
import { guarded, shooterFaulted } from '../game/shooterFault';
import { resetBurst } from '../game/burst';
import { advanceSuitAim, applySuitAim, barrelOf, createSuitAim, type SuitAim } from './aimPose';
import { buildBlasterSkin, setBlasterSkin, type BlasterSkin } from './blasterSkin';
import { FOREARM, HAND, HAND_SCALE, cannonLink } from './cannonContract';
import { advanceShotBody, createShotBody, resetShotBody, ventAimScale, type ShotBody, type ShotBodyEnv } from './shotBody';
import { applyShotBodyPost, applyShotBodyPre } from './shotBodyPose';
import { writeCannonDrive } from './shotDrive';
import { BONE_COUNT } from './suitSkeleton';

/** Carry weight in flight at cruise: lerp(1, CARRY_FLIGHT, flight), where flight fades in from hover (3 m/s) to 13 m/s. .7 (was .5)
 * keeps the bold carry's outline readable in cruise (owner feedback 2026-09-23). */
export const CARRY_FLIGHT = .7;
export type BlasterRig = { root: Object3D; joints: Object3D[] };
export type SuitBlaster = {
  aim: SuitAim; body: ShotBody; env: ShotBodyEnv; skin: BlasterSkin | null | undefined;
  /** hand_r is scaled down and the blaster skin swapped in. */ hidden: boolean;
  /** The body layers ran last frame (blaster on, third person). */ active: boolean; epoch: number;
  /** World barrel direction of the solved (pre-kick) pose, published with the gameplay muzzle. */ barrel: { x: number; y: number; z: number };
};
/** Per-frame inputs, rewritten in place by Suit. camera: world position, vertical FOV (deg) and the canvas height (px). */
export type BlasterFrame = {
  rig: BlasterRig; blaster: SuitBlaster; s: ShooterState; on: boolean; third: boolean; paused: boolean; reduced: boolean;
  epoch: number; flight: number; speed: number; ground: number; camera: { x: number; y: number; z: number }; fov: number; height: number;
};
export function createSuitBlaster(): SuitBlaster {
  return { aim: createSuitAim(), body: createShotBody(), skin: undefined, hidden: false, active: false, epoch: NaN, barrel: { x: 0, y: -1, z: 0 },
    env: { dt: 0, paused: false, reduced: false, epoch: 0, aimWeight: 0, ads: 0, ground: 1, pxPerM: 0 } };
}
export function createBlasterFrame(rig: BlasterRig, s: ShooterState): BlasterFrame {
  return { rig, blaster: createSuitBlaster(), s, on: false, third: true, paused: true, reduced: false, epoch: 0, flight: 0, speed: 0,
    ground: 1, camera: { x: 0, y: 0, z: 0 }, fov: 65, height: 0 };
}
const muzzle = new Vector3(), axis = new Vector3(), offset = new Vector3(), DEG = Math.PI / 180;
const clamp01 = (v: number) => v <= 0 ? 0 : v >= 1 ? 1 : v;
/** The carry goal: 0 off or in first person; 1 grounded or hovering; toward CARRY_FLIGHT at cruise. */
export function carryGoal(f: BlasterFrame) {
  if (!f.on || !f.third) return 0;
  const cruise = clamp01(f.flight) * clamp01((f.speed - 3) / 10);
  return 1 + (CARRY_FLIGHT - 1) * cruise;
}
/** Chase-camera pixels per metre at the gameplay muzzle (0 when unknown). */
function pxPerM(f: BlasterFrame) {
  const m = f.s.muzzle, c = f.camera, d = m.valid ? Math.hypot(m.x - c.x, m.y - c.y, m.z - c.z) : 0;
  return d > .1 && f.height > 0 ? f.height / (2 * Math.tan(f.fov * DEG / 2) * d) : 0;
}
/** The guarded blaster-on block: every shooter write in Suit's frame. */
const run = guarded('Suit blaster', (f: BlasterFrame, dt: number) => {
  const b = f.blaster, s = f.s, joints = f.rig.joints, root = f.rig.root, skinned = joints.length >= BONE_COUNT;
  if (b.epoch !== f.epoch) { b.epoch = f.epoch; resetBurst(); }
  if (b.skin === undefined && skinned) b.skin = buildBlasterSkin(root);
  if (f.third) {
    const e = b.env, body = b.body;
    e.dt = dt; e.paused = f.paused; e.reduced = f.reduced; e.epoch = f.epoch; e.aimWeight = b.aim.weight; e.ads = s.aim.blend;
    e.ground = f.ground; e.pxPerM = pxPerM(f);
    advanceShotBody(body, s, e);
    writeCannonDrive(body, s, b.aim.weight, f.reduced);
    applyShotBodyPre(joints, body);
    advanceSuitAim(b.aim, f.epoch, s.aim.blend, s.aim.fireHold, carryGoal(f), ventAimScale(body), s.aim.origin, s.aim.point, f.paused, f.reduced, dt);
    applySuitAim(joints, root, b.aim, s.aim.origin, s.aim.dir);
    if (skinned) {
      root.updateMatrixWorld(true);
      barrelOf(joints, muzzle, axis); b.barrel.x = axis.x; b.barrel.y = axis.y; b.barrel.z = axis.z;
      s.muzzle.x = muzzle.x; s.muzzle.y = muzzle.y; s.muzzle.z = muzzle.z;
      s.muzzle.valid = cannonLink.ready; s.muzzle.weight = b.aim.weight;
    } else { s.muzzle.valid = false; s.muzzle.weight = 0; }
    applyShotBodyPost(joints, body);
    if (body.offset.x !== 0 || body.offset.y !== 0 || body.offset.z !== 0)
      root.position.add(offset.set(body.offset.x, body.offset.y, body.offset.z).applyQuaternion(root.quaternion));
    b.active = true;
  } else {
    // First person: the model is hidden; the arm settles to rest for the next chase frame and shots use a virtual muzzle.
    advanceSuitAim(b.aim, f.epoch, 0, 0, 0, 1, s.aim.origin, s.aim.point, f.paused, f.reduced, dt);
    if (b.active) { resetShotBody(b.body); b.active = false; }
    s.muzzle.valid = false; s.muzzle.weight = 0;
  }
  if (cannonLink.ready && skinned && b.skin) {
    setBlasterSkin(b.skin, true); joints[HAND].scale.setScalar(HAND_SCALE); b.hidden = true; cannonLink.handHidden = true;
  }
});
/** Unguarded, so it still runs after a fault turned the blaster off: the original skin, hand scale 1, the body at exact rest. */
function release(f: BlasterFrame) {
  const b = f.blaster;
  if (b.skin) setBlasterSkin(b.skin, false);
  if (b.hidden) { f.rig.joints[HAND].scale.setScalar(1); b.hidden = false; }
  cannonLink.handHidden = false;
  if (!f.on && (b.active || b.aim.weight !== 0 || b.aim.carry !== 0)) {
    resetShotBody(b.body); b.active = false; b.aim = createSuitAim();
  }
}
/** One Suit frame of the blaster. With the blaster off from the start it writes no joint. */
export function stepSuitBlaster(f: BlasterFrame, dt: number) {
  const skinned = f.rig.joints.length >= BONE_COUNT;
  if (f.on) run(f, dt);
  if (!(f.on && cannonLink.ready && skinned && f.blaster.skin) || shooterFaulted()) release(f);
  cannonLink.forearm = skinned && f.on ? f.rig.joints[FOREARM] : null;
  f.rig.root.updateMatrixWorld(true);
}
/** Suit unmount: unlink the forearm and restore the original skin and hand. */
export function releaseSuitBlaster(f: BlasterFrame) {
  f.on = false; release(f); cannonLink.forearm = null;
}
