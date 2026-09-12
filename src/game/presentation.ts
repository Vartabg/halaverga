import { Vector3, type Object3D } from 'three';
import type { Vec } from './motion';
export const presentation = {
  anchor: null as Object3D | null, position: new Vector3(),
  viewYaw: 0, viewPitch: -.12, yaw: 0, lean: 0, bank: 0, speed: 0, flight: 0, brake: 0,
  epoch: -1, alignAfterReset: false,
};
export const angleDelta = (from: number, to: number) => Math.atan2(Math.sin(to - from), Math.cos(to - from));
export function settle(value: number, target: number, rate: number, dt: number) {
  return value + (target - value) * (1 - Math.exp(-rate * Math.min(dt, .05)));
}
export function settleAngle(value: number, target: number, rate: number, dt: number) {
  return value + angleDelta(value, target) * (1 - Math.exp(-rate * Math.min(dt, .05)));
}

export type Pose = Pick<typeof presentation, 'viewYaw' | 'viewPitch' | 'yaw' | 'lean' | 'bank' | 'speed' | 'flight' | 'brake'>;
export type PoseInput = { yaw: number; pitch: number; speed: number; velocity: Vec; flying: boolean; reduced: boolean };
export function advanceFlightPose(pose: Pose, input: PoseInput, elapsed: number) {
  const dt = Math.min(elapsed, .05);
  pose.viewYaw = input.reduced ? input.yaw : settleAngle(pose.viewYaw, input.yaw, 15, dt);
  pose.viewPitch = input.reduced ? input.pitch : settle(pose.viewPitch, input.pitch, 15, dt);
  const oldSpeed = pose.speed;
  pose.speed = settle(pose.speed, input.speed, 7, dt);
  const horizontalSpeed = Math.hypot(input.velocity.x, input.velocity.z);
  const travelYaw = input.flying && horizontalSpeed > 1 ? Math.atan2(-input.velocity.x, -input.velocity.z) : input.flying && pose.speed > 2 ? pose.yaw : input.yaw;
  const turn = Math.max(-.3, Math.min(.3, angleDelta(pose.yaw, travelYaw) * .55));
  pose.yaw = settleAngle(pose.yaw, travelYaw, 7, dt);
  // The player reads the back in chase view, even while velocity catches a sharp turn.
  const facingLag = angleDelta(pose.viewYaw, pose.yaw);
  if (Math.abs(facingLag) > .4) pose.yaw = pose.viewYaw + Math.sign(facingLag) * .4;
  pose.bank = settle(pose.bank, input.reduced ? 0 : turn, 5, dt);
  pose.flight = settle(pose.flight, input.flying ? 1 : 0, 5, dt);
  const streamline = Math.min(1, Math.max(0, (pose.speed - 3) / 25));
  const deceleration = dt > 0 ? (oldSpeed - pose.speed) / dt : 0;
  const brace = input.flying ? Math.max(0, Math.min(1, (deceleration - 2) / 18)) : 0;
  pose.brake = settle(pose.brake, brace, 5, dt);
  pose.lean = settle(pose.lean, -pose.flight * streamline * 1.35 + pose.brake * .12, 5, dt);
}
