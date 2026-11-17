import { expect } from 'vitest';
import type { ShooterState, Vec3 } from '../src/game/combat';
import { COMMAND, requestCommand } from '../src/game/commands';
import { FX, createBanish, resetBanish, stepBanish, type BanishState } from '../src/game/banish';
import { createShooter } from '../src/game/combat';
import { buildTargets, createDroneSim } from '../src/game/drones';
import { resetBattle } from '../src/game/celestialBattle';
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

/** One shooter and banish state with demon 0 ten metres ahead, every target in sight; run steps the fight for some seconds. */
export function setup() {
  const s = createShooter(), sim = createDroneSim(s); buildTargets(s);
  for (const t of s.targets) t.los = true;
  const b = createBanish(); resetBanish(b, s); resetBattle(0);
  const at = s.drones.pos[0], near = { x: at.x, y: at.y, z: at.z + 10 };
  s.aim.valid = true; s.aim.origin = { ...near }; s.aim.dir = { x: 0, y: 0, z: -1 };
  const run = (seconds: number) => { for (let n = 0; n < Math.ceil(seconds * 60); n++) { stepBanish(b, s, near, 1 / 60); buildTargets(s); for (const t of s.targets) t.los = true; } };
  const sword = () => b.fx.filter(e => e.kind === FX.sword && e.serial > 0).sort((x, y) => x.serial - y.serial).map(e => e.n);
  return { s, b, near, run, sword, sim };
}
