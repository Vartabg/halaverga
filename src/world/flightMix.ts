import type { Vec } from '../game/motion';
import { angleDelta, settle, type Pose } from '../game/presentation';
import { BONE_COUNT, BONE_NAMES } from './suitSkeleton';
/**
 * Plain-number state of the flight clip layer, advanced once per frame before posing. The blend weights settle per bone (torso first,
 * hands and toes last), so a brake or a turn breaks through the body in succession instead of switching it in one frame.
 */
export type FlightMix = {
  epoch: number; held: boolean; clock: number; slope: number; fistOn: boolean; raise: number; fist: number; steer: number; braking: number;
  travel: number; tracking: boolean; view: number; lateral: number; command: number; bank: Float32Array; brake: Float32Array; label: string; clamped: number;
  /** Landing flare weight; from touchdown it eases out from `hold` as `landed` counts the seconds since (Infinity in flight). */
  flare: number; hold: number; landed: number;
};
export type MixInput = { paused: boolean; reduced: boolean; flying: boolean; landing?: boolean; velocity: Vec };
/** Seconds over which the landing flare eases out after touchdown, starting and ending at rest (no velocity step). */
export const HANDOVER = .45;
/** The hero fist deploys at 20 m/s and stows at 15 m/s, so no held speed shows a half-raised fist; each takes `time` seconds. */
export const FIST = { up: 20, down: 15, time: .6 } as const;
const RATE: Record<string, number> = { pelvis: 16, spine: 14, chest: 12, neck: 12, head: 10, clavicle: 10, upperarm: 9, thigh: 9,
  forearm: 7, shin: 7, hand: 5, foot: 5, toe: 4 };
/** Settle rate (1/s) of each bone's brake and bank weight. */
export const LAG: readonly number[] = BONE_NAMES.map(n => RATE[n.replace(/_[lr]$/, '')]);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
export function createFlightMix(): FlightMix {
  return { epoch: Number.NaN, held: false, clock: 0, slope: 0, fistOn: false, raise: 0, fist: 0, steer: 0, braking: 0, travel: 0, tracking: false, view: 0, lateral: 0,
    command: 0, bank: new Float32Array(BONE_COUNT), brake: new Float32Array(BONE_COUNT), label: 'ground', clamped: 0,
    flare: 0, hold: 0, landed: Infinity };
}
/**
 * Reads speed, travel, turn and slope from the presentation pose and the physics velocity (plain numbers, no allocation). Turns carve
 * from the lateral acceleration of the actual travel; the fist steers from the commanded heading, which leads it by .13-.24 s.
 */
export function advanceFlightMix(mix: FlightMix, pose: Pose & { epoch: number }, input: MixInput, elapsed: number) {
  const real = Number.isFinite(elapsed) ? clamp(elapsed, 0, .25) : 0, dt = Math.min(real, .05), v = input.velocity;
  const sin = Math.sin(pose.yaw), cos = Math.cos(pose.yaw), forward = -v.x * sin - v.z * cos, side = v.x * cos - v.z * sin;
  const slope = clamp(v.y / Math.max(4, Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z)), -1, 1) || 0;
  const horizontal = Math.sqrt(v.x * v.x + v.z * v.z), moving = horizontal > 2, travel = moving ? Math.atan2(-v.x, -v.z) : mix.travel;
  // Flying backward reads as pushing against the air.
  const brake = clamp(Math.max(pose.brake, clamp(-forward / 8, 0, 1) * pose.flight), 0, 1) || 0;
  mix.fistOn = input.flying && (pose.speed >= FIST.up || (mix.fistOn && pose.speed > FIST.down));
  if (mix.epoch !== pose.epoch || (mix.held && !input.paused)) {
    // A teleport, reset or resume restarts the weights at their targets instead of animating across the gap.
    mix.epoch = pose.epoch; mix.held = false; mix.slope = slope; mix.fist = mix.raise = mix.fistOn ? 1 : 0; mix.travel = travel; mix.tracking = moving; mix.view = pose.viewYaw;
    mix.lateral = mix.command = mix.steer = 0; mix.braking = brake; mix.bank.fill(0); mix.brake.fill(brake);
    mix.flare = mix.hold = 0; mix.landed = Infinity;
  }
  if (input.paused) { mix.held = true; return; }
  // The travel heading goes stale below 2 m/s: setting off again re-seeds it instead of carving the whole change in one frame.
  const lateral = real > 0 && moving && mix.tracking ? angleDelta(mix.travel, travel) / real * horizontal : 0;
  const command = real > 0 && horizontal > 2 ? angleDelta(mix.view, pose.viewYaw) / real * horizontal : 0;
  mix.travel = travel; mix.tracking = moving; mix.view = pose.viewYaw;
  mix.lateral = settle(mix.lateral, clamp(lateral, -60, 60) || 0, 8, dt); mix.command = settle(mix.command, clamp(command, -60, 60) || 0, 12, dt);
  // Left turns carve with positive weight; drifting right leans right.
  const bank = input.reduced ? 0 : clamp(mix.lateral / 20 - .5 * clamp(side / 13, -1, 1) * pose.flight, -1, 1) || 0;
  // Soft saturation: a surge turn (command about 50) leans the fist in and back out without a flick or a dead stop.
  mix.steer = input.reduced ? 0 : mix.steer + (Math.tanh(mix.command / 20) - mix.steer) * (1 - Math.exp(-30 * dt));
  // Every shared loop divides 4 s; the clock runs a little faster with speed.
  mix.clock = (mix.clock + real * (.85 + .3 * clamp(pose.speed / 34, 0, 1))) % 4 || 0;
  ease(mix, input, real, dt); mix.slope = settle(mix.slope, slope, 6, dt); mix.braking = brake;
  for (let b = 0; b < BONE_COUNT; b++) { mix.bank[b] = settle(mix.bank[b], bank, LAG[b], dt); mix.brake[b] = settle(mix.brake[b], brake, LAG[b], dt); }
}
/** The eased weights, written in place (a helper returning numbers would box them every frame). */
function ease(mix: FlightMix, input: MixInput, real: number, dt: number) {
  // A linear raise through smoothstep: the fist starts and ends each deploy and stow at rest instead of at full speed.
  const raise = Math.min(1, Math.max(0, mix.raise + (mix.fistOn ? dt : -dt) / FIST.time));
  mix.raise = raise; mix.fist = raise * raise * (3 - 2 * raise);
  // The flare follows the landing approach in the air and carries through touchdown, easing out instead of dropping in one frame.
  if (input.flying) { mix.landed = Infinity; mix.flare += ((input.landing ? 1 : 0) - mix.flare) * (1 - Math.exp(-4 * dt)); return; }
  if (mix.landed === Infinity) { mix.hold = mix.flare; mix.landed = 0; }
  mix.landed += real; const u = Math.min(1, mix.landed / HANDOVER); mix.flare = mix.hold * (1 - u * u * (3 - 2 * u));
}
