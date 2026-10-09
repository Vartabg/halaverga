import { describe, expect, it } from 'vitest';
import { trackpadPill, type PillEnv } from '../src/ui/trackpadPill';
// The classic trackpad pill (Garo 2026-09-24): the free cursor states its whole mapping in one line; blaster off is 7945430's copy.

const pill = (o: Partial<PillEnv>) => trackpadPill({ steering: 'free', shooter: true, cruising: false, flying: false, ...o });
const CRUISE = 'MOVE TO STEER · SCROLL FOR SPEED · CLICK TO HOVER';

describe('trackpadPill', () => {
  it('free cursor, blaster on: cruising, hovering and on the ground', () => {
    for (const flying of [true, false]) expect(pill({ cruising: true, flying })).toBe(`${CRUISE} · HOLD C TO FIRE`);
    expect(pill({ flying: true })).toBe('W OR SPACE TO FLY · CLICK TO FIRE · DRAG TO LOOK');
    expect(pill({ flying: false })).toBe('SPACE TO FLY · CLICK TO FIRE · DRAG TO LOOK');
  });
  it('free cursor, blaster on, hovering with a surface in reach: Space lands, so only W flies', () => {
    expect(pill({ flying: true, canLand: true })).toBe('W TO FLY · SPACE TO LAND · CLICK TO FIRE · DRAG TO LOOK');
    expect(pill({ flying: false, canLand: true })).toBe('SPACE TO FLY · CLICK TO FIRE · DRAG TO LOOK');
    expect(pill({ cruising: true, flying: true, canLand: true })).toBe(`${CRUISE} · HOLD C TO FIRE`);
    expect(pill({ shooter: false, flying: true, canLand: true })).toBe('CLICK TO FLY · DRAG TO LOOK');
  });
  it('free cursor, blaster off: the 7945430 lines', () => {
    for (const flying of [true, false]) {
      expect(pill({ shooter: false, cruising: true, flying })).toBe(CRUISE);
      expect(pill({ shooter: false, flying })).toBe('CLICK TO FLY · DRAG TO LOOK');
    }
  });
  it('captured steering keeps its own cruise line, blaster on or off', () => {
    for (const shooter of [true, false]) for (const flying of [true, false]) {
      expect(pill({ steering: 'captured', shooter, cruising: true, flying })).toBe(`${CRUISE} + RELEASE`);
      expect(pill({ steering: 'captured', shooter, flying })).toBe('CLICK TO FLY · DRAG TO LOOK');
    }
  });
  it('no pill for one finger + keyboard, Flow or an unknown profile', () => {
    for (const steering of ['simple', 'flow', 'mystery', '']) for (const shooter of [true, false]) for (const cruising of [true, false])
      expect(pill({ steering, shooter, cruising })).toBeNull();
  });
  it('every line is under 70 characters', () => {
    for (const steering of ['free', 'captured']) for (const shooter of [true, false]) for (const cruising of [true, false]) for (const flying of [true, false]) for (const canLand of [true, false]) {
      const text = pill({ steering, shooter, cruising, flying, canLand });
      expect(text).not.toBeNull(); expect(text!.length).toBeLessThan(70);
    }
  });
});
