import { Color, Euler, Group, Matrix4, MeshStandardMaterial, Quaternion, SkinnedMesh, Vector3, type AnimationClip, type Object3D } from 'three';
import { EYE_FORWARD, EYE_UP, MAX_DRONES } from '../game/combat';
import { bindAngelClips, blendAngelClip, clipTime, FULL, UPPER_BODY } from './angelClips';
import { buildSuitRig } from './suitRig';
import { WA, banish } from '@/game/banishState';

const ember = new Color('#ff591c');
export type DemonPose = { time: number; charging: boolean; hit: number; down: boolean; reduced: boolean; damage: number; attack?: number; attackTime?: number; rusher?: boolean };
const poseEuler = new Euler(), poseQ = new Quaternion();
function attackPose(joints: readonly Object3D[], state: DemonPose, move: number) {
  const phase = state.attack ?? 0, time = state.attackTime ?? 0;
  if (!phase || state.down) return;
  const w = state.reduced ? .55 : phase === WA.tell ? Math.min(1, time / .25) : 1;
  const rotate = (i: number, x: number, y = 0, z = 0) => { poseQ.setFromEuler(poseEuler.set(x, y, z)); joints[i].quaternion.slerp(poseQ, w); };
  if (phase === WA.recover) { rotate(11, .22); rotate(2, .15, 0, -.5); rotate(3, .15, 0, .5); rotate(6, 1.1); rotate(7, 1.1); }
  else if (move === WA.sweep) {
    const cut = phase === WA.sweep ? Math.min(1, time / .2) : 0;
    rotate(11, .1, -.55 + cut * 1.1); rotate(2, 1.4, -.6 + cut * 1.3, -.7); rotate(3, .5, .2, .35);
    rotate(6, .8); rotate(7, 1.0);
  } else if (move === WA.fan) {
    rotate(11, -.2); rotate(2, 1.2, -.7, -.9); rotate(3, 1.2, .7, .9); rotate(6, .4); rotate(7, .4);
  } else if (state.rusher) {
    rotate(11, .2); rotate(2, phase === WA.rush ? 1.5 : .5, -.2, -.2); rotate(3, phase === WA.rush ? 1.5 : 2.0, .2, .2);
    rotate(6, phase === WA.rush ? .2 : 1.2); rotate(7, phase === WA.rush ? .2 : 1.4);
  } else {
    rotate(11, -.15); rotate(2, phase === WA.volley ? 1.7 : 2.4, -.25, -.4); rotate(3, phase === WA.volley ? 1.7 : 2.4, .25, .4);
    rotate(6, .3); rotate(7, .3);
  }
}
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
    const headBind = rig.joints[1].matrixWorld.clone().invert().multiply(new Matrix4().makeTranslation(0, EYE_UP, -EYE_FORWARD));
    return { ...rig, materials, plate, chestBind, headBind, wingMatrix: new Matrix4(), eyeMatrix: new Matrix4(), downTime: 0, lastTime: 0 };
  });
  const group = new Group(); actors.forEach(a => group.add(a.root));
  function step(index: number, position: Vector3, rotation: Quaternion, visible: boolean, state: DemonPose) {
    const a = actors[index]; a.root.visible = visible;
    if (!visible) return;
    a.root.position.copy(position); a.root.quaternion.copy(rotation);
    for (const j of a.joints) j.quaternion.identity();
    hip.set(0, 0, 0);
    const time = state.reduced ? 0 : state.time + index * .37;
    blendAngelClip(a.joints, clips.idle, clipTime(clips.idle, time, true), 1, FULL, hip);
    // The airborne legs and shoulders carry weight; only the upper body interrupts for the fiery-dart gesture.
    blendAngelClip(a.joints, clips.flight, clipTime(clips.flight, time * .7, true), .3, FULL, hip);
    if (state.charging) blendAngelClip(a.joints, clips.charge, .18, .85, UPPER_BODY);
    if (state.hit > 0) blendAngelClip(a.joints, clips.hit, .12, Math.min(.8, state.hit), UPPER_BODY);
    attackPose(a.joints, state, banish.wardens.move[index]);
    if (state.down) {
      a.downTime = Math.min(2.4, a.downTime + Math.max(0, Math.min(.05, state.time - a.lastTime)));
      blendAngelClip(a.joints, clips.down, state.reduced ? 2.2 : a.downTime, 1, FULL);
    } else a.downTime = 0;
    a.lastTime = state.time;
    // Keep the head's weak point inside its existing combat sphere; pelvis translation stays visual-only and tiny.
    a.joints[0].position.set(0, 0, 0);
    for (const m of a.materials) {
      m.emissive.copy(ember).multiplyScalar(state.damage * .28 + state.hit * .5);
      m.emissiveIntensity = 1;
    }
    a.root.updateMatrixWorld(true);
    a.wingMatrix.multiplyMatrices(a.joints[11].matrixWorld, a.chestBind);
    a.eyeMatrix.multiplyMatrices(a.joints[1].matrixWorld, a.headBind);
  }
  return { group, actors, clips, step, dispose() { actors.forEach(a => a.dispose()); } };
}
