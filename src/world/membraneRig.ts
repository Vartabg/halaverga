import { DataTexture, Euler, FloatType, Matrix4, Quaternion, RGBAFormat, Vector3 } from 'three';
import { MAX_DRONES } from '../game/combat';
import { smooth } from './wingMotion';
/** A joint table: the right wing's shoulder, elbow and wrist in the model frame (the left mirrors x). */
export type WingJoints = readonly (readonly [number, number, number])[];
const e = new Euler(), q = new Quaternion(), translation = new Matrix4(), one = new Vector3(1, 1, 1), point = new Vector3();
/**
 * Four skin matrices per side: fixed flank, shoulder, elbow, wrist. A small float texture avoids mobile uniform-array limits.
 * `joints` places the hinges (the Watchers' feather wings: watcherWings.ts WATCHER_JOINTS).
 */
export function createMembraneRig(joints: WingJoints) {
  const data = new Float32Array(MAX_DRONES * 8 * 16), palette = Array.from({ length: MAX_DRONES * 8 }, () => new Matrix4());
  const texture = new DataTexture(data, 4, MAX_DRONES * 8, RGBAFormat, FloatType); texture.needsUpdate = true;
  const world = [new Matrix4(), new Matrix4(), new Matrix4()];
  const step = (index: number, time: number, speed: number, reduced: boolean, strain = 0, rate = 1.65) => {
    const glide = smooth(5, 11, speed) * (1 - Math.min(1, strain)), phase = (time * rate + index * .193) % 1;
    const recovery = reduced || phase < .48 ? 0 : Math.sin((phase - .48) / .52 * Math.PI);
    const stroke = reduced ? 0 : phase < .48 ? 1 - 2 * smooth(0, .48, phase) : -1 + 2 * smooth(.48, 1, phase);
    for (const side of [-1, 1]) {
      const base = index * 8 + (side < 0 ? 0 : 4); palette[base].identity();
      for (let j = 0; j < 3; j++) {
        const p = joints[j], previous = j ? joints[j - 1] : [0, 0, 0];
        point.set(side * (p[0] - previous[0]), p[1] - previous[1], p[2] - previous[2]);
        if (j === 0) e.set(.10 + recovery * .20, side * -.06, side * (.10 + stroke * (.73 - glide * .38)), 'ZXY');
        else if (j === 1) e.set(0, side * recovery * .85, 0, 'XYZ');
        else e.set(recovery * .28, -side * recovery * .64, 0, 'XYZ');
        q.setFromEuler(e); world[j].compose(point, q, one); if (j) world[j].premultiply(world[j - 1]);
        translation.makeTranslation(-side * p[0], -p[1], -p[2]); palette[base + j + 1].copy(world[j]).multiply(translation);
      }
      for (let j = 0; j < 4; j++) palette[base + j].toArray(data, (base + j) * 16);
    }
    texture.needsUpdate = true;
  };
  for (let i = 0; i < MAX_DRONES; i++) step(i, 0, 0, true);
  return { texture, palette, step, dispose() { texture.dispose(); } };
}
export const membraneSkinGLSL = `
attribute vec4 aWingWeights;
attribute float aWingSide;
uniform sampler2D uWingPose;
mat4 hostBone(int i) {
  return mat4(texelFetch(uWingPose, ivec2(0,i), 0), texelFetch(uWingPose, ivec2(1,i), 0),
    texelFetch(uWingPose, ivec2(2,i), 0), texelFetch(uWingPose, ivec2(3,i), 0));
}
mat4 hostWingSkin() {
  int base = gl_InstanceID * 8 + (aWingSide < 0.0 ? 0 : 4);
  return hostBone(base) * aWingWeights.x + hostBone(base+1) * aWingWeights.y
    + hostBone(base+2) * aWingWeights.z + hostBone(base+3) * aWingWeights.w;
}
`;
