import { Color, Group, Matrix4, MeshStandardMaterial, Quaternion, SkinnedMesh, Vector3, type AnimationClip, type Object3D } from 'three';
import { MAX_DRONES } from '../game/combat';
import { bindAngelClips, blendAngelClip, blendUnder, clipTime, FULL, UPPER_BODY, type AngelClip } from './angelClips';
import { buildSuitRig } from './suitRig';
import { WA } from '@/game/banishState';
import { SWORD_GRIP, swordGripRotation } from './swordGrip';
import { WARDEN_BLEND, hitClipName, wardenClip, type PhaseClip } from './watcherClips';
import { EYE_MARKER } from './watcherGeometry';

const ember = new Color('#ff591c');
/** hit: the flash (emissive). hitT: seconds since the last blow (the hit clock); hitSide: the way that blow turns the body (-1..1,
 * banishState.twist); blow: the cut of the string that landed then (-1 for anything else), which picks the reaction clip.
 * attack/attackTime/move/tell/rush: a warden's phase, its clock, the turn's move, its tell length and the rush's length. */
export type DemonPose = { time: number; charging: boolean; hit: number; down: boolean; reduced: boolean; damage: number; attack?: number; attackTime?: number;
  move?: number; tell?: number; rush?: number; hitT?: number; hitSide?: number; blow?: number; airspeed?: number };
/**
 * The struck reaction (docs/plans/2026-11-16-real-fight.md A3, B7). The clip is chosen at the blow (watcherClips.ts hitClipName)
 * and kept on the actor beside the reaction it interrupted. From the blow it plays through at `rate`, on the upper body (a thrown
 * demon's throw owns its position and tilt), then fades out; the body yaws about the vertical toward the cut's side, out in `snap`
 * seconds and back by the end. A blow landing while the last reaction still runs (a string's next cut) crossfades from it over
 * `cross` seconds instead of fading in from the flight pose. Reduced motion keeps the old still hit frame by the flash, with no yaw.
 */
export const REACT = { rate: .7, weight: .9, fadeIn: .04, fadeOut: .22, yaw: .55, snap: .08, cross: .12 } as const;
const ease = (u: number) => { const k = Math.min(1, Math.max(0, u)); return k * k * (3 - 2 * k); };
/** Seconds the whole reaction lasts for a hit clip of `duration`. */
export const reactionLength = (duration: number) => duration / REACT.rate + REACT.fadeOut;
/** Weight of the hit clip at hitT seconds after the blow (0 before it and once it is over), coming in over `fadeIn` seconds. */
export function reactionWeight(hitT: number, duration: number, fadeIn: number = REACT.fadeIn) {
  const end = reactionLength(duration);
  if (!(hitT >= 0 && hitT < end)) return 0;
  return REACT.weight * Math.min(1, hitT / fadeIn, (end - hitT) / REACT.fadeOut);
}
export function reactionYaw(hitT: number, duration: number) {
  const end = reactionLength(duration);
  if (!(hitT >= 0 && hitT < end)) return 0;
  return hitT < REACT.snap ? ease(hitT / REACT.snap) : 1 - ease((hitT - REACT.snap) / (end - REACT.snap));
}
const twistQ = new Quaternion(), UP = new Vector3(0, 1, 0), layer: PhaseClip = { name: '', time: 0, weight: 0 };
/** The blade in the right fist, in hand_r's frame: the grip measured for the archangel's hand, which watcher.glb shares
 * (tests/sword-grip.test.ts checks both fists). */
