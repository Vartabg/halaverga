import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createShooter, pressFire, releaseFire } from '../src/game/combat';
import { advanceWeapon } from '../src/game/weapon';
import { advanceFlightPose, aimDemand, angleDelta, FACING, settle, settleAngle, type Pose, type PoseInput } from '../src/game/presentation';
const fresh = (): Pose => ({ viewYaw: 0, viewPitch: 0, yaw: 0, pitch: 0, lean: 0, bank: 0, speed: 0, flight: 0, power: 0, brake: 0, aim: 0 });
const cruise = { yaw: 0, pitch: 0, speed: 34, velocity: { x: 0, y: 0, z: -34 }, flying: true, reduced: false };
/** main's advanceFlightPose, verbatim: the shooter-off pose must match it bit for bit. */
function mainPose(pose: Pose, input: PoseInput, elapsed: number) {
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
  const facingLag = angleDelta(pose.viewYaw, pose.yaw);
  if (Math.abs(facingLag) > FACING.yaw) pose.yaw = pose.viewYaw + Math.sign(facingLag) * FACING.yaw;
  pose.pitch = Math.max(pose.viewPitch - FACING.pitchDown, Math.min(pose.viewPitch + FACING.pitchUp, settle(pose.pitch, travelPitch, 7, dt)));
  pose.bank = settle(pose.bank, input.reduced ? 0 : turn, 5, dt);
  pose.flight = settle(pose.flight, input.flying ? 1 : 0, 5, dt);
  const deceleration = dt > 0 ? (oldSpeed - pose.speed) / dt : 0;
  const brace = input.flying ? Math.max(0, Math.min(1, (deceleration - 2) / 18)) : 0;
  pose.brake = settle(pose.brake, brace, 5, dt);
  pose.power = settle(pose.power, Math.min(1, Math.max(0, (pose.speed - 3) / 25)) * pose.flight, 5, dt);
  pose.lean = -pose.power * 1.35 + pose.brake * .12;
}
/** A 3 s script of turns, climbs, dives, brakes, hover and a reduced-motion stretch (the inputs tests/presentation.test.ts uses). */
function script(t: number): PoseInput {
  if (t < .5) return { ...cruise, yaw: Math.PI, velocity: { x: 0, y: 0, z: -34 } };
  if (t < 1) return { ...cruise, pitch: 1.25, velocity: { x: 0, y: 24, z: -24 } };
  if (t < 1.4) return { ...cruise, pitch: -1.3, velocity: { x: 12, y: -24, z: -20 } };
  if (t < 1.9) return { ...cruise, speed: 0, velocity: { x: 0, y: 0, z: 0 }, yaw: -.4 };
  if (t < 2.4) return { ...cruise, yaw: t % .1 < .05 ? .03 : -.03, velocity: { x: 34, y: 0, z: 0 } };
  if (t < 2.7) return { ...cruise, flying: false, speed: 3, velocity: { x: 0, y: 0, z: -3 } };
  return { ...cruise, yaw: .8, pitch: .5, reduced: true };
}
describe('presentation with the shooter aim', () => {
  it('matches main bit for bit with aim undefined, and with aim 0 and combat false', () => {
    for (const hz of [30, 60, 120, 165]) {
      const main = fresh(), plain = fresh(), zero = fresh();
      for (let i = 0; i < hz * 3; i++) {
        const input = script(i / hz);
        mainPose(main, input, 1 / hz); advanceFlightPose(plain, input, 1 / hz);
        advanceFlightPose(zero, { ...input, aim: 0, combat: false }, 1 / hz);
        expect(plain).toEqual(main); expect(zero).toEqual(plain);
      }
    }
  });
  it('settles the view at rate 40 in combat: after 25 ms the lag is e^-1 of the step', () => {
    const p = fresh();
    advanceFlightPose(p, { ...cruise, yaw: .5, pitch: .2, combat: true }, .025);
    expect(.5 - p.viewYaw).toBeCloseTo(.5 * Math.exp(-1), 12);
    expect(.2 - p.viewPitch).toBeCloseTo(.2 * Math.exp(-1), 12);
    const q = fresh();
    advanceFlightPose(q, { ...cruise, yaw: .5, pitch: .2 }, .025);
    expect(.5 - q.viewYaw).toBeCloseTo(.5 * Math.exp(-.375), 12);
  });
  it('blends the body target by angle between travel and view yaw (a blend, not a switch)', () => {
    const dt = 1 / 60, target = (aim: number) => {
      const p = fresh(); p.speed = 20; p.flight = 1;
      advanceFlightPose(p, { ...cruise, speed: 20, velocity: { x: 0, y: 0, z: -20 }, yaw: .2, aim }, dt);
      return p.yaw / (1 - Math.exp(-(7 + 13 * aim) * dt));
    };
    expect(target(0)).toBeCloseTo(0, 12);
    expect(target(1)).toBeCloseTo(.2, 12);
    expect(target(.5)).toBeCloseTo(.1, 12);
    expect(target(.25)).toBeCloseTo(.05, 12);
  });
  it('turns the body toward the view within FACING at aim 1 and scales power toward 0', () => {
    const aimed = fresh(), plain = fresh();
    for (const p of [aimed, plain]) { p.speed = 34; p.flight = 1; p.power = 1; }
    for (let i = 0; i < 120; i++) {
      advanceFlightPose(aimed, { ...cruise, yaw: 1, aim: 1, combat: true }, 1 / 60);
      advanceFlightPose(plain, { ...cruise, yaw: 1 }, 1 / 60);
      expect(Math.abs(angleDelta(aimed.viewYaw, aimed.yaw))).toBeLessThanOrEqual(FACING.yaw + 1e-9);
    }
    expect(aimed.yaw).toBeCloseTo(1, 3);
    expect(aimed.power).toBeLessThan(1e-3); expect(aimed.lean).toBeGreaterThan(-2e-3);
    expect(aimed.aim).toBe(1);
    // Without aim the body keeps trailing the travel (clamped at FACING) and stays streamlined.
    expect(Math.abs(angleDelta(plain.viewYaw, plain.yaw))).toBeCloseTo(FACING.yaw, 6);
    expect(plain.power).toBeGreaterThan(.99);
  });
  it('leaves pose.aim untouched when the input carries no aim', () => {
    const p = fresh(); p.aim = .7;
    advanceFlightPose(p, cruise, 1 / 60); expect(p.aim).toBe(.7);
    advanceFlightPose(p, { ...cruise, aim: .3 }, 1 / 60); expect(p.aim).toBe(.3);
  });
  it('asks for full aim on the press frame itself: held fire or a pending press, with fireHold still 0', () => {
    const s = createShooter();
    expect(aimDemand(s)).toBe(0);
    pressFire(s, 'click'); expect(s.aim.fireHold).toBe(0); expect(aimDemand(s)).toBe(1);
    // A press released inside the same frame is still pending until the weapon handles it (at -25, after the presentation at -30).
    releaseFire(s, 'click'); expect(s.input.fire).toBe(false); expect(aimDemand(s)).toBe(1);
    advanceWeapon(s.weapon, false, s.input.pressSerial, 1 / 60); expect(aimDemand(s)).toBe(0);
    // The locked weapon ignores a press outside the vent window, as the shooter step's pending rule does.
    s.weapon.lock = 1; s.input.pressSerial++; expect(aimDemand(s)).toBe(0);
    s.aim.blend = .3; s.aim.fireHold = .6; expect(aimDemand(s)).toBe(.6);
    // The torso therefore squares up on the press frame: the body yaw moves toward the view that same frame.
    const p = fresh(), q = fresh(), t = createShooter(); pressFire(t, 'touch');
    advanceFlightPose(p, { ...cruise, speed: 0, velocity: { x: 0, y: 0, z: 0 }, flying: false, yaw: .25, aim: aimDemand(t), combat: true }, 1 / 60);
    advanceFlightPose(q, { ...cruise, speed: 0, velocity: { x: 0, y: 0, z: 0 }, flying: false, yaw: .25, aim: t.aim.fireHold, combat: true }, 1 / 60);
    expect(p.aim).toBe(1); expect(q.aim).toBe(0); expect(p.yaw).toBeGreaterThan(2 * q.yaw);
    const src = readFileSync(new URL('../src/game/FlightPresentation.tsx', import.meta.url), 'utf8');
    expect(src).toContain('state.shooter ? aimDemand(runtime.shooter) : 0');
  });
});
