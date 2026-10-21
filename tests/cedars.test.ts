import { describe, expect, it } from 'vitest';
import { CEDAR, CEDAR_TIERS, makeCedars } from '../src/world/cedarData';

describe('cedars of Lebanon (pre-Flood dressing)', () => {
  it('is deterministic and keeps snow on the top tier', () => {
    expect(makeCedars()).toEqual(makeCedars());
    expect(CEDAR_TIERS.length).toBeGreaterThanOrEqual(3);
    expect(CEDAR.snowY).toBeGreaterThan(CEDAR_TIERS[CEDAR_TIERS.length - 1].y);
  });
  it('stands clear of the route corridor and on the banks', () => {
    for (const c of makeCedars()) {
      expect(Math.abs(c.position[0])).toBeGreaterThan(12); // route corridor is x -12..12
      expect(c.position[1]).toBe(2.1);
      expect(c.scale).toBeGreaterThan(0);
    }
  });
});
