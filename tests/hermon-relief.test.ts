import { readFileSync, statSync } from 'node:fs';
import { afterAll, describe, expect, it } from 'vitest';
import { WORLD } from '@/game/motion';
import { FAR_PLANE } from '@/world/atmospherePalette';
import { makeEdgeRing } from '@/world/edgeRingData';
import { makeField } from '@/world/fieldData';
import relief from '@/world/hermonRelief.json';

const geometry = makeEdgeRing();
const p = geometry.attributes.position;
const rim = new Map<string, number>();
const rimCount = 2 * (relief.rows[0][1] + relief.rows[0][2]);
for (let i = 0; i < rimCount; i++) rim.set(`${p.getX(i)},${p.getZ(i)}`, p.getY(i));

describe('regional Hermon relief', () => {
  it('joins every outer strip at the same rendered vertices', () => {
    const { minX, maxX, minZ, maxZ } = WORLD;
    const field = makeField(), seen = new Set<string>();
    try {
      for (const chunk of field.terrains) {
        const v = chunk.vertices;
        for (let i = 0; i < v.length; i += 3) {
          const [x, y, z] = v.subarray(i, i + 3);
          if (x !== minX && x !== maxX && z !== minZ && z !== maxZ) continue;
          const pos = `${x},${z}`;
          expect(rim.get(pos)).toBe(y);
          seen.add(pos);
        }
      }
      expect(seen.size).toBe(rimCount);
    } finally {
      field.geometries.forEach(g => g.dispose());
    }
  });
  it('retains real rise and fall beyond the authored join, including high land to the north', () => {
    let peak = -Infinity, valley = Infinity, peakZ = 0;
    for (let i = rimCount; i < p.count; i++) {
      const y = p.getY(i);
      if (y > peak) { peak = y; peakZ = p.getZ(i); }
      valley = Math.min(valley, y);
    }
    expect(peak).toBeGreaterThan(215);
    expect(peakZ).toBeLessThan(-1100);
    expect(valley).toBeLessThan(-2000);
  });
  it('holds indexed, upward-facing triangles within the far plane', () => {
    const n = geometry.attributes.normal;
    const index = geometry.index!;
    expect(index.array).toBeInstanceOf(Uint16Array);
    expect(index.count / 3).toBeLessThan(24_000);
    expect(p.count).toBe(relief.rows.reduce((count, [, width, depth]) => count + 2 * (width + depth), 0));
    expect(p.array.every(Number.isFinite)).toBe(true);
    for (let i = 0; i < p.count; i++) {
      expect(n.getY(i)).toBeGreaterThan(0);
      expect(Math.hypot(Math.abs(p.getX(i)) + 430, Math.abs(p.getY(i)) + 160, Math.abs(p.getZ(i)) + 440)).toBeLessThan(FAR_PLANE);
    }
  });
  it('credits the height data and ships the two compact surface maps', () => {
    const provenance = readFileSync('docs/art/hermon-sky/PROVENANCE.md', 'utf8');
    for (const part of ['N33E035', 'N33E036', 'SRTM data courtesy of the U.S. Geological Survey', 'cliff_side', 'snow_02', 'CC0']) {
      expect(provenance).toContain(part);
    }
    expect(readFileSync('src/ui/FieldGuide.tsx', 'utf8')).toContain('SRTM data courtesy of the U.S. Geological Survey');
    for (const f of ['limestone-cliff.jpg', 'snow.jpg']) expect(statSync(`public/textures/terrain/${f}`).size).toBeLessThan(400_000);
    expect(statSync('src/world/hermonRelief.json').size).toBeLessThan(36_000);
  });
});

afterAll(() => geometry.dispose());
