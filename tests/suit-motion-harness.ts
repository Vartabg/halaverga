import { Group, Vector3 } from 'three';
import { BONE_HEADS, BONE_PARENTS } from '../src/world/suitSkeleton';
import { applySuitPose, orientSuit } from '../src/world/suitPose';
import { advanceSuitAnimation, applySuitAnimation, createSuitAnimation, type AnimatedPose, type AnimationInput, type SuitAnimation } from '../src/world/suitAnimation';
/** Shared harness for the living-motion tests: plain 21-bone rigs at the exported heads, posed the way Suit.tsx poses them. */
export type Drive = (t: number) => AnimationInput;
export const pose = (patch: Partial<AnimatedPose> = {}): AnimatedPose => ({ viewYaw: 0, viewPitch: 0, yaw: 0, pitch: 0, lean: 0, bank: 0,
  speed: 0, flight: 0, power: 0, brake: 0, epoch: 0, position: { x: 0, y: 0, z: 0 }, ...patch });
export const walking = (x: number, z: number): Drive => () => ({ flying: false, velocity: { x, y: 0, z } });
export const hovering: Drive = () => ({ flying: true, velocity: { x: 0, y: 0, z: 0 } });
export const lift = (at = 1): Drive => t => ({ flying: t >= at, velocity: { x: 0, y: t >= at ? 6 : 0, z: 0 } });
export const approach: Drive = t => ({ flying: t < 1, landing: t < 1, velocity: { x: 0, y: t < 1 ? -1.5 : 0, z: 0 } });
export function rig() {
  const root = new Group(), joints = BONE_HEADS.map(() => new Group());
  joints.forEach((joint, i) => {
    const parent = BONE_PARENTS[i], p = BONE_HEADS[i], o = parent < 0 ? [0, 0, 0] : BONE_HEADS[parent];
    joint.position.set(p[0] - o[0], p[1] - o[1], p[2] - o[2]); (parent < 0 ? root : joints[parent]).add(joint);
  });
  return { root, joints };
}
/**
 * Steps the layer like the game: inputs are sampled at the start of each step (so every refresh rate sees a change at the same
 * instant), `before` sets the anchor for the frame being rendered, `each` observes the result.
 */
export function simulate(seconds: number, hz: number, drive: Drive, p = pose(), a = createSuitAnimation(),
  each?: (a: SuitAnimation, t: number) => void, before?: (t: number) => void) {
  for (let i = 1; i <= Math.round(seconds * hz); i++) {
    before?.(i / hz); advanceSuitAnimation(a, p, drive((i - 1) / hz), 1 / hz); each?.(a, i / hz);
  }
  return a;
}
/** Poses a rig the way Suit.tsx does (orientation, pose targets, then the layer) and measures the soles in world space. */
export function posed(a: SuitAnimation, p = pose(), { reduced = false, hero = 1, r = rig() } = {}) {
  r.root.position.set(p.position.x, p.position.y, p.position.z); orientSuit(r.root, p, { hero, epoch: 0 });
  applySuitPose(r.joints, p, { hero, epoch: 0 }, reduced);
  const up = applySuitAnimation(r.joints, a, p, reduced, hero);
  r.root.position.y += up; r.root.updateMatrixWorld(true);
  return { joints: r.joints, lift: up, soles: [8, 9].map(i => r.joints[i].localToWorld(new Vector3(0, -.49, 0))) };
}
export const rotations = (joints: Group[]) => joints.flatMap(j => [j.rotation.x, j.rotation.y, j.rotation.z]);
/** The same state with the follow-through springs at rest, to isolate their contribution. */
export const quiet = (a: SuitAnimation): SuitAnimation => ({ ...a, lagForward: { x: 0, v: 0 }, lagSide: { x: 0, v: 0 } });
