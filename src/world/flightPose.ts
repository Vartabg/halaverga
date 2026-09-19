import type { Object3D } from 'three';
import type { Pose } from '../game/presentation';
import { addPose, createPose, limitPose, mixPose, pitchOf, preRotateX, restPose, rotateX, rotateZ, sampleClip, sumPitch, type Clip, type PoseBuffer } from './clipSampler';
import { ACCENTS } from './flightAccents';
import { FLIGHT, HOVER_LOOP } from './flightClips';
import type { FlightMix } from './flightMix';
import { BONE_COUNT, BONE_NAMES, LEGACY_COUNT } from './suitSkeleton';
import { armAuthority, takeoffRelease, type SuitAnimation } from './suitAnimation';
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const smooth = (a: number, b: number, v: number) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const group = (name: string) => name.replace(/_[lr]$/, '');
const idx = (name: string) => BONE_NAMES.indexOf(name as never);
const UPPERARM_R = idx('upperarm_r'), CHEST = idx('chest'), NECK = idx('neck'), HEAD = idx('head'), FOOT_R = idx('foot_r');
const LOOK = new Int8Array(['spine', 'chest', 'neck', 'head'].map(idx)), spent = new Float64Array(1);
/** The hero fist chain: while the fist is up, the bank and slope accents leave it alone. */
const LEAD = BONE_NAMES.map(n => ['clavicle_r', 'upperarm_r', 'forearm_r', 'hand_r'].includes(n) ? 1 : 0);
/** The hero trailing arm: while the fist is up, it stays along the body through a left turn instead of taking the inside arm's tuck. */
const TRAIL = BONE_NAMES.map(n => ['clavicle_l', 'upperarm_l', 'forearm_l', 'hand_l'].includes(n) ? 1 : 0);
/** Bones the slope clips pose: the limbs for the climb (no torso pitch), and the rounded back as well for the dive. */
const LIMB = BONE_NAMES.map(n => ['clavicle', 'upperarm', 'forearm', 'hand', 'thigh', 'shin', 'foot', 'toe'].includes(group(n)) ? 1 : 0);
const TUCK = BONE_NAMES.map((n, b) => LIMB[b] || n === 'spine' || n === 'chest' ? 1 : 0);
const ARM = BONE_NAMES.map(n => ['clavicle', 'upperarm', 'forearm', 'hand'].includes(group(n)));
const FEET = BONE_NAMES.map(n => ['foot', 'toe'].includes(group(n))), SOLES = BONE_NAMES.map(n => group(n) === 'foot' ? 1 : 0);
const UNSOLED = SOLES.map(s => 1 - s), THIGHS = [4, 5] as const, FEET_AT = [idx('foot_l'), idx('foot_r')] as const;
const LEGS = BONE_NAMES.map((_, b) => b === 4 || b === 5 || b === 8 || b === 9);
const FLARE: Record<string, number> = { thigh: 1, shin: 1, foot: 1, toe: 1, upperarm: 1, forearm: 1, hand: 1, clavicle: .5, spine: .5, chest: .5 };
const FLARE_MASK = BONE_NAMES.map(n => FLARE[group(n)] ?? 0);
// Preallocated buffers: posing allocates nothing per frame.
const out = createPose(), work = createPose(), hero = createPose(), still = createPose(), final = createPose();
const bankLeft = new Float32Array(BONE_COUNT), bankRight = new Float32Array(BONE_COUNT), keep = new Float32Array(BONE_COUNT), authority = new Float32Array(BONE_COUNT);
const limbs = new Float32Array(BONE_COUNT), tuck = new Float32Array(BONE_COUNT), sweep = new Float32Array(BONE_COUNT), stop = new Float32Array(BONE_COUNT);
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
  // Setting off, the arms sweep back ahead of the legs: full by P = .2 (8 m/s), the rest of the body by P = .35. The arm ramp eases
  // out, so the sweep settles into the cruise pose instead of stopping dead where a linear ramp would hit its clamp.
  const reach = clamp(P / .2, 0, 1);
  for (let b = 0; b < BONE_COUNT; b++) sweep[b] = ARM[b] ? reach * (2 - reach) : u;
  if (u > 0) { styled(work, FLIGHT.cruise, FLIGHT.cruise, t, 0, amp); mixPose(out, work, 1, sweep); }
  if (w > 0) { styled(work, FLIGHT.power[0], FLIGHT.power[1], t, h, amp * (.4 + .6 * speed)); mixPose(out, work, w); }
  if (fist > 1e-4) {
    styled(work, FLIGHT.fist, FLIGHT.fist, t, 0, amp);
    // Authored for the full power lean on level travel: re-aim along the travel axis at any lean and slope, then lead the turn.
    preRotateX(work, UPPERARM_R, clamp(-(pose.lean + 1.35) + pose.pitch * (1 - P), -.8, .4)); rotateZ(work, UPPERARM_R, -.1 * mix.steer);
    mixPose(out, work, fist, LEAD);
  }
  for (let b = 0; b < BONE_COUNT; b++) {
    keep[b] = 1 - LEAD[b] * fist; limbs[b] = LIMB[b] * keep[b]; tuck[b] = TUCK[b] * keep[b];
    // In a left turn the trailing arm is the inside arm and stays along the body; in a right turn it takes the outside arm's pull in.
    // At power speed the legs hold the straight-flight line through a turn (the whole-body roll carries it).
    const legs = LEGS[b] ? 1 - w : 1;
    bankLeft[b] = Math.max(0, mix.bank[b]) * keep[b] * (1 - TRAIL[b] * fist) * legs; bankRight[b] = Math.max(0, -mix.bank[b]) * keep[b] * legs;
  }
  // The slope clips replace the limbs (and for the dive the back), full by a slope of .7 (about 44 degrees); the feet-first sink
  // belongs to a hover descent and is gone by P = .25; the dive tuck is full from P = .4 (keyboard speed).
  const up = Math.min(1, Math.max(0, mix.slope) / .7), down = Math.min(1, Math.max(0, -mix.slope) / .7), hovering = Math.max(0, 1 - 4 * P);
  if (up > 0) { styled(work, FLIGHT.climb, FLIGHT.climb, t, 0, amp); mixPose(out, work, up, limbs); }
  const diving = down * smooth(0, .4, P);
  if (diving > 0) { styled(work, FLIGHT.dive, FLIGHT.dive, t, 0, amp); mixPose(out, work, diving, tuck); }
  let braking = false;
  for (let b = 0; b < BONE_COUNT; b++) braking ||= mix.brake[b] > 1e-3;
  // The arms' forward reach flares against the airflow of the speed being shed: a brake out of a drift under about 8 m/s keeps the
  // hover arms, where a partial reach would hold the outside arm straight out to the side.
  const air = smooth(2, 8, mix.pace);
  for (let b = 0; b < BONE_COUNT; b++) stop[b] = mix.brake[b] * (ARM[b] ? air : 1);
  if (braking) { styled(work, FLIGHT.brake[0], FLIGHT.brake[1], t, h, amp); mixPose(out, work, 1, stop); }
  accent(ACCENTS.bankLeft, 0, 1, bankLeft); accent(ACCENTS.bankRight, 0, 1, bankRight);
  accent(ACCENTS.sink, 0, Math.max(0, -mix.slope) * hovering * hovering);
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
  const arms = armAuthority(life, A);
  for (let b = 0, o = 0; b < BONE_COUNT; b++, o += 4) {
    const q = joints[b].quaternion;
    if (b < LEGACY_COUNT) { final[o] = q.x; final[o + 1] = q.y; final[o + 2] = q.z; final[o + 3] = q.w; }
    else { final[o] = final[o + 1] = final[o + 2] = 0; final[o + 3] = 1; }
    authority[b] = FEET[b] ? A * release : LEGS[b] ? A * legs : ARM[b] ? arms : A;
  }
  mixPose(final, out, 1, authority);
  // While the legs hand back after touchdown the feet are already flat to the shins; a knee still folded back from flight would tip
  // the toes into the ground, so each foot (and past the foot's limit, the toe) lifts by what its thigh and shin still pitch back beyond the ground pose. Under .1 rad
  // the toe clears the ground unaided, so a landing from the flare stance keeps its feet exactly flat.
  if (!life.flying && legs > 0) for (let k = 0; k < 2; k++) {
    const thigh = THIGHS[k], shin = thigh + 4, back = joints[thigh].rotation.x + joints[shin].rotation.x - pitchOf(final, thigh) - pitchOf(final, shin);
    const lift = back * smooth(.1, .2, back); rotateX(final, FEET_AT[k], Math.min(.35, lift)); rotateX(final, FEET_AT[k] + 2, clamp(lift - .35, 0, .5));
  }
  // A legacy joint the layer has no authority over keeps exactly what the procedural layer wrote.
  for (let b = 0; b < BONE_COUNT; b++) if (b >= LEGACY_COUNT || authority[b] > 0) joints[b].quaternion.fromArray(final, b * 4);
  mix.label = mix.braking > .5 ? 'brake' : Math.abs(mix.bank[CHEST]) > .3 ? mix.bank[CHEST] > 0 ? 'bank-left' : 'bank-right'
    : fist > .5 ? 'power-hero' : w > .5 ? 'power' : u > .5 ? 'cruise' : 'hover';
  return A;
}
