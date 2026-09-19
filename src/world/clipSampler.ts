import { Euler, Quaternion } from 'three';
import { BLEND_REF, BONE_COUNT, BONE_NAMES, HINGE, LIMITS, MIRROR, type BoneName } from './suitSkeleton';
/** One key: time in seconds, then the bone's local rotation as three.js XYZ Euler radians (the rotation.set convention). */
export type Key = readonly [t: number, x: number, y: number, z: number];
/** Where a clip came from. Only original work is allowed: hand-authored tables now, own Blender bakes later; never third-party clips. */
export type ClipSource = 'authored-table';
export type AuthoredClip = {
  name: string; duration: number; loop: boolean; source: ClipSource;
  /** Additive clips hold offsets from rest and are applied on top of a base pose. */
  additive?: boolean;
  keys: Keys;
};
export type Keys = Partial<Record<BoneName, readonly Key[]>>;
type Channel = { bone: number; times: Float32Array; q: Float32Array; m: Float32Array };
/** Loops wrap after their last key (no duplicate end key). `linear` is for dense imported clips (mocap, Blender bakes). */
export type Clip = { name: string; source: ClipSource; duration: number; loop: boolean; additive: boolean; linear: boolean; channels: Channel[] };
/** BONE_COUNT quaternions, x y z w. */
export type PoseBuffer = Float32Array;
const euler = new Euler(), quat = new Quaternion(), REST = new Float32Array([0, 0, 0, 1]);
const REF = new Float32Array(BONE_COUNT * 4);
BLEND_REF.forEach((e, i) => quat.setFromEuler(euler.set(e[0], e[1], e[2])).toArray(REF, i * 4));
const dot = (a: Float32Array, i: number, b: Float32Array, j: number) => a[i] * b[j] + a[i + 1] * b[j + 1] + a[i + 2] * b[j + 2] + a[i + 3] * b[j + 3];
export function createPose() { const p = new Float32Array(BONE_COUNT * 4); for (let i = 3; i < p.length; i += 4) p[i] = 1; return p; }
export function restPose(p: PoseBuffer) { p.fill(0); for (let i = 3; i < p.length; i += 4) p[i] = 1; return p; }

export function compileClip(src: AuthoredClip): Clip {
  if (!(src.duration > 0) || !Number.isFinite(src.duration)) throw new Error(`${src.name}: bad duration`);
  for (const name of Object.keys(src.keys)) if (!BONE_NAMES.includes(name as BoneName)) throw new Error(`${src.name}: unknown bone ${name}`);
  const channels = Object.entries(src.keys).map(([name, keys]) => channel(BONE_NAMES.indexOf(name as BoneName), [...keys!], src));
  return { name: src.name, source: src.source, duration: src.duration, loop: src.loop, additive: !!src.additive, linear: false, channels };
}
const reflect = ([t, x, y, z]: Key, shift: number, d: number): Key => [shift ? (t + shift) % d : t, x, -y, -z];
const partner = (name: string) => BONE_NAMES[MIRROR[BONE_NAMES.indexOf(name as BoneName)]];
/** Adds a left channel for every right channel that has none (x kept, y and z negated), shifted `shift` seconds round a loop. */
export function mirrorKeys(keys: Keys, shift = 0, duration = 1): Keys {
  const out: Record<string, readonly Key[]> = { ...keys };
  for (const [name, list] of Object.entries(keys)) if (name.endsWith('_r') && !keys[partner(name)])
    out[partner(name)] = list!.map(k => reflect(k, shift, duration)).sort((a, b) => a[0] - b[0]);
  return out;
}
/** The clip reflected left-right, e.g. a right bank from the left one. */
export function mirrorClip(src: AuthoredClip, name: string): AuthoredClip {
  const keys: Record<string, readonly Key[]> = {};
  for (const [bone, list] of Object.entries(src.keys)) keys[partner(bone)] = list!.map(k => reflect(k, 0, src.duration));
  return { ...src, name, keys };
}
function channel(bone: number, keys: Key[], src: AuthoredClip): Channel {
  const n = keys.length, times = new Float32Array(n), q = new Float32Array(n * 4), m = new Float32Array(n * 4);
  keys.forEach(([t, x, y, z], k) => {
    const late = src.loop ? t >= src.duration : t > src.duration;
    if (!(t >= 0) || late || (k && t <= keys[k - 1][0]) || ![x, y, z].every(Number.isFinite)) throw new Error(`${src.name}: bad key on ${BONE_NAMES[bone]}`);
    if (HINGE.has(bone) && (y || z)) throw new Error(`${src.name}: ${BONE_NAMES[bone]} is a hinge`);
    // Offsets never unflex a hinge: elbows only close (+x), knees only fold (-x).
    if (src.additive && ((bone === 6 || bone === 7) && x < 0 || (bone === 8 || bone === 9) && x > 0)) throw new Error(`${src.name}: ${BONE_NAMES[bone]} offset opens a hinge`);
    times[k] = t; quat.setFromEuler(euler.set(x, y, z)).toArray(q, k * 4);
    // Offsets align to rest, poses to the bone's blend pivot, so every blend of them stays in one hemisphere.
    if (dot(q, k * 4, src.additive ? REST : REF, src.additive ? 0 : bone * 4) < 0) for (let i = 0; i < 4; i++) q[k * 4 + i] *= -1;
  });
  // Catmull-Rom tangents for uneven key spacing; one-shots ease in and out of their end keys.
  for (let k = 0; k < n; k++) {
    const wraps = src.loop && n > 1, a = k ? k - 1 : wraps ? n - 1 : k, b = k < n - 1 ? k + 1 : wraps ? 0 : k;
    const span = (times[b] + (b < k ? src.duration : 0)) - (times[a] - (a > k ? src.duration : 0));
    if (a === k || b === k || span <= 0) continue;
    for (let i = 0; i < 4; i++) m[k * 4 + i] = (q[b * 4 + i] - q[a * 4 + i]) / span;
  }
  return { bone, times, q, m };
}

