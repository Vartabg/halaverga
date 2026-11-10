// Which library clip plays over the angel and how strongly (angelClips.ts). Visual only: it writes joints and the pelvis offset,
// never the camera, physics or presentation pose. Standing still on the ground the body takes the library idle (the sword idle
// while the sword is out). A sword dive raises the blade and holds it until contact, then the cut plays through; rebuke, bind and
// cast play their own gestures. In flight a move takes the body from the waist up, so the legs keep the flight clips.
import { Vector3, type Object3D } from 'three';
import { banish, FX } from '../game/banishState';
import { strike } from '../game/strike';
import { blendAngelClip, clipTime, FULL, UPPER_BODY, type AngelClips } from './angelClips';

/** Sword_Attack: the blade is high over the head at .36 s and through the cut by .55 s; the cut plays faster than authored. */
export const SLASH = { raised: .36, rate: 1.5, fadeIn: .08, fadeOut: .25 } as const;
const GESTURES: Readonly<Record<number, string>> = { [FX.sword]: 'slash', [FX.rebuke]: 'rebuke', [FX.bind]: 'rebuke', [FX.cast]: 'cast' };

export function createAngelMotion() {
  return { idle: 0, idleT: 0, act: '', actT: 0, since: 0, weight: 0, serial: -1, phase: 0, hip: new Vector3(), rest: new Vector3() };
}
export type AngelMotion = ReturnType<typeof createAngelMotion>;
export type AngelMotionInput = { dt: number; paused: boolean; flying: boolean; ground: number; speed: number; sword: boolean };

function begin(m: AngelMotion, name: string, at = 0) { m.act = name; m.actT = at; m.since = 0; }

/** Starts gestures from new strikes and combat effects. Effects already in the ring when the angel mounted are skipped. */
function trigger(m: AngelMotion, clips: AngelClips) {
  if (strike.phase === 1 && m.phase !== 1 && clips.slash) begin(m, 'slash');
  m.phase = strike.phase;
  let newest = m.serial;
  for (const e of banish.fx) {
    if (e.serial <= m.serial) continue;
    newest = Math.max(newest, e.serial);
    const name = GESTURES[e.kind];
    if (!name || !clips[name]) continue;
    // Contact during the dive releases the raised sword into the cut; a stroke out of nowhere starts at the raised blade.
    if (name === 'slash') { if (m.act === 'slash') m.actT = Math.max(m.actT, SLASH.raised); else begin(m, 'slash', SLASH.raised); }
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
    m.actT += dt * (m.act === 'slash' && cutting ? SLASH.rate : 1); m.since += dt;
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
  }
  joints[0].position.copy(m.rest).add(m.hip);
}
