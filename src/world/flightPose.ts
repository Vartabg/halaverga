import type { Object3D } from 'three';
import type { Pose } from '../game/presentation';
import { addPose, createPose, limitPose, mixPose, pitchOf, preRotateX, restPose, rotateX, rotateZ, sampleClip, sumPitch, type Clip, type PoseBuffer } from './clipSampler';
import { ACCENTS } from './flightAccents';
import { FLIGHT, HOVER_LOOP } from './flightClips';
import type { FlightMix } from './flightMix';
import { BONE_COUNT, BONE_NAMES, LEGACY_COUNT } from './suitSkeleton';
import { takeoffRelease, type SuitAnimation } from './suitAnimation';
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const smooth = (a: number, b: number, v: number) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const group = (name: string) => name.replace(/_[lr]$/, '');
const idx = (name: string) => BONE_NAMES.indexOf(name as never);
const UPPERARM_R = idx('upperarm_r'), CHEST = idx('chest'), NECK = idx('neck'), HEAD = idx('head'), FOOT_R = idx('foot_r');
const LOOK = new Int8Array(['spine', 'chest', 'neck', 'head'].map(idx)), spent = new Float64Array(1);
/** The hero fist chain: while the fist is up, the bank and slope accents leave it alone. */
const LEAD = BONE_NAMES.map(n => ['clavicle_r', 'upperarm_r', 'forearm_r', 'hand_r'].includes(n) ? 1 : 0);
const FEET = BONE_NAMES.map(n => ['foot', 'toe'].includes(group(n))), SOLES = BONE_NAMES.map(n => group(n) === 'foot' ? 1 : 0);
const UNSOLED = SOLES.map(s => 1 - s);
const LEGS = BONE_NAMES.map((_, b) => b === 4 || b === 5 || b === 8 || b === 9);
const FLARE: Record<string, number> = { thigh: 1, shin: 1, foot: 1, toe: 1, upperarm: .7, forearm: .7, hand: .7, clavicle: .5, spine: .5, chest: .5 };
const FLARE_MASK = BONE_NAMES.map(n => FLARE[group(n)] ?? 0);
// Preallocated buffers: posing allocates nothing per frame.
const out = createPose(), work = createPose(), hero = createPose(), still = createPose(), final = createPose();
const bankLeft = new Float32Array(BONE_COUNT), bankRight = new Float32Array(BONE_COUNT), keep = new Float32Array(BONE_COUNT), authority = new Float32Array(BONE_COUNT);
/** Samples a clip (or a classic/hero pair mixed by `style`) into `into`; amplitude below 1 pulls the loop toward its t = 0 key. */
function styled(into: PoseBuffer, classic: Clip, heroic: Clip, t: number, style: number, amplitude: number) {
  const pair = heroic !== classic && style > 0;
  restPose(into); sampleClip(classic, t, into);
  if (pair) { restPose(hero); sampleClip(heroic, t, hero); mixPose(into, hero, style); }
  if (amplitude >= 1) return;
  restPose(still); sampleClip(classic, 0, still);
  if (pair) { restPose(hero); sampleClip(heroic, 0, hero); mixPose(still, hero, style); }
  mixPose(still, into, amplitude); into.set(still);
}
function accent(clip: Clip, t: number, weight: number, mask?: ArrayLike<number>) {
  if (!(weight > 0)) return;
  restPose(work); sampleClip(clip, t, work); addPose(out, work, weight, mask);
}
/**
 * Blends the authored flight pose over what applySuitPose wrote to joints 0-9 this frame and writes bones 10-20. Returns the flight
 * authority; at 0 it writes nothing to 0-9 and holds 10-20 at rest, so the ground stays exactly the procedural layer.
 */
