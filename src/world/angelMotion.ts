// Which library clip plays over the angel and how strongly (angelClips.ts). Visual only: it writes joints and the pelvis offset,
// never the camera, physics or presentation pose. Standing still on the ground the body takes the library idle (the sword idle
// while the sword is out). A sword dive raises the blade and holds it until contact, then the cut plays through; rebuke, bind and
// cast play their own gestures. In flight a move takes the body from the waist up, so the legs keep the flight clips. Each cut plays
// its own motion-capture stroke and then its recovery (cutClips.ts).
import { Euler, Quaternion, Vector3, type Object3D } from 'three';
import { banish, FX } from '../game/banishState';
import { strike } from '../game/strike';
import { hurtShove } from '../game/hurtShove';
import { blendAngelClip, blendUnder, clipTime, FULL, UPPER_BODY, type AngelClips } from './angelClips';
import { CUTS, cutFor } from '../game/swordString';
import { CUT_CLIPS, cutClip } from './cutClips';
import { BONE_NAMES } from './suitSkeleton';

/** A string cut (swordString.ts) starts `lead` before its raised blade (cutClips.ts), or at the clip's start when the windup is
 * shorter, so the blade rises during the step-in; it then plays at that cut's own rate. A move started while another still shows
 * crossfades from it over `cross` seconds. */
export const SLASH = { fadeIn: .08, fadeOut: .25, lead: .14, cross: .12 } as const;
/** How far before its raised blade a step-in starts cut `cut` (never before the clip's start). */
export const cutLead = (cut: number) => Math.min(SLASH.lead, cutClip(cut).raised);
const at = (name: string) => BONE_NAMES.indexOf(name as never);
const HEAD = at('head'), CHEST = at('chest'), UA_L = at('upperarm_l'), UA_R = at('upperarm_r'), FA_L = at('forearm_l'), FA_R = at('forearm_r');
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
/** Prone legs: together, straight and pointed (local XYZ Euler; the climb and power clips' legs). [bone, x, y, z]. The thighs close
 * .1 rad: archangel.glb's hip joints stand .23 m apart, and at the old .03 its feet stayed .36 m apart. */
export const PRONE_LEGS: readonly (readonly [number, number, number, number])[] = [
  [at('thigh_l'), .02, 0, .1], [at('thigh_r'), .02, 0, -.1], [at('shin_l'), -.08, 0, 0], [at('shin_r'), -.08, 0, 0],
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
  return { idle: 0, idleT: 0, act: '', actT: 0, since: 0, weight: 0, tail: false, serial: -1, phase: 0, cut: 0, spinT: -1, spinCut: 0, spinNext: -1, twirl: 0, flip: 0, hip: new Vector3(), rest: new Vector3(),
    /** prone: the eased forward pitch flight asks for (rad, >= 0); pitch: what the model root adds to the lean (rad, <= 0 tips forward). */
    prone: 0, pitch: 0, hurt: -1, flinchT: -1, flinch: 0, epoch: -1,
    /** The move a new one interrupted, crossfading out: its clip, clip time, weight then, cut (-1 for a gesture) and tail flag. */
    from: '', fromT: 0, fromW: 0, fromCut: -1, fromTail: false };
}
const smooth = (u: number) => { const k = Math.min(1, Math.max(0, u)); return k * k * (3 - 2 * k); };
/** The interrupted move's share of the pose, eased to 0 as the new one eases in (the strike stance adds by it). Its clip goes
 * under the new move (angelClips blendUnder) until that is fully in. */
export const fromWeight = (m: AngelMotion) => m.from ? m.fromW * (1 - smooth(m.since / SLASH.cross)) : 0;
export type AngelMotion = ReturnType<typeof createAngelMotion>;
/** speed: horizontal (m/s). travel: proneSpeed (m/s). lean: the forward pitch already on the model root (orientSuit: lean + pitch x
 * power; rad, negative tips forward). epoch: the pose epoch (a reset or retry ends a flinch). */
export type AngelMotionInput = { dt: number; paused: boolean; flying: boolean; ground: number; speed: number; sword: boolean; reduced?: boolean;
  lean?: number; travel?: number; epoch?: number };

/** Starts act `name` (cut `cut` for a stroke) at clip time `at`. The move still showing stays as the `from` layer, so a cut begun in
 * a recovery never drops the body toward the idle or snaps to the new clip; an earlier crossfade that outweighs it stays instead. */
