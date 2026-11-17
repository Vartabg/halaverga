import { expect } from 'vitest';
import type { ShooterState, Vec3 } from '../src/game/combat';
import { COMMAND, requestCommand } from '../src/game/commands';
import { stepBanish, type BanishState } from '../src/game/banish';
import { strike, strikeVelocity } from '../src/game/strike';

/** Lets the last cut's hit-stop and the first beat of the hold pass, as real frames would, so the next press is not buffered. */
export function settle(from: Vec3) {
  const v = { x: 0, y: 0, z: 0 };
  strikeVelocity(v, from, .2, false); strikeVelocity(v, from, .2, false);
}
/** One landed sword cut on demon i: the press, the dive or the step-in for its full wind-up, then contact at the demon. */
export function landCut(b: BanishState, s: ShooterState, i: number, from: Vec3) {
  settle(from);
  requestCommand(s, COMMAND.sword, i); stepBanish(b, s, from, 1 / 60);
  expect(strike.phase, 'the cut is under way').toBe(1);
  strikeVelocity({ x: 0, y: 0, z: 0 }, from, strike.minTime + .01, false);
  stepBanish(b, s, { ...s.targets[i].c }, 1 / 60);
  expect(strike.landed, 'the cut landed').toBe(true);
}
