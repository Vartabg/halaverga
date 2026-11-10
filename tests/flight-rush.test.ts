import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createShooter } from '../src/game/combat';
import { diveFov, rumble, speedFovTarget } from '../src/game/cameraFx';
import { RUSH, streakLength, streakStrength, vapourStrength } from '../src/world/rushData';
import { createRibbon } from '../src/world/ribbon';
import { flameGeometry } from '../src/world/swordBlade';
import { aheadOf, WATCH_AHEAD } from '../src/game/combatCamera';

describe('the rush of flight', () => {
  it('streaks the air only at speed, more the faster, and never under reduced motion', () => {
    expect(streakStrength(0, false)).toBe(0); expect(streakStrength(RUSH.from, false)).toBe(0);
    expect(streakStrength(50, false)).toBeGreaterThan(.1); expect(streakStrength(RUSH.full, false)).toBe(1); expect(streakStrength(200, false)).toBe(1);
    for (let v = RUSH.from; v < RUSH.full; v += 4) expect(streakStrength(v + 4, false)).toBeGreaterThan(streakStrength(v, false));
    expect(streakStrength(120, true)).toBe(0); expect(streakLength(80)).toBeGreaterThan(streakLength(30));
  });
  it('pulls vapour off the wingtips at speed, sooner in a hard turn, and never while slow or under reduced motion', () => {
    expect(vapourStrength(20, 2, false)).toBe(0); expect(vapourStrength(60, 0, false)).toBeGreaterThan(0);
    expect(vapourStrength(60, 1.2, false)).toBeGreaterThan(vapourStrength(60, 0, false) * 1.8);
    expect(vapourStrength(140, 3, false)).toBe(1); expect(vapourStrength(140, 3, true)).toBe(0);
  });
  it('opens the view further only in a dive, and leaves cruising as it was', () => {
    expect(diveFov(100)).toBe(0); expect(diveFov(130)).toBe(6); expect(diveFov(400)).toBe(6);
    expect(speedFovTarget(100, false)).toBe(75); expect(speedFovTarget(130, false)).toBe(81); expect(speedFovTarget(130, true)).toBe(65);
  });
  it('shakes the view a little at speed as a floor under the hit shake, and leaves a slow angel exactly at rest', () => {
    const fx = createShooter().camFx;
    rumble(fx, 0); expect(fx.trauma).toBe(0); rumble(fx, 45); expect(fx.trauma).toBe(0);
    rumble(fx, 77); expect(fx.trauma).toBeCloseTo(.2, 6); rumble(fx, 300); expect(fx.trauma).toBe(.24);
    fx.trauma = .8; rumble(fx, 300); expect(fx.trauma).toBe(.8); // never lowers a harder shake
  });
  it('is mounted in the scene, and the suit publishes its wingtips', () => {
    expect(readFileSync('src/world/Scene.tsx', 'utf8')).toContain('<FlightRush />');
    expect(readFileSync('src/world/Suit.tsx', 'utf8')).toContain('wingTips.live = rig.root.visible && state.flying;');
    expect(readFileSync('src/game/Shooter.tsx', 'utf8')).toContain('rumble(runtime.shooter.camFx, runtime.speed)');
  });
});
describe('a trail ribbon', () => {
  const colour = (r: ReturnType<typeof createRibbon>, section: number) => (r.mesh.geometry.attributes.color.array as Float32Array)[section * 6];
  const place = (r: ReturnType<typeof createRibbon>, section: number) => (r.mesh.geometry.attributes.position.array as Float32Array)[section * 6];
  it('draws the newest section first and fades each with its age', () => {
    const r = createRibbon(6, '#ffffff');
    for (let x = 1; x <= 3; x++) { r.push(x, 0, 0, x, 1, 0); r.update(.05, .2); }
    expect(r.mesh.visible).toBe(true); expect(r.count).toBe(3);
    expect(place(r, 0)).toBe(3); expect(place(r, 1)).toBe(2); expect(place(r, 2)).toBe(1);
    expect(colour(r, 0)).toBeGreaterThan(colour(r, 1)); expect(colour(r, 1)).toBeGreaterThan(colour(r, 2));
    expect(place(r, 5)).toBe(1); expect(colour(r, 5)).toBe(0); // unused sections fold onto the oldest and stay dark
    r.dispose();
  });
  it('goes dark and empties once everything in it has aged out, and a weak section is drawn weak', () => {
    const r = createRibbon(6, '#ffffff');
    r.push(0, 0, 0, 0, 1, 0, 1); r.push(1, 0, 0, 1, 1, 0, .25); r.update(.01, .2);
    expect(colour(r, 0)).toBeLessThan(colour(r, 1)); // the newer one was pushed at a quarter strength
    r.update(.3, .2); expect(r.mesh.visible).toBe(false); expect(r.count).toBe(0);
    r.push(5, 0, 0, 5, 1, 0); r.clear(); expect(r.count).toBe(0);
    r.dispose();
  });
  it('moves its newest section without adding one, so a trail sampled on a fixed step keeps its head on the blade', () => {
    const r = createRibbon(6, '#ffffff');
    r.lead(9, 0, 0, 9, 1, 0); expect(r.count).toBe(0); // nothing to move yet
    r.push(1, 0, 0, 1, 1, 0); r.lead(2, 0, 0, 2, 1, 0); r.update(.01, .2);
    expect(r.count).toBe(1); expect(place(r, 0)).toBe(2);
    r.dispose();
  });
  it('samples the trails on a fixed step, the same on a 60 and a 120 Hz screen', () => {
    const rush = readFileSync('src/world/FlightRush.tsx', 'utf8'), sword = readFileSync('src/world/FlamingSword.tsx', 'utf8');
    expect(rush).toContain('const sample = parts.since >= RUSH.step'); expect(rush).toContain('trail.lead(');
    expect(sword).toContain('if (sword.since < TRAIL.step) trail.lead('); expect(RUSH.step).toBeCloseTo(1 / 60, 9);
    expect(28 * RUSH.step).toBeGreaterThan(RUSH.life); // the vapour ribbon holds its whole life
  });
  it('shapes the blade as a diamond section, widest at the guard', () => {
    const g = flameGeometry(), p = g.attributes.position.array as Float32Array; let top = -Infinity, wideTop = 0, edge = false, ridge = false, low = Infinity;
    for (let i = 0; i < p.length; i += 3) { top = Math.max(top, p[i + 1]); low = Math.min(low, p[i + 1]); }
    let wideMid = 0;
    for (let i = 0; i < p.length; i += 3) {
      const x = Math.abs(p[i]), y = p[i + 1], z = Math.abs(p[i + 2]);
      if (y > top - .01) { wideTop = Math.max(wideTop, x); if (z < 1e-6 && x > .05) edge = true; if (x < 1e-6 && z > .01) ridge = true; }
      else if (y > low + .2) wideMid = Math.max(wideMid, x);
    }
    expect(edge).toBe(true); expect(ridge).toBe(true); // an edge to each side, a ridge down each face
    expect(wideTop).toBeGreaterThan(wideMid); // it tapers away from the guard
    g.dispose();
  });
  it('follows a cast-down demon only while it is ahead of the pilot', () => {
    const at = { x: 0, y: 0, z: 0 };
    expect(aheadOf(0, at, { x: 0, y: -20, z: -30 })).toBeCloseTo(30, 6); expect(aheadOf(0, at, { x: 0, y: 0, z: 12 })).toBeCloseTo(-12, 6);
    expect(aheadOf(Math.PI / 2, at, { x: -8, y: 0, z: 0 })).toBeCloseTo(8, 6); expect(WATCH_AHEAD).toBeGreaterThan(0);
    const rig = readFileSync('src/game/CameraRig.tsx', 'utf8');
    expect(rig).toContain('aheadOf(runtime.yaw, pose.position, shooter.drones.pos[cast]) > WATCH_AHEAD');
    expect(rig).toContain('if (frame.tracking && !watching) { runtime.yaw = frame.yaw; runtime.pitch = frame.pitch; }'); // the pilot is not turned
  });
  it('gives the sword its trail and keeps the flame out of reduced motion', () => {
    const sword = readFileSync('src/world/FlamingSword.tsx', 'utf8'), blade = readFileSync('src/world/swordBlade.ts', 'utf8');
    for (const part of ['createRibbon(TRAIL.sections', 'presentation.position', 'if (!hand || state.reduced || state.camera !== \'third\') { trail.clear()', '!state.paused && !state.reduced) sword.fire.uniforms.uTime.value = (sword.fire.uniforms.uTime.value + dt) % 600']) expect(sword, part).toContain(part);
    for (const part of ['uniform float uFlare', 'gl_FragColor', 'AdditiveBlending', 'export const BLADE = 1.22']) expect(blade, part).toContain(part);
  });
});