function begin(m: AngelMotion, name: string, at = 0, cut = m.cut) {
  const old = fromWeight(m);
  if (m.act && m.since > 0 && m.weight > 0 && m.weight >= old) Object.assign(m, { from: actClip(m), fromT: m.actT, fromW: m.weight, fromCut: m.act === 'slash' ? m.cut : -1, fromTail: m.tail });
  else if (old > 0) m.fromW = old; else m.from = '';
  m.act = name; m.cut = cut; m.actT = at; m.since = 0; m.tail = false;
}
/** The clip the act plays now: a gesture's own, or the cut's stroke, then (tail) its recovery. */
export const actClip = (m: AngelMotion) => m.act !== 'slash' ? m.act : m.tail ? cutClip(m.cut).rec : cutClip(m.cut).clip;
/** Starts this cut's whole-body move, or queues it behind the one still turning: a fast second press never snaps the model back. */
function turn(m: AngelMotion, cut: number) {
  if (m.spinT < 0) { m.spinT = 0; m.spinCut = cut; m.spinNext = -1; } else if (m.spinCut !== cut) m.spinNext = cut;
}

/** Starts gestures from new strikes and combat effects. Effects already in the ring when the angel mounted are skipped. */
function trigger(m: AngelMotion, clips: AngelClips) {
  if (strike.phase === 1 && m.phase !== 1 && clips[CUT_CLIPS[0].clip]) {
    const i = strike.target, cut = i >= 0 ? cutFor(banish, i, banish.armor[i] > 0, banish.armor[i]) : 0;
    begin(m, 'slash', strike.lunge ? cutClip(cut).raised - cutLead(cut) : 0, cut);
    if (strike.lunge) turn(m, cut); // a step-in turns as it closes; the opener turns on contact
  }
  m.phase = strike.phase;
  let newest = m.serial;
  for (const e of banish.fx) {
    if (e.serial <= m.serial) continue;
    newest = Math.max(newest, e.serial);
    const name = GESTURES[e.kind];
    if (!name || !clips[name === 'slash' ? CUT_CLIPS[0].clip : name]) continue;
    // Automatic chains cannot replace the contact cut with a ritual pose (its recovery tail they may).
    if (name !== 'slash' && (strike.phase !== 0 || m.act === 'slash' && !m.tail)) continue;
    // Contact during the dive releases the raised sword into the cut; a stroke out of nowhere starts at the raised blade. Contact
    // that names another cut than the one begun crossfades from the held blade to that cut's clip at its raised blade.
    if (name === 'slash') {
      const same = m.act === 'slash' && !m.tail && m.cut === e.n, raised = cutClip(e.n).raised;
      if (same) m.actT = Math.max(m.actT, raised); else begin(m, 'slash', raised, e.n);
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
    const slash = m.act === 'slash', raised = cutClip(m.cut).raised, cutting = !slash || m.tail || m.actT >= raised;
    m.actT += dt * (slash && cutting ? CUTS[m.cut]?.rate ?? 1 : 1); m.since += dt; m.fromT += dt;
    if (slash && !m.tail && strike.phase === 1 && !strike.landed) m.actT = Math.min(m.actT, raised);
    let clip = clips[actClip(m)], left = clip ? clip.duration - m.actT : 0;
    // The recovery plays on as the act's tail. The stroke fades over both, so its weight holds through the impact and the seam.
    if (left <= 0 && slash && !m.tail && clips[cutClip(m.cut).rec]) { m.tail = true; m.actT = -left; clip = clips[actClip(m)]; left = clip.duration - m.actT; }
    if (m.since >= SLASH.cross || left <= 0) m.from = '';
    if (left <= 0) m.act = '';
    else m.weight = Math.min(1, m.from ? smooth(m.since / SLASH.cross) : m.since / SLASH.fadeIn, (left + (slash && !m.tail ? clips[cutClip(m.cut).rec]?.duration ?? 0 : 0)) / SLASH.fadeOut);
  }
  const still = input.flying ? 0 : input.ground * Math.min(1, Math.max(0, 1 - (input.speed - .4) / 1.6));
  m.idle += (still - m.idle) * Math.min(1, 5 * dt); m.idleT += dt;
  m.hip.set(0, 0, 0);
  const idle = clips[input.sword && clips.swordIdle ? 'swordIdle' : 'idle'];
  if (idle && m.idle > .001) blendAngelClip(joints, idle, clipTime(idle, m.idleT, true), m.idle, FULL, m.hip);
  if (m.act) {
    const grounded = !input.flying && input.ground > .5, mask = grounded ? FULL : UPPER_BODY, old = clips[m.from];
    // The interrupted move goes under the new one. On the ground each move's weight shift takes over from what lies under it.
    if (old) { if (grounded) m.hip.multiplyScalar(1 - m.fromW); blendUnder(joints, old, clipTime(old, m.fromT, false), m.fromW, mask, m.weight, m.hip); }
    if (grounded) m.hip.multiplyScalar(1 - m.weight);
    const clip = clips[actClip(m)]; blendAngelClip(joints, clip, clipTime(clip, m.actT, false), m.weight, mask, m.hip);
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
/** The cut's move pivots about PIVOT (as tuned for the leans); the prone pitch about the chest bone at rest (archangel.glb: .4 m over
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
