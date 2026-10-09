import { describe, expect, it } from 'vitest';
import { DRONE_RADIUS, PHASE, createShooter, type Vec3 } from '../src/game/combat';
import { startTelegraph } from '../src/game/droneDodge';
import { advanceDrones, createDroneContext, createDroneSim } from '../src/game/drones';

const P: Vec3 = { x: 0, y: 30, z: 0 };
/** A plane wall at x = W with ShooterWorld.lineClear semantics: the cast stops .5 m short of b. */
const wallAt = (W: number) => (a: Vec3, b: Vec3) => {
  const x = b.x - a.x, l = Math.hypot(x, b.y - a.y, b.z - a.z), max = l - .5;
  if (!(max > 0)) return true;
  return a.x < W && a.x + x / l * max < W;
};

/** Runs one dodge of drone 1 (camera aiming along -z, drone right of the ray) against a wall at W; returns the final side. */
function dodgeAgainst(W: number) {
  const s = createShooter(), sim = createDroneSim(s), ctx = createDroneContext(), f = s.drones, clear = wallAt(W);
  for (let i = 0; i < f.count; i++) if (i !== 1) { f.phase[i] = PHASE.dead; sim.respawnAt[i] = Infinity; }
  f.phase[1] = PHASE.alert; f.phaseT[1] = 0; f.cooldown[1] = 0; f.dwell[1] = 0;
  for (const v of [f.pos[1], f.home[1], f.anchor[1], sim.prev[1]]) { v.x = P.x; v.y = P.y; v.z = P.z; }
  Object.assign(ctx, { tier: 'mouse', threat: false });
  ctx.camera.x = -.3; ctx.camera.y = 30; ctx.camera.z = 30; ctx.player.x = -.3; ctx.player.y = 29.5; ctx.player.z = 30;
  ctx.aimDir.x = 0; ctx.aimDir.y = 0; ctx.aimDir.z = -1;
  if (!startTelegraph(s, sim, ctx, 1, clear)) return { started: false, side: 0, pos: { ...f.pos[1] } };
  for (let t = 0; t < 2 && f.phase[1] !== PHASE.punish; t += 1 / 60) { ctx.dt = 1 / 60; s.clock += ctx.dt; advanceDrones(s, sim, ctx, clear); }
  expect(f.phase[1]).toBe(PHASE.punish);
  return { started: true, side: f.side[1], pos: { ...f.pos[1] } };
}

describe('drone dodge clearance', () => {
  it('never ends with its hit sphere inside a wall beside the dodge (walls 4.0 to 6.0 m away)', () => {
    let toward = 0;
    for (let k = 0; k <= 40; k++) {
      const W = 4 + k * .05, r = dodgeAgainst(W);
      if (!r.started) continue;
      if (r.side === 1) toward++;
      expect(W - r.pos.x).toBeGreaterThanOrEqual(DRONE_RADIUS + .1);
    }
    expect(toward).toBeGreaterThan(0);
  });
  it('turns away from a wall 4.51 m to its right and keeps the far side at 5.6 m clear', () => {
    expect(dodgeAgainst(4.51).side).toBe(-1);
    expect(dodgeAgainst(5.0).side).toBe(-1);
    const far = dodgeAgainst(5.11);
    expect(far.side).toBe(1); expect(5.11 - far.pos.x).toBeGreaterThanOrEqual(1.1 - 1e-9);
  });
});
