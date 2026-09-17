import { describe, expect, it } from 'vitest';
import { advanceFlightPose, angleDelta, FACING, type Pose } from '../src/game/presentation';
const fresh = (): Pose => ({ viewYaw: 0, viewPitch: 0, yaw: 0, pitch: 0, lean: 0, bank: 0, speed: 0, flight: 0, brake: 0 });
const cruise = { yaw: 0, pitch: 0, speed: 34, velocity: { x: 0, y: 0, z: -34 }, flying: true, reduced: false };
describe('composed flight presentation', () => {
  it('keeps the back toward the chase camera during sharp turns and reverse velocity', () => {
    for (const hz of [30, 60, 120]) {
      const p = fresh();
      for (let i = 0; i < hz * 2; i++) {
        advanceFlightPose(p, { ...cruise, yaw: Math.PI, velocity: { x: 0, y: 0, z: -34 } }, 1 / hz);
        expect(Math.abs(angleDelta(p.viewYaw, p.yaw))).toBeLessThanOrEqual(FACING.yaw + .01);
      }
    }
  });
  it('holds the body pitch within reach of the view while looking up before the climb catches up', () => {
    for (const hz of [30, 60, 120]) {
      const p = fresh(); p.speed = 34; p.flight = 1;
      for (let i = 0; i < hz * 2; i++) {
        advanceFlightPose(p, { ...cruise, pitch: i < hz ? 1.25 : -1.3 }, 1 / hz);
        expect(p.pitch).toBeGreaterThanOrEqual(p.viewPitch - FACING.pitchDown - 1e-9);
        expect(p.pitch).toBeLessThanOrEqual(p.viewPitch + FACING.pitchUp + 1e-9);
      }
    }
  });
  it('points the body along a climbing or diving velocity', () => {
    for (const vy of [24, -24]) {
      const p = fresh(), pitch = Math.atan2(vy, 24);
      for (let i = 0; i < 180; i++) advanceFlightPose(p, { ...cruise, pitch, velocity: { x: 0, y: vy, z: -24 } }, 1 / 60);
      expect(p.pitch).toBeCloseTo(pitch, 2);
    }
    const p = fresh(); for (let i = 0; i < 180; i++) advanceFlightPose(p, { ...cruise, speed: 0, velocity: { x: 0, y: 0, z: 0 }, pitch: .7 }, 1 / 60);
    expect(p.pitch).toBeCloseTo(.7, 2);
  });
  it('converges to the same streamlined pose at 30, 60 and 120 Hz', () => {
    const results = [30, 60, 120].map(hz => {
      const pose = fresh(); for (let i = 0; i < hz * 3; i++) advanceFlightPose(pose, cruise, 1 / hz); return pose;
    });
    for (const p of results) {
      expect(p.lean).toBeCloseTo(-1.35, 2); expect(p.speed).toBeCloseTo(34, 2);
      expect(p.bank).toBe(0); expect(p.brake).toBe(0);
    }
  });
  it('does not turn fingertip sampling noise into suit banking', () => {
    const p = fresh();
    for (let i = 0; i < 300; i++) {
      advanceFlightPose(p, { ...cruise, yaw: i % 2 ? .03 : -.03 }, 1 / 60);
      expect(p.bank).toBe(0);
    }
  });
  it('takes the short turn across the angle wrap and returns smoothly to hover', () => {
    const p = fresh(); p.yaw = Math.PI - .01; p.viewYaw = p.yaw;
    const target = -Math.PI + .01;
    advanceFlightPose(p, { ...cruise, yaw: target, velocity: { x: -Math.sin(target) * 34, y: 0, z: -Math.cos(target) * 34 } }, 1 / 60);
    expect(Math.abs(angleDelta(Math.PI - .01, p.yaw))).toBeLessThan(.01);
    for (let i = 0; i < 300; i++) advanceFlightPose(p, { ...cruise, speed: 0, velocity: { x: 0, y: 0, z: 0 } }, 1 / 60);
    expect(Math.abs(p.lean)).toBeLessThan(.001); expect(Math.abs(p.bank)).toBeLessThan(.001);
  });
  it('banks into a turn instead of lifting the inside shoulder', () => {
    const p = fresh(); advanceFlightPose(p, { ...cruise, velocity: { x: 34, y: 0, z: 0 } }, 1 / 60);
    expect(p.bank).toBeLessThan(0);
  });
  it('keeps reduced-motion aiming immediate and banking disabled', () => {
    const p = fresh(); advanceFlightPose(p, { ...cruise, yaw: .8, pitch: .5, reduced: true }, 1 / 60);
    expect(p.viewYaw).toBe(.8); expect(p.viewPitch).toBe(.5); expect(p.bank).toBe(0);
  });
});
