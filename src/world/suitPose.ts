import type { Object3D } from 'three';
import { settle, type Pose } from '../game/presentation';
export type SuitMotion = { climb: number; hero: number; epoch: number };
const clamp = (v: number) => Math.max(0, Math.min(1, v));
/** Joint rotations only: the player/camera remain authoritative. */
export function applySuitPose(joints: Object3D[], pose: Pose, motion: SuitMotion, reduced: boolean) {
  const flight = pose.flight, power = clamp((pose.speed - 3) / 25) * flight;
  const hero = motion.hero * (reduced ? .3 : 1), brake = pose.brake * hero;
  const turn = reduced ? 0 : Math.max(-1, Math.min(1, pose.bank / .3));
  const hover = flight * (1 - power), arms = joints;
  joints[0].rotation.y = turn * .12 * hero;
  joints[1].rotation.set(-pose.lean * .72 - motion.climb * power * .3 * hero, turn * .22 * hero, 0);
  for (let i = 2; i <= 3; i++) {
    const side = i === 2 ? -1 : 1, lead = i === 3 ? 1 : 0;
    const classic = flight * .18 - pose.brake * .25;
    const sweep = flight * (.2 - power * .3) + pose.brake * .35;
    const targetX = -hover * .18 + power * (lead ? -2.72 : .2) * (1 - brake) - brake * .4;
    const targetZ = side * (hover * .18 + power * .08 + brake * .55 + Math.abs(turn) * .28);
    arms[i].rotation.set(classic + (targetX - classic) * hero, -side * Math.abs(turn) * .12 * hero,
      side * sweep + (targetZ - side * sweep) * hero);
    const elbow = i + 4;
    joints[elbow].rotation.x = -hero * (hover * .65 + power * (lead ? .32 : 1.5) * (1 - brake) + brake * .9);
  }
  for (let i = 4; i <= 5; i++) {
    const side = i === 4 ? -1 : 1, raised = i === 4 ? 1 : .25;
    joints[i].rotation.set(flight * .14 + pose.brake * .28 - hero * (hover * raised * .22 + brake * raised * 1.05),
      0, side * hero * (hover * .04 + brake * .12));
    joints[i + 4].rotation.x = hero * (hover * (i === 4 ? .3 : .14) + power * .16 + brake * raised * 1.1);
  }
}
export function advanceSuitMotion(motion: SuitMotion, slope: number, hero: boolean, dt: number) {
  motion.climb = settle(motion.climb, Math.max(-1, Math.min(1, slope)), 7, dt);
  motion.hero = settle(motion.hero, hero ? 1 : 0, 8, dt);
}