/** Writes the clip's channels at `time` into `out`; bones the clip does not key are left untouched. */
export function sampleClip(clip: Clip, time: number, out: PoseBuffer) {
  const d = clip.duration, t = clip.loop ? ((time % d) + d) % d : Math.min(d, Math.max(0, time));
  for (let c = 0; c < clip.channels.length; c++) {
    const { bone, times, q, m } = clip.channels[c], n = times.length, o = bone * 4;
    if (t < times[0] && !clip.loop) { copy(out, o, q, 0); continue; }
    // Segment a -> b containing t; before the first key of a loop, the segment is the wrap from the last key.
    let a = n - 1; while (a > 0 && times[a] > t) a--;
    const early = t < times[a]; if (early) a = n - 1;
    const b = a + 1 < n ? a + 1 : clip.loop ? 0 : a;
    if (b === a && !clip.loop) { copy(out, o, q, a * 4); continue; }
    const t0 = times[a] - (early ? d : 0), h = (b > a ? times[b] : times[b] + d) - (early ? d : 0) - t0;
    const s = h > 0 ? (t - t0) / h : 0, s2 = s * s, s3 = s2 * s;
    const h00 = 2 * s3 - 3 * s2 + 1, h10 = (s3 - 2 * s2 + s) * h, h01 = 3 * s2 - 2 * s3, h11 = (s3 - s2) * h;
    for (let i = 0; i < 4; i++) {
      out[o + i] = clip.linear ? q[a * 4 + i] * (1 - s) + q[b * 4 + i] * s
        : h00 * q[a * 4 + i] + h10 * m[a * 4 + i] + h01 * q[b * 4 + i] + h11 * m[b * 4 + i];
    }
    normalize(out, o);
  }
}
function copy(out: Float32Array, o: number, q: Float32Array, k: number) { for (let i = 0; i < 4; i++) out[o + i] = q[k + i]; }
function normalize(p: Float32Array, o: number) {
  const l = Math.sqrt(p[o] * p[o] + p[o + 1] * p[o + 1] + p[o + 2] * p[o + 2] + p[o + 3] * p[o + 3]);
  if (!(l > 1e-6) || !Number.isFinite(l)) { p[o] = p[o + 1] = p[o + 2] = 0; p[o + 3] = 1; return; }
  for (let i = 0; i < 4; i++) p[o + i] /= l;
}
/** pose = nlerp(pose, src, w · mask), both sign-aligned to the blend pivot: a normalised sum never cancels or goes the long way. */
export function mixPose(pose: PoseBuffer, src: PoseBuffer, w: number, mask?: ArrayLike<number>) {
  for (let b = 0, o = 0; b < BONE_COUNT; b++, o += 4) {
    const u = Math.min(1, Math.max(0, w * (mask ? mask[b] : 1)));
    if (u === 0) continue;
    const sa = dot(pose, o, REF, o) < 0 ? -1 : 1, sb = dot(src, o, REF, o) < 0 ? -1 : 1;
    for (let i = 0; i < 4; i++) pose[o + i] = pose[o + i] * sa * (1 - u) + src[o + i] * sb * u;
    normalize(pose, o);
  }
}
/** pose_b = pose_b · nlerp(rest, offset_b, w · mask): a local post-multiply, so offsets read the same on any base. */
export function addPose(pose: PoseBuffer, offset: PoseBuffer, w: number, mask?: ArrayLike<number>) {
  for (let b = 0, o = 0; b < BONE_COUNT; b++, o += 4) {
    const u = Math.min(1, Math.max(0, w * (mask ? mask[b] : 1)));
    if (u === 0) continue;
    const s = offset[o + 3] < 0 ? -u : u;
    const x = offset[o] * s, y = offset[o + 1] * s, z = offset[o + 2] * s, ww = 1 - u + offset[o + 3] * s, l = Math.sqrt(x * x + y * y + z * z + ww * ww);
    const bx = x / l, by = y / l, bz = z / l, bw = ww / l, ax = pose[o], ay = pose[o + 1], az = pose[o + 2], aw = pose[o + 3];
    pose[o] = ax * bw + aw * bx + ay * bz - az * by; pose[o + 1] = ay * bw + aw * by + az * bx - ax * bz;
    pose[o + 2] = az * bw + aw * bz + ax * by - ay * bx; pose[o + 3] = aw * bw - ax * bx - ay * by - az * bz;
  }
}
/** The bone's XYZ Euler x (its forward or backward bend), read from a pose buffer. */
export const pitchOf = (pose: PoseBuffer, bone: number) => euler.setFromQuaternion(quat.fromArray(pose, bone * 4)).x;
/** Writes the summed pitch of `bones` to into[0]: a typed-array result, so the per-frame caller boxes no numbers. */
export function sumPitch(pose: PoseBuffer, bones: ArrayLike<number>, into: Float64Array) {
  into[0] = 0; for (let i = 0; i < bones.length; i++) into[0] += euler.setFromQuaternion(quat.fromArray(pose, bones[i] * 4)).x;
}
/** Bone, x, y, z of each clamp in the last limitPose call, for diagnostics. */
export const lastClamped: number[] = [];
/** Clamps each bone to its Euler range (hinges to pure x) in place; returns how many bones were clamped. */
export function limitPose(pose: PoseBuffer) {
  let clamped = 0; lastClamped.length = 0;
  for (let b = 0; b < BONE_COUNT; b++) {
    euler.setFromQuaternion(quat.fromArray(pose, b * 4)); const r = LIMITS[b];
    const x = Math.min(r[1], Math.max(r[0], euler.x)), y = Math.min(r[3], Math.max(r[2], euler.y)), z = Math.min(r[5], Math.max(r[4], euler.z));
    if (x === euler.x && y === euler.y && z === euler.z) continue;
    clamped++; lastClamped.push(b, +euler.x.toFixed(3), +euler.y.toFixed(3), +euler.z.toFixed(3)); quat.setFromEuler(euler.set(x, y, z)).toArray(pose, b * 4);
  }
  return clamped;
}
/** q = q · Rx(angle): about the bone's own x after its rotation. */
export function rotateX(p: PoseBuffer, bone: number, angle: number) {
  const o = bone * 4, s = Math.sin(angle / 2), c = Math.cos(angle / 2), x = p[o], y = p[o + 1], z = p[o + 2], w = p[o + 3];
  p[o] = x * c + w * s; p[o + 1] = y * c + z * s; p[o + 2] = z * c - y * s; p[o + 3] = w * c - x * s;
}
/** q = Rx(angle) · q: about the parent's x, the same as adding to the Euler x. */
export function preRotateX(p: PoseBuffer, bone: number, angle: number) {
  const o = bone * 4, s = Math.sin(angle / 2), c = Math.cos(angle / 2), x = p[o], y = p[o + 1], z = p[o + 2], w = p[o + 3];
  p[o] = c * x + s * w; p[o + 1] = c * y - s * z; p[o + 2] = c * z + s * y; p[o + 3] = c * w - s * x;
}
/** q = q · Rz(angle): swings a limb toward +X whatever its x. */
export function rotateZ(p: PoseBuffer, bone: number, angle: number) {
  const o = bone * 4, s = Math.sin(angle / 2), c = Math.cos(angle / 2), x = p[o], y = p[o + 1], z = p[o + 2], w = p[o + 3];
  p[o] = x * c + y * s; p[o + 1] = y * c - x * s; p[o + 2] = z * c + w * s; p[o + 3] = w * c - z * s;
}
