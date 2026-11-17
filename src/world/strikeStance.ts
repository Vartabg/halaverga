// The fighting body in flight (docs/plans/2026-11-16-fight-calm-body.md D5, D6). While the sword is out the legs and the free (left)
// arm hold a stance instead of trailing; each of the three cuts drives them: a coil on the wind-up and a swing through the blow.
// The guard replaces the library clip's left upper arm and forearm while it holds (clavicle and hand still follow the clip): the free
// arm braces instead of swinging with the blade.
// Visual only: it writes joint rotations after the library clips and before the springs, and publishes `brace` for them.
import { Euler, Quaternion, type Object3D } from 'three';
import { SLASH, type AngelMotion } from './angelMotion';
import { banish } from '../game/banishState';
import { strike } from '../game/strike';
import { BONE_NAMES } from './suitSkeleton';

const at = (name: string) => BONE_NAMES.indexOf(name as never);
const TL = at('thigh_l'), TR = at('thigh_r'), SL = at('shin_l'), SR = at('shin_r'), UA = at('upperarm_l'), FA = at('forearm_l');
/** Held stance, local joint angles (rad): hips flexed 25 deg, knees bent 45 deg, feet apart; the guard arm forward and out, elbow about 90 deg. */
export const STANCE: readonly (readonly [bone: number, x: number, y: number, z: number])[] = [
  [TL, .44, 0, -.16], [TR, .44, 0, .16], [SL, -.8, 0, 0], [SR, -.8, 0, 0], [UA, .85, 0, -.55], [FA, 1.55, 0, 0],
];
/** Offsets from the stance per cut (x rad on the same bones): [coil at the wind-up, swing through the blow]. */
type Move = readonly [coil: number, swing: number];
type Drive = { tl: Move; tr: Move; sl: Move; sr: Move; ux: Move; uz: Move; fx: Move };
export const DRIVE: readonly Drive[] = [
  // Cross cut: the legs scissor against the blade (right back, left forward); the guard arm pulls back.
  { tl: [-.25, .5], tr: [.3, -.55], sl: [-.1, -.2], sr: [.1, -.3], ux: [.3, -.55], uz: [-.1, .3], fx: [-.1, .4] },
  // Rising cut: knees tuck on the wind-up and drive down through the cut; the guard arm drives down.
  { tl: [.5, -.4], tr: [.5, -.4], sl: [-.45, .65], sr: [-.45, .65], ux: [.35, -.75], uz: [-.2, .35], fx: [-.2, .25] },
  // Casting blow: knees tucked high on the wind-up, extended hard on contact; the arm reaches forward then pulls in.
  { tl: [.75, -.6], tr: [.75, -.6], sl: [-.55, .75], sr: [-.55, .75], ux: [.5, -.65], uz: [-.1, .3], fx: [-.7, .6] },
];
/** Spring stiffness gain while a cut plays, for the legs and the free arm (suitSprings.ts). */
/** Spring stiffness gain while a cut plays. The bone springs step at 1/120 s and a thigh (7 Hz, zeta .75) goes unstable past
 * about 2.7x its tune, so the brace stays at 2.2x and never multiplies the landing stiffness (suitSprings.ts takes the larger). */
export const BRACE = 1.2, LINGER = .6;
export const FREE_ARM = new Set([2, 6, 13, 15]);

export function createStrikeStance() { return { stance: 0, brace: 0, linger: 0 }; }
export type StrikeStance = ReturnType<typeof createStrikeStance>;
export type StanceInput = { dt: number; paused: boolean; flying: boolean; reduced?: boolean };
const clamp = (v: number) => Math.min(1, Math.max(0, v));
const ease = (v: number) => v * v * (3 - 2 * v);
const e = new Euler(), q = new Quaternion(), offset = new Float32Array(32);
const lerp = (m: Move, v: number) => m[0] + (m[1] - m[0]) * v;

export function stepStrikeStance(s: StrikeStance, joints: readonly Object3D[], m: AngelMotion, input: StanceInput) {
  const dt = input.paused ? 0 : input.dt;
  // A real fight signal (a strike under way, an open string, a cut playing), held for LINGER seconds after the last cut.
  const fighting = strike.phase !== 0 || m.act === 'slash' || banish.string.target >= 0 && banish.clock <= banish.string.until;
  s.linger = fighting ? LINGER : Math.max(0, s.linger - dt);
  const on = input.flying && !input.paused && !input.reduced && s.linger > 0 && joints.length > UA ? 1 : 0;
  s.stance += (on - s.stance) * Math.min(1, 9 * dt);
  s.brace = 0;
  if (s.stance < .001) return;
  offset.fill(0);
  const cutting = m.act === 'slash' && m.weight > 0 && DRIVE[m.cut];
  if (cutting) {
    const d = DRIVE[m.cut], u = ease(clamp(m.actT / SLASH.raised)), v = ease(clamp((m.actT - SLASH.raised) / .28)), g = m.weight * u;
    offset[TL] = g * lerp(d.tl, v); offset[TR] = g * lerp(d.tr, v); offset[SL] = g * lerp(d.sl, v); offset[SR] = g * lerp(d.sr, v);
    offset[UA] = g * lerp(d.ux, v); offset[UA + 16] = g * lerp(d.uz, v); offset[FA] = g * lerp(d.fx, v);
    s.brace = input.flying ? m.weight * s.stance : 0;
  }
  for (const [b, x, y, z] of STANCE) {
    e.set(x + offset[b], y, z + offset[b + 16]); q.setFromEuler(e);
    joints[b].quaternion.slerp(q, s.stance);
  }
}
