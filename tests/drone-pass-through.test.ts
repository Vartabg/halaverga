import { describe, expect, it } from 'vitest';
import { PHASE, createShooter, type Vec3 } from '../src/game/combat';
import { CHASE_BOOM, CHASE_HEAD } from '../src/game/presentation';
import { advanceDrones, createDroneContext, createDroneSim } from '../src/game/drones';
// Dynamics review S2 (2026-09-28): flying through an alerted drone. Before: eye slew 16 rad/s, drone acceleration 46-171 m/s2, the
// chase camera (CHASE_BOOM, 5.3 m behind the hero) passing 2.2-3.6 m from it (per pass: 0.70 m at worst). The push now starts at 9 m plus 0.35 s of camera speed. Real advanceDrones; the hero flies straight at the drone at a
// given speed with a lateral offset. Node math, not iPhone validation.
const DT = 1 / 60, clear = () => true;
type Run = { maxAccel: number; maxSlew: number; minCam: number; minPlayer: number; sideFlips: number };
const angle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
function pass(speed: number, lateral: number, k: number): Run {
  const s = createShooter(), sim = createDroneSim(s, 900 + k), ctx = createDroneContext(), f = s.drones;
  for (let i = 0; i < f.count; i++) if (i !== 1) { f.phase[i] = PHASE.dead; sim.respawnAt[i] = Infinity; }
  const a = k / 20 * 2 * Math.PI, start: Vec3 = { x: lateral * Math.cos(a), y: 30 + lateral * Math.sin(a) * .6, z: -45 };
  f.phase[1] = PHASE.alert; f.phaseT[1] = 0; f.cooldown[1] = 0; f.dwell[1] = 0; f.hp[1] = 6; f.los[1] = 1; f.losT[1] = .2;
  for (const v of [f.pos[1], f.home[1], f.anchor[1], sim.prev[1]]) Object.assign(v, start);
  f.yaw[1] = f.pitch[1] = 0;
  Object.assign(ctx, { tier: 'touch', threat: false, dt: DT });
  ctx.aimDir.x = 0; ctx.aimDir.y = 0; ctx.aimDir.z = -1;
  const player = { x: 0, y: 30, z: 0 }, out: Run = { maxAccel: 0, maxSlew: 0, minCam: 1e9, minPlayer: 1e9, sideFlips: 0 };
  let lastV = { x: 0, y: 0, z: 0 }, lastYaw = f.yaw[1], lastPitch = f.pitch[1], lastSign = 0;
  for (let n = 0; n < 60 * 6; n++) {
    player.z -= speed * DT;
    Object.assign(ctx.player, player); // The published chase camera, flying along -z: the head plus the boom (CameraRig hangs it 5.3 m behind).
    Object.assign(ctx.camera, { x: player.x + CHASE_BOOM.x, y: player.y + CHASE_HEAD + CHASE_BOOM.y, z: player.z + CHASE_BOOM.z });
    s.clock += DT; advanceDrones(s, sim, ctx, clear);
    const p = f.pos[1], v = sim.vel[1];
    if (n > 5) out.maxAccel = Math.max(out.maxAccel, Math.hypot(v.x - lastV.x, v.y - lastV.y, v.z - lastV.z) / DT);
    out.maxSlew = Math.max(out.maxSlew, Math.abs(angle(f.yaw[1] - lastYaw)) / DT, Math.abs(angle(f.pitch[1] - lastPitch)) / DT);
    lastV = { ...v }; lastYaw = f.yaw[1]; lastPitch = f.pitch[1];
    out.minCam = Math.min(out.minCam, Math.hypot(p.x - ctx.camera.x, p.y - ctx.camera.y, p.z - ctx.camera.z));
    out.minPlayer = Math.min(out.minPlayer, Math.hypot(p.x - player.x, p.y - player.y, p.z - player.z));
    const sign = Math.sign(p.x - player.x); if (sign && lastSign && sign !== lastSign) out.sideFlips++; if (sign) lastSign = sign;
    if (p.z > player.z + 20) break;
  }
  return out;
}
const cell = (speed: number, lateral: number) => Array.from({ length: 20 }, (_, k) => pass(speed, lateral, k));
const mean = (r: Run[], key: keyof Run) => r.reduce((t, x) => t + x[key], 0) / r.length;
const cells = [13, 34].flatMap(speed => [0, 1, 2, 4].map(lateral => ({ speed, lateral, runs: cell(speed, lateral) })));
describe('flying through an alerted drone', () => {
  it('the eye never slews faster than 5 rad/s (was 16 rad/s, about 930 deg/s)', () => {
    for (const c of cells) for (const r of c.runs) expect(r.maxSlew).toBeLessThanOrEqual(5 + 1e-4) // the angles are Float32;
  });
  it('the drone never accelerates faster than 40 m/s2 (was 46-60 at 13 m/s and 72-171 at 34 m/s)', () => {
    for (const c of cells) for (const r of c.runs) expect(r.maxAccel).toBeLessThanOrEqual(40 + 1e-6);
  });
  it('in every single pass the chase camera keeps at least 4.6 m from it, at 13 and at 34 m/s (per-run minima, not means: the first patch left 3.80 m at 13 m/s and 0.26 m at 34)', () => {
    for (const c of cells) for (const r of c.runs) expect(r.minCam).toBeGreaterThanOrEqual(4.6);
  });
  it('and the hero itself clears it by 3.5 m in every pass (was 0.80 m at 34 m/s after the first patch)', () => {
    for (const c of cells) for (const r of c.runs) expect(r.minPlayer).toBeGreaterThanOrEqual(3.5);
  });
  it('it still steps aside as before: side flips per pass are no higher than the unpatched brain (2, 1.55, 1.5, .7 at 13 m/s; 1, .55, .55, .3 at 34)', () => {
    const before = [2, 1.55, 1.5, .7, 1, .55, .55, .3];
    cells.forEach((c, n) => expect(mean(c.runs, 'sideFlips')).toBeLessThanOrEqual(before[n] + .05));
  });
});
