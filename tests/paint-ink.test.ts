import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { makeCity } from '../src/world/cityData';
import { surfaces } from '../src/world/kit';
import { INK, INK_GROUP, INK_SKY, paintInkMaterial } from '../src/world/paintInk';
import { STONE_SAT, sharedTerrain, srgbSaturation } from '../src/world/terrainArt';
import { BRONZE } from '../src/world/villageCourt';

function inkVertices(city: ReturnType<typeof makeCity>, pred: (x: number, y: number, z: number) => boolean) {
  const geometry = city.geometry, position = geometry.attributes.position;
  const slots = geometry.groups.filter(g => g.materialIndex === INK_GROUP);
  if (!geometry.index) return 0;
  let count = 0;
  for (const slot of slots) for (let i = slot.start; i < slot.start + slot.count; i++) {
    const vertex = geometry.index.array[i];
    if (pred(position.getX(vertex), position.getY(vertex), position.getZ(vertex))) count++;
  }
  return count;
}

describe('painted Hermon rock and steles', () => {
  it('paints with a toon ramp and chromatic sky fill, and takes the rock and snow maps through uniforms, not a map slot', () => {
    expect(surfaces[INK_GROUP]).toBe('ink');
    const ink = paintInkMaterial(sharedTerrain);
    expect(ink.map).toBeNull(); expect(ink.normalMap).toBeNull(); expect(ink.gradientMap).toBeTruthy(); expect(ink.toneMapped).toBe(false);
    const source = readFileSync('src/world/paintInk.ts', 'utf8');
    expect(source).toContain('indirectDiffuse *= ${INK_SKY}'); expect(source).toContain('inkFade');
    expect(source).not.toContain('cragStrata'); expect(INK_SKY).toBe(0.28);
    // the albedo is set before the lights, and the soft cel and ink constants follow tK (0 until the maps load)
    expect(source.indexOf('terrainFragment(wholeTerrain)')).toBeLessThan(source.indexOf('#include <lights_toon_fragment>`'));
    for (const part of ['mix(0.92, 0.4, tK)', 'mix(0.90, 0.6, tK)']) expect(source).toContain(part);
    ink.dispose();
  });
  it('uses continuous terrain under the hero, with authored ink only on sanctuaries and steles', () => {
    const city = makeCity(), terrain = city.terrains.find(t => t.id === 'hermon-near')!;
    let arrival = false;
    for (let i = 0; i < terrain.vertices.length; i += 3) {
      if (Math.abs(terrain.vertices[i]) < 1 && Math.abs(terrain.vertices[i + 1] - 20) < .01 && Math.abs(terrain.vertices[i + 2] - 65) < 1) arrival = true;
    }
    expect(arrival).toBe(true);
    expect(inkVertices(city, (x, y, z) => Math.abs(x - 30) < 3 && Math.abs(y - 61.44) < .03 && Math.abs(z + 38) < 3)).toBeGreaterThan(0);
    expect(inkVertices(city, (x, y, z) => Math.abs(x + 26) < 4 && Math.abs(z - 48) < 4 && y > 10 && y < 40)).toBeGreaterThan(0);
    expect(inkVertices(city, (x, y, z) => Math.abs(x - 134) < .01 && Math.abs(y - 2.05) < .01 && Math.abs(z - 88) < .01)).toBe(0);
    city.geometry.dispose(); city.terrains.forEach(t => t.geometry.dispose());
  });
});

describe('which ink colours become limestone (sRGB saturation, as the shader measures it)', () => {
  it('textures the stone colours, including INK.rock and INK.plinth, and leaves the accents alone', () => {
    for (const name of ['rock', 'plinth', 'shaft', 'lit', 'cap'] as const) expect(srgbSaturation(INK[name]), name).toBeLessThan(STONE_SAT[0]);
    for (const name of ['crown', 'ember', 'jade', 'broken'] as const) expect(srgbSaturation(INK[name]), name).toBeGreaterThan(STONE_SAT[1]);
    expect(srgbSaturation(BRONZE), 'court bronze').toBeGreaterThan(STONE_SAT[1]);
  });
});
