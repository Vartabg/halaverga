import { Euler, Quaternion, Vector3, type Object3D } from 'three';
import { settle, type Pose } from '../game/presentation';
import { sightLine } from './suitRoll';
export type SuitMotion = { hero: number; epoch: number };
const euler = new Euler(0, 0, 0, 'YXZ'), roll = new Quaternion(), sight = new Vector3(), tail = new Vector3();
/**
 * Root orientation. The model faces -Z and the chase camera hangs at +Z of the view frame, so the back stays toward the camera:
 * yaw and pitch follow the travel direction (bounded near the view in presentation.ts) and the lean tips the head into it.
 * Hovering and on foot the bank tilts the body sideways; in flight `fade` (suitRoll.ts speedFade) hands that tilt over to
 * `turnRoll`, the whole-body turn roll (rad, positive rolls left). The roll turns the body about the line of sight to the chase
 * camera, so no body direction's dot product with that line changes: the back-to-camera bound holds by construction. It is
 * weighted by how directly the camera looks along the flight axis, so the on-screen tilt matches a bank about that axis and a
 * steep view does not turn it into a heading swing; flying toward the camera gives none.
 */
export function orientSuit(root: Object3D, pose: Pose, motion: SuitMotion, turnRoll = 0, fade = 0) {
  const power = pose.power;
  euler.set(pose.lean + pose.pitch * power, pose.yaw, pose.bank * (1 - power) * (1 + motion.hero * .7) * (1 - fade * pose.flight));
  root.quaternion.setFromEuler(euler);
  if (!turnRoll) return;
  const elevation = pose.pitch * power;
  // Back along the flight axis, the way the camera looks along it.
  tail.set(Math.sin(pose.yaw) * Math.cos(elevation), -Math.sin(elevation), Math.cos(pose.yaw) * Math.cos(elevation));
  sightLine(pose, sight);
  root.quaternion.premultiply(roll.setFromAxisAngle(sight, turnRoll * Math.max(0, tail.dot(sight))));
}
/**
 * Joint rotations only: the player/camera remain authoritative. Every limb hangs along -Y at rest, so a positive x
 * rotation swings it forward (toward -Z): elbows flex with positive x, knees with negative x. Neither may bend
 * toward the chase camera.
 */
export function applySuitPose(joints: Object3D[], pose: Pose, motion: SuitMotion, reduced: boolean) {
  const flight = pose.flight, power = pose.power;
  const hero = motion.hero * (reduced ? .3 : 1), brake = pose.brake * hero;
  const turn = reduced ? 0 : Math.max(-1, Math.min(1, pose.bank / .3));
  const hover = flight * (1 - power);
  // Every rotation component is written each frame, so the animation layer can add to it without accumulating.
  joints[0].rotation.set(0, turn * .12 * hero, 0);
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
    joints[i + 4].rotation.set(hero * (hover * .5 + power * (lead ? .12 : .35) * (1 - brake) + brake * .9), 0, 0);
  }
  for (let i = 4; i <= 5; i++) {
    const side = i === 4 ? -1 : 1, raised = i === 4 ? 1 : .25;
    // Legs trail straight in power flight; braking lifts the left knee forward with the heel tucked behind.
    joints[i].rotation.set(flight * .08 * (1 - power) + pose.brake * .1 + hero * (hover * raised * .12 + brake * raised * .8),
      0, side * hero * (hover * .04 + brake * .12));
    joints[i + 4].rotation.set(-hero * (hover * (i === 4 ? .25 : .12) + power * .12 + brake * raised * 1.1), 0, 0);
  }
}
export function advanceSuitMotion(motion: SuitMotion, hero: boolean, dt: number) {
  motion.hero = settle(motion.hero, hero ? 1 : 0, 8, dt);
}
