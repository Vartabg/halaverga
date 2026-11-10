import { Group, Quaternion, Vector3, type Object3D } from 'three';
import { createAvianWing, type AvianWing } from './avianWing';
import { featherMaterial } from './featherMaterial';
import { advanceWingMotion, createWingMotion } from './wingMotion';
import { foldFeather } from './wingFold';
const identity = new Quaternion(), q = new Quaternion(), twist = new Quaternion(), axisX = new Vector3(1, 0, 0), axisY = new Vector3(0, 1, 0), covertAxis = new Vector3(), closed = new Vector3();
const frameInput = { flying: false, paused: false, reduced: false, speed: 0, vy: 0, roll: 0, brake: 0 };
const face = new Vector3(), parentQ = new Quaternion(), frameQ = new Quaternion(), handQ = new Quaternion(), covertQ = new Quaternion();
/** Each complete skin/rig scales together at its own root, so clearance uses its actual world bounds. Span about twice the
 * angel's height (Garo: the wings read too massive at 2.6x). Codex proposed .62 for a compact combat silhouette; .8 is the size
 * Garo last reviewed, pending his choice. */
export const WING_SCALE = .8;
export function createArchangelWings() {
  const root = new Group(), plume = featherMaterial(), left = createAvianWing(-1, plume.material), right = createAvianWing(1, plume.material);
  root.position.set(0, .20, .17); left.root.position.x = -.125; right.root.position.x = .125; root.add(left.root, right.root);
  left.root.scale.setScalar(WING_SCALE); right.root.scale.setScalar(WING_SCALE);
  const motion = createWingMotion(), tuck = { left: 0, right: 0 };
  const w = { root, left, right, motion, tuck, strikeFold: 0, dispose() { left.dispose(); right.dispose(); plume.dispose(); } };
  poseWings(w); return w;
}
export type ArchangelWings = ReturnType<typeof createArchangelWings>;
function poseSide(wing: AvianWing, side: number, w: ArchangelWings, tuck: number) {
  tuck = Math.max(tuck, w.strikeFold);
  const m = w.motion, folded = m.unfold * tuck, ground = 1 - m.unfold, u = m.unfold * (1 - tuck);
  const alongBack = folded / Math.max(.00001, 1 - u), recovery = m.recovery * (1 - m.glide), bank = Math.max(-.5, Math.min(.5, m.roll));
  const flap = m.amplitude * m.stroke, differential = side * bank * .10 * u;
  // Grounded, the joints are solved (wrist high on the shoulder blade, hand down the back, every upper face turned to the back),
  // so the folded wing lies as a flat stack instead of flaring.
  wing.bones[0].rotation.set(ground * 1.786 + folded * .12 + u * (.06 + recovery * .28 + m.brake * .23),
    side * (ground * .954 - folded * 1.40 + u * (-.10 + recovery * .10)), side * (ground * -2.115 - folded * .04 + u * (.12 + flap + differential)), 'ZXY');
  wing.bones[1].rotation.set(0, side * (ground * 2.156 + folded * 2.10 + u * recovery * .78), 0);
  wing.bones[2].rotation.set(u * (recovery * .28 - m.brake * .15) - ground * .031, side * (-ground * 2.416 - folded * 1.45 - u * recovery * .60), 0);
  wing.bones[3].rotation.set(0, side * ((1 - u) * .08 - ground * .073 + u * (.04 + m.brake * .04)), 0);
  handQ.identity(); for (let i = 0; i < 4; i++) handQ.multiply(wing.bones[i].quaternion); handQ.invert();
  // Folded feathers show their upper face to the back (+z); tucked in flight it turns up, the feather lying flat along the back.
  const faceAt = (local: Quaternion) => face.set(0, alongBack, 1 - alongBack).normalize().applyQuaternion(local);
  for (let i = 0; i < 10; i++) {
    closed.set(side * (-.07 + .09 * alongBack), -.99 + .91 * alongBack, .10 + .90 * alongBack).normalize().applyQuaternion(handQ); foldFeather(q, wing.axes[i], closed, faceAt(handQ));
    q.slerp(identity, u);
    const ripple = m.flutterGain * .05 * Math.sin(m.flutter * (19 + i * 1.7) + i * 2.1);
    twist.setFromAxisAngle(wing.axes[i], side * u * (recovery * .66 + m.brake * .06 + ripple)); q.multiply(twist);
    // Slotted fingers when slow, closed in a glide.
    twist.setFromAxisAngle(axisY, side * u * (i / 9 - .5) * (.08 + (1 - m.glide) * .26 + m.brake * .22)); wing.bones[4 + i].quaternion.copy(q).premultiply(twist);
  }
  covertQ.copy(wing.bones[3].quaternion).multiply(handQ);
  // Folded, the hand-covert block runs down the hand (its feathers point toward the spine); tucked in flight it lies back.
  covertAxis.set(side * (.4 + .6 * ground), 0, 1 - .75 * ground).normalize(); closed.set(side * (-.07 + .09 * alongBack), -.99 + .91 * alongBack, .10 + .90 * alongBack).normalize().applyQuaternion(covertQ);
  foldFeather(wing.bones[16].quaternion, covertAxis, closed, faceAt(covertQ)).slerp(identity, u);
  covertQ.copy(wing.bones[2].quaternion).multiply(wing.bones[3].quaternion).multiply(handQ);
  for (let i = 0; i < 14; i++) {
    closed.set(side * (-.02 + .05 * alongBack), -.985 + .905 * alongBack, .16 + .84 * alongBack).normalize().applyQuaternion(covertQ);
    foldFeather(wing.bones[17 + i].quaternion, wing.axes[10 + i], closed, faceAt(covertQ)).slerp(identity, u);
    if (m.flutterGain > 0) wing.bones[17 + i].quaternion.multiply(twist.setFromAxisAngle(wing.axes[10 + i], side * u * m.flutterGain * .035 * Math.sin(m.flutter * (23 + i * 1.3) + i * 1.7)));
  }
  // Folded, the covert rows draw in toward the forearm (their chord offset shrinks), so no fringe shows past the arms.
  for (let i = 0; i < 75; i++) {
    const bone = wing.bones[31 + i], at = wing.rest[31 + i]; bone.position.set(at.x, at.y, at.z * (1 - .6 * ground));
    closed.set(side * (-.02 + .05 * alongBack), -.985 + .905 * alongBack, .16 + .84 * alongBack).normalize().applyQuaternion(covertQ);
    foldFeather(wing.bones[31 + i].quaternion, wing.axes[24 + i], closed, faceAt(covertQ)).slerp(identity, u);
  }
  closed.set(side * .54, -.015, -.21).normalize();
  wing.bones[15].quaternion.setFromAxisAngle(closed, -side * (1 - u) * 1.2);
  wing.bones[14].rotation.set(0, 0, side * u * (.02 + m.brake * .5 + (1 - m.glide) * .04)); // the alula lies flush until a flare
}
export function poseArchangelWing(w: ArchangelWings, side: number, tuck = side < 0 ? w.tuck.left : w.tuck.right) {
  poseSide(side < 0 ? w.left : w.right, side, w, tuck);
}
function poseWings(w: ArchangelWings) { poseArchangelWing(w, -1); poseArchangelWing(w, 1); }
/** Read the final character frame. Counter the flight lean so a prone body cannot turn lifting surfaces into vertical signs. */
export function alignArchangelWings(w: ArchangelWings, body: Object3D, lean: number) {
  if (!w.root.parent) return;
  body.getWorldQuaternion(frameQ); q.setFromAxisAngle(axisX, -lean); frameQ.multiply(q);
  w.root.parent.getWorldQuaternion(parentQ); w.root.quaternion.copy(parentQ.invert()).multiply(frameQ);
}
export function stepArchangelWings(w: ArchangelWings, flying: boolean, paused: boolean, reduced: boolean, speed: number, vy: number, roll: number, dt: number, brake = 0, striking = false) {
  if (paused) return;
  const goal = striking ? .72 : 0;
  w.strikeFold = reduced ? goal : goal + (w.strikeFold - goal) * Math.exp(-(striking ? 22 : 5) * Math.max(0, Math.min(.1, dt)));
  Object.assign(frameInput, { flying, paused, reduced, speed, vy, roll, brake });
  advanceWingMotion(w.motion, frameInput, dt); poseWings(w);
}
