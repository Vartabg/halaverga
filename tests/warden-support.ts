import { createShooter, PHASE, type Vec3 } from '../src/game/combat';
import { buildTargets, createDroneSim } from '../src/game/drones';
import { createBanish, resetBanish, stepBanish } from '../src/game/banish';
import { battle, resetBattle } from '../src/game/celestialBattle';
import { flowPaths, flowVisible } from '../src/game/combatFlow';
import { wardenWorld } from '../src/game/wardenMath';
import { COMMAND, requestCommand } from '../src/game/commands';
import { cancelStrike } from '../src/game/strike';
export function wardenSetup(i = 5) {
  const s = createShooter(), sim = createDroneSim(s); const b = createBanish(); resetBanish(b, s); resetBattle();
  for (let k = 0; k < s.drones.count; k++) { s.drones.hp[k] = k === i ? 6 : 0; s.drones.phase[k] = k === i ? PHASE.alert : PHASE.dead; s.drones.los[k] = 1; }
  Object.assign(s.drones.pos[i], { x: 0, y: 35, z: 0 });
  const player = { x: 0, y: 35, z: 20 }; Object.assign(s.aim.origin, player); Object.assign(s.aim.dir, { x: 0, y: 0, z: -1 }); s.aim.valid = true;
  battle.clock = 1; battle.nextAttack = 9999; wardenWorld.clear = () => true; flowPaths.fill(1); flowVisible.fill(1); buildTargets(s);
  b.wardens.cool[i] = 0; b.wardens.engage[i] = .65;
  const step = (dt = 1 / 60, at: Vec3 = player) => {
    s.clock += dt; battle.clock += dt; battle.invulnerable = Math.max(0, battle.invulnerable - dt);
    buildTargets(s); stepBanish(b, s, at, dt); buildTargets(s);
  };
  const tick = (sec: number, dt = 1 / 60) => { for (let n = 0; n < Math.ceil(sec / dt); n++) step(dt); };
  const contact = () => { cancelStrike(); Object.assign(player, s.drones.pos[i]); player.z += 2; requestCommand(s, COMMAND.sword, i); step(); };
  return { i, s, sim, b, w: b.wardens, player, step, tick, contact };
}
