import { Matrix4, Vector3, type Object3D } from 'three';
import type { Vec } from '../game/motion';
import { settle, type Pose } from '../game/presentation';
type Spring = { x: number; v: number };
/** Time-based motion layered over the pose targets: gait, breathing, hover bob, takeoff, landing and follow-through. */
export type SuitAnimation = {
  epoch: number; time: number; flying: boolean; ground: number; gait: number; stride: number;
  speed: number; forward: number; side: number; takeoff: number; landing: number; impact: number; approach: number;
  lagForward: Spring; lagSide: Spring;
};
/** `landing` is the store's landing-approach flag: the hover bob settles on the way down so touchdown has none left. */
export type AnimationInput = { flying: boolean; landing?: boolean; velocity: Vec };
const TAU = Math.PI * 2, SOLE = new Vector3(0, -.49, 0), REST_SOLE = -1, LIMBS = [[4, 8, 2, 6, -1, 0], [5, 9, 3, 7, 1, Math.PI]] as const;
const chain = new Matrix4(), sole = new Vector3();
/** Height of a sole below the hips, through the actual pelvis, hip and knee transforms. */
function soleHeight(joints: Object3D[], hip: number, shin: number) {
  for (const i of [0, hip, shin]) joints[i].updateMatrix();
  chain.multiplyMatrices(joints[0].matrix, joints[hip].matrix).multiply(joints[shin].matrix);
  return sole.copy(SOLE).applyMatrix4(chain).y;
}
const clamp = (v: number, low: number, high: number) => Math.min(high, Math.max(low, v));
const smooth = (from: number, to: number, t: number) => { const u = clamp((t - from) / (to - from), 0, 1); return u * u * (3 - 2 * u); };
export function createSuitAnimation(): SuitAnimation {
  return { epoch: Number.NaN, time: 0, flying: false, ground: 1, gait: 0, stride: 0, speed: 0, forward: 0, side: 0,
    takeoff: Infinity, landing: Infinity, impact: 0, approach: 0, lagForward: { x: 0, v: 0 }, lagSide: { x: 0, v: 0 } };
}
// An underdamped spring (about 1.6 Hz, damping ratio .35) integrated in fixed 1/240 s steps, so it settles alike at any refresh rate.
function chase(spring: Spring, target: number, dt: number) {
  for (let left = dt; left > 1e-9; left -= 1 / 240) {
    const h = Math.min(left, 1 / 240);
    spring.v += (-7 * spring.v - 100 * (spring.x - target)) * h; spring.x += spring.v * h;
  }
}
export function advanceSuitAnimation(a: SuitAnimation, pose: Pose & { epoch: number }, input: AnimationInput, elapsed: number) {
  const dt = clamp(elapsed, 0, .05), sin = Math.sin(pose.yaw), cos = Math.cos(pose.yaw), v = input.velocity;
  // Velocity in the body frame: the model faces -Z, so forward is (-sin, 0, -cos) of its yaw and right is (cos, 0, -sin).
  a.forward = -v.x * sin - v.z * cos; a.side = v.x * cos - v.z * sin; a.speed = Math.hypot(a.forward, a.side);
  const forward = clamp(a.forward / 13, -2.6, 2.6), side = clamp(a.side / 13, -2.6, 2.6);
  if (a.epoch !== pose.epoch) {
    // A teleport or reset restarts the layer instead of animating across the jump.
    Object.assign(a, { epoch: pose.epoch, flying: input.flying, ground: input.flying ? 0 : 1, gait: 0, takeoff: Infinity, landing: Infinity,
      lagForward: { x: forward, v: 0 }, lagSide: { x: side, v: 0 } });
  }
  if (input.flying !== a.flying) {
    // A lift launches upward; the suit catching a fall does not push off.
    if (input.flying && v.y > 3) a.takeoff = 0;
    if (!input.flying) { a.landing = 0; a.impact = .75 + .25 * Math.min(1, pose.speed / 6); }
    a.flying = input.flying;
  }
  a.time += dt; a.takeoff += dt; a.landing += dt;
  a.ground = settle(a.ground, a.flying ? 0 : 1, 25, dt); a.approach = settle(a.approach, input.landing ? 1 : 0, 4, dt);
  a.gait = settle(a.gait, a.ground * smooth(.2, 1.5, a.speed), 10, dt);
  // One cycle is two steps. Stride length grows with speed, so the cadence rises from a walk to about three steps a second.
  a.stride = (a.stride + a.speed / clamp(.8 + .5 * a.speed, 1, 3.4) * dt) % 1;
  chase(a.lagForward, forward, dt); chase(a.lagSide, side, dt);
}
/** Adds the motion to the joint rotations written by applySuitPose this frame; returns the visual root lift in metres. */
export function applySuitAnimation(joints: Object3D[], a: SuitAnimation, pose: Pose, reduced: boolean) {
  const soft = reduced ? .3 : 1, gait = a.gait, idle = a.ground * (1 - gait) * soft;
  const hover = (1 - a.ground) * (1 - pose.power) * soft, wind = pose.flight * pose.power * Math.min(1, pose.speed / 34) * soft;
  const h = a.speed, ahead = a.speed > 1e-3 ? a.forward / a.speed : 0, across = a.speed > 1e-3 ? a.side / a.speed : 0;
  const push = smooth(0, .1, a.takeoff) * (1 - smooth(.1, .26, a.takeoff)), crouch = push * soft;
  const extend = smooth(.1, .2, a.takeoff) * (1 - smooth(.3, .55, a.takeoff)) * soft;
  const absorb = a.impact * smooth(0, .07, a.landing) * (1 - smooth(.12, .6, a.landing)) * soft;
  const lagForward = reduced ? 0 : clamp(a.lagForward.x - clamp(a.forward / 13, -2.6, 2.6), -1, 1);
  const lagSide = reduced ? 0 : clamp(a.lagSide.x - clamp(a.side / 13, -2.6, 2.6), -1, 1);
  const breath = Math.sin(a.time * TAU * .25), sway = Math.sin(a.time * TAU * .09), bob = Math.sin(a.time * TAU * .42);
  const swingAmp = Math.min(.5, .12 + .16 * h), kneeAmp = Math.min(1.3, .35 + .2 * h);
  const armAmp = Math.min(.6, .08 + .11 * h), elbowBase = Math.min(1.35, .15 + .24 * h);
  for (const [hip, shin, arm, fore, side, offset] of LIMBS) {
    const phase = a.stride * TAU + offset, swing = Math.sin(phase), drift = (1 + Math.sin(a.time * TAU * .42 + offset * .6)) / 2;
    const flutter = (1 + Math.sin(a.time * TAU * (3.1 + offset * .2))) / 2;
    // Gait: the foot travels along the direction of motion and the knee folds while it swings through.
    joints[hip].rotation.x += gait * swingAmp * swing * ahead + .6 * crouch - .1 * extend + .7 * absorb + hover * .06 * (drift * 2 - 1) + .3 * lagForward;
    joints[hip].rotation.z += gait * .6 * swingAmp * swing * across - idle * .025 * sway + .25 * lagSide;
    joints[shin].rotation.x -= gait * (kneeAmp * Math.max(0, Math.cos(phase)) ** 1.5 + .2 * Math.min(1, h / 4) * Math.max(0, -Math.cos(phase)))
      + idle * .08 * Math.max(0, side * sway) + 1.15 * crouch + 1.35 * absorb + hover * .1 * drift + wind * .05 * flutter + .2 * Math.abs(lagForward);
    // Arms pump against the legs, relax at rest, float while hovering and flare for balance on landing.
    // The launch drives the right fist up, matching the power-flight lead; the left arm follows lower.
    joints[arm].rotation.x += -gait * (armAmp * swing * ahead + .2 * Math.min(1, h / 5)) - .5 * crouch + (side > 0 ? 1.5 : .7) * extend + .35 * absorb + .4 * lagForward;
    joints[arm].rotation.z += side * (gait * .06 * Math.min(1, h / 3) + idle * (.07 + .02 * breath) + hover * .05 * drift + .4 * absorb) + .3 * lagSide;
    // The elbow closes as the arm drives forward and opens as it swings back.
    joints[fore].rotation.x += gait * (elbowBase - .25 * swing * ahead) + idle * (.15 + .03 * breath) + .3 * crouch + .2 * extend
      + .35 * absorb + hover * .06 * drift + wind * .03 * flutter + .3 * lagForward;
  }
  joints[0].rotation.x -= gait * .14 * clamp(a.forward / 5, -1, 1) + .25 * crouch + .3 * absorb;
  joints[0].rotation.z += idle * .025 * sway;
  if (!reduced) joints[0].rotation.y += gait * .06 * Math.sin(a.stride * TAU) * ahead;
  joints[1].rotation.x += gait * .06 * clamp(a.forward / 5, -1, 1) + idle * .02 * breath + .2 * crouch + .15 * absorb - .15 * lagForward;
  for (const i of [6, 7]) joints[i].rotation.x = Math.max(0, joints[i].rotation.x);
  for (const i of [8, 9]) joints[i].rotation.x = Math.min(0, joints[i].rotation.x);
  // Plant the lower foot: lower the body by however much the bent legs shortened, whenever grounded and through the push-off crouch.
  const plant = a.flying ? 1 - smooth(.1, .22, a.takeoff) : 1;
  return plant * (REST_SOLE - Math.min(soleHeight(joints, 4, 8), soleHeight(joints, 5, 9))) + (1 - plant) * hover * (1 - a.approach) * .06 * bob;
}
