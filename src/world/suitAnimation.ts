import { Matrix4, Vector3, type Object3D } from 'three';
import type { Vec } from '../game/motion';
import { settle, type Pose } from '../game/presentation';
type Spring = { x: number; v: number };
/** Time-based motion layered over the pose targets: gait, breathing, hover bob, takeoff, landing and follow-through. */
export type SuitAnimation = {
  epoch: number; time: number; flying: boolean; held: boolean; ground: number; gait: number; stride: number;
  speed: number; forward: number; side: number; groundY: number; takeoff: number; takeoffY: number; landing: number; approach: number;
  switched: number; pending: boolean; blend: number; lastLift: number; last: { forward: number; side: number }; lagForward: Spring; lagSide: Spring;
};
/** `landing` is the store's landing-approach flag; while `paused` the layer holds, and it restarts cleanly on resume. */
export type AnimationInput = { flying: boolean; landing?: boolean; paused?: boolean; velocity: Vec };
export type AnimatedPose = Pose & { epoch: number; position: Vec };
const TAU = Math.PI * 2, SOLE = new Vector3(0, -.49, 0), REST_SOLE = -1;
const LIMBS = [[4, 8, 2, 6, -1, 0], [5, 9, 3, 7, 1, Math.PI]] as const, ELBOWS = [6, 7] as const, KNEES = [8, 9] as const;
const chain = new Matrix4(), turn = new Matrix4(), sole = new Vector3();
/** World-vertical sole height below the hips, through the model's own rotation and the pelvis, hip and knee transforms. */
function soleHeight(joints: Object3D[], hip: number, shin: number) {
  joints[0].updateMatrix(); joints[hip].updateMatrix(); joints[shin].updateMatrix();
  const root = joints[0].parent;
  chain.multiplyMatrices(root ? turn.makeRotationFromQuaternion(root.quaternion) : turn.identity(), joints[0].matrix);
  return sole.copy(SOLE).applyMatrix4(chain.multiply(joints[hip].matrix).multiply(joints[shin].matrix)).y;
}
const clamp = (v: number, low: number, high: number) => Math.min(high, Math.max(low, v));
const smooth = (from: number, to: number, t: number) => { const u = clamp((t - from) / (to - from), 0, 1); return u * u * (3 - 2 * u); };
/** 0 through the push-off crouch, 1 once the feet may leave the ground plant (and for a caught fall). */
export const takeoffRelease = (a: SuitAnimation) => smooth(.1, .22, a.takeoff);
export function createSuitAnimation(): SuitAnimation {
  return { epoch: Number.NaN, time: 0, flying: false, held: false, ground: 1, gait: 0, stride: 0, speed: 0, forward: 0, side: 0, groundY: 0,
    takeoff: Infinity, takeoffY: 0, landing: Infinity, approach: 0, switched: Infinity, pending: false, blend: 0, lastLift: 0,
    last: { forward: 0, side: 0 }, lagForward: { x: 0, v: 0 }, lagSide: { x: 0, v: 0 } };
}
// Limb lag from body acceleration: each change of velocity kicks an underdamped spring (about 1.6 Hz, damping ratio .35) that
// rings out from rest. The kick is capped, so even an instant stop from full flight speed moves the limbs over several frames.
// Fixed 1/240 s steps keep it consistent across refresh rates.
function ring(spring: Spring, kick: number, dt: number) {
  spring.v = clamp(spring.v - 14 * kick, -10, 10);
  for (let left = dt; left > 1e-9; left -= 1 / 240) {
    const h = Math.min(left, 1 / 240);
    spring.v += (-7 * spring.v - 100 * spring.x) * h; spring.x += spring.v * h;
  }
}
export function advanceSuitAnimation(a: SuitAnimation, pose: AnimatedPose, input: AnimationInput, elapsed: number) {
  const real = Number.isFinite(elapsed) ? clamp(elapsed, 0, .25) : 0, dt = Math.min(real, .05);
  const sin = Math.sin(pose.yaw), cos = Math.cos(pose.yaw), v = input.velocity;
  // Velocity in the body frame: the model faces -Z, so forward is (-sin, 0, -cos) of its yaw and right is (cos, 0, -sin).
  const rawForward = -v.x * sin - v.z * cos, rawSide = v.x * cos - v.z * sin;
  const forward = clamp(rawForward / 13, -2.6, 2.6), side = clamp(rawSide / 13, -2.6, 2.6);
  if (a.epoch !== pose.epoch || (a.held && !input.paused)) {
    // A teleport, reset or resume restarts the layer instead of animating across the gap.
    Object.assign(a, { epoch: pose.epoch, held: false, flying: input.flying, ground: input.flying ? 0 : 1, gait: 0, takeoff: Infinity,
      landing: Infinity, switched: Infinity, pending: false, blend: 0, forward: rawForward, side: rawSide, speed: Math.hypot(rawForward, rawSide),
      groundY: pose.position.y, last: { forward, side }, lagForward: { x: 0, v: 0 }, lagSide: { x: 0, v: 0 } });
  }
  // Paused frames keep every value, so the pose on screen is the one from before the pause.
  if (input.paused) { a.held = true; return; }
  if (input.flying !== a.flying) {
    // A lift launches from the last grounded height (physics has already raised the anchor on this frame). A caught fall or a
    // touchdown switches the foot plant in one frame; applySuitAnimation blends that height change out.
    if (input.flying && v.y > 3) { a.takeoff = 0; a.takeoffY = a.groundY; } else { a.switched = 0; a.pending = true; }
    if (!input.flying) a.landing = 0;
    a.flying = input.flying;
  }
  a.time += real; a.takeoff += real; a.landing += real; a.switched += real;
  if (!a.flying) a.groundY = pose.position.y;
  a.ground = settle(a.ground, a.flying ? 0 : 1, 25, dt); a.approach = settle(a.approach, input.landing ? 1 : 0, 4, dt);
  // The gait follows a smoothed velocity, so an instant change (a wall, cleared input) never snaps the legs; the springs get the raw change.
  a.forward = settle(a.forward, rawForward, 12, dt); a.side = settle(a.side, rawSide, 12, dt); a.speed = Math.hypot(a.forward, a.side);
  a.gait = settle(a.gait, a.ground * smooth(.2, 1.5, a.speed), 10, dt);
  // One cycle is two steps. Stride length grows with speed, so the cadence rises from a walk to about three steps a second.
  a.stride = (a.stride + a.speed / clamp(.8 + .5 * a.speed, 1, 3.4) * real) % 1;
  ring(a.lagForward, forward - a.last.forward, dt); ring(a.lagSide, side - a.last.side, dt);
  a.last.forward = forward; a.last.side = side;
}
/**
 * Adds the motion to the joint rotations written by applySuitPose this frame and returns the visual root lift in metres, which it
 * also records for the plant blend. `hero` is the settled expressive-pose weight: it adds the fist-led launch. `authored` is the flight
 * clip authority from applyFlightClips: the authored pose replaces the procedural hover drift and the idle arms by that much.
 */
