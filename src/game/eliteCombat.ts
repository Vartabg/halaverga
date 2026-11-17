import { droneAlive, type ShooterState } from './combat';
import { MODE, type BanishState } from './banishState';
import { ELITE } from './encounter';
import { stepWardenAttacks } from './wardenAttacks';
import { takeWardenCounter } from './wardenCounter';
import { flightFeel } from './flightFeel';
import { PURSUIT } from './wardenSteering';
/** Armor absorbs an actual contact, never an input press. The player may carry through and fight someone else. */
export function absorbEliteStrike(b: BanishState, s: ShooterState, i: number) {
  const counter = takeWardenCounter(b.wardens, i);
  // An adjacent counter may land before Player ever sees the dive phase. It still leaves the parked-hover intent.
  if (counter) flightFeel.brake = false;
  if (b.armor[i] === 0) return false;
  // The first hit provokes the duel. Its last armor layer needs a defended attack, not another timed spam loop.
  if (b.armor[i] < 2 && !counter) {
    b.guardTime[i] = .8; b.retaliate[i] = 1; b.mode[i] = MODE.staggered; b.timer[i] = ELITE.reaction;
    s.drones.held[i] = 1; b.wardens.cool[i] = 0; return true;
  }
  b.armor[i]--; b.guardTime[i] = ELITE.exchange; b.retaliate[i] = 1;
  if (counter && b.armor[i] === 0) { s.drones.broken[i] = 1; return false; }
  b.mode[i] = MODE.staggered; b.timer[i] = ELITE.reaction; s.drones.held[i] = 1;
  if (b.armor[i] === 0) s.drones.broken[i] = 1;
  b.wardens.cool[i] = 0;
  if (b.wardens.duel === i) { b.wardens.relocate[i] = PURSUIT.beat; b.wardens.navTime[i] = 0; }
  return true;
}
/** New elite turn choreography; normal enemy darts remain in celestialBattle. */
export function stepEliteGuards(b: BanishState, s: ShooterState, player: { x: number; y: number; z: number }, dt: number) {
  stepWardenAttacks(b, s, player, dt);
}
