import { droneAlive, type ShooterState } from './combat';
import { MODE, type BanishState } from './banishState';
import { battle, BATTLE } from './celestialBattle';
import { ELITE, ELITES } from './encounter';
/** Armor absorbs an actual contact, never an input press. The player may carry through and fight someone else. */
export function absorbEliteStrike(b: BanishState, s: ShooterState, i: number) {
  if (b.armor[i] === 0) return false;
  b.armor[i]--; b.guardTime[i] = ELITE.exchange; b.retaliate[i] = 1;
  b.mode[i] = MODE.staggered; b.timer[i] = ELITE.reaction; s.drones.held[i] = 1;
  if (b.armor[i] === 0) s.drones.broken[i] = 1;
  return true;
}
/** Reuses the encounter's visible windup/dart attack. No hidden damage, teleport or second slow-time clock. */
export function stepEliteGuards(b: BanishState, s: ShooterState, player: { x: number; y: number; z: number }, dt: number) {
  for (const i of ELITES) {
    if (!droneAlive(s.drones, i) || b.mode[i] >= MODE.down) { b.guardTime[i] = 0; b.retaliate[i] = 0; continue; }
    b.guardTime[i] = Math.max(0, b.guardTime[i] - dt);
    if (!b.retaliate[i] || b.mode[i] === MODE.staggered) continue;
    s.drones.held[i] = 0;
    const p = s.drones.pos[i];
    if (Math.hypot(p.x - player.x, p.y - player.y, p.z - player.z) > BATTLE.range) { b.retaliate[i] = 0; continue; }
    if (battle.charging < 0 && s.targets[i].los) {
      battle.charging = i; battle.charge = 0; b.retaliate[i] = 0;
    }
  }
}
