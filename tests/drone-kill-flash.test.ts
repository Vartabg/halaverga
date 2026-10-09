import { describe, expect, it } from 'vitest';
import { PHASE, createShooter, readEvents, type Vec3 } from '../src/game/combat';
import { DRONE, advanceDrones, createDroneContext, createDroneSim, damageDrone } from '../src/game/drones';
// Dynamics review S4 (2026-09-28): the white kill flash fell to 0.66 one frame after the killing hit and to 0.12 on the frame the
// burst FX spawn (25/s decay against the 80 ms hit-stop), so the fireball appeared after the white had faded. It now holds at full
// through the hit-stop. The WCAG gate (3 flashes per second per drone) is untouched. Real drone module, node math.
const DT = 1 / 60, clear = () => true, dir: Vec3 = { x: 0, y: 0, z: -1 };
function rig(reduced = false) {
  const s = createShooter(), sim = createDroneSim(s), ctx = createDroneContext();
  for (let i = 0; i < s.drones.count; i++) if (i !== 1) { s.drones.phase[i] = PHASE.dead; sim.respawnAt[i] = Infinity; }
  s.drones.phase[1] = PHASE.alert; s.drones.hp[1] = 1; Object.assign(ctx, { tier: 'mouse', reduced });
  return { s, sim, ctx, cursor: { last: 0 } };
}
type Rig = ReturnType<typeof rig>;
function frame(r: Rig) { r.ctx.dt = DT; r.s.clock += DT; advanceDrones(r.s, r.sim, r.ctx, clear); }
/** Kills drone 1 and steps to its burst FX; returns the flash on the kill frame, every dying frame, and the burst frame. */
function kill(r: Rig) {
  expect(damageDrone(r.s, r.sim, 1, false, dir)).toBe('kill');
  const f = r.s.drones, atKill = f.flash[1], dying: number[] = []; let burst = NaN;
  for (let k = 0; k < 20 && Number.isNaN(burst); k++) {
    frame(r);
    readEvents(r.s, r.cursor, e => { if (e.kind === 'burst') burst = f.flash[1]; });
    if (Number.isNaN(burst)) dying.push(f.flash[1]);
  }
  return { atKill, dying, burst };
}
describe('the kill flash holds through the hit-stop', () => {
  it('is 1.0 on the kill frame, every frame of the hit-stop, and the frame the burst FX spawn (was 0.66 and 0.12)', () => {
    const k = kill(rig());
    expect(k.atKill).toBe(1); expect(k.burst).toBe(1);
    expect(k.dying.length).toBe(Math.round(DRONE.hitStop / DT) - 1); // 4 frames before the burst frame at 80 ms
    for (const flash of k.dying) expect(flash).toBe(1);
  });
  it('still gates the flash: a kill inside a burst of 3 flashes in 1 s keeps the gated (low) value, never a new white peak', () => {
    const r = rig(); r.s.drones.hp[1] = 100;
    for (let k = 0; k < 3; k++) { damageDrone(r.s, r.sim, 1, false, dir); for (let n = 0; n < 6; n++) frame(r); } // 3 flashes over .3 s
    const before = r.s.drones.flash[1]; expect(before).toBeLessThan(.2);
    r.s.drones.hp[1] = 1; const k = kill(r);
    expect(k.atKill).toBeCloseTo(before, 12); expect(k.burst).toBeCloseTo(before, 12); // held, not raised
  });
  it('under reduced motion the flash decays exactly as before (no longer white than the unpatched brain)', () => {
    const k = kill(rig(true));
    expect(k.atKill).toBe(1);
    k.dying.forEach((flash, n) => expect(flash).toBeCloseTo(Math.exp(-DRONE.flashDecay * DT * (n + 1)), 6)); // 0.66 on the first frame after the hit
    expect(k.burst).toBeLessThan(.13);
  });
  it('after the burst the flash still fades to exact rest', () => {
    const r = rig(); kill(r);
    for (let n = 0; n < 60; n++) frame(r);
    expect(r.s.drones.flash[1]).toBe(0);
  });
});
