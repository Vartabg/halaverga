import { readFileSync } from 'node:fs';
import { afterAll, describe, expect, it } from 'vitest';
import { WORLD } from '@/game/motion';
import { makeCity } from '@/world/cityData';
import { makeField } from '@/world/fieldData';
import { heightAt, MASSIF } from '@/world/massifData';
import { makeSkyline, makeSkylineChunks } from '@/world/skylineData';
import type { TerrainChunk } from '@/world/massifGeometry';

const near = makeCity();
const field = makeField();
const all = [...near.terrains, ...field.terrains];
const key = (x: number, y: number, z: number) => `${x.toFixed(3)},${y.toFixed(3)},${z.toFixed(3)}`;
function edge(chunk: TerrainChunk, axis: 'x' | 'z', value: number, min = -Infinity, max = Infinity, coarse = false) {
  const out: string[] = [];
  for (let i = 0; i < chunk.vertices.length; i += 3) {
    const p: [number, number, number] = [chunk.vertices[i], chunk.vertices[i + 1], chunk.vertices[i + 2]];
    const along = p[axis === 'x' ? 2 : 0];
    if (coarse && Math.abs(along / 10 - Math.round(along / 10)) > .001) continue;
    if (Math.abs(p[axis === 'x' ? 0 : 2] - value) < .001 && along >= min && along <= max) out.push(key(...p));
  }
  return [...new Set(out)].sort();
}
function expectJoined(chunks: TerrainChunk[]) {
  for (let i = 0; i < chunks.length; i++) for (let j = i + 1; j < chunks.length; j++) {
    const a = chunks[i], b = chunks[j];
    if (!a.bounds || !b.bounds) continue;
    for (const axis of ['x', 'z'] as const) {
      const [a0, a1, b0, b1] = axis === 'x' ? [a.bounds.minX, a.bounds.maxX, b.bounds.minX, b.bounds.maxX]
        : [a.bounds.minZ, a.bounds.maxZ, b.bounds.minZ, b.bounds.maxZ];
      const value = Math.abs(a1 - b0) < .001 ? a1 : Math.abs(a0 - b1) < .001 ? a0 : null;
      if (value === null) continue;
      const [aMin, aMax, bMin, bMax] = axis === 'x' ? [a.bounds.minZ, a.bounds.maxZ, b.bounds.minZ, b.bounds.maxZ]
        : [a.bounds.minX, a.bounds.maxX, b.bounds.minX, b.bounds.maxX];
      const min = Math.max(aMin, bMin), max = Math.min(aMax, bMax);
      if (max - min <= 0) continue;
      const coarse = a.step !== b.step;
      expect(edge(a, axis, value, min, max, coarse), `${a.id} ↔ ${b.id}`).toEqual(edge(b, axis, value, min, max, coarse));
    }
  }
}