export function applySuitAnimation(joints: Object3D[], a: SuitAnimation, pose: AnimatedPose, reduced: boolean, hero = 1, authored = 0) {
  const soft = reduced ? .3 : 1, gait = a.gait, idle = a.ground * (1 - gait) * soft;
  // The relaxed arms of the grounded idle give way to the authored pose (the landing flare) as the drift does.
  const rest = idle * (1 - authored), hover = (1 - a.ground) * (1 - pose.power) * soft;
  const wind = pose.flight * pose.power * Math.min(1, pose.speed / 34) * soft;
  const drifting = hover * (1 - authored), h = a.speed, ahead = h > 1e-3 ? a.forward / h : 0, across = h > 1e-3 ? a.side / h : 0;
  const hold = 1 - takeoffRelease(a), crouch = smooth(0, .1, a.takeoff) * (1 - smooth(.1, .26, a.takeoff)) * soft;
  const extend = smooth(.1, .2, a.takeoff) * (1 - smooth(.3, .55, a.takeoff)) * soft;
  const absorb = .8 * smooth(0, .07, a.landing) * (1 - smooth(.12, .6, a.landing)) * soft;
  // The authored landing flare already holds the arms out for balance: the impact reaction gives way to it, so the two never stack.
  const brace = absorb * (1 - authored);
  const lagForward = reduced ? 0 : clamp(a.lagForward.x, -1, 1), lagSide = reduced ? 0 : clamp(a.lagSide.x, -1, 1);
  const breath = Math.sin(a.time * TAU * .25), sway = Math.sin(a.time * TAU * .09), bob = Math.sin(a.time * TAU * .42);
  const swingAmp = Math.min(.5, .12 + .16 * h), kneeAmp = Math.min(1.3, .35 + .2 * h);
  const armAmp = Math.min(.6, .08 + .11 * h), elbowBase = Math.min(1.35, .15 + .24 * h);
  // The torso leans into the run and folds over a crouch; the hips take the opposite angle, so the legs keep their world angle.
  const lean = gait * .14 * clamp(a.forward / 5, -1, 1) + .25 * crouch + .3 * absorb;
  for (const [hip, shin, arm, fore, side, offset] of LIMBS) {
    const phase = a.stride * TAU + offset, swing = Math.sin(phase), drift = (1 + Math.sin(a.time * TAU * .42 + offset * .6)) / 2;
    const flutter = (1 + Math.sin(a.time * TAU * (3.1 + offset * .2))) / 2;
    // Gait: the foot travels along the direction of motion and the knee folds while it swings through.
    joints[hip].rotation.x += lean + gait * swingAmp * swing * ahead + .6 * crouch - .1 * extend + .7 * absorb + drifting * .06 * (drift * 2 - 1) + .3 * lagForward;
    // Sideways, each foot steps out on its own side and closes back to the hips, so the legs never cross.
    joints[hip].rotation.z += gait * .3 * swingAmp * (across * swing + Math.abs(across) * side) - idle * .025 * sway + .25 * lagSide;
    joints[shin].rotation.x -= gait * (kneeAmp * Math.max(0, Math.cos(phase)) ** 1.5 + .2 * Math.min(1, h / 4) * Math.max(0, -Math.cos(phase)))
      + idle * .08 * Math.max(0, side * sway) + 1.15 * crouch + 1.35 * absorb + drifting * .1 * drift + wind * .05 * flutter + .2 * Math.abs(lagForward);
    // Arms pump against the legs, relax at rest, float while hovering and flare for balance on landing. With hero poses
    // the launch drives the right fist up, matching the power-flight lead; the left arm follows lower.
    joints[arm].rotation.x += -gait * (armAmp * swing * ahead + .2 * Math.min(1, h / 5)) - .5 * crouch + (side > 0 ? .7 + .8 * hero : .7) * extend
      + .35 * brace + .4 * lagForward;
    joints[arm].rotation.z += side * (gait * .06 * Math.min(1, h / 3) + rest * (.07 + .02 * breath) + drifting * .05 * drift + .4 * brace) + .3 * lagSide;
    // The elbow closes as the arm drives forward and opens as it swings back.
    joints[fore].rotation.x += gait * (elbowBase - .25 * swing * ahead) + rest * (.15 + .03 * breath) + .3 * crouch + .2 * extend
      + .35 * brace + drifting * .06 * drift + wind * .03 * flutter + .3 * lagForward;
  }
  joints[0].rotation.x -= lean;
  joints[0].rotation.z += idle * .025 * sway;
  if (!reduced) joints[0].rotation.y += gait * .06 * Math.sin(a.stride * TAU) * ahead;
  joints[1].rotation.x += gait * .06 * clamp(a.forward / 5, -1, 1) + idle * .02 * breath + .2 * crouch + .15 * absorb - .15 * lagForward;
  // Hinge guards: nothing above bends an elbow backward or a knee forward in normal play; these keep it that way.
  for (const i of ELBOWS) joints[i].rotation.x = Math.max(0, joints[i].rotation.x);
  for (const i of KNEES) joints[i].rotation.x = Math.min(0, joints[i].rotation.x);
  // Keep the lower sole at ground height whenever grounded and through the push-off crouch. During the crouch the anchor is
  // already rising, so the model holds the takeoff height and catches up as the legs extend; reduced motion rides with the anchor.
  const plant = a.flying ? hold : 1, rise = a.flying && !reduced ? clamp(pose.position.y - a.takeoffY, 0, 2) * hold : 0;
  const lift = plant * (REST_SOLE - Math.min(soleHeight(joints, 4, 8), soleHeight(joints, 5, 9))) - rise + (1 - plant) * hover * (1 - a.approach) * .06 * bob;
  // A caught fall or a touchdown switches the plant in one frame: blend the height change out over .15 s instead of popping.
  if (a.pending) { a.blend = a.lastLift - lift; a.pending = false; }
  a.lastLift = lift + a.blend * (1 - smooth(0, .15, a.switched));
  return a.lastLift;
}
