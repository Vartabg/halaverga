import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { makeCity } from '../src/world/cityData';
import { surfaces } from '../src/world/kit';
import { INK, INK_GROUP, INK_SKY, paintInkMaterial } from '../src/world/paintInk';

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
  it('keeps the paint texture-free with a toon ramp and chromatic sky fill', () => {
    expect(surfaces[INK_GROUP]).toBe('ink');
    const ink = paintInkMaterial();
    expect(ink.map).toBeNull(); expect(ink.normalMap).toBeNull(); expect(ink.gradientMap).toBeTruthy(); expect(ink.toneMapped).toBe(false);
    const source = readFileSync('src/world/paintInk.ts', 'utf8');
    expect(source).toContain('indirectDiffuse *= ${INK_SKY}'); expect(source).toContain('inkFade');
    expect(source).not.toContain('cragStrata'); expect(INK_SKY).toBe(0.28);
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
