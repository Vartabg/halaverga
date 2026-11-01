import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { courtGeometry } from '../src/world/villageCourt';

describe('village opening oath court', () => {
  it('covers the standing spot with irregular polygonal stone and no runway boxes', () => {
    const geometry = courtGeometry(), p = geometry.attributes.position;
    expect(p.count).toBeGreaterThan(60);
    for (let i = 0; i < p.count; i++) {
      expect(Math.abs(p.getX(i))).toBeLessThanOrEqual(12);
      expect(p.getZ(i)).toBeGreaterThanOrEqual(55); expect(p.getZ(i)).toBeLessThanOrEqual(75);
      expect(p.getY(i)).toBeLessThan(20.3);
      expect(geometry.attributes.normal.getY(i)).toBe(1);
    }
    expect(readFileSync('src/world/villageCourt.ts', 'utf8')).not.toContain('BoxGeometry');
    geometry.dispose();
  });
  it('draws with the paint material and adds no collider', () => {
    const src = readFileSync('src/world/Village.tsx', 'utf8');
    expect(src).toContain('paintInkMaterial'); expect(src).toContain('courtGeometry');
    expect(src).not.toContain('CuboidCollider'); expect(src).not.toContain('map:');
  });
});
