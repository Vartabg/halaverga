import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { mulberry32, WATER_LEVEL } from '../src/game/combat';
import { makePuffs, makeSparks } from '../src/world/fxPools';
import { SLAM, slamSize, slamSurface, spawnSlam } from '../src/world/fxSlam';
import { billboard, billboardLit } from '../src/world/fxShaders';

const pools = () => ({ add: makePuffs(32), alpha: makePuffs(64), rings: makePuffs(12), sparks: makeSparks(200) });
const strike = (c: { x: number; y: number; z: number }, n: { x: number; y: number; z: number }, speed: number, reduced = false, floor?: number) => {
  const p = pools(); let chips = 0, stone = 0;
  spawnSlam(p, (_c, _a, _b, _u, _s, _h, rock) => { chips++; if (rock) stone++; }, 5, c, n, speed, WATER_LEVEL, floor ?? c.y, 1, mulberry32(11), reduced);
  return { dust: p.alpha.next, rings: p.rings.next, embers: p.sparks.next, glow: p.add.next, chips, stone, p };
};
const UP = { x: 0, y: 1, z: 0 }, FACE = { x: -1, y: 0, z: 0 };
describe('what a thrown demon throws up where it strikes', () => {
  it('tells water, ground and cliff apart from where and how it struck', () => {
    expect(slamSurface(WATER_LEVEL, 1, WATER_LEVEL)).toBe('water'); expect(slamSurface(20, 1, WATER_LEVEL)).toBe('ground');
    expect(slamSurface(20, .7, WATER_LEVEL)).toBe('ground'); expect(slamSurface(30, 0, WATER_LEVEL)).toBe('wall');
    expect(slamSurface(WATER_LEVEL, .2, WATER_LEVEL)).toBe('wall'); // a bank at the water line is still a bank
    expect(slamSurface(WATER_LEVEL - 2, .7, WATER_LEVEL)).toBe('water'); // water beside a bank: the bank tilts the normal, the water is still water
    expect(slamSurface(WATER_LEVEL + .2, 1, WATER_LEVEL)).toBe('ground'); // a level shore just above the water line is dry
  });
  it('draws a harder strike bigger, within bounds', () => {
    expect(slamSize(0)).toBe(.8); expect(slamSize(SLAM.full)).toBe(1); expect(slamSize(500)).toBe(1.4);
    expect(slamSize(36)).toBeGreaterThan(slamSize(20));
  });
  it('raises dust, chips of rock and embers from the ground, and no spray', () => {
    const hit = strike({ x: 0, y: 20, z: 60 }, UP, 60);
    expect(hit.dust).toBe(3 + SLAM.dust); expect(hit.chips).toBe(SLAM.chips); expect(hit.stone).toBe(SLAM.chips); // chips of the mountain, not of a demon expect(hit.embers).toBe(SLAM.embers); expect(hit.rings).toBe(0);
    expect(hit.glow).toBe(0); // nothing bright: dust is alpha-blended, so a landing adds no flash
  });
  it('blows a smaller cloud off a cliff face, pushed away from the rock', () => {
    const hit = strike({ x: 7, y: 30, z: -40 }, FACE, 60);
    expect(hit.dust).toBe(2 + 4); expect(hit.chips).toBe(6); expect(hit.rings).toBe(0);
    expect(hit.p.alpha.d[17]).toBeLessThan(0); // the first cloud drifts along the face's normal (-x)
    let up = 0, down = 0;
    for (let i = 0; i < hit.dust; i++) {
      const o = i * 23, d = hit.p.alpha.d;
      expect(d[o + 2]).toBeLessThan(7); expect(d[o + 5]).toBe(0); // every cloud stands off the face, on the open side, and none climbs through it
      if (i >= 2) { expect(d[o + 17]).toBeCloseTo(-14, 5); if (d[o + 18] > 1) up++; if (d[o + 18] < -1) down++; } // the skirt leaves the face and spreads along it
    }
    expect(up).toBeGreaterThan(0); expect(down).toBeGreaterThan(0);
  });
  it('throws a column of spray and widening rings from the water, with no rock', () => {
    const hit = strike({ x: 0, y: WATER_LEVEL, z: 0 }, UP, 60);
    expect(hit.rings).toBe(SLAM.rings); expect(hit.chips).toBe(0); expect(hit.embers).toBe(0); expect(hit.dust).toBe(2 + SLAM.dust);
    expect(hit.p.alpha.d[5]).toBeGreaterThan(5); // the column rises fast
    const bank = strike({ x: 0, y: WATER_LEVEL + .1, z: 0 }, { x: .6, y: .8, z: 0 }, 60, false, WATER_LEVEL - 2); // beside a bank
    expect(bank.rings).toBe(SLAM.rings); expect(bank.chips).toBe(0); expect(bank.p.alpha.d[2]).toBe(0); // still a splash, and it stands straight up
  });
  it('stands every cloud on the surface, so the ground or the water never cuts its body away', () => {
    const dust = strike({ x: 0, y: 20, z: 60 }, UP, 60), splash = strike({ x: 0, y: WATER_LEVEL, z: 0 }, UP, 60);
    for (let i = 0; i < dust.dust; i++) {
      const o = i * 23, size = dust.p.alpha.d[o + 6] * dust.p.alpha.d[o + 8];
      expect(dust.p.alpha.d[o + 3] - 20).toBeCloseTo(SLAM.sit * size, 5); expect(dust.p.alpha.d[o + 5]).toBeGreaterThan(0); // and it climbs as it grows
    }
    for (let i = 0; i < splash.dust; i++) expect(splash.p.alpha.d[i * 23 + 3]).toBeGreaterThan(WATER_LEVEL + .5);
    const still = strike({ x: 0, y: 20, z: 60 }, UP, 60, true).p.alpha.d;
    expect(still[3] - 20).toBeCloseTo(SLAM.sit * still[7], 5); // reduced motion: lifted clear at its final size instead of climbing
  });
  it('keeps to one still cloud under reduced motion', () => {
    for (const hit of [strike({ x: 0, y: 20, z: 60 }, UP, 60, true), strike({ x: 7, y: 30, z: -40 }, FACE, 60, true)]) {
      expect(hit.dust).toBe(1); expect(hit.chips).toBe(0); expect(hit.embers).toBe(0); expect(hit.p.alpha.d[5]).toBe(0); expect(hit.p.alpha.d[17]).toBe(0);
    }
    const splash = strike({ x: 0, y: WATER_LEVEL, z: 0 }, UP, 60, true);
    expect(splash.dust).toBe(2); expect(splash.rings).toBe(0); expect(splash.p.alpha.d[5]).toBe(0);
  });
  it('is spawned by the effect layer from the fight\'s own strikes, with sparks where the blade connects', () => {
    const fx = readFileSync('src/world/ImpactFx.tsx', 'utf8');
    expect(fx).toContain('if (e.kind === HIT.impact)'); expect(fx).toContain('spawnSlam(pools, addDebris, t, e.to, n, e.n, WATER_LEVEL, heightAt(e.to.x, e.to.z), gainAt(e.to), rng, reduced)');
    expect(fx).toContain('else if (e.kind === HIT.sword)'); expect(fx).toContain('burstSparks(sp, t, p, dir, reduced ? 3 : 7 + 4 * e.n, rng)');
    expect(fx).toContain('p.x = e.to.x + dir.x * NEAR'); // from the side of the demon that faces the angel, not from inside it
  });
  it('fills a dense puff in solid without changing how a puff at alpha 1 or less draws', () => {
    const make = () => ({ vertexShader: '#include <common>\n#include <project_vertex>', fragmentShader: '#include <common>\n#include <color_fragment>' });
    const plain = make(), lit = make();
    billboard(plain as never); billboardLit(lit as never);
    expect(plain.fragmentShader).toContain('diffuseColor.a = min(1., diffuseColor.a * vAlpha);');
    // The lit edge must still be spliced in (it replaces the line billboard writes): own colour wherever density fills the disc in.
    expect(lit.fragmentShader).toContain('sqrt(clamp(diffuseColor.a * max(1., vAlpha), 0., 1.))'); expect(lit.fragmentShader).toContain('diffuseColor.a = min(1., diffuseColor.a * vAlpha);');
    expect(lit.fragmentShader.split('diffuseColor.a = min(').length).toBe(2);
  });
});
