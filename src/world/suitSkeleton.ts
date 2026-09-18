import { pivots } from './suitGeometry';
/**
 * The 21-bone explorer skeleton. Indices 0-9 are the legacy joints that suitPose and suitAnimation address by number;
 * their heads are the suitGeometry pivots by reference, so they stay bit-exact. Every bone rests at identity rotation,
 * so the added bones change nothing until something rotates them.
 */
export const BONE_NAMES = ['pelvis', 'head', 'upperarm_l', 'upperarm_r', 'thigh_l', 'thigh_r', 'forearm_l', 'forearm_r', 'shin_l', 'shin_r',
  'spine', 'chest', 'neck', 'clavicle_l', 'clavicle_r', 'hand_l', 'hand_r', 'foot_l', 'foot_r', 'toe_l', 'toe_r'] as const;
export type BoneName = typeof BONE_NAMES[number];
export const BONE_COUNT = BONE_NAMES.length, LEGACY_COUNT = pivots.length;
/** Not topologically ordered: the head and upper arms hang from bones appended after them. Build every bone before parenting. */
export const BONE_PARENTS: readonly number[] = [-1, 12, 13, 14, 0, 0, 2, 3, 4, 5, 0, 10, 11, 11, 11, 6, 7, 8, 9, 17, 18];
/** Heads in three.js metres (x right, y up, the model faces -Z). Blender heads are (x, -z, y). */
export const BONE_HEADS: readonly (readonly [number, number, number])[] = [...pivots,
  [0, .12, 0], [0, .34, 0], [0, .6, 0], [-.045, .55, 0], [.045, .55, 0], [-.324, -.075, 0], [.324, -.075, 0],
  [-.112, -.905, .01], [.112, -.905, .01], [-.11, -.965, -.125], [.11, -.965, -.125]];
const INDEX = new Map<string, number>(BONE_NAMES.map((name, i) => [name, i]));
/** Current names, plus the legacy single-digit `suit_joint_N` names so a ten-joint GLB still binds. */
export function boneIndex(name: string) {
  const legacy = /^suit_joint_([0-9])$/.exec(name);
  const index = legacy ? Number(legacy[1]) : INDEX.get(name);
  if (index === undefined) throw new Error('Human suit has unknown joints.');
  return index;
}
