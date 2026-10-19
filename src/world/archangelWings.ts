import { Group, Quaternion, Vector3, type Object3D } from 'three';
import { createAvianWing, type AvianWing } from './avianWing';
import { featherMaterial } from './featherMaterial';
import { advanceWingMotion, createWingMotion } from './wingMotion';
const identity = new Quaternion(), q = new Quaternion(), twist = new Quaternion(), axisX = new Vector3(1, 0, 0), axisY = new Vector3(0, 1, 0), covertAxis = new Vector3(), closed = new Vector3();
const frameInput = { flying: false, paused: false, reduced: false, speed: 0, vy: 0, roll: 0, brake: 0 };
const parentQ = new Quaternion(), frameQ = new Quaternion(), handQ = new Quaternion(), covertQ = new Quaternion();
export function createArchangelWings() {
  const root = new Group(), plume = featherMaterial(), left = createAvianWing(-1, plume.material), right = createAvianWing(1, plume.material);
  root.position.set(0, .20, .17); left.root.position.x = -.125; right.root.position.x = .125; root.add(left.root, right.root);
  const motion = createWingMotion();
  const w = { root, left, right, motion, dispose() { left.dispose(); right.dispose(); plume.dispose(); } };
  poseWings(w); return w;
}
export type ArchangelWings = ReturnType<typeof createArchangelWings>;
function poseSide(wing: AvianWing, side: number, w: ArchangelWings) {
  const m = w.motion, u = m.unfold, recovery = m.recovery * (1 - m.glide), bank = Math.max(-.5, Math.min(.5, m.roll));
  const flap = m.amplitude * m.stroke, differential = side * bank * .10 * u;
  wing.bones[0].rotation.set((1 - u) * 1.40 + u * (.06 + recovery * .28 + m.brake * .23),
    side * ((1 - u) * -.12 + u * (-.10 + recovery * .10)), side * ((1 - u) * -.85 + u * (.12 + flap + differential)), 'ZXY');
  wing.bones[1].rotation.set(0, side * ((1 - u) * 2.25 + u * recovery * .78), 0);
  wing.bones[2].rotation.set(u * (recovery * .28 - m.brake * .15), side * ((1 - u) * -1.20 - u * recovery * .60), 0);
  wing.bones[3].rotation.set(0, side * ((1 - u) * .08 + u * (.04 + m.brake * .04)), 0);
  handQ.identity(); for (let i = 0; i < 4; i++) handQ.multiply(wing.bones[i].quaternion); handQ.invert();
  for (let i = 0; i < 10; i++) {
    closed.set(side * .02, -.83, .55).normalize().applyQuaternion(handQ); q.setFromUnitVectors(wing.axes[i], closed);
    q.slerp(identity, u);
    twist.setFromAxisAngle(wing.axes[i], side * u * (recovery * .66 + m.brake * .06)); q.multiply(twist);
    twist.setFromAxisAngle(axisY, side * u * (i / 9 - .5) * (.045 + m.brake * .16)); wing.bones[4 + i].quaternion.copy(q).premultiply(twist);
  }
  covertQ.copy(wing.bones[3].quaternion).multiply(handQ);
  covertAxis.set(side * .4, 0, 1).normalize(); closed.set(side * .02, -.83, .55).normalize().applyQuaternion(covertQ);
  wing.bones[16].quaternion.setFromUnitVectors(covertAxis, closed).slerp(identity, u);
  covertQ.copy(wing.bones[2].quaternion).multiply(wing.bones[3].quaternion).multiply(handQ);
  for (let i = 0; i < 14; i++) {
    closed.set(side * .03, -.92, .30).normalize().applyQuaternion(covertQ);
    wing.bones[17 + i].quaternion.setFromUnitVectors(wing.axes[10 + i], closed).slerp(identity, u);
  }
  for (let i = 0; i < 75; i++) {
    closed.set(side * .03, -.92, .30).normalize().applyQuaternion(covertQ);
    wing.bones[31 + i].quaternion.setFromUnitVectors(wing.axes[24 + i], closed).slerp(identity, u);
  }
  closed.set(side * .54, -.015, -.21).normalize();
  wing.bones[15].quaternion.setFromAxisAngle(closed, -side * (1 - u) * 1.2);
  wing.bones[14].rotation.set(0, 0, side * u * (.06 + m.brake * .48 + (1 - m.glide) * .12));
}
function poseWings(w: ArchangelWings) { poseSide(w.left, -1, w); poseSide(w.right, 1, w); }
/** Read the final character frame. Counter the flight lean so a prone body cannot turn lifting surfaces into vertical signs. */
export function alignArchangelWings(w: ArchangelWings, body: Object3D, lean: number) {
  if (!w.root.parent) return;
  body.getWorldQuaternion(frameQ); q.setFromAxisAngle(axisX, -lean); frameQ.multiply(q);
  w.root.parent.getWorldQuaternion(parentQ); w.root.quaternion.copy(parentQ.invert()).multiply(frameQ);
}
export function stepArchangelWings(w: ArchangelWings, flying: boolean, paused: boolean, reduced: boolean, speed: number, vy: number, roll: number, dt: number, brake = 0) {
  if (paused) return;
  Object.assign(frameInput, { flying, paused, reduced, speed, vy, roll, brake });
  advanceWingMotion(w.motion, frameInput, dt); poseWings(w);
}
