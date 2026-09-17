import { Euler, Quaternion, Vector3, type Object3D } from 'three';
import { settle, type Pose } from '../game/presentation';
export type SuitMotion = { hero: number; epoch: number };
const clamp = (v: number) => Math.max(0, Math.min(1, v));
const euler = new Euler(0, 0, 0, 'YXZ'), roll = new Quaternion(), LONG_AXIS = new Vector3(0, 1, 0);
/** 0 while walking or hovering, 1 in full power flight. */
export const streamline = (pose: Pose) => clamp((pose.speed - 3) / 25) * pose.flight;
/**
 * Root orientation. The model faces -Z and the chase camera hangs at +Z of the view frame, so the back stays toward
 * the camera: yaw and pitch follow the travel direction (bounded near the view in presentation.ts), the lean tips the
 * head into that direction, and banking rolls around the body's long axis instead of swinging the torso sideways.
 */
export function orientSuit(root: Object3D, pose: Pose, motion: SuitMotion) {
  const power = streamline(pose);
  euler.set(pose.lean + pose.pitch * power, pose.yaw, pose.bank * (1 - power) * (1 + motion.hero * .7));
  // A modest roll reads on a horizontal travel axis; near-vertical flight would turn it into a heading swing, and a
  // larger roll combined with yaw lag in a climbing left turn would show the chest to the right-shoulder camera.
  root.quaternion.setFromEuler(euler).multiply(roll.setFromAxisAngle(LONG_AXIS, -pose.bank * power * (1 + motion.hero * .2) * Math.cos(pose.pitch)));
}
/**
 * Joint rotations only: the player/camera remain authoritative. Every limb hangs along -Y at rest, so a positive x
 * rotation swings it forward (toward -Z): elbows flex with positive x, knees with negative x. Neither may bend
 * toward the chase camera.
 */
export function applySuitPose(joints: Object3D[], pose: Pose, motion: SuitMotion, reduced: boolean) {
  const flight = pose.flight, power = streamline(pose);
  const hero = motion.hero * (reduced ? .3 : 1), brake = pose.brake * hero;
  const turn = reduced ? 0 : Math.max(-1, Math.min(1, pose.bank / .3));
  const hover = flight * (1 - power);
  joints[0].rotation.y = turn * .12 * hero;
  // The head keeps looking along the travel direction while the body leans into it.
  joints[1].rotation.set(-pose.lean * .72, turn * .22 * hero, 0);
  for (let i = 2; i <= 3; i++) {
    const side = i === 2 ? -1 : 1, lead = i === 3;
    const classic = flight * .18 + pose.brake * .25;
    const sweep = flight * (.2 - power * .3) + pose.brake * .35;
    // Hover floats the arms slightly forward and out. Power flight leads with the right fist along the travel axis
    // and trails the left arm at the hip. Braking flares both arms forward and out.
    const targetX = hover * .15 + power * (lead ? 3 : -.2) * (1 - brake) + brake * .6;
    const targetZ = side * (hover * .2 + power * (lead ? .05 : .12) + brake * .55 + Math.abs(turn) * .28);
    joints[i].rotation.set(classic + (targetX - classic) * hero, -side * Math.abs(turn) * .12 * hero,
      side * sweep + (targetZ - side * sweep) * hero);
    joints[i + 4].rotation.x = hero * (hover * .5 + power * (lead ? .12 : .35) * (1 - brake) + brake * .9);
  }
  for (let i = 4; i <= 5; i++) {
    const side = i === 4 ? -1 : 1, raised = i === 4 ? 1 : .25;
    // Legs trail straight in power flight; braking lifts the left knee forward with the heel tucked behind.
    joints[i].rotation.set(flight * .08 * (1 - power) + pose.brake * .1 + hero * (hover * raised * .12 + brake * raised * .8),
      0, side * hero * (hover * .04 + brake * .12));
    joints[i + 4].rotation.x = -hero * (hover * (i === 4 ? .25 : .12) + power * .12 + brake * raised * 1.1);
  }
}
export function advanceSuitMotion(motion: SuitMotion, hero: boolean, dt: number) {
  motion.hero = settle(motion.hero, hero ? 1 : 0, 8, dt);
}
