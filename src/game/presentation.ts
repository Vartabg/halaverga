import type { Object3D } from 'three';
import type { Vec } from './motion';
import type { ShooterState } from './combat';
import { FACING_AIM, FACING_PATH } from './gesture/tuningCore';
// Telemetry reads this on the landing page, so vectors stay plain objects and three.js is imported for types only.
export const presentation = {
  anchor: null as Object3D | null, position: { x: 0, y: 0, z: 0 },
  viewYaw: 0, viewPitch: -.12, yaw: 0, pitch: -.12, lean: 0, bank: 0, speed: 0, flight: 0, power: 0, brake: 0,
  epoch: -1, alignAfterReset: false,
  /** The flight clip on show (a plain label for telemetry and tests), written by the suit each frame. */
  suitClip: 'ground',
  /** The whole-body turn roll on show (rad, positive rolls left), written by the suit each frame for telemetry. */
  suitRoll: 0,
  /** Body aim weight 0..1 (max of the ADS blend and the hip-fire hold) the pose was last advanced with; 0 with the shooter off. */
  aim: 0,
  /** Gesture Lab body roll about the travel axis (rad, positive rolls right); the camera never rolls. 0 outside the lab. */
  spin: 0,
  /** The facing bounds in force (FACING, FACING_PATH or FACING_AIM): they widen at once and narrow smoothly. */
  bound: { yaw: .3, up: .4, down: .15 },
  /** Settled view turn rate (rad/s) and the view yaw it was last measured from: a fast turn widens the facing and the bank. */
  turnRate: 0, lastYaw: NaN,
};
/** Third-person boom in the view frame: right, up and behind the head. */
export const CHASE_BOOM: Vec = { x: .85, y: .7, z: 5.3 };
/** Height (m) of the head above the anchor: the chase boom hangs from it. */
export const CHASE_HEAD = .65;
/** The body may trail the travel direction, but never far enough to turn its chest toward the chase camera. */
export const FACING = { yaw: .3, pitchUp: .4, pitchDown: .15 } as const;
export const angleDelta = (from: number, to: number) => Math.atan2(Math.sin(to - from), Math.cos(to - from));
export function settle(value: number, target: number, rate: number, dt: number) {
  return value + (target - value) * (1 - Math.exp(-rate * Math.min(dt, .05)));
}
export function settleAngle(value: number, target: number, rate: number, dt: number) {
  return value + angleDelta(value, target) * (1 - Math.exp(-rate * Math.min(dt, .05)));
}

/**
 * The body aim weight FlightPresentation (-30) passes on: the ADS blend, the hip-fire hold, or 1 when this frame's input fires (held
 * fire, or a press the unlocked weapon has not handled yet, as the shooter step's own pending rule). The shooter step (-25) raises fireHold later in the same frame, so reading the input
 * here turns the torso on the press frame instead of the next one.
 */
export function aimDemand(s: Pick<ShooterState, 'aim' | 'input' | 'weapon'>) {
  const pressed = s.input.fire || (s.weapon.lock === 0 && s.input.pressSerial !== s.weapon.handledPress);
  return Math.max(s.aim.blend, s.aim.fireHold, pressed ? 1 : 0);
}
export type FacingBound = { yaw: number; up: number; down: number };
export type Pose = Pick<typeof presentation, 'viewYaw' | 'viewPitch' | 'yaw' | 'pitch' | 'lean' | 'bank' | 'speed' | 'flight' | 'power' | 'brake'>
  & { aim?: number; spin?: number; bound?: FacingBound; turnRate?: number; lastYaw?: number };
/**
 * `aim`: body aim weight 0..1 (squares the chest to the crosshair); `combat`: the view settles faster while shooting. Gesture Lab:
 * `facing` 1 (a drawn path) or 2 (an aimed burst) widens the facing bounds; `aimYaw`/`aimPitch` offset the aimed shot from the view
 * (the chest squares to view + aimYaw); `spin` is the body roll.
 */
export type PoseInput = { yaw: number; pitch: number; speed: number; velocity: Vec; flying: boolean; reduced: boolean; aim?: number; combat?: boolean;
  facing?: 0 | 1 | 2; aimYaw?: number; aimPitch?: number; spin?: number };