describe('continuous Hermon massif', () => {
  it('is deterministic and keeps authored landing plateaus and the cloven gorge', () => {
    for (const [x, z] of [[0, 65], [30, -38], [0, 22], [-3, -1], [0, -27], [230, -30]]) {
      expect(heightAt(x, z)).toBe(heightAt(x, z));
      expect(Number.isFinite(heightAt(x, z))).toBe(true);
    }
    expect(heightAt(7, 41, MASSIF.seed)).not.toBe(heightAt(7, 41, 7));
    for (const [x, z] of [[0, 65], [-.55, 64.45], [.55, 65.55]]) expect(heightAt(x, z)).toBe(20);
    for (const [x, z] of [[30, -38], [29.45, -38.55], [30.55, -37.45]]) expect(heightAt(x, z)).toBe(61.415);
    expect(heightAt(0, 22)).toBeLessThan(.1);
    expect(heightAt(-3, -1)).toBeLessThan(.1);
    expect(heightAt(0, -27)).toBeLessThan(3);
  });
  it('uses the same source triangles for every rendered facet and collider', () => {
    for (const chunk of all) {
      const p = chunk.geometry.attributes.position;
      expect(chunk.geometry.index).toBeNull();
      expect(p.count).toBe(chunk.indices.length);
      for (let i = 0; i < chunk.indices.length; i++) {
        const source = chunk.indices[i] * 3;
        for (let axis = 0; axis < 3; axis++) expect(p.array[i * 3 + axis]).toBe(chunk.vertices[source + axis]);
      }
      for (const name of ['position', 'normal', 'color', 'uv']) {
        const values = chunk.geometry.attributes[name].array;
        expect(values.every(Number.isFinite)).toBe(true);
      }
    }
  });
  it('joins near and outer chunks along identical shared edges', () => {
    const centre = near.terrains.find(t => t.id === 'hermon-near')!;
    const north = field.terrains.find(t => t.id === 'hermon-north')!;
    const south = field.terrains.find(t => t.id === 'hermon-south')!;
    const west = field.terrains.find(t => t.id === 'hermon-west')!;
    const east = field.terrains.find(t => t.id === 'hermon-east')!;
    expect(edge(centre, 'z', -205)).toEqual(edge(north, 'z', -205, -225, 225));
    expect(edge(centre, 'z', 130)).toEqual(edge(south, 'z', 130, -225, 225));
    expect(edge(centre, 'x', -225)).toEqual(edge(west, 'x', -225, -205, 130));
    expect(edge(centre, 'x', 225)).toEqual(edge(east, 'x', 225, -205, 130));
  });
  it('joins every playable and distant strip, including mixed-resolution edges', () => {
    const ranges = makeSkylineChunks();
    expectJoined([...all, ...ranges]);
    ranges.forEach(t => t.geometry.dispose());
  });
  it('winds the natural arch outward and spans each waystone with its collider', () => {
    const arch = near.terrains.find(t => t.id === 'cloven-arch')!;
    expect(arch.geometry.attributes.normal.getY(0)).toBeGreaterThan(0);
    const cap = 18 * 9 * 6;
    expect(arch.geometry.attributes.normal.getX(cap)).toBeLessThan(0);
    expect(arch.geometry.attributes.normal.getX(arch.geometry.attributes.normal.count - 1)).toBeGreaterThan(0);
    for (const [x, z] of [[-24, 45], [26, -17], [-26, -76]]) {
      const solid = near.solids.find(s => Math.abs(s.position[0] - x) < .01 && Math.abs(s.position[2] - z) < .01)!;
      const ground = heightAt(x, z) + .1;
      expect(solid.position[1] - solid.size[1]).toBeLessThanOrEqual(ground - .05);
      expect(solid.position[1] + solid.size[1]).toBeGreaterThanOrEqual(ground + 3.9);
    }
  });
  it('stays inside bounded triangle and world-height budgets', () => {
    expect(near.triangles).toBeLessThan(25000);
    expect(field.triangles).toBeLessThan(55000);
    for (let x = WORLD.minX; x <= WORLD.maxX; x += 20) for (let z = WORLD.minZ; z <= WORLD.maxZ; z += 20) {
      expect(heightAt(x, z)).toBeLessThan(WORLD.ceiling - 20);
    }
  });
  it('retires grid ruins and box towers from all active terrain generators', () => {
    for (const path of ['src/world/cityData.ts', 'src/world/fieldData.ts', 'src/world/skylineData.ts']) {
      const source = readFileSync(path, 'utf8');
      for (const gone of ['ruinBuilding', 'fieldSpecs', 'anchorSpecs', 'bakeTower', 'stoneSpecs', 'street:', 'cell:']) {
        expect(source, `${path} must not contain ${gone}`).not.toContain(gone);
      }
    }
  });
  it('builds continuous distant ranges without tower records', () => {
    const sky = makeSkyline();
    expect(sky.triangles).toBeGreaterThan(3000);
    expect(sky.triangles).toBeLessThan(40000);
    expect(sky.geometry.attributes.position.count).toBeGreaterThan(9000);
    expect('towers' in sky).toBe(false);
    sky.geometry.dispose();
  });
});

afterAll(() => {
  near.geometry.dispose(); near.terrains.forEach(t => t.geometry.dispose());
  field.geometries.forEach(g => g.dispose());
});
