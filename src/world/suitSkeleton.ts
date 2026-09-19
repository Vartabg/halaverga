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
/** Left/right partner of each bone (itself on the centre line). Mirroring a rotation keeps x and negates y and z. */
export const MIRROR: readonly number[] = BONE_NAMES.map(n => INDEX.get(n.replace(/_([lr])$/, (_, s) => s === 'l' ? '_r' : '_l'))!);
/** Hinges rotate about x only: elbows flex +x, knees -x, toes either way. */
export const HINGE: ReadonlySet<number> = new Set([6, 7, 8, 9, 19, 20]);
type Range = readonly [minX: number, maxX: number, minY: number, maxY: number, minZ: number, maxZ: number];
// Right-side and centre ranges in radians, three.js XYZ Euler; the left side negates and swaps y and z. Spine plus chest yaw stays within .1.
const RIGHT: Record<string, Range> = {
  pelvis: [-1.2, 1.2, -.4, .4, -.4, .4], head: [-.6, .7, -.35, .35, -.25, .25], spine: [-.3, .25, -.04, .04, -.12, .12],
  chest: [-.3, .3, -.06, .06, -.12, .12], neck: [-.4, .6, -.2, .2, -.15, .15], clavicle: [-.1, .1, -.25, .25, -.15, .35],
  upperarm: [-1, 3.1, -.8, .8, -.35, 1.3], forearm: [0, 2.2, 0, 0, 0, 0], hand: [-.9, 1, -.3, .3, -.35, .45],
  thigh: [-.5, 1.4, -.4, .4, -.35, .6], shin: [-2.3, 0, 0, 0, 0, 0], foot: [-1.1, .35, -.15, .15, -.2, .2], toe: [-.5, .5, 0, 0, 0, 0],
};
export const LIMITS: readonly Range[] = BONE_NAMES.map(name => {
  const r = RIGHT[name.replace(/_[lr]$/, '')];
  return name.endsWith('_l') ? [r[0], r[1], -r[3], -r[2], -r[5], -r[4]] as const : r;
});
/** Blend pivots (XYZ Euler): quaternions are sign-aligned to these, so wide arm swings between poses pass in front of the body. */
export const BLEND_REF: readonly (readonly [number, number, number])[] = BONE_NAMES.map(n => n.startsWith('upperarm') ? [1.4, 0, 0] as const : [0, 0, 0] as const);
