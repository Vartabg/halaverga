// Which library clip plays over the angel and how strongly (angelClips.ts). Visual only: it writes joints and the pelvis offset,
// never the camera, physics or presentation pose. Standing still on the ground the body takes the library idle (the sword idle
// while the sword is out). A sword dive raises the blade and holds it until contact, then the cut plays through; rebuke, bind and
// cast play their own gestures. In flight a move takes the body from the waist up, so the legs keep the flight clips.
import { Euler, Quaternion, Vector3, type Object3D } from 'three';
import { banish, FX } from '../game/banishState';
import { strike } from '../game/strike';
import { hurtShove } from '../game/hurtShove';
import { blendAngelClip, clipTime, FULL, UPPER_BODY, type AngelClips } from './angelClips';
import { CUTS, cutFor } from '../game/swordString';
import { BONE_NAMES } from './suitSkeleton';

/** Sword_Attack: the blade is high over the head at .36 s and through the cut by .55 s; the cut plays faster than authored. A string
 * cut (swordString.ts) starts `lead` before the raised blade, so it rises during the step-in, and plays at that cut's own rate. */
export const SLASH = { raised: .36, rate: 1.5, fadeIn: .08, fadeOut: .25, lead: .14 } as const;
const at = (name: string) => BONE_NAMES.indexOf(name as never);
const CHEST = at('chest'), HEAD = at('head'), UA_L = at('upperarm_l'), UA_R = at('upperarm_r'), FA_L = at('forearm_l'), FA_R = at('forearm_r');
/**
 * Prone flight (docs/plans/2026-11-16-real-fight.md A2): the body's forward pitch by horizontal speed, 0 at or below hover speed
 * (so hover and a climb stay upright), 65 deg at cruise and 75 deg at dive speed, eased over `ease` seconds. The flight lean
 * (presentation.ts, by `power`) already tips the body outside a fight; the fight's aim stands it up (power 0 while a cut aims), so
 * the model root only makes up what the lean leaves short of this. Off under reduced motion.
 */
export const PRONE = { hover: 3, cruise: 22, dive: 55, atCruise: 65 * Math.PI / 180, atDive: 75 * Math.PI / 180, ease: .3 } as const;
export function proneTarget(speed: number) {
  if (speed <= PRONE.hover) return 0;
  if (speed < PRONE.cruise) { const u = (speed - PRONE.hover) / (PRONE.cruise - PRONE.hover); return PRONE.atCruise * u * u * (3 - 2 * u); }
  return PRONE.atCruise + (PRONE.atDive - PRONE.atCruise) * Math.min(1, (speed - PRONE.cruise) / (PRONE.dive - PRONE.cruise));
}
/** Prone legs: together, straight and pointed (local XYZ Euler; the climb and power clips' legs). [bone, x, y, z]. */
export const PRONE_LEGS: readonly (readonly [number, number, number, number])[] = [
  [at('thigh_l'), .02, 0, .03], [at('thigh_r'), .02, 0, -.03], [at('shin_l'), -.08, 0, 0], [at('shin_r'), -.08, 0, 0],
  [at('foot_l'), -.85, 0, 0], [at('foot_r'), -.85, 0, 0], [at('toe_l'), -.2, 0, 0], [at('toe_r'), -.2, 0, 0],
];
/**
 * The flinch when the angel is hit (A3), over `time` s: arms drawn in and wings flared (Suit.tsx). The facing rule
 * (tests/flight-clips.test.ts) allows no back arch where an overhead camera can meet the body, so the chest and head throw back
 * (`arch`, `head`) only as far as the body lies prone; upright they hunch forward instead (`hunch`, `bow`), as the brake does.
 */
export const FLINCH = { time: .35, arch: .4, head: .35, hunch: .3, bow: .25, arm: .35, elbow: .45 } as const;
/** The speed that lays the body prone: along the body's facing (`yaw`) plus descent, without the hit shove (hurtShove.ts), so a
 * steep dive lies prone and backward or sideways travel, a climb and a shove at hover stay upright. */
export function proneSpeed(v: { x: number; y: number; z: number }, yaw: number) {
  const x = v.x - hurtShove.ax, y = v.y - hurtShove.ay, z = v.z - hurtShove.az;
  return Math.hypot(Math.max(0, -x * Math.sin(yaw) - z * Math.cos(yaw)), Math.max(0, -y));
}
const legQ = PRONE_LEGS.map(([, x, y, z]) => new Quaternion().setFromEuler(new Euler(x, y, z)));
const GESTURES: Readonly<Record<number, string>> = { [FX.sword]: 'slash', [FX.rebuke]: 'rebuke', [FX.bind]: 'rebuke', [FX.cast]: 'cast' };

