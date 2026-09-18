import { Vector3, type Object3D } from 'three';
import type { Vec } from './motion';
export const presentation = {
  anchor: null as Object3D | null, position: new Vector3(),
  viewYaw: 0, viewPitch: -.12, yaw: 0, pitch: -.12, lean: 0, bank: 0, speed: 0, flight: 0, power: 0, brake: 0,
  epoch: -1, alignAfterReset: false,
};
/** Third-person boom in the view frame: right, up and behind the head. */
export const CHASE_BOOM = new Vector3(.85, .7, 5.3);
/** The body may trail the travel direction, but never far enough to turn its chest toward the chase camera. */
export const FACING = { yaw: .3, pitchUp: .4, pitchDown: .15 } as const;
export const angleDelta = (from: number, to: number) => Math.atan2(Math.sin(to - from), Math.cos(to - from));
export function settle(value: number, target: number, rate: number, dt: number) {
  return value + (target - value) * (1 - Math.exp(-rate * Math.min(dt, .05)));
}
export function settleAngle(value: number, target: number, rate: number, dt: number) {
  return value + angleDelta(value, target) * (1 - Math.exp(-rate * Math.min(dt, .05)));
}

export type Pose = Pick<typeof presentation, 'viewYaw' | 'viewPitch' | 'yaw' | 'pitch' | 'lean' | 'bank' | 'speed' | 'flight' | 'power' | 'brake'>;
export type PoseInput = { yaw: number; pitch: number; speed: number; velocity: Vec; flying: boolean; reduced: boolean };
export function advanceFlightPose(pose: Pose, input: PoseInput, elapsed: number) {
  const dt = Math.min(elapsed, .05);
  pose.viewYaw = input.reduced ? input.yaw : settleAngle(pose.viewYaw, input.yaw, 15, dt);
  pose.viewPitch = input.reduced ? input.pitch : settle(pose.viewPitch, input.pitch, 15, dt);
  const oldSpeed = pose.speed;
  pose.speed = settle(pose.speed, input.speed, 7, dt);
  const horizontalSpeed = Math.hypot(input.velocity.x, input.velocity.z), travelling = input.flying && pose.speed > 2;
  const travelYaw = travelling && horizontalSpeed > 1 ? Math.atan2(-input.velocity.x, -input.velocity.z) : travelling ? pose.yaw : input.yaw;
  const travelPitch = travelling ? Math.atan2(input.velocity.y, horizontalSpeed) : input.pitch;
  const turn = Math.max(-.3, Math.min(.3, angleDelta(pose.yaw, travelYaw) * .55));
  pose.yaw = settleAngle(pose.yaw, travelYaw, 7, dt);
  // The player reads the back in chase view, even while velocity catches a sharp turn.
  const facingLag = angleDelta(pose.viewYaw, pose.yaw);
  if (Math.abs(facingLag) > FACING.yaw) pose.yaw = pose.viewYaw + Math.sign(facingLag) * FACING.yaw;
  // Looking up before the climb catches up would show the chest from below; the body stays within reach of the view pitch.
  pose.pitch = Math.max(pose.viewPitch - FACING.pitchDown, Math.min(pose.viewPitch + FACING.pitchUp, settle(pose.pitch, travelPitch, 7, dt)));
  pose.bank = settle(pose.bank, input.reduced ? 0 : turn, 5, dt);
  pose.flight = settle(pose.flight, input.flying ? 1 : 0, 5, dt);
  const deceleration = dt > 0 ? (oldSpeed - pose.speed) / dt : 0;
  const brace = input.flying ? Math.max(0, Math.min(1, (deceleration - 2) / 18)) : 0;
  pose.brake = settle(pose.brake, brace, 5, dt);
  pose.power = settle(pose.power, Math.min(1, Math.max(0, (pose.speed - 3) / 25)) * pose.flight, 5, dt);
  // The lean and the body pitch that offsets it both scale with this one settled value. Fading them at
  // separate rates turned the body edge-on while braking hard out of a climb with the camera below it.
  pose.lean = -pose.power * 1.35 + pose.brake * .12;
}
