import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { paintBlockGeometry } from '../src/world/paintBlocks';
import { HOUSE_BASE, HOUSES, houseBlocks } from '../src/world/villageHouseData';

const holds = (block: { x: number; y: number; z: number; w: number; h: number; d: number }, x: number, y: number, z: number) =>
  Math.abs(x - block.x) <= block.w / 2 && Math.abs(y - block.y) <= block.h / 2 && Math.abs(z - block.z) <= block.d / 2;

describe('village houses', () => {
  it('stacks stone outside the standing spot and leaves a door', () => {
    const parts = houseBlocks();
    expect(parts.length).toBeGreaterThan(40);
    for (const house of HOUSES) {
      expect(Math.max(house.w, house.d)).toBeLessThanOrEqual(5);
      const doorY = HOUSE_BASE + 0.5;
      const door = house.door === 'px' ? { x: house.x + house.w / 2, z: house.z }
        : house.door === 'nx' ? { x: house.x - house.w / 2, z: house.z }
        : house.door === 'pz' ? { x: house.x, z: house.z + house.d / 2 }
        : { x: house.x, z: house.z - house.d / 2 };
      expect(parts.some(p => holds(p, door.x, doorY, door.z))).toBe(false);
    }
    for (const p of parts) {
      const overlapsStand = Math.abs(p.x) - p.w / 2 < 4 && p.z + p.d / 2 > 62 && p.z - p.d / 2 < 68;
      expect(overlapsStand).toBe(false);
      expect(p.y - p.h / 2).toBeGreaterThanOrEqual(HOUSE_BASE - 1e-6);
      expect(Math.abs(p.x) + p.w / 2).toBeLessThanOrEqual(12);
      expect(p.z - p.d / 2).toBeGreaterThanOrEqual(55);
      expect(p.z + p.d / 2).toBeLessThanOrEqual(75);
      expect(p.color.startsWith('#')).toBe(true);
    }
  });

  it('builds a colored mesh and adds no collider', () => {
    const geometry = paintBlockGeometry(houseBlocks());
    expect(geometry.getAttribute('color').count).toBe(geometry.getAttribute('position').count);
    geometry.dispose();
    const src = readFileSync('src/world/villageHouses.tsx', 'utf8') + readFileSync('src/world/PaintedBlocks.tsx', 'utf8');
    expect(src).toContain('paintInkMaterial');
    expect(src).not.toContain('CuboidCollider');
    expect(src).not.toContain('map:');
  });

  it('keeps box-stacked houses retired from the active Hermon sanctuary scene', () => {
    expect(readFileSync('src/world/HermonCity.tsx', 'utf8')).not.toContain('<VillageHouses />');
  });
});