const GRIP = new Matrix4().compose(new Vector3(SWORD_GRIP.x, SWORD_GRIP.y, SWORD_GRIP.z), swordGripRotation(), new Vector3(1, 1, 1));
/** Eight small 21-bone rigs share geometry inputs and cached maps. No camera or gameplay writes. */
export function createDemonActors(source: Object3D, animations: AnimationClip[]) {
  const clips = bindAngelClips(animations), hip = new Vector3();
  const actors = Array.from({ length: MAX_DRONES }, () => {
    const rig = buildSuitRig(source), materials: MeshStandardMaterial[] = [];
    rig.root.traverse(o => {
      if (!(o instanceof SkinnedMesh)) return;
      o.frustumCulled = false; o.castShadow = o.receiveShadow = false;
      const material = o.material as MeshStandardMaterial;
      if (!materials.includes(material)) materials.push(material);
    });
    let plate: Object3D | undefined;
    rig.root.traverse(o => { if (o instanceof SkinnedMesh && o.material instanceof MeshStandardMaterial && o.name === 'plate') plate = o; });
    rig.root.updateMatrixWorld(true);
    const chestBind = rig.joints[11].matrixWorld.clone().invert();
    const headBind = rig.joints[1].matrixWorld.clone().invert().multiply(new Matrix4().makeTranslation(...EYE_MARKER.centre));
    return { ...rig, materials, plate, chestBind, headBind, wingMatrix: new Matrix4(), eyeMatrix: new Matrix4(), bladeMatrix: new Matrix4(), downTime: 0, lastTime: 0,
      /** clock/side/clip: last frame's hit clock, side and reaction clip; oldT/oldSide/oldClip: the reaction a new blow interrupted. */
      clock: Infinity, side: 0, clip: clips.hit as AngelClip, oldT: -1, oldSide: 0, oldClip: clips.hit as AngelClip,
      /** A warden's phase last frame, seconds since it changed, the guard and phase clip shown, and what the change interrupted. */
      phase: 0, cross: 0, guard: 0, fromGuard: 0, shown: { name: '', time: 0, weight: 0 } as PhaseClip, from: { name: '', time: 0, weight: 0 } as PhaseClip };
  });
  const group = new Group(); actors.forEach(a => group.add(a.root));
  function step(index: number, position: Vector3, rotation: Quaternion, visible: boolean, state: DemonPose) {
    const a = actors[index]; a.root.visible = visible;
    if (!visible) return;
    a.root.position.copy(position); a.root.quaternion.copy(rotation);
    const hitT = state.hitT ?? Infinity, side = state.hitSide ?? 0, dt = Math.max(0, Math.min(.05, state.time - a.lastTime));
    if (hitT < a.clock) { // a new blow: keep the reaction it interrupts, and pick this one's clip
      if (a.clock < reactionLength(a.clip.duration)) { a.oldT = a.clock; a.oldSide = a.side; a.oldClip = a.clip; } else a.oldT = -1;
      a.clip = clips[hitClipName(state.blow ?? -1)] ?? clips.hit;
    }
    if (!(hitT < REACT.cross)) a.oldT = -1;
    const d = a.clip.duration, od = a.oldClip.duration;
    const old = a.oldT >= 0 ? a.oldT + hitT : -1, k = old >= 0 ? hitT / REACT.cross : 1; a.clock = hitT; a.side = side;
    const yaw = state.reduced || state.down ? 0 : REACT.yaw * (side * reactionYaw(hitT, d) + (old >= 0 ? a.oldSide * reactionYaw(old, od) * (1 - k) : 0));
    if (yaw) a.root.quaternion.premultiply(twistQ.setFromAxisAngle(UP, yaw)); // about the world vertical, as the cut pushed it
    for (const j of a.joints) j.quaternion.identity();
    hip.set(0, 0, 0);
    const time = state.reduced ? 0 : state.time + index * .37;
    blendAngelClip(a.joints, clips.idle, clipTime(clips.idle, time, true), 1, FULL, hip);
    // The airborne legs and shoulders carry weight; only the upper body interrupts for the fiery-dart gesture.
    const speed = state.airspeed ?? 0;
    blendAngelClip(a.joints, clips.flight, clipTime(clips.flight, time * .7, true), Math.min(.78, .3 + speed * .04), FULL, hip);
    if (state.charging) blendAngelClip(a.joints, clips.charge, .18, .85, UPPER_BODY);
    if (state.reduced) { if (state.hit > 0) blendAngelClip(a.joints, clips.hit, .12, Math.min(.8, state.hit), UPPER_BODY); }
    else {
      if (old >= 0) blendAngelClip(a.joints, a.oldClip, clipTime(a.oldClip, old * REACT.rate, false), reactionWeight(old, od), UPPER_BODY);
      blendAngelClip(a.joints, a.clip, clipTime(a.clip, hitT * REACT.rate, false), reactionWeight(hitT, d, old >= 0 ? REACT.cross : REACT.fadeIn), UPPER_BODY);
    }
    // A warden's turn (wardenAttacks.ts): the sword guard from the tell on, and each phase's own clip over it. A phase change keeps
    // the clip last shown under the new phase's as that comes in (WARDEN_BLEND.phase); as the turn ends it and the guard fade out
    // over WARDEN_BLEND.guard.
    const phase = state.down ? 0 : state.attack ?? 0, at = state.attackTime ?? 0;
    if (phase !== a.phase) { a.phase = phase; a.cross = 0; Object.assign(a.from, a.shown); a.fromGuard = a.guard; } else a.cross += dt;
    const u = Math.min(1, phase ? at / WARDEN_BLEND.phase : a.cross / WARDEN_BLEND.guard), was = u < 1 ? clips[a.from.name] : undefined;
    a.guard = !phase ? a.fromGuard * (1 - u) : state.reduced ? WARDEN_BLEND.reduced : phase === WA.tell ? Math.min(1, at / WARDEN_BLEND.guard) : 1;
    blendAngelClip(a.joints, clips.swordIdle, state.reduced ? 0 : clipTime(clips.swordIdle, time, true), a.guard, UPPER_BODY);
    const shown = phase > 0 && wardenClip(layer, clips, phase, at, state.move ?? 0, state.tell ?? 0, state.rush ?? 1, state.reduced) ? clips[layer.name] : undefined;
    if (was && shown && !state.reduced) blendUnder(a.joints, was, a.from.time, a.from.weight, UPPER_BODY, layer.weight);
    else if (was) blendAngelClip(a.joints, was, a.from.time, a.from.weight * (1 - u), UPPER_BODY);
    a.shown.name = '';
    if (shown) { blendAngelClip(a.joints, shown, layer.time, layer.weight, UPPER_BODY); Object.assign(a.shown, layer); }
    if (state.down) {
      a.downTime = Math.min(2.4, a.downTime + dt);
      // The casting blow's knock back plays out first, then the fall takes the body.
      const knocked = a.clip === clips.knock && !state.reduced ? ease(hitT * REACT.rate / d) : 1;
      blendAngelClip(a.joints, clips.down, state.reduced ? 2.2 : a.downTime, knocked, FULL);
    } else a.downTime = 0;
    a.lastTime = state.time;
    // Keep the head's weak point inside its existing combat sphere; pelvis translation stays visual-only and tiny.
    a.joints[0].position.set(0, state.reduced ? 0 : -.22 * Math.min(1, state.hit), 0);
    for (const m of a.materials) {
      m.emissive.copy(ember).multiplyScalar(state.damage * .28 + state.hit * .5);
      m.emissiveIntensity = 1;
    }
    a.root.updateMatrixWorld(true);
    a.wingMatrix.multiplyMatrices(a.joints[11].matrixWorld, a.chestBind);
    a.eyeMatrix.multiplyMatrices(a.joints[1].matrixWorld, a.headBind);
    a.bladeMatrix.multiplyMatrices(a.joints[16].matrixWorld, GRIP);
  }
  return { group, actors, clips, step, dispose() { actors.forEach(a => a.dispose()); } };
}
