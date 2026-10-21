import { droneAlive, type ShooterState } from './combat';
import { MODE, type BanishState } from './banishState';
import { ELITE } from './encounter';
import { stepWardenAttacks } from './wardenAttacks';
import { takeWardenCounter } from './wardenCounter';
/** Armor absorbs an actual contact, never an input press. The player may carry through and fight someone else. */
export function absorbEliteStrike(b: BanishState, s: ShooterState, i: number) {
  if (takeWardenCounter(b.wardens, i)) { b.armor[i] = 0; s.drones.broken[i] = 1; return false; }
  if (b.armor[i] === 0) return false;
  b.armor[i]--; b.guardTime[i] = ELITE.exchange; b.retaliate[i] = 1;
  b.mode[i] = MODE.staggered; b.timer[i] = ELITE.reaction; s.drones.held[i] = 1;
  if (b.armor[i] === 0) s.drones.broken[i] = 1;
  b.wardens.cool[i] = 0;
  return true;
}
/** New elite turn choreography; normal enemy darts remain in celestialBattle. */
export function stepEliteGuards(b: BanishState, s: ShooterState, player: { x: number; y: number; z: number }, dt: number) {
  stepWardenAttacks(b, s, player, dt);
}
