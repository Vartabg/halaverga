import { describe, expect, it } from 'vitest';
import { advanceFlightPose, angleDelta, FACING, type Pose, type PoseInput } from '../src/game/presentation';
import { FACING_PATH } from '../src/game/gesture/tuningCore';

const SPEED = 13;
function newPose(yaw = 0): Pose {
  return { viewYaw: yaw, viewPitch: -.12, yaw, pitch: -.12, lean: 0, bank: 0, speed: SPEED, flight: 1, power: 0, brake: 0,
    bound: { yaw: FACING.yaw, up: FACING.pitchUp, down: FACING.pitchDown }, turnRate: 0, lastYaw: NaN };
}
/** Level flight whose velocity heads `lag` rad behind the view yaw (travelYaw = atan2(-vx, -vz)). */
function input(yaw: number, lag: number, reduced = false): PoseInput {
  const h = yaw - lag;
  return { yaw, pitch: -.12, speed: SPEED, velocity: { x: -Math.sin(h) * SPEED, y: 0, z: -Math.cos(h) * SPEED }, flying: true, reduced };
}
/** Turns at `rate` rad/s for `secs`, calling `each` after every step; the travel lags the view by `lag`. */
function turn(pose: Pose, rate: number, secs: number, hz: number, lag: number, each?: (p: Pose, yaw: number) => void, reduced = false,
  start = 0) {
  const dt = 1 / hz, steps = Math.round(secs * hz);
  let yaw = start;
  for (let i = 0; i < steps; i++) {
    yaw += rate * dt;
    advanceFlightPose(pose, input(yaw, lag * Math.sign(rate), reduced), dt);
    each?.(pose, yaw);
  }
  return yaw;
}

describe('fast-turn body facing and bank', () => {
  for (const hz of [60, 120]) {
    it(`turns under 1.5 rad/s keep the old output exactly at ${hz} Hz`, () => {
      for (const rate of [.4, -.9, 1.45]) {
        const live = newPose(), ref = newPose();
        const dt = 1 / hz;
        let yaw = 0;
        for (let i = 0; i < 2 * hz; i++) {
          yaw += rate * dt;
          advanceFlightPose(live, input(yaw, .1 * Math.sign(rate)), dt);
          // The reference never measures a turn (no previous yaw), so it runs the pre-turn-rate formula.
          ref.lastYaw = NaN;
          advanceFlightPose(ref, input(yaw, .1 * Math.sign(rate)), dt);
          expect(live.bound!.yaw).toBe(FACING.yaw);
          expect(Math.abs(live.bank)).toBeLessThanOrEqual(.3);
          for (const k of ['viewYaw', 'viewPitch', 'yaw', 'pitch', 'lean', 'bank', 'speed', 'flight', 'power', 'brake'] as const)
            expect(live[k]).toBe(ref[k]);
        }
      }
    });
  }
  for (const lag of [0, .35]) {
    it(`4.2 rad/s widens to FACING_PATH, banks .45-.6 and narrows back after the turn (travel lag ${lag})`, () => {
      for (const rate of [4.2, -4.2]) {
        const pose = newPose();
        let maxBank = 0, step = 0;
        const yaw = turn(pose, rate, 1.5, 60, lag, p => {
          step++;
          expect(Math.abs(angleDelta(p.viewYaw, p.yaw))).toBeLessThanOrEqual(FACING_PATH.yaw + 1e-6);
          expect(Math.abs(p.bank)).toBeLessThanOrEqual(.6 + 1e-9);
          // The test's travel lag starts at full size, so the first frames may bank a hair the other way (as before); after 0.2 s
          // the body banks into the turn.
          if (step > 12) expect(Math.sign(p.bank)).toBe(Math.sign(rate));
          maxBank = Math.max(maxBank, Math.abs(p.bank));
        });
        expect(pose.bound!.yaw).toBeCloseTo(FACING_PATH.yaw, 9);
        expect(maxBank).toBeGreaterThanOrEqual(.45);
        // The turn stops: within 1.5 s the bound is back within 0.01 of FACING (it narrows smoothly, never snapping).
        let prev = pose.bound!.yaw;
        turn(pose, 0, 1.5, 60, 0, p => {
          expect(p.bound!.yaw).toBeLessThanOrEqual(prev + 1e-12); prev = p.bound!.yaw;
          expect(Math.abs(angleDelta(p.viewYaw, p.yaw))).toBeLessThanOrEqual(FACING_PATH.yaw + 1e-6);
        }, false, yaw);
        expect(Math.abs(pose.bound!.yaw - FACING.yaw)).toBeLessThanOrEqual(.01);
      }
    });
  }
  it('reduced motion never banks and never widens the bound', () => {
    const pose = newPose();
    turn(pose, 4.2, 1.5, 60, .2, p => {
      expect(p.bank).toBe(0);
      expect(p.bound!.yaw).toBe(FACING.yaw);
      expect(Math.abs(angleDelta(p.viewYaw, p.yaw))).toBeLessThanOrEqual(FACING.yaw + 1e-6);
    }, true);
  });
  it('a reset jump of pi is not a turn', () => {
    const pose = newPose();
    turn(pose, 0, .5, 60, 0);
    for (let i = 0; i < 60; i++) {
      advanceFlightPose(pose, input(Math.PI, 0), 1 / 60);
      expect(pose.turnRate).toBe(0);
      expect(pose.bound!.yaw).toBe(FACING.yaw);
      expect(Math.abs(pose.bank)).toBeLessThanOrEqual(.3);
    }
  });
  it('a pose without the turn fields (older callers) still advances', () => {
    const pose: Pose = { viewYaw: 0, viewPitch: -.12, yaw: 0, pitch: -.12, lean: 0, bank: 0, speed: SPEED, flight: 1, power: 0, brake: 0 };
    turn(pose, 4.2, 1, 60, 0, p => expect(Number.isFinite(p.bank)).toBe(true));
    expect(Math.abs(angleDelta(pose.viewYaw, pose.yaw))).toBeLessThanOrEqual(FACING_PATH.yaw + 1e-6);
  });
});
