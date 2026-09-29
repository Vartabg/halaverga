import { describe, expect, it } from 'vitest';
import { PHASE, createShooter } from '../src/game/combat';
import { CHASE_BOOM, CHASE_HEAD } from '../src/game/presentation';
import { advanceDrones, createDroneContext, createDroneSim } from '../src/game/drones';
import { DRONE } from '../src/game/droneDodge';
// Dynamics review S2 follow-up (2026-09-28): the wider avoid push (9 m) made a staggered (PUNISH) drone slide 4.85 / 3.36 / 1.74 m away
// from a hero standing 3 / 5 / 7 m off, so the fixed target ran from the tap. PUNISH keeps its old 4 m reach and full gain: the drone
// holds where it was hit (drift .94 m at 3 m, none beyond 4 m). Real advanceDrones; node math, not iPhone validation.
const DT = 1 / 60, clear = () => true;
function drift(range: number, bearing: number, phase: number, seconds = .65) {
  const s = createShooter(), sim = createDroneSim(s, 77), ctx = createDroneContext(), f = s.drones;
  for (let i = 0; i < f.count; i++) if (i !== 1) { f.phase[i] = PHASE.dead; sim.respawnAt[i] = Infinity; }
  const start = { x: 0, y: 30, z: 0 };
  for (const v of [f.pos[1], f.home[1], f.anchor[1], sim.prev[1]]) Object.assign(v, start);
  f.phase[1] = phase; f.phaseT[1] = 0; f.hp[1] = 6; f.cooldown[1] = 9; f.los[1] = 1; f.losT[1] = .2; sim.dodger = -1;
  Object.assign(ctx, { tier: 'touch', threat: false, dt: DT });
  // The hero stands `range` from the drone at `bearing` (0 = drone dead ahead), the chase camera 5.3 m behind it.
  const player = { x: Math.sin(bearing) * range, y: 30, z: -Math.cos(bearing) * range * -1 };
  Object.assign(ctx.player, player);
  Object.assign(ctx.camera, { x: player.x + CHASE_BOOM.x, y: player.y + CHASE_HEAD + CHASE_BOOM.y, z: player.z + CHASE_BOOM.z });
  let peak = 0;
  for (let n = 0; n < seconds / DT; n++) {
    s.clock += DT; advanceDrones(s, sim, ctx, clear);
    peak = Math.max(peak, Math.hypot(f.pos[1].x - start.x, f.pos[1].y - start.y, f.pos[1].z - start.z));
  }
  return { peak, phase: f.phase[1] };
}
describe('a staggered (punish) drone stays a fixed target', () => {
  it.each([3, 5, 7, 9])('hero %s m away, dead ahead, to the side and behind: the drone drifts about 1 m at most over .65 s', range => {
    for (const bearing of [0, Math.PI / 2, -Math.PI / 2, Math.PI]) {
      const r = drift(range, bearing, PHASE.punish);
      expect(r.phase).toBe(PHASE.punish);
      expect(r.peak).toBeLessThanOrEqual(1.05);
    }
  });
  it('past the old 4 m reach it does not move at all', () => {
    for (const range of [5, 7, 9]) expect(drift(range, 0, PHASE.punish).peak).toBe(0);
  });
  it('an alerted (not punished) drone still gives way from the wider 9 m reach', () => {
    expect(DRONE.avoid).toBeGreaterThan(DRONE.avoidNear);
    expect(drift(7, 0, PHASE.alert, 1).peak).toBeGreaterThan(1);
  });
});
