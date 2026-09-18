import { describe, expect, it } from 'vitest';
import { Euler, Quaternion } from 'three';
import { createPose, pitchOf, preRotateX, rotateZ, sampleClip, type Clip, type PoseBuffer } from '../src/world/clipSampler';
import { FLIGHT, HOVER_LOOP } from '../src/world/flightClips';
import { ACCENTS } from '../src/world/flightAccents';
import { BLEND_REF, BONE_COUNT, BONE_NAMES, HINGE, MIRROR } from '../src/world/suitSkeleton';
const at = (name: string) => BONE_NAMES.indexOf(name as never);
const REF = BLEND_REF.map(e => new Quaternion().setFromEuler(new Euler(e[0], e[1], e[2])));
const CLIPS: Clip[] = [FLIGHT.hover, FLIGHT.cruise, ...FLIGHT.power, FLIGHT.fist, ...FLIGHT.brake, ...Object.values(ACCENTS)];
const sample = (c: Clip, t: number) => { const p = createPose(); sampleClip(c, t, p); return p; };
const times = (c: Clip, n = 48) => Array.from({ length: n + 1 }, (_, i) => i * c.duration / n);
const quat = (p: PoseBuffer, b: number) => new Quaternion().fromArray(p, b * 4);
const euler = (p: PoseBuffer, b: number) => new Euler().setFromQuaternion(quat(p, b));
/**
 * A blend is safe when both poses sit clearly on one side of the bone's blend pivot (so the sign mixPose picks cannot flip between
 * frames) and their pivot-aligned halfway sum stays long (the nlerp never passes near a cancelled, undefined rotation).
 */