export function createAngelMotion() {
  return { idle: 0, idleT: 0, act: '', actT: 0, since: 0, weight: 0, serial: -1, phase: 0, cut: 0, spinT: -1, spinCut: 0, spinNext: -1, twirl: 0, flip: 0, hip: new Vector3(), rest: new Vector3(),
    /** prone: the eased forward pitch flight asks for (rad, >= 0); pitch: what the model root adds to the lean (rad, <= 0 tips forward). */
    prone: 0, pitch: 0, hurt: -1, flinchT: -1, flinch: 0, epoch: -1 };
}
export type AngelMotion = ReturnType<typeof createAngelMotion>;
/** speed: horizontal (m/s). travel: proneSpeed (m/s). lean: the forward pitch already on the model root (orientSuit: lean + pitch x
 * power; rad, negative tips forward). epoch: the pose epoch (a reset or retry ends a flinch). */
export type AngelMotionInput = { dt: number; paused: boolean; flying: boolean; ground: number; speed: number; sword: boolean; reduced?: boolean;
  lean?: number; travel?: number; epoch?: number };

function begin(m: AngelMotion, name: string, at = 0) { m.act = name; m.actT = at; m.since = 0; }
/** Starts this cut's whole-body move, or queues it behind the one still turning: a fast second press never snaps the model back. */
function turn(m: AngelMotion, cut: number) {
  if (m.spinT < 0) { m.spinT = 0; m.spinCut = cut; m.spinNext = -1; } else if (m.spinCut !== cut) m.spinNext = cut;
}

/** Starts gestures from new strikes and combat effects. Effects already in the ring when the angel mounted are skipped. */
function trigger(m: AngelMotion, clips: AngelClips) {
  if (strike.phase === 1 && m.phase !== 1 && clips.slash) {
    const i = strike.target; m.cut = i >= 0 ? cutFor(banish, i, banish.armor[i] > 0, banish.armor[i]) : 0;
    begin(m, 'slash', strike.lunge ? SLASH.raised - SLASH.lead : 0);
    if (strike.lunge) turn(m, m.cut); // a step-in turns as it closes; the opener turns on contact
  }
  m.phase = strike.phase;
  let newest = m.serial;
  for (const e of banish.fx) {
    if (e.serial <= m.serial) continue;
    newest = Math.max(newest, e.serial);
    const name = GESTURES[e.kind];
    if (!name || !clips[name]) continue;
    if (name !== 'slash' && (strike.phase !== 0 || m.act === 'slash')) continue; // automatic chains cannot replace the contact cut with a ritual pose.
    // Contact during the dive releases the raised sword into the cut; a stroke out of nowhere starts at the raised blade.
    if (name === 'slash') {
      m.cut = e.n; if (m.act === 'slash') m.actT = Math.max(m.actT, SLASH.raised); else begin(m, 'slash', SLASH.raised);
      if (m.spinCut !== e.n || m.spinT < 0 && !strike.lunge) turn(m, e.n);
    }
    else begin(m, name);
  }
  m.serial = newest;
}

