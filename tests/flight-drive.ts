import { advanceVelocity, SPEED, type Vec } from '../src/game/motion';
import { advanceFlightPose } from '../src/game/presentation';
import { advanceSuitAnimation, type SuitAnimation } from '../src/world/suitAnimation';
import { advanceSuitRoll, createSuitRoll, speedFade, type SuitRoll } from '../src/world/suitRoll';
import { createTurnSweep, sweepTurn } from '../src/game/turnSweep';
import { createFlightMix, advanceFlightMix, cruising, flightPose, frame, type Rig } from './flight-harness';
import type { FlightMix } from '../src/world/flightMix';
/**
 * Turns as each input device makes them, flown through Player.tsx's physics at a fixed 60 Hz under render frames at any rate:
 * `rate` turns the view per physics step (rad/s: keyboard arrows, a held thumb or trackpad edge at 1.5 rad/s), `look` by look()
 * events per render frame (rad: thumb drags at gain 1.6, trackpad swipes, tap-pad look steps of .225 rad). Positive turns left.
 */
export type Device = { speed: number; pointer: boolean; forward?: number; strafe?: number; rate?: (t: number) => number; look?: (t: number, dt: number) => number };
const during = (from: number, to: number, value: number) => (t: number) => t >= from && t < to ? value : 0;
export const keyboard = (speed: 13 | 34, dir = 1, from = 1, to = 3): Device => ({ speed, pointer: false, rate: during(from, to, 1.5 * dir) });
export const edge = (speed: number, dir = 1, from = 1, to = 3): Device => ({ speed, pointer: true, rate: during(from, to, 1.5 * dir) });
/** A 150 px thumb drag over .4 s. */
export const thumb = (speed: number, dir = 1): Device => ({ speed, pointer: true, look: (t, dt) => during(1, 1.4, dir * 150 / .4 * 1.6 * .003)(t) * dt });
/** A 300 px trackpad swipe over .5 s while cruising. */
export const trackpad = (speed: number, dir = 1): Device => ({ speed, pointer: true, look: (t, dt) => during(1, 1.5, dir * 300 / .5 * .003)(t) * dt });
/** One Look left (or right) tap at 1 s while the forward pad holds 13 m/s. */
export const tap = (dir = 1, at = [1]): Device => ({ speed: SPEED.flight, pointer: false, look: (t, dt) => at.some(a => t <= a && t + dt > a) ? .225 * dir : 0 });
/**
 * The physics state hooks may change on each 60 Hz step: `steer` as the controls choose the velocity (a landing approach),
 * `step` as the world answers (a wall deflection, a touchdown), the way the flight safety follows the controls in Player.tsx.
 */
export type Body = { t: number; yaw: number; pitch: number; v: Vec; flying: boolean; landing: boolean };
export type Options = {
  hz?: number; pitch?: number; hero?: number; seconds?: number; reduced?: (t: number) => boolean; rig?: Rig; steer?: (b: Body) => void; step?: (b: Body) => void;
};
export type Frame = { t: number; roll: number; fade: number; p: ReturnType<typeof flightPose>; mix: FlightMix; life: SuitAnimation; turn: SuitRoll; body: Body };
/** Steady flight at the device's speed, then the game's per-frame order: presentation, animation, mix, roll, then (with `rig`) one Suit.tsx frame. */
export function drive(device: Device, { hz = 60, pitch = 0, hero = 1, seconds = 5, reduced = () => false, rig, steer, step }: Options, each: (f: Frame) => void) {
  const s = device.speed, p = flightPose({ speed: s, viewPitch: pitch, pitch }), life = cruising(), mix = createFlightMix(), turn = createSuitRoll(), sweep = createTurnSweep();
  const body: Body = { t: 0, yaw: 0, pitch, v: { x: 0, y: Math.sin(pitch) * s, z: -Math.cos(pitch) * s }, flying: true, landing: false };
  const forward = device.forward ?? (device.pointer ? s / SPEED.surge : 1), strafe = device.strafe ?? 0, surge = device.pointer || s > SPEED.flight;
  let due = 0;
  for (let f = 0; f < Math.round(seconds * hz); f++) {
    const t = f / hz, dt = 1 / hz, calm = reduced(t);
    body.yaw += device.look?.(t, dt) ?? 0;
    for (due += dt; due >= 1 / 60 - 1e-9; due -= 1 / 60) {
      body.yaw += (device.rate?.(body.t) ?? 0) / 60;
      const from = body.v;
      if (body.flying) body.v = advanceVelocity(body.v, { forward, strafe, vertical: 0 }, body.yaw, pitch, true, surge, 1 / 60);
      body.t += 1 / 60; steer?.(body);
      const chosen = body.v; step?.(body); sweepTurn(sweep, from, chosen, body.v, p.yaw, 1 / 60);
    }
    const v = body.v, input = { paused: false, reduced: calm, flying: body.flying, landing: body.landing, velocity: v, turn: sweep };
    advanceFlightPose(p, { yaw: body.yaw, pitch, speed: Math.hypot(v.x, v.y, v.z), velocity: v, flying: body.flying, reduced: calm }, dt);
    advanceSuitAnimation(life, p, input, dt);
    advanceFlightMix(mix, p, input, dt);
    const roll = advanceSuitRoll(turn, p, input, hero, mix.flare, dt), fade = speedFade(Math.hypot(v.x, v.z));
    if (rig) frame(rig, p, mix, life, hero, calm, true, roll, fade);
    each({ t: t + dt, roll, fade, p, mix, life, turn, body });
  }
}
/** The largest roll (signed) over a run. */
export function peak(device: Device, options: Options = {}) {
  let m = 0; drive(device, options, f => { if (Math.abs(f.roll) > Math.abs(m)) m = f.roll; }); return m;
}
