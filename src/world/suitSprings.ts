// The angel's spring tuning (boneSprings.ts): the core is firm, the extremities loose, so motion travels outward from the hips
// through the chest to the head, hands, wing tips and feathers. Legs firm up when planted (no foot slide) and the commanding arm
// firms up while it is raised; a wing firms up while it tucks clear of stone, so clearance keeps its timing.
import { Quaternion, Vector3, type Object3D } from 'three';
import { createBoneSprings, followTargets, restoreTargets, type SpringTune } from './boneSprings';
import type { ArchangelWings } from './archangelWings';

/** Index order is suitSkeleton.BONE_NAMES. */
export const BODY_TUNES: readonly SpringTune[] = [
  [12, .9], [6, .7], [5, .62], [5, .62], [7, .75], [7, .75], [4.5, .58], [4.5, .58], [6, .7], [6, .7],
  [9, .85], [8, .8], [7, .75], [6.5, .7], [6.5, .7], [4, .55], [4, .55], [6, .7], [6, .7], [5, .6], [5, .6],
];
const LEGS = new Set([4, 5, 8, 9, 17, 18, 19, 20]), COMMAND_ARM = new Set([3, 7, 14, 16]);
/** Shoulder, elbow, wrist, hand, then the ten primaries: the feathers trail the arm that carries them. */
const WING: readonly SpringTune[] = [[7, .7], [6, .66], [5.5, .62], [5, .6], ...Array.from({ length: 10 }, (_, i): SpringTune => [4.4 - i * .12, .5])];
export const WING_BONES = WING.length;
/** Body-local cloth and hair offsets (metres at the hem / the hair ends), each a damped spring chasing a drag target. */
export type Sway = { at: Vector3; v: Vector3; hz: number; zeta: number; gain: number; cap: number };
const sway = (hz: number, zeta: number, gain: number, cap: number): Sway => ({ at: new Vector3(), v: new Vector3(), hz, zeta, gain, cap });
const local = new Vector3(), goal = new Vector3(), inverse = new Quaternion();

export function createSuitSprings(root: Object3D, joints: Object3D[], wings: ArchangelWings) {
  return {
    root: createBoneSprings([root], [[8, .85]]),
    body: createBoneSprings(joints, BODY_TUNES),
    wings: createBoneSprings([...wings.left.bones.slice(0, WING_BONES), ...wings.right.bones.slice(0, WING_BONES)], [...WING, ...WING]),
    cloth: sway(1.8, .32, .007, .3), hair: sway(3.2, .38, .0025, .06), epoch: -1,
  };
}
export type SuitSprings = ReturnType<typeof createSuitSprings>;
export const beginSuitSprings = (s: SuitSprings) => restoreTargets(s.body);

type Frame = { dt: number; paused: boolean; reduced: boolean; epoch: number; ground: number; command: number };
/** After every body layer (pose, clips, living motion, the command arm): the root and the 21 bones follow their targets. */
export function followBody(s: SuitSprings, f: Frame) {
  const snap = f.reduced || f.epoch !== s.epoch, dt = f.paused ? 0 : f.dt;
  s.epoch = f.epoch;
  followTargets(s.root, dt, snap);
  followTargets(s.body, dt, snap, i => LEGS.has(i) ? 1 + 1.2 * f.ground : COMMAND_ARM.has(i) ? 1 + .6 * f.command : 1);
}
/** After the wings are posed and cleared of stone. */
export function followWings(s: SuitSprings, w: ArchangelWings, f: Frame) {
  followTargets(s.wings, f.paused ? 0 : f.dt, f.reduced || !s.wings.live, i => 1 + 2 * (i < WING_BONES ? w.tuck.left : w.tuck.right));
}
function stepSway(o: Sway, velocity: Vector3, dt: number) {
  goal.copy(velocity).multiplyScalar(-o.gain); if (goal.length() > o.cap) goal.setLength(o.cap);
  const w = 2 * Math.PI * o.hz, steps = Math.min(12, Math.ceil(dt * 120)), h = steps ? dt / steps : 0;
  for (let n = 0; n < steps; n++) {
    o.v.x += (w * w * (goal.x - o.at.x) - 2 * o.zeta * w * o.v.x) * h; o.v.y += (w * w * (goal.y - o.at.y) - 2 * o.zeta * w * o.v.y) * h;
    o.v.z += (w * w * (goal.z - o.at.z) - 2 * o.zeta * w * o.v.z) * h; o.at.addScaledVector(o.v, h);
  }
}
/** Cloth and hair trail the body's travel in its own frame and swing when it changes. Reduced motion holds them at rest. */
export function stepClothSway(s: SuitSprings, root: Object3D, velocity: { x: number; y: number; z: number }, dt: number, paused: boolean, reduced: boolean) {
  if (reduced) { s.cloth.at.set(0, 0, 0); s.cloth.v.set(0, 0, 0); s.hair.at.set(0, 0, 0); s.hair.v.set(0, 0, 0); return; }
  if (paused || !(dt > 0)) return;
  local.set(velocity.x, velocity.y, velocity.z).applyQuaternion(inverse.copy(root.quaternion).invert());
  stepSway(s.cloth, local, Math.min(dt, .1)); stepSway(s.hair, local, Math.min(dt, .1));
}