const pivotDot = (p: PoseBuffer, bone: number) => Math.abs(quat(p, bone).dot(REF[bone]));
const halfway = (a: PoseBuffer, b: PoseBuffer, bone: number) => {
  const qa = quat(a, bone), qb = quat(b, bone), sa = Math.sign(qa.dot(REF[bone]) || 1), sb = Math.sign(qb.dot(REF[bone]) || 1);
  return Math.hypot(sa * qa.x + sb * qb.x, sa * qa.y + sb * qb.y, sa * qa.z + sb * qb.z, sa * qa.w + sb * qb.w) / 2;
};
const bases = () => [FLIGHT.hover, FLIGHT.cruise, ...FLIGHT.power].flatMap(c => times(c, 16).map(t => sample(c, t)));
describe('authored flight clips', () => {
  it('keep elbows forward and knees back at every sampled instant, with hinges bending about x only', () => {
    for (const c of CLIPS) for (const t of times(c, 96)) {
      const p = sample(c, t);
      for (const h of HINGE) { const e = euler(p, h); expect(Math.abs(e.y) + Math.abs(e.z), `${c.name} ${BONE_NAMES[h]}`).toBeLessThan(1e-4); }
      if (c.additive) continue;
      for (const b of [6, 7]) expect(pitchOf(p, b), `${c.name} elbow`).toBeGreaterThanOrEqual(0);
      for (const b of [8, 9]) expect(pitchOf(p, b), `${c.name} knee`).toBeLessThanOrEqual(1e-6);
    }
  });
  it('never jump more than 1.05 rad between consecutive keys', () => {
    for (const c of CLIPS) for (const ch of c.channels) for (let k = 1; k < ch.times.length; k++)
      expect(new Quaternion().fromArray(ch.q, (k - 1) * 4).angleTo(new Quaternion().fromArray(ch.q, k * 4)), `${c.name} ${BONE_NAMES[ch.bone]}`).toBeLessThan(1.05);
  });
  it('share one clock: loops divide 4 s, and hover spans two bob periods', () => {
    expect(FLIGHT.hover.duration).toBe(2 / .42); expect(HOVER_LOOP).toBe(2 / .42);
    for (const c of [FLIGHT.cruise, ...FLIGHT.power, FLIGHT.fist, ...FLIGHT.brake]) { expect(c.loop).toBe(true); expect(Number.isInteger(4 / c.duration)).toBe(true); }
  });
  it('blend every pair along the short way round their pivots', () => {
    const base = bases(), fist = times(FLIGHT.fist, 8).flatMap(t => [-.8, -.4, 0, .4].flatMap(aim => [-.25, 0, .25].map(steer => {
      const p = sample(FLIGHT.fist, t); preRotateX(p, at('upperarm_r'), aim); rotateZ(p, at('upperarm_r'), steer); return p; })));
    const brake = FLIGHT.brake.flatMap(c => times(c, 16).map(t => sample(c, t))), flare = [sample(ACCENTS.flare, 0)];
    const pairs: [string, PoseBuffer[], PoseBuffer[], number[]][] = [
      ['hover-cruise', times(FLIGHT.hover, 16).map(t => sample(FLIGHT.hover, t)), times(FLIGHT.cruise, 16).map(t => sample(FLIGHT.cruise, t)), []],
      ['cruise-power', times(FLIGHT.cruise, 16).map(t => sample(FLIGHT.cruise, t)), FLIGHT.power.flatMap(c => times(c, 8).map(t => sample(c, t))), []],
      ['classic-hero', times(FLIGHT.power[0], 16).map(t => sample(FLIGHT.power[0], t)), times(FLIGHT.power[1], 16).map(t => sample(FLIGHT.power[1], t)), []],
      ['base-fist', base, fist, ['clavicle_r', 'upperarm_r', 'forearm_r', 'hand_r'].map(at)], ['base-brake', base, brake, []], ['base-flare', [...base, ...brake], flare, []]];
    for (const [name, from, to, only] of pairs) {
      let side = 1, length = 1;
      for (const a of from) for (const b of to) for (let bone = 0; bone < BONE_COUNT; bone++) if (!only.length || only.includes(bone)) {
        side = Math.min(side, pivotDot(a, bone), pivotDot(b, bone)); length = Math.min(length, halfway(a, b, bone));
      }
      expect(side, name).toBeGreaterThan(.4); expect(length, name).toBeGreaterThan(.5);
    }
  });
  it('keep held accents small, and the takeoff snap on the added bones only, starting and ending at rest', () => {
    for (const c of [ACCENTS.bankLeft, ACCENTS.bankRight, ACCENTS.climb, ACCENTS.dive, ACCENTS.sink]) {
      const p = sample(c, 0);
      for (let b = 0; b < BONE_COUNT; b++) { const e = euler(p, b); expect(Math.max(Math.abs(e.x), Math.abs(e.y), Math.abs(e.z)), `${c.name} ${BONE_NAMES[b]}`).toBeLessThanOrEqual(.35 + 1e-6); }
    }
    for (const ch of ACCENTS.launch.channels) expect(ch.bone).toBeGreaterThanOrEqual(10);
    for (const t of [0, 1]) expect(Math.max(...sample(ACCENTS.launch, t).map((v, i) => Math.abs(v - (i % 4 === 3 ? 1 : 0))))).toBeLessThan(1e-6);
  });
  it('encode the facing rule: no torso pitch where an overhead camera can meet it, and braking hunches', () => {
    const torso = ['spine', 'chest', 'neck', 'head'].map(at);
    for (const c of [ACCENTS.climb, ACCENTS.sink, ACCENTS.launch, ACCENTS.flare]) for (const t of times(c, 8)) for (const b of torso)
      expect(Math.abs(pitchOf(sample(c, t), b)), `${c.name} ${BONE_NAMES[b]}`).toBeLessThan(1e-6);
    for (const c of FLIGHT.brake) for (const t of times(c, 32)) for (const b of torso) expect(pitchOf(sample(c, t), b)).toBeLessThanOrEqual(1e-6);
  });
  it('mirror the right bank from the left, land the flare feet flat, and are all original', () => {
    const left = sample(ACCENTS.bankLeft, 0), right = sample(ACCENTS.bankRight, 0);
    for (let b = 0; b < BONE_COUNT; b++) {
      const l = euler(left, MIRROR[b]), r = euler(right, b);
      expect(r.x).toBeCloseTo(l.x, 6); expect(r.y).toBeCloseTo(-l.y, 6); expect(r.z).toBeCloseTo(-l.z, 6);
    }
    const flare = sample(ACCENTS.flare, 0);
    for (const b of ['foot_l', 'foot_r', 'toe_l', 'toe_r'].map(at)) expect([...flare.subarray(b * 4, b * 4 + 4)].map(Math.abs)).toEqual([0, 0, 0, 1]);
    for (const c of CLIPS) expect(c.source, c.name).toBe('authored-table');
  });
});
