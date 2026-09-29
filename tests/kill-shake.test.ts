import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PHASE, createShooter, tapShot, type Vec3 } from '../src/game/combat';
import { createAssistMemory } from '../src/game/aimAssist';
import { createDroneSim } from '../src/game/drones';
import { createStepContext, stepShooter } from '../src/game/shooterStep';
import { resetBurst } from '../src/game/burst';
// Dynamics review S5 (2026-09-28): a kill at tap range had no camera feedback (trauma .45 x (1 - d/20): 0.68 px at 6 m, 0.24 px at
// 10 m, nothing from 20 m; real tap kills land at a median 27-67 m). Now .6 trauma flat to 40 m, tapering to 0 at 70 m. Real shot path
// (stepShooter -> fireShot -> damageDrone), node math; the peak is read off camFx, the angle CameraRig applies after publishing the ray.
const DEG = Math.PI / 180, PX_PER_DEG = 844 / 2 / Math.tan(65 * DEG / 2) * DEG, ORIGIN: Vec3 = { x: 0, y: 30, z: 80 };
/** One-shot kill of a drone `d` m ahead (hp 1, held still by a dead flock); returns the shake peak (deg) and trauma at the kill. */
function killAt(d: number, reduced = false) {
  const s = createShooter(), sim = createDroneSim(s), ctx = createStepContext(), mem = createAssistMemory(), f = s.drones; resetBurst();
  f.count = 1; f.phase[0] = PHASE.alert; f.hp[0] = 1; f.los[0] = 1; f.yaw[0] = f.pitch[0] = 0;
  const at = { x: 0, y: 30, z: 80 - d };
  for (const v of [f.pos[0], f.home[0], f.anchor[0], sim.prev[0]]) Object.assign(v, at);
  const a = s.aim; a.valid = true; Object.assign(a.origin, ORIGIN); Object.assign(a.dir, { x: 0, y: 0, z: -1 }); Object.assign(a.right, { x: 1, y: 0, z: 0 }); Object.assign(a.up, { x: 0, y: 1, z: 0 });
  Object.assign(ctx.head, ORIGIN); Object.assign(ctx.player, ORIGIN); ctx.dt = 1 / 60; ctx.flying = true; ctx.reduced = reduced;
  const world = { castShot: () => false, lineClear: () => true };
  let peak = 0, trauma = 0, ray = 0;
  for (let k = 0; k < 20; k++) stepShooter(s, sim, mem, world, ctx, () => {}); // the flock settles for 1/3 s first
  for (let k = 0; k < 120; k++) {
    if (k === 0 || (s.stats.kills === 0 && k < 40)) { const p = f.pos[0], n = f.knock[0]; Object.assign(a.dir, { x: p.x + n.x - ORIGIN.x, y: p.y + n.y - ORIGIN.y, z: p.z + n.z - ORIGIN.z }); const l = Math.hypot(a.dir.x, a.dir.y, a.dir.z); a.dir.x /= l; a.dir.y /= l; a.dir.z /= l; tapShot(s); }
    stepShooter(s, sim, mem, world, ctx, () => {});
    if (s.stats.kills && !trauma) trauma = s.camFx.trauma;
    if (s.stats.kills) peak = Math.max(peak, Math.abs(s.camFx.shakeP), Math.abs(s.camFx.shakeY));
    ray = Math.max(ray, Math.abs(a.origin.x - ORIGIN.x) + Math.abs(a.origin.y - ORIGIN.y) + Math.abs(a.origin.z - ORIGIN.z));
  }
  return { kills: s.stats.kills, peakDeg: peak / DEG, peakPx: peak / DEG * PX_PER_DEG, trauma, ray };
}
describe('a kill at tap range shakes the camera', () => {
  const near = [6, 10, 20, 30, 40].map(d => killAt(d)), far = killAt(50), out = killAt(70);
  it('kills at every distance, with the same peak flat out to 40 m (0.5 deg, about 6 px on a phone; was 0.68 px at 6 m, 0.24 px at 10 m, 0 from 20 m)', () => {
    for (const k of [...near, far, out]) expect(k.kills).toBe(1);
    for (const k of near) { expect(k.trauma).toBeCloseTo(.6 - 1 / 60, 9); expect(k.peakDeg).toBeCloseTo(near[0].peakDeg, 9); }
    expect(near[0].peakDeg).toBeGreaterThan(.45); expect(near[0].peakDeg).toBeLessThan(.6); expect(near[0].peakPx).toBeGreaterThan(5.5);
  });
  it('tapers past 40 m and is nothing at 70 m', () => {
    expect(far.trauma).toBeGreaterThan(.36); expect(far.trauma).toBeLessThan(.43); // .6 x (70 - d) / 30 at d = 49 m (the hit is on the drone's near side)
     expect(far.peakPx).toBeLessThan(.5 * near[0].peakPx); expect(far.peakPx).toBeGreaterThan(1);
    expect(out.trauma).toBeLessThan(.02); expect(out.peakPx).toBeLessThan(.2); // 0 at a hit 70 m out; the drone's near side is at 69.1 m
    expect(killAt(80).peakDeg).toBe(0);
  });
  it('the published aim ray is never shaken: the shake is applied after the ray is published, and reduced motion gets none', () => {
    for (const k of [...near, far]) expect(k.ray).toBe(0);
    const rig = readFileSync('src/game/CameraRig.tsx', 'utf8');
    expect(rig.indexOf('aim.valid = true')).toBeGreaterThan(0);
    expect(rig.indexOf('camera.quaternion.multiply(shake')).toBeGreaterThan(rig.indexOf('aim.valid = true'));
    expect(rig).toMatch(/fx\.trauma > 0 && !reduced/);
    const still = killAt(20, true); expect(still.kills).toBe(1); expect(still.peakDeg).toBe(0); expect(still.trauma).toBe(0);
  });
});
