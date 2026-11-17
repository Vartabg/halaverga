import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CEDAR, CEDAR_HEIGHT, CEDAR_TIERS, HERO_CEDARS, makeCedars } from '../src/world/cedarData';
import { makeUnderstory } from '../src/world/reclamationData';
import { GROWTH, MASSIF, heightAt, slopeAt } from '../src/world/massifData';

describe('cedars of Lebanon (pre-Flood dressing)', () => {
  it('is deterministic and keeps snow on the top tier', () => {
    expect(makeCedars()).toEqual(makeCedars());
    expect(CEDAR_TIERS.length).toBeGreaterThanOrEqual(3);
    expect(CEDAR.snowY).toBeGreaterThan(CEDAR_TIERS[CEDAR_TIERS.length - 1].y);
  });
  it('plants hero cedars whose crowns rise past the arrival terrace', () => {
    expect(HERO_CEDARS.length).toBe(4);
    for (const c of HERO_CEDARS) {
      expect(c.scale).toBeGreaterThanOrEqual(1.8);
      // They stand on the banks below the court, so only the crown should clear the lip.
      expect(c.position[1]).toBeLessThan(MASSIF.arrivalY);
      expect(c.position[1] + CEDAR_HEIGHT * c.scale).toBeGreaterThan(MASSIF.arrivalY + 8);
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

describe('bank understory', () => {
  it('roots every clump on the terrain and drops the ones on the cliffs', () => {
    const plants = makeUnderstory();
    expect(plants.length).toBeGreaterThan(20);
    for (const p of plants) {
      const [x, y, z] = p.position;
      expect(y).toBeCloseTo(heightAt(x, z), 6);
      expect(y).toBeLessThanOrEqual(GROWTH.treeline);
      expect(slopeAt(x, z)).toBeLessThanOrEqual(GROWTH.ivySlope);
    }
  });
});

describe('Reclamation', () => {
  it('is mounted in the scene', () => {
    expect(readFileSync('src/world/HermonCity.tsx', 'utf8')).toContain('<Reclamation />');
  });
});