const widen = (from: number, to: number, snap: boolean, dt: number) => to >= from || snap ? to : settle(from, to, 4, dt);
const smooth = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
export function advanceFlightPose(pose: Pose, input: PoseInput, elapsed: number) {
  const dt = Math.min(elapsed, .05), aim = input.aim ?? 0, viewRate = input.combat ? 40 : 15;
  pose.viewYaw = input.reduced ? input.yaw : settleAngle(pose.viewYaw, input.yaw, viewRate, dt);
  pose.viewPitch = input.reduced ? input.pitch : settle(pose.viewPitch, input.pitch, viewRate, dt);
  const oldSpeed = pose.speed;
  pose.speed = settle(pose.speed, input.speed, 7, dt);
  const horizontalSpeed = Math.hypot(input.velocity.x, input.velocity.z), travelling = input.flying && pose.speed > 2;
  const travelYaw = travelling && horizontalSpeed > 1 ? Math.atan2(-input.velocity.x, -input.velocity.z) : travelling ? pose.yaw : input.yaw;
  const travelPitch = travelling ? Math.atan2(input.velocity.y, horizontalSpeed) : input.pitch;
  // Aiming blends the body toward the view yaw (strafe-aim), so the chest squares to the crosshair.
  const bodyYaw = aim > 0 ? travelYaw + angleDelta(travelYaw, input.yaw + (input.aimYaw ?? 0)) * aim : travelYaw;
  // A fast view turn (over 2 rad/s) widens the facing to FACING_PATH and lets the body bank further; slower turns are unchanged.
  // Jumps over 1 rad (resets, snaps) are not turns. Reduced motion never widens or banks.
  const last = pose.lastYaw, d = last !== undefined && Number.isFinite(last) ? angleDelta(last, input.yaw) : 0;
  pose.lastYaw = input.yaw;
  pose.turnRate = settle(pose.turnRate ?? 0, elapsed > 0 && Math.abs(d) < 1 ? Math.abs(d) / elapsed : 0, 10, dt);
  const fast = input.reduced ? 0 : smooth((pose.turnRate - 2) / 1.5), reach = .3 + .3 * fast;
  const f = input.facing === 1 || (!input.facing && fast > .5) ? FACING_PATH : input.facing === 2 ? FACING_AIM : FACING, b = pose.bound;
  if (b) { b.yaw = widen(b.yaw, f.yaw, input.reduced, dt); b.up = widen(b.up, f.pitchUp, input.reduced, dt); b.down = widen(b.down, f.pitchDown, input.reduced, dt); }
  const bYaw = b ? b.yaw : f.yaw, bUp = b ? b.up : f.pitchUp, bDown = b ? b.down : f.pitchDown;
  const turn = Math.max(-reach, Math.min(reach, angleDelta(pose.yaw, bodyYaw) * (.55 + .45 * fast)));
  pose.yaw = settleAngle(pose.yaw, bodyYaw, 7 + 13 * aim, dt);
  // The player reads the back in chase view, even while velocity catches a sharp turn.
  const facingLag = angleDelta(pose.viewYaw, pose.yaw);
  if (Math.abs(facingLag) > bYaw) pose.yaw = pose.viewYaw + Math.sign(facingLag) * bYaw;
  // Looking up before the climb catches up would show the chest from below; the body stays within reach of the view pitch.
  // An aimed burst blends toward the absolute aim pitch (view + aimPitch), as the yaw does; aimPitch is view-relative, so adding it to
  // the travel pitch would miss by (view - travel) while cruising. Standard aiming (no facing 2) is unchanged.
  const aimPitch = input.facing === 2 && input.aimPitch !== undefined ? (input.pitch + input.aimPitch - travelPitch) * aim : 0;
  pose.pitch = Math.max(pose.viewPitch - bDown, Math.min(pose.viewPitch + bUp, settle(pose.pitch, travelPitch + aimPitch, 7, dt)));
  pose.bank = settle(pose.bank, input.reduced ? 0 : turn, 5, dt);
  pose.flight = settle(pose.flight, input.flying ? 1 : 0, 5, dt);
  const deceleration = dt > 0 ? (oldSpeed - pose.speed) / dt : 0;
  const brace = input.flying ? Math.max(0, Math.min(1, (deceleration - 2) / 18)) : 0;
  pose.brake = settle(pose.brake, brace, 5, dt);
  pose.power = settle(pose.power, Math.min(1, Math.max(0, (pose.speed - 3) / 25)) * pose.flight * (1 - aim), 5, dt);
  // The lean and the body pitch that offsets it both scale with this one settled value. Fading them at
  // separate rates turned the body edge-on while braking hard out of a climb with the camera below it.
  pose.lean = -pose.power * 1.35 + pose.brake * .12;
  if (input.aim !== undefined) pose.aim = aim;
  if (input.spin !== undefined) pose.spin = input.reduced ? 0 : input.spin;
}
