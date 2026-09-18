import { describe, expect, it } from 'vitest';
import { Euler, Quaternion } from 'three';
import { addPose, compileClip, createPose, limitPose, mirrorClip, mirrorKeys, mixPose, pitchOf, preRotateX, rotateX, rotateZ, sampleClip,
  type AuthoredClip, type Keys, type PoseBuffer } from '../src/world/clipSampler';
import { BONE_COUNT, BONE_NAMES, HINGE, LIMITS, MIRROR } from '../src/world/suitSkeleton';
const at = (name: string) => BONE_NAMES.indexOf(name as never);
const clip = (keys: Keys, patch: Partial<AuthoredClip> = {}): AuthoredClip => ({ name: 'test', duration: 2, loop: true, source: 'authored-table', keys, ...patch });
const q = (x: number, y: number, z: number) => new Quaternion().setFromEuler(new Euler(x, y, z));
const read = (p: PoseBuffer, bone: number) => new Quaternion().fromArray(p, bone * 4);
const sample = (c: ReturnType<typeof compileClip>, t: number) => { const p = createPose(); sampleClip(c, t, p); return p; };
/** Largest component difference, sign-insensitive: float32 buffers make angleTo too coarse near zero. */
const angle = (a: Quaternion, b: Quaternion) => { const s = a.dot(b) < 0 ? -1 : 1; return Math.max(Math.abs(a.x - s * b.x), Math.abs(a.y - s * b.y), Math.abs(a.z - s * b.z), Math.abs(a.w - s * b.w)); };
const ARM = at('upperarm_r'), SHIN = at('shin_r'), FORE = at('forearm_r');
describe('clip sampler', () => {
  const swing = compileClip(clip({ upperarm_r: [[0, .2, .1, .3], [.5, .6, -.1, .2], [1.2, -.3, .05, .1]] }));
  it('hits every key exactly and leaves unkeyed bones untouched', () => {
    for (const [t, x, y, z] of [[0, .2, .1, .3], [.5, .6, -.1, .2], [1.2, -.3, .05, .1]]) expect(angle(read(sample(swing, t), ARM), q(x, y, z))).toBeLessThan(1e-3);
    const p = sample(swing, .3); for (let b = 0; b < BONE_COUNT; b++) if (b !== ARM) expect([...p.subarray(b * 4, b * 4 + 4)]).toEqual([0, 0, 0, 1]);
  });
  it('is C1: the second difference across each key falls with the square of the step, including across the wrap', () => {
    const late = compileClip(clip({ upperarm_r: [[.4, .2, 0, 0], [1, .8, 0, 0], [1.6, .1, 0, 0]] }));
    const flat = compileClip(clip({ upperarm_r: [[0, .2, 0, 0], [.5, .6, 0, 0], [1.2, -.3, 0, 0]] }));
    // A kink leaves |f(t-d) - 2f(t) + f(t+d)| proportional to d (halving d halves it); a C1 curve makes it fall as d squared.
    for (const c of [flat, late]) for (const key of [0, .4, .5, 1, 1.2, 1.6, 2]) {
      const bend = (d: number) => Math.abs(pitchOf(sample(c, key - d), ARM) - 2 * pitchOf(sample(c, key), ARM) + pitchOf(sample(c, key + d), ARM));
      expect(bend(.01), `key ${key}`).toBeLessThan(bend(.02) * .35 + 2e-6);
    }
    // Before the first key a loop interpolates from its last key round the wrap, never jumping to the first key's value.
    const before = pitchOf(sample(late, .2), ARM);
    expect(before).toBeGreaterThan(.1); expect(before).toBeLessThan(.2);
  });
  it('wraps loops and clamps one-shots to their end keys', () => {
    expect(angle(read(sample(swing, 2.5), ARM), read(sample(swing, .5), ARM))).toBeLessThan(1e-5);
    expect(angle(read(sample(swing, -1.5), ARM), read(sample(swing, .5), ARM))).toBeLessThan(1e-5);
    const once = compileClip(clip({ upperarm_r: [[.2, .3, 0, 0], [.8, .9, 0, 0]] }, { loop: false, duration: 1 }));
    expect(pitchOf(sample(once, 0), ARM)).toBeCloseTo(.3, 4); expect(pitchOf(sample(once, 5), ARM)).toBeCloseTo(.9, 4);
  });
  it('mirrors: right-only channels gain a reflected left, and mirroring a clip twice is the identity', () => {
    const keys = mirrorKeys({ upperarm_r: [[0, .2, .1, .3], [1.5, .4, .2, .1]], spine: [[0, .1, .02, .03]] }, 1, 2);
    expect(keys.upperarm_l).toEqual([[.5, .4, -.2, -.1], [1, .2, -.1, -.3]]);
    expect(keys.spine).toEqual([[0, .1, .02, .03]]);
    const src = clip({ upperarm_r: [[0, .2, .1, .3]], spine: [[0, .1, .02, .03]], hand_l: [[0, .1, 0, -.2]] });
    const twice = mirrorClip(mirrorClip(src, 'm'), 'back');
    expect(twice.keys).toEqual(src.keys); expect(MIRROR.every((m, i) => MIRROR[m] === i)).toBe(true);
  });
  it('rejects malformed tables', () => {
    const bad: [Keys, Partial<AuthoredClip>?][] = [
      [{ spine: [[.5, 0, 0, 0], [.2, 0, 0, 0]] }], [{ spine: [[.5, 0, 0, 0], [.5, .1, 0, 0]] }], [{ spine: [[2, 0, 0, 0]] }],
      [{ spine: [[0, Number.NaN, 0, 0]] }], [{ spine: [[-.1, 0, 0, 0]] }], [{ forearm_r: [[0, .2, .1, 0]] }], [{ shin_l: [[0, -.2, 0, .1]] }],
      [{ forearm_l: [[0, -.1, 0, 0]] }, { additive: true }], [{ shin_r: [[0, .1, 0, 0]] }, { additive: true }], [{ spine: [[0, 0, 0, 0]] }, { duration: 0 }],
      [{ tail: [[0, 0, 0, 0]] } as Keys]];
    for (const [keys, patch] of bad) expect(() => compileClip(clip(keys, patch))).toThrow();
    expect(() => compileClip(clip({ forearm_r: [[0, .2, 0, 0]], shin_r: [[0, -.2, 0, 0]] }, { additive: true }))).not.toThrow();
  });
  it('blends a wide arm swing in front of the body, never backward over the shoulder', () => {
    const a = createPose(), b = createPose();
    q(-.3, -.2, .2).toArray(a, ARM * 4); q(2.8, .1, .05).toArray(b, ARM * 4);
    // The raw quaternions sit in opposite hemispheres; aligned to the pivot the halfway pose points forward and up.
    for (const flip of [1, -1]) {
      const c = new Float32Array(b); for (let i = 0; i < 4; i++) c[ARM * 4 + i] *= flip;
      const mid = new Float32Array(a); mixPose(mid, c, .5);
      expect(pitchOf(mid, ARM)).toBeGreaterThan(1); expect(pitchOf(mid, ARM)).toBeLessThan(1.6);
    }
    // Sampling between two such keys takes the same forward path, even when a key is written in the other hemisphere (x - 2π).
    const reach = compileClip(clip({ upperarm_r: [[0, -.3, -.2, .2], [1, 2.8 - 2 * Math.PI, .1, .05]] }));
    for (const t of [.25, .5, .75, 1.25, 1.5, 1.75]) expect(pitchOf(sample(reach, t), ARM), `t ${t}`).toBeGreaterThan(-.5);
    expect(pitchOf(sample(reach, .5), ARM)).toBeGreaterThan(1); expect(pitchOf(sample(reach, .5), ARM)).toBeLessThan(1.6);
    const masked = new Float32Array(a); mixPose(masked, b, 1, BONE_NAMES.map(() => 0)); expect(masked).toEqual(a);
  });
  it('adds offsets as local post-multiplies that vanish at zero weight', () => {
    const base = createPose(), offset = createPose(); q(.4, .2, -.1).toArray(base, ARM * 4); q(.1, 0, .2).toArray(offset, ARM * 4);
    const none = new Float32Array(base); addPose(none, offset, 0); expect(none).toEqual(base);
    const full = new Float32Array(base); addPose(full, offset, 1);
    expect(angle(read(full, ARM), q(.4, .2, -.1).multiply(q(.1, 0, .2)))).toBeLessThan(1e-5);
  });
  it('rotates as documented: own x, parent x (Euler x) and own z', () => {
    const p = createPose(); q(.3, .2, .1).toArray(p, ARM * 4);
    const own = new Float32Array(p); rotateX(own, ARM, .5); expect(angle(read(own, ARM), q(.3, .2, .1).multiply(q(.5, 0, 0)))).toBeLessThan(1e-5);
    const pre = new Float32Array(p); preRotateX(pre, ARM, .5); expect(angle(read(pre, ARM), q(.5, 0, 0).multiply(q(.3, .2, .1)))).toBeLessThan(1e-5);
    const z = new Float32Array(p); rotateZ(z, ARM, .5); expect(angle(read(z, ARM), q(.3, .2, .1).multiply(q(0, 0, .5)))).toBeLessThan(1e-5);
    const flat = createPose(); preRotateX(flat, SHIN, -.4); expect(pitchOf(flat, SHIN)).toBeCloseTo(-.4, 5);
  });
  it('limits each bone to its range and hinges to pure x, reporting how many it clamped', () => {
    const inside = createPose(); q(.5, 0, 0).toArray(inside, FORE * 4); expect(limitPose(inside)).toBe(0);
    const out = createPose(); q(-.4, 0, 0).toArray(out, FORE * 4); q(.3, 0, 0).toArray(out, SHIN * 4); q(0, .3, 0).toArray(out, at('spine') * 4);
    expect(limitPose(out)).toBe(3);
    expect(pitchOf(out, FORE)).toBeCloseTo(0, 5); expect(pitchOf(out, SHIN)).toBeCloseTo(0, 5);
    expect(new Euler().setFromQuaternion(read(out, at('spine'))).y).toBeCloseTo(.04, 5);
    for (const h of HINGE) expect(LIMITS[h].slice(2).every(v => v === 0)).toBe(true);
    for (let b = 0; b < BONE_COUNT; b++) expect(LIMITS[MIRROR[b]]).toEqual(b === MIRROR[b] ? LIMITS[b] : [LIMITS[b][0], LIMITS[b][1], -LIMITS[b][3], -LIMITS[b][2], -LIMITS[b][5], -LIMITS[b][4]]);
  });
});
