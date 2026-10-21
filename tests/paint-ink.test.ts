import { readFileSync } from 'node:fs';
import { Color } from 'three';
import { describe, expect, it } from 'vitest';
import { makeCity } from '../src/world/cityData';
import { surfaces } from '../src/world/kit';
import { INK, INK_GROUP, INK_SKY, paintInkMaterial } from '../src/world/paintInk';

/** Counts indexed vertices in one material group whose position matches. */
function inGroup(city: ReturnType<typeof makeCity>, group: number, pred: (x: number, y: number, z: number) => boolean) {
  const geometry = city.geometry;
  const slot = geometry.groups.find(item => item.materialIndex === group);
  if (!slot || !geometry.index) return 0;
  const index = geometry.index.array;
  const position = geometry.attributes.position;
  let count = 0;
  for (let i = slot.start; i < slot.start + slot.count; i++) {
    const vertex = index[i];
    if (pred(position.getX(vertex), position.getY(vertex), position.getZ(vertex))) count++;
  }
  return count;
}

describe('painted arrival rock and steles', () => {
  it('puts the paint on its own group and leaves the photo concrete on the stone', () => {
    expect(surfaces[INK_GROUP]).toBe('ink');
    const mats = readFileSync('src/world/cityMaterials.ts', 'utf8');
    expect(mats).toContain('concrete_floor_02_diff_1k.jpg');
    const ink = paintInkMaterial();
    expect(ink.map).toBeNull();
    expect(ink.normalMap).toBeNull();
    expect(ink.gradientMap).toBeTruthy();
    expect(ink.toneMapped).toBe(false);
    expect(readFileSync('src/world/paintInk.ts', 'utf8')).toContain('indirectDiffuse *= ${INK_SKY}');
    expect(INK_SKY).toBe(0.28);
    ink.dispose();
  });

  it('paints the terrace under the hero and a gate stele, and leaves a road deck on the photo ground', () => {
    const city = makeCity();
    const lit = new Color(INK.lit);
    const rock = new Color(INK.rock);
    // Box corners only: the terrace mass is 24 by 2 by 20 at y 19, the lit top is a thinner slab just above it.
    const mass = (x: number, y: number, z: number) => Math.abs(Math.abs(x) - 12) < 0.01 && Math.abs(y - 20) < 0.01 && Math.abs(z - 75) < 0.01;
    const top = (x: number, y: number, z: number) => Math.abs(Math.abs(x) - 11.4) < 0.01 && y > 20.05 && Math.abs(Math.abs(z - 65) - 9.4) < 0.01;
    expect(inGroup(city, INK_GROUP, mass)).toBeGreaterThan(0);
    expect(inGroup(city, INK_GROUP, top)).toBeGreaterThan(0);
    expect(inGroup(city, 3, top)).toBe(0);
    // A corner of the east road deck (centre 76, 1.8, -32, 116 by 0.5 by 240). It stays on the photo ground.
    expect(inGroup(city, 3, (x, y, z) => Math.abs(x - 134) < 0.01 && Math.abs(y - 2.05) < 0.01 && Math.abs(z - 88) < 0.01)).toBeGreaterThan(0);
    expect(inGroup(city, INK_GROUP, (x, y, z) => Math.abs(x + 26) < 4 && Math.abs(z - 70) < 4 && y > 10 && y < 40)).toBeGreaterThan(0);
    const color = city.geometry.attributes.color;
    const position = city.geometry.attributes.position;
    let sawLit = false;
    let sawRock = false;
    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i), y = position.getY(i), z = position.getZ(i);
      if (!sawLit && top(x, y, z)) {
        expect(color.getX(i)).toBeCloseTo(lit.r, 3);
        expect(color.getY(i)).toBeCloseTo(lit.g, 3);
        expect(color.getZ(i)).toBeCloseTo(lit.b, 3);
        sawLit = true;
      }
      if (!sawRock && mass(x, y, z)) {
        expect(color.getX(i)).toBeCloseTo(rock.r, 3);
        expect(color.getY(i)).toBeCloseTo(rock.g, 3);
        expect(color.getZ(i)).toBeCloseTo(rock.b, 3);
        sawRock = true;
      }
    }
    expect(sawLit && sawRock).toBe(true);
    city.geometry.dispose();
  });
});
