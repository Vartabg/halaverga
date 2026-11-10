import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { WORLD } from '@/game/motion';
import { SEA_BODY, SKYLINE, acesFilmic, type Rgb } from '@/world/atmospherePalette';
import { makeCity } from '@/world/cityData';
import { makeSkyline } from '@/world/skylineData';

const sky = makeSkyline();
const hash = (s: ReturnType<typeof makeSkyline>) => createHash('sha256')
  .update(Buffer.from(s.geometry.attributes.position.array.buffer)).update(Buffer.from(s.geometry.attributes.color.array.buffer)).digest('hex');
const outside = (x: number, z: number) => Math.max(0, WORLD.minX - x, x - WORLD.maxX, WORLD.minZ - z, z - WORLD.maxZ);

describe('continuous distant Hermon ranges', () => {
  it('is deterministic and seeded', () => {
    expect(hash(makeSkyline())).toBe(hash(sky));
    expect(hash(makeSkyline(7))).not.toBe(hash(sky));
  });
  it('stays inside its budget with finite, non-indexed flat facets', () => {
    expect(sky.triangles).toBeLessThanOrEqual(40000);
    expect(sky.triangles).toBeGreaterThanOrEqual(3000);
    expect(sky.geometry.index).toBeNull();
    expect(sky.geometry.attributes.position.count).toBe(sky.triangles * 3);
    for (const name of ['position', 'normal', 'color', 'uv']) for (const v of sky.geometry.attributes[name].array) expect(Number.isFinite(v)).toBe(true);
    for (const v of sky.geometry.attributes.color.array) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(1.001); }
  });
  it('forms three ridge rings outside the flyable world without tower records', () => {
    expect('towers' in sky).toBe(false);
    expect(SKYLINE.gaps).toHaveLength(3);
    const p = sky.geometry.attributes.position;
    let nearest = Infinity, farthest = 0;
    for (let i = 0; i < p.count; i++) {
      const d = outside(p.getX(i), p.getZ(i));
      nearest = Math.min(nearest, d); farthest = Math.max(farthest, d);
      expect(p.getY(i)).toBeLessThanOrEqual(170);
    }
    expect(nearest).toBe(0); // inner edges join the playable ranges
    expect(farthest).toBeGreaterThanOrEqual(100);
    expect(farthest).toBeLessThanOrEqual(400);
  });
  it('retires every box-tower generator from the active source', () => {
    const source = readFileSync('src/world/skylineData.ts', 'utf8');
    for (const gone of ['bakeTower', 'stoneSpecs', 'pickRuin', 'lean', 'foot']) expect(source).not.toContain(gone);
    expect(source).toContain('makeMassifChunk');
  });
  it('knows the dawn water colour and keeps the ACES twin monotonic', () => {
    const enc = (x: number) => Math.round(255 * (x <= .0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - .055));
    const [r, g, b] = SEA_BODY.map(enc);
    expect(Math.abs(r - 11)).toBeLessThanOrEqual(3); expect(Math.abs(g - 22)).toBeLessThanOrEqual(3); expect(Math.abs(b - 31)).toBeLessThanOrEqual(3);
    const grey = (x: number): Rgb => [x, x, x];
    let last = -1; for (const x of [.01, .05, .18, .5, 1, 4]) { const v = acesFilmic(grey(x))[1]; expect(v).toBeGreaterThan(last); last = v; }
  });
  it('keeps foot mist, altitude snow and dawn haze in the static range material', () => {
    const mesh = readFileSync('src/world/Skyline.tsx', 'utf8');
    for (const part of ['FOOT_SEA', 'SNOW', 'pow(f, 1.3)', 'toneMapped: false', 'fog: true']) expect(mesh).toContain(part);
    for (const gone of ['aWall', 'RUST', 'useFrame', 'invalidate']) expect(mesh).not.toContain(gone);
    expect(mesh).toContain('castShadow={false}'); expect(mesh).toContain('receiveShadow={false}');
    expect(mesh).toContain('geometry.dispose()'); expect(mesh).toContain('material.dispose()');
  });
  it('keeps distant geometry out of the sanctuary mesh and preserves material group indices', () => {
    const city = makeCity();
    expect(city.terrains.length).toBeGreaterThan(0);
    expect(city.geometry.groups.length).toBeGreaterThan(0);
    for (const group of city.geometry.groups) {
      expect(group.count).toBeGreaterThan(0);
      expect(group.materialIndex).toBeGreaterThanOrEqual(0);
      expect(group.materialIndex).toBeLessThanOrEqual(6);
    }
    city.geometry.dispose(); city.terrains.forEach(t => t.geometry.dispose());
  });
});