export function applyFlightClips(joints: Object3D[], mix: FlightMix, pose: Pose, life: SuitAnimation, heroWeight: number, reduced: boolean) {
  const A = joints.length < BONE_COUNT ? 0 : clamp((pose.flight - .002) / .998, 0, 1) || 0;
  if (!A) { for (let b = LEGACY_COUNT; b < joints.length; b++) joints[b].quaternion.identity(); mix.label = 'ground'; return 0; }
  // Reduced camera motion keeps the poses at full strength and only damps the motion.
  const h = heroWeight, amp = reduced ? .3 : 1, P = pose.power, t = mix.clock, speed = clamp(pose.speed / 34, 0, 1);
  const u = clamp(P / .35, 0, 1), w = clamp((P - .35) / .5, 0, 1), fist = h * mix.fist;
  styled(out, FLIGHT.hover, FLIGHT.hover, life.time % HOVER_LOOP, 0, amp);
  if (u > 0) { styled(work, FLIGHT.cruise, FLIGHT.cruise, t, 0, amp); mixPose(out, work, u); }
  if (w > 0) { styled(work, FLIGHT.power[0], FLIGHT.power[1], t, h, amp * (.4 + .6 * speed)); mixPose(out, work, w); }
  if (fist > 1e-4) {
    styled(work, FLIGHT.fist, FLIGHT.fist, t, 0, amp);
    // Authored for the full power lean on level travel: re-aim along the travel axis at any lean and slope, then lead the turn.
    preRotateX(work, UPPERARM_R, clamp(-(pose.lean + 1.35) + pose.pitch * (1 - P), -.8, .4)); rotateZ(work, UPPERARM_R, -.25 * mix.steer);
    mixPose(out, work, fist, LEAD);
  }
  let braking = false;
  for (let b = 0; b < BONE_COUNT; b++) braking ||= mix.brake[b] > 1e-3;
  if (braking) { styled(work, FLIGHT.brake[0], FLIGHT.brake[1], t, h, amp); mixPose(out, work, 1, mix.brake); }
  for (let b = 0; b < BONE_COUNT; b++) {
    keep[b] = 1 - LEAD[b] * fist;
    bankLeft[b] = Math.max(0, mix.bank[b]) * keep[b]; bankRight[b] = Math.max(0, -mix.bank[b]) * keep[b];
  }
  accent(ACCENTS.bankLeft, 0, 1, bankLeft); accent(ACCENTS.bankRight, 0, 1, bankRight);
  const up = Math.max(0, mix.slope), down = Math.max(0, -mix.slope);
  accent(ACCENTS.climb, 0, up, keep); accent(ACCENTS.dive, 0, down * P, keep); accent(ACCENTS.sink, 0, down * (1 - P));
  if (life.takeoff < 1) {
    // The launch snaps the feet toward an absolute reach by the keyed weight, so they point further without passing the limit.
    accent(ACCENTS.launch, life.takeoff, amp, UNSOLED); const reach = -pitchOf(work, FOOT_R) * amp;
    restPose(work); sampleClip(ACCENTS.reach, 0, work); mixPose(out, work, reach, SOLES);
  }
  const approach = mix.flare;
  if (approach > 1e-3) { restPose(work); sampleClip(ACCENTS.flare, 0, work); mixPose(out, work, approach, FLARE_MASK); }
  // Look budget: the neck and head make up whatever the torso has not already spent of the look along the travel (down on a flare).
  const look = clamp(-pose.lean * .72, -.25, 1) * (1 - approach) - .2 * approach;
  sumPitch(out, LOOK, spent); const rest = clamp(look - spent[0], -.4, 1);
  rotateX(out, NECK, rest * .5); rotateX(out, HEAD, rest * .5);
  mix.clamped = limitPose(out);
  // Handover: the feet leave the plant only once the takeoff releases it and go flat on touchdown; the legs hand back over .15 s.
  const release = life.flying ? takeoffRelease(life) : 0, legs = life.flying ? release : 1 - smooth(0, .15, life.switched);
  for (let b = 0, o = 0; b < BONE_COUNT; b++, o += 4) {
    const q = joints[b].quaternion;
    if (b < LEGACY_COUNT) { final[o] = q.x; final[o + 1] = q.y; final[o + 2] = q.z; final[o + 3] = q.w; }
    else { final[o] = final[o + 1] = final[o + 2] = 0; final[o + 3] = 1; }
    authority[b] = FEET[b] ? A * release : LEGS[b] ? A * legs : A;
  }
  mixPose(final, out, 1, authority);
  // A legacy joint the layer has no authority over keeps exactly what the procedural layer wrote.
  for (let b = 0; b < BONE_COUNT; b++) if (b >= LEGACY_COUNT || authority[b] > 0) joints[b].quaternion.fromArray(final, b * 4);
  mix.label = mix.braking > .5 ? 'brake' : Math.abs(mix.bank[CHEST]) > .3 ? mix.bank[CHEST] > 0 ? 'bank-left' : 'bank-right'
    : fist > .5 ? 'power-hero' : w > .5 ? 'power' : u > .5 ? 'cruise' : 'hover';
  return A;
}
