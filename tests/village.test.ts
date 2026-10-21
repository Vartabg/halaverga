import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { courtParts } from '../src/world/villageCourt';

describe('village opening court', () => {
  it('covers the standing spot with painted earth and leaves the middle open for houses', () => {
    const parts = courtParts();
    const under = parts.filter(p => Math.abs(p.x) <= 3 && p.z - p.d / 2 <= 65 && p.z + p.d / 2 >= 65);
    expect(under.length).toBeGreaterThan(0);
    for (const p of parts) {
      expect(Math.abs(p.x) + p.w / 2).toBeLessThanOrEqual(12);
      expect(p.z - p.d / 2).toBeGreaterThanOrEqual(55);
      expect(p.z + p.d / 2).toBeLessThanOrEqual(75);
      expect(p.y + p.h / 2).toBeLessThan(20.3);
      expect(p.color.startsWith('#')).toBe(true);
    }
  });
  it('draws with the paint material and adds no collider', () => {
    const src = readFileSync('src/world/Village.tsx', 'utf8');
    expect(src).toContain('paintInkMaterial');
    expect(src).not.toContain('CuboidCollider');
    expect(src).not.toContain('map:');
  });
});
