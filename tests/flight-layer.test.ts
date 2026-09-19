import { describe, expect, it } from 'vitest';
import { Quaternion } from 'three';
import { HOVER_LOOP } from '../src/world/flightClips';
import { BONE_NAMES } from '../src/world/suitSkeleton';
import { cruising, flightPose, frame, idx, rig, settledMix, type Rig } from './flight-harness';
import { local, TOE_TIP } from './flight-sim';
/** Pose-level checks of mechanisms the signal tests cannot see: each fails when its mechanism is removed. */
const at = (name: string) => BONE_NAMES.indexOf(name as never);
// Normalised first: the float32 pose buffers leave |q| a hair off 1, which angleTo would read as up to 7e-4 rad.
const angle = (a: Rig, b: Rig, bone: number) => a.joints[bone].quaternion.clone().normalize().angleTo(b.joints[bone].quaternion.clone().normalize());
type Setup = { speed?: number; power?: number; pitch?: number; hero?: number; reduced?: boolean; clock?: number; time?: number;
  slope?: number; fist?: number; steer?: number; takeoff?: number; flare?: number };
/** One posed frame in steady flight, with the mix and animation fields a test pins. */
function posed(s: Setup = {}) {
  const { speed = 0, pitch = 0, hero = 1, reduced = false } = s, p = flightPose({ speed, pitch, viewPitch: pitch, ...(s.power === undefined ? {} : { power: s.power }) });
  const mix = settledMix(p, { x: 0, y: Math.sin(pitch) * speed, z: -Math.cos(pitch) * speed }, reduced), life = cruising(s.time ?? 0), r = rig();
  Object.assign(mix, { clock: s.clock ?? 0, slope: s.slope ?? 0, fist: s.fist ?? 0, steer: s.steer ?? 0, flare: s.flare ?? 0 });
  life.takeoff = s.takeoff ?? Infinity; frame(r, p, mix, life, hero, reduced);
  return r;
}
const tips = (r: Rig) => [local(r, idx.handR), local(r, at('hand_l')), local(r, idx.toeL, TOE_TIP), local(r, idx.toeR, TOE_TIP)];
const moved = (a: Rig, b: Rig) => { const from = tips(a); return tips(b).map((v, k) => v.distanceTo(from[k])); };
describe('flight layer mechanisms at the pose level', () => {
  it('locks the hover tread to the bob: it follows the animation time, not the shared clip clock', () => {
    for (const time of [0, 1, 2.2, 3.7]) {
      const a = posed({ time, clock: 0 }), b = posed({ time, clock: 2.5 }), later = posed({ time: time + HOVER_LOOP, clock: 1 });
      for (let bone = 0; bone < a.joints.length; bone++) { expect(angle(a, b, bone)).toBeLessThan(1e-6); expect(angle(a, later, bone)).toBeLessThan(1e-4); }
    }
    expect(Math.max(...moved(posed({ time: 0 }), posed({ time: HOVER_LOOP / 4 })))).toBeGreaterThan(.02);
  });
  it('snaps the launch on takeoff: clavicle and feet point, at 30 % under reduced motion, back to the tread by the end', () => {
    const shift = (reduced: boolean, bone: number) => angle(posed({ reduced, takeoff: .25 }), posed({ reduced, takeoff: 1 }), bone);
    for (const bone of ['clavicle_r', 'hand_r', 'foot_r', 'toe_l'].map(at)) {
      expect(shift(false, bone), BONE_NAMES[bone]).toBeGreaterThan(.1);
      expect(shift(true, bone) / shift(false, bone), BONE_NAMES[bone]).toBeGreaterThan(.2); expect(shift(true, bone) / shift(false, bone)).toBeLessThan(.4);
    }
    // At the snap the feet point toward the launch reach, past the tread they left.
    expect(posed({ takeoff: .25 }).joints[at('foot_r')].rotation.x).toBeLessThan(-1);
    for (let bone = 0; bone < 21; bone++) expect(angle(posed({ takeoff: 1 }), posed(), bone)).toBeLessThan(1e-6);
  });
  it('flares for landing: feet flat, arms out and the head looking down', () => {
    const flare = posed({ flare: 1 }), hover = posed();
    for (const bone of ['foot_l', 'foot_r', 'toe_l', 'toe_r'].map(at)) expect(flare.joints[bone].quaternion.clone().normalize().angleTo(new Quaternion())).toBeLessThan(1e-6);
    expect(angle(flare, hover, at('upperarm_r'))).toBeGreaterThan(.05); expect(angle(flare, hover, at('upperarm_l'))).toBeGreaterThan(.05);
    expect(flare.joints[idx.head].rotation.x + flare.joints[idx.neck].rotation.x).toBeLessThan(hover.joints[idx.head].rotation.x + hover.joints[idx.neck].rotation.x - .1);
  });
  it('climbs, dives and sinks visibly: each slope accent moves the hands or toe tips by 4 cm or more', () => {
    const slope = (speed: number, pitch: number) => Math.max(...moved(posed({ speed, pitch, hero: 0 }), posed({ speed, pitch, hero: 0, slope: Math.sin(pitch) })));
    expect(slope(13, .9), 'climb').toBeGreaterThan(.04); expect(slope(13, -.9), 'dive').toBeGreaterThan(.04); expect(slope(0, -.9), 'sink').toBeGreaterThan(.04);
  });
  it('steers the raised fist into the turn: a full steer swings the wrist 5 cm or more toward the inside', () => {
    const wrist = (steer: number) => local(posed({ speed: 34, fist: 1, steer }), idx.handR).x;
    expect(wrist(1)).toBeLessThan(wrist(0) - .05); expect(wrist(-1)).toBeGreaterThan(wrist(0) + .05);
  });
  it('scales the power loop with speed: at 13 m/s it swings about 60 % as far as at 34 m/s', () => {
    const spread = (speed: number) => { const still = posed({ speed, power: 1, hero: 0 }); let worst = 0;
      for (let k = 1; k < 16; k++) { const r = posed({ speed, power: 1, hero: 0, clock: k / 4 }); for (let b = 10; b < 21; b++) worst = Math.max(worst, angle(r, still, b)); }
      return worst; };
    const ratio = spread(13) / spread(34);
    expect(spread(34)).toBeGreaterThan(.05); expect(ratio).toBeGreaterThan(.5); expect(ratio).toBeLessThan(.75);
  });
});
