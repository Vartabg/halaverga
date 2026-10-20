import { expect, it } from 'vitest';
import { pilotVelocity } from '../src/game/pilotFlight';
import { flightFeel } from '../src/game/flightFeel';
import { runtime } from '../src/game/runtime';
import { beginStrike, cancelStrike, strike } from '../src/game/strike';
const idle = { forward: 0, strafe: 0, vertical: 0 }, thrust = { ...idle, forward: 1 }, v = { x: 0, y: 0, z: -30 };
it('a new attack leaves parked hover; an explicit brake or interruption cancels that attack', () => {
  runtime.poseEpoch++; pilotVelocity(v, idle, 0, 0, true, true, 1 / 60);
  flightFeel.brake = true; beginStrike(0, { x: 0, y: 0, z: -30 });
  pilotVelocity(v, idle, 0, 0, true, true, 1 / 60); expect(flightFeel.brake).toBe(false); expect(strike.phase).toBe(1);
  runtime.touchEpoch++; pilotVelocity(v, idle, 0, 0, true, true, 1 / 60);
  expect(flightFeel.brake).toBe(true); expect(strike.phase).toBe(0);
  pilotVelocity(v, thrust, 0, 0, true, true, 1 / 60); expect(flightFeel.brake).toBe(false); cancelStrike();
});

it('the free cursor stop gesture brakes even without a pointer-lock epoch change', () => {
  runtime.poseEpoch++; runtime.trackpad.active = true;
  pilotVelocity(v, thrust, 0, 0, true, true, 1 / 60);
  runtime.trackpad.active = false;
  const next = pilotVelocity(v, idle, 0, 0, true, true, 1 / 60);
  expect(flightFeel.brake).toBe(true); expect(Math.abs(next.z)).toBeLessThan(29);
});

it('a fresh brake request cancels a dive but its later parked state permits the next attack', () => {
  runtime.poseEpoch++; runtime.trackpad.active = false; pilotVelocity(v, idle, 0, 0, true, true, 1 / 60);
  beginStrike(0, { x: 0, y: 0, z: -30 }); flightFeel.serial++;
  pilotVelocity(v, idle, 0, 0, true, true, 1 / 60); expect(strike.phase).toBe(0); expect(flightFeel.brake).toBe(true);
  beginStrike(0, { x: 0, y: 0, z: -30 }); pilotVelocity(v, idle, 0, 0, true, true, 1 / 60);
  expect(strike.phase).toBe(1); expect(flightFeel.brake).toBe(false); cancelStrike();
});
