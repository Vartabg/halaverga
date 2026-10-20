// Library clips carried by the angel GLB (scripts/angel_asset: Quaternius Universal Animation Library, CC0, retargeted to the
// 21-bone identity-rest skeleton). They are sampled straight from their keyframe tracks, not through three's AnimationMixer, so they
// layer over the game's own pose, flight clips and living motion by weight, bone by bone, with no allocation per frame.
import { Quaternion, Vector3, type AnimationClip, type Interpolant, type KeyframeTrack, type Object3D } from 'three';
import { BONE_COUNT, BONE_NAMES } from './suitSkeleton';

export type AngelClip = { duration: number; rotations: (Interpolant | null)[]; pelvis: Interpolant | null };
export type AngelClips = Readonly<Record<string, AngelClip>>;
/** Per-bone weights in suitSkeleton order. */
export type BoneMask = readonly number[];

/** three sets createInterpolant per track from its interpolation mode (quaternion tracks slerp); the typings leave it out. */
type Sampled = KeyframeTrack & { createInterpolant(): Interpolant };
const INDEX = new Map<string, number>(BONE_NAMES.map((name, i) => [name, i]));
const q = new Quaternion();

/** Tracks are named '<bone>.quaternion' (and 'pelvis.position') by GLTFLoader; tracks for anything else are ignored. */
export function bindAngelClips(clips: readonly AnimationClip[]): AngelClips {
  const out: Record<string, AngelClip> = {};
  for (const clip of clips) {
    const rotations: (Interpolant | null)[] = new Array(BONE_COUNT).fill(null);
    let pelvis: Interpolant | null = null;
    for (const track of clip.tracks) {
      const dot = track.name.lastIndexOf('.'), index = INDEX.get(track.name.slice(0, dot)), property = track.name.slice(dot + 1);
      if (index === undefined) continue;
      if (property === 'quaternion') rotations[index] = (track as Sampled).createInterpolant();
      else if (property === 'position' && index === 0) pelvis = (track as Sampled).createInterpolant();
    }
    if (rotations.some(Boolean)) out[clip.name] = { duration: clip.duration, rotations, pelvis };
  }
  return out;
}

/** Clip time for an elapsed time: wrapped for loops, held on the last frame for one-shots. */
export function clipTime(clip: AngelClip, elapsed: number, loop: boolean) {
  if (clip.duration <= 0) return 0;
  return loop ? ((elapsed % clip.duration) + clip.duration) % clip.duration : Math.min(Math.max(elapsed, 0), clip.duration);
}

/**
 * Slerp each joint toward the clip's frame by weight * mask[i]. The pelvis offset (the clip's weight shift) is added to `hip`,
 * which the caller writes to the pelvis once per frame, so several clips can share it.
 */
export function blendAngelClip(joints: readonly Object3D[], clip: AngelClip, time: number, weight: number, mask: BoneMask, hip?: Vector3) {
  if (weight <= 0) return;
  for (let i = 0; i < BONE_COUNT; i++) {
    const track = clip.rotations[i], w = weight * mask[i];
    if (!track || w <= 0) continue;
    const r = track.evaluate(time) as ArrayLike<number>;
    q.set(r[0], r[1], r[2], r[3]);
    joints[i].quaternion.slerp(q, Math.min(1, w));
  }
  if (hip && clip.pelvis) {
    const p = clip.pelvis.evaluate(time) as ArrayLike<number>, w = weight * mask[0];
    hip.x += p[0] * w; hip.y += p[1] * w; hip.z += p[2] * w;
  }
}

const UPPER = new Set(['spine', 'chest', 'neck', 'head', 'clavicle_l', 'clavicle_r', 'upperarm_l', 'upperarm_r', 'forearm_l', 'forearm_r', 'hand_l', 'hand_r']);
/** Whole body. */
export const FULL: BoneMask = BONE_NAMES.map(() => 1);
/** Waist up, for moves made in flight: the legs keep the flight pose. The spine takes half so the trunk still follows the wings. */
export const UPPER_BODY: BoneMask = BONE_NAMES.map(n => n === 'spine' ? .5 : UPPER.has(n) ? 1 : 0);
