import { describe, expect, it } from 'vitest';
import { momentumVelocity, FLIGHT } from '../src/game/momentumFlight';
import { advanceVelocity, type Vec } from '../src/game/motion';
const thrust = { forward: 1, strafe: 0, vertical: 0 }, idle = { forward: 0, strafe: 0, vertical: 0 };
const speed = (v: Vec) => Math.hypot(v.x, v.y, v.z);
function fly(v: Vec, pitch: number, seconds: number, hz = 60, yaw = 0, brake = false, input = thrust) {
  let height = 0;
  for (let k = 0; k < Math.round(seconds * hz); k++) { v = momentumVelocity(v, input, yaw, pitch, true, true, 1 / hz, brake); height += v.y / hz; }
  return { v, height };
}
describe('energy flight', () => {
  it('stores a dive as speed, then spends that speed gaining altitude', () => {
    const level = fly({ x: 0, y: 0, z: -30 }, 0, 2);
    const dive = fly({ x: 0, y: 0, z: -30 }, -.7, 2);
    expect(speed(dive.v)).toBeGreaterThan(speed(level.v) + 20); expect(dive.height).toBeLessThan(-35);
    const climb = fly(dive.v, .8, 2);
    expect(climb.height).toBeGreaterThan(15); expect(speed(climb.v)).toBeLessThan(speed(dive.v) - 10);
    console.log('ENERGY', JSON.stringify({ level: speed(level.v), dive: speed(dive.v), drop: dive.height, climb: speed(climb.v), gained: climb.height }));
  });
  it('the previous velocity-target controller cannot bank dive energy', () => {
    let level = { x: 0, y: 0, z: -30 }, dive = { ...level };
    for (let k = 0; k < 180; k++) { level = advanceVelocity(level, thrust, 0, 0, true, true, 1 / 60); dive = advanceVelocity(dive, thrust, 0, -.7, true, true, 1 / 60); }
    expect(Math.abs(speed(dive) - speed(level))).toBeLessThan(.1);
    console.log('OLD', JSON.stringify({ level: speed(level), dive: speed(dive) }));
  });
  it('carves a broad turn without collapsing momentum and never snaps a reversal', () => {
    const start = { x: 0, y: 0, z: -48 }, next = momentumVelocity(start, thrust, Math.PI / 2, 0, true, true, 1 / 60);
    expect(speed(next)).toBeGreaterThan(47); expect(next.z).toBeLessThan(-47); expect(next.x).toBeLessThan(0);
    const turn = fly(start, 0, .8, 60, Math.PI / 2);
    expect(turn.v.x).toBeLessThan(-40); expect(speed(turn.v)).toBeGreaterThan(44);
    const reverse = momentumVelocity(start, thrust, Math.PI, 0, true, true, 1 / 60);
    expect(reverse.z).toBeLessThan(-47); expect(Number.isFinite(reverse.x)).toBe(true);
  });
  it('coasts when released and brakes deliberately to a hover', () => {
    const start = { x: 0, y: 0, z: -40 };
    const glide = fly(start, 0, 1, 60, 0, false, idle);
    expect(speed(glide.v)).toBeGreaterThan(27);
    const stop = fly(start, 0, 1, 60, 0, true, idle);
    expect(speed(stop.v)).toBeLessThan(.15);
    expect(speed(fly(stop.v, 0, 1, 60, 0, true, idle).v)).toBe(0);
  });
  it('coasting still spends energy uphill and gains it downhill; powered Rise remains usable', () => {
    const uphill = { x: 0, y: 25, z: -25 }, downhill = { x: 0, y: -25, z: -25 };
    expect(Math.hypot(...Object.values(fly(uphill, 0, .5, 60, 0, false, idle).v))).toBeLessThan(30);
    expect(Math.hypot(...Object.values(fly(downhill, 0, .5, 60, 0, false, idle).v))).toBeGreaterThan(35);
    const rise = fly({ x: 0, y: 0, z: 0 }, 0, 3, 60, 0, false, { forward: 0, strafe: 0, vertical: 1 });
    expect(rise.height).toBeGreaterThan(35);
  });
  it('preserves strike exit speed instead of clamping to cruising speed', () => {
    const v = momentumVelocity({ x: 0, y: 0, z: -85 }, thrust, .1, 0, true, true, 1 / 60);
    expect(speed(v)).toBeGreaterThan(84);
    expect(fly(v, 0, 1).v.z).toBeLessThan(-70);
  });
  it('is consistent across frame rates, freezes at zero dt and safely bounds stalls', () => {
    const initial = { x: 0, y: 0, z: -30 }, values = [30, 60, 120].map(hz => fly(initial, -.6, 2, hz));
    for (const v of values) expect(speed(v.v)).toBeCloseTo(speed(values[0].v), 5);
    expect(momentumVelocity(initial, thrust, 0, 0, true, true, 0)).toEqual(initial);
    expect(speed(momentumVelocity(initial, thrust, 0, -1, true, true, 100))).toBeLessThan(35);
    expect(FLIGHT.maxGlide).toBeGreaterThan(FLIGHT.boost);
  });
});