export function stepAngelMotion(m: AngelMotion, clips: AngelClips, joints: readonly Object3D[], input: AngelMotionInput) {
  if (m.serial < 0) { m.serial = banish.fxSerial; m.rest.copy(joints[0].position); }
  const dt = input.paused ? 0 : input.dt;
  if (!input.paused) trigger(m, clips);
  m.weight = 0;
  if (m.act) {
    const clip = clips[m.act], cutting = m.act !== 'slash' || m.actT >= SLASH.raised;
    m.actT += dt * (m.act === 'slash' && cutting ? CUTS[m.cut]?.rate ?? SLASH.rate : 1); m.since += dt;
    if (m.act === 'slash' && strike.phase === 1 && !strike.landed) m.actT = Math.min(m.actT, SLASH.raised);
    const left = clip.duration - m.actT;
    if (left <= 0) m.act = '';
    else m.weight = Math.min(1, m.since / SLASH.fadeIn, left / SLASH.fadeOut);
  }
  const still = input.flying ? 0 : input.ground * Math.min(1, Math.max(0, 1 - (input.speed - .4) / 1.6));
  m.idle += (still - m.idle) * Math.min(1, 5 * dt); m.idleT += dt;
  m.hip.set(0, 0, 0);
  const idle = clips[input.sword && clips.swordIdle ? 'swordIdle' : 'idle'];
  if (idle && m.idle > .001) blendAngelClip(joints, idle, clipTime(idle, m.idleT, true), m.idle, FULL, m.hip);
  if (m.act && m.weight > 0) {
    const grounded = !input.flying && input.ground > .5;
    // On the ground the move's weight shift takes over from the idle's; in flight the pelvis is the flight pose's.
    if (grounded) m.hip.multiplyScalar(1 - m.weight);
    blendAngelClip(joints, clips[m.act], clipTime(clips[m.act], m.actT, false), m.weight, grounded ? FULL : UPPER_BODY, m.hip);
    // One library cut, three strokes: the chest winds up one way and swings through the other, by this cut's amount.
    const twist = m.act === 'slash' ? CUTS[m.cut]?.roll ?? 0 : 0;
    if (twist && CHEST >= 0) joints[CHEST].rotateY(twist * m.weight * (1 - 2 * Math.min(1, Math.max(0, (m.actT - SLASH.raised) / .3))));
  }
  joints[0].position.copy(m.rest).add(m.hip);
  proneBody(m, joints, input, dt); flinchBody(m, joints, input, dt);
  // The cut's whole-body lean, in flight only: about the spine or across it (turnBody applies it to the model). Every cut is a
  // lean that goes out and comes back (swordString.ts CUTS); the full-turn branch stays for data that asks for one.
  // Reduced motion keeps the body still.
  const cut = CUTS[m.spinCut];
  m.twirl = m.flip = 0;
  if (m.spinT >= 0 && cut) {
    m.spinT += dt; const u = Math.min(1, m.spinT / cut.spin), e = u * u * (3 - 2 * u);
    if (input.flying && !input.reduced) {
      const turn = (turns: number) => 2 * Math.PI * turns * (Math.abs(turns) < 1 ? Math.sin(Math.PI * u) : e);
      m.twirl = turn(cut.twirl); m.flip = turn(cut.flip);
    }
    if (u >= 1) { m.spinT = -1; if (m.spinNext >= 0) { m.spinT = 0; m.spinCut = m.spinNext; m.spinNext = -1; } }
  }
}
/** The prone pitch (eased) and, while it holds, the legs brought together and pointed (before the strike stance and the springs). */
function proneBody(m: AngelMotion, joints: readonly Object3D[], input: AngelMotionInput, dt: number) {
  const target = input.flying && !input.reduced ? proneTarget(input.travel ?? 0) : 0;
  m.prone = input.reduced ? 0 : target + (m.prone - target) * Math.exp(-dt / PRONE.ease);
  const short = m.prone - Math.max(0, -(input.lean ?? 0)); m.pitch = short > 0 ? -short : 0;
  const legs = Math.min(1, m.prone / PRONE.atCruise);
  if (legs > .001 && joints.length > PRONE_LEGS[PRONE_LEGS.length - 1][0]) for (let k = 0; k < legQ.length; k++) joints[PRONE_LEGS[k][0]].quaternion.slerp(legQ[k], legs);
}
/** A new hit (hurtShove.serial) starts the flinch; hits from before the angel mounted, or before a reset or retry, are skipped. */
function flinchBody(m: AngelMotion, joints: readonly Object3D[], input: AngelMotionInput, dt: number) {
  if (input.epoch !== undefined && input.epoch !== m.epoch) { m.epoch = input.epoch; m.hurt = hurtShove.serial; m.flinchT = -1; }
  if (m.hurt < 0) m.hurt = hurtShove.serial;
  if (hurtShove.serial !== m.hurt) { m.hurt = hurtShove.serial; m.flinchT = 0; }
  m.flinch = 0;
  if (m.flinchT < 0) return;
  m.flinchT += dt; const u = m.flinchT / FLINCH.time;
  if (u >= 1) { m.flinchT = -1; return; }
  if (input.reduced || joints.length <= FA_R) return;
  const f = m.flinch = Math.sin(Math.PI * u), lying = Math.min(1, m.prone / PRONE.atCruise); // +x arches back, -x hunches
  joints[CHEST].rotateX(f * (FLINCH.arch * lying - FLINCH.hunch * (1 - lying))); joints[HEAD].rotateX(f * (FLINCH.head * lying - FLINCH.bow * (1 - lying)));
  joints[UA_R].rotateZ(-FLINCH.arm * f); joints[UA_L].rotateZ(FLINCH.arm * f); // in toward the body
  joints[FA_R].rotateX(FLINCH.elbow * f); joints[FA_L].rotateX(FLINCH.elbow * f);
}
/** The cut's move pivots about PIVOT (as tuned for the leans); the prone pitch about the chest bone at rest (angel.glb: .4 m over
 * the root), so the chest stays where the camera frames it. */
const PIVOT = new Vector3(0, 1.1, 0), CHEST_AT = new Vector3(0, .4, 0), before = new Vector3(), after = new Vector3();
function about(root: Object3D, pivot: Vector3, x: number, y: number) {
  before.copy(pivot).applyQuaternion(root.quaternion);
  if (y) root.rotateY(y);
  if (x) root.rotateX(x);
  root.position.add(before).sub(after.copy(pivot).applyQuaternion(root.quaternion));
}
/** Turns the whole model: the prone pitch first, then the cut's move, so the wings (aligned to the model root) turn with the body.
 * Visual only: the camera, physics and presentation pose never read the model root. */
export function turnBody(root: Object3D, m: AngelMotion) {
  if (m.pitch) about(root, CHEST_AT, m.pitch, 0);
  if (m.twirl || m.flip) about(root, PIVOT, m.flip, m.twirl);
}
