import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CEDAR_HEIGHT, CEDAR_TIERS, HERO_CEDARS, makeCedars } from '../src/world/cedarData';
import { GROWTH, MASSIF, heightAt, slopeAt } from '../src/world/massifData';

describe('cedars of Lebanon (pre-Flood dressing)', () => {
  it('is deterministic and keeps a tapered crown', () => {
    expect(makeCedars()).toEqual(makeCedars());
    expect(CEDAR_TIERS.length).toBeGreaterThanOrEqual(3);
    expect(CEDAR_TIERS.at(-1)!.r).toBeLessThan(CEDAR_TIERS[0].r);
  });
  it('keeps the cedar crowns below the arrival terrace', () => {
    expect(HERO_CEDARS.length).toBe(4);
    for (const c of HERO_CEDARS) {
      expect(c.scale).toBeGreaterThan(0);
      expect(c.position[1]).toBeLessThan(MASSIF.arrivalY);
      expect(c.position[1] + CEDAR_HEIGHT * c.scale).toBeLessThan(MASSIF.arrivalY);
    }
    expect(makeCedars().slice(0, 4)).toEqual(HERO_CEDARS);
  });
  it('stands every trunk on the terrain, below the treeline and off the cliffs', () => {
    const cedars = makeCedars();
    expect(cedars.length).toBeGreaterThan(14);
    for (const c of cedars) {
      const [x, y, z] = c.position;
      expect(Math.abs(x)).toBeGreaterThan(GROWTH.corridor); // route corridor
      expect(y).toBeCloseTo(heightAt(x, z), 6);
      expect(y).toBeLessThanOrEqual(GROWTH.treeline);
      expect(slopeAt(x, z)).toBeLessThanOrEqual(GROWTH.cedarSlope);
      expect(c.scale).toBeGreaterThan(0);
    }
  });
  it('keeps a grove on both banks', () => {
    const east = makeCedars().filter(c => c.position[0] > 0).length;
    expect(east).toBeGreaterThanOrEqual(5);
    expect(makeCedars().length - east).toBeGreaterThanOrEqual(5);
  });
});

describe('Lower-slope cedars', () => {
  it('is mounted in the scene', () => {
    expect(readFileSync('src/world/NearMassif.tsx', 'utf8')).toContain('<Cedars />');
  });
});
