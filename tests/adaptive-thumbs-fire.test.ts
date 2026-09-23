import { describe, expect, it } from 'vitest';
import { AdaptiveThumbs } from '../src/game/adaptiveThumbs';
import { thumbThrottle } from '../src/game/thumbFlight';
// Fire (outside the flight surface) as an external thumb: the flight contact becomes a move stick and keeps its throttle.
const W = 393, H = 852;
const quietLook = (t: AdaptiveThumbs) => {
  expect(t.output.lookX).toBe(0); expect(t.output.lookY).toBe(0);
  expect(t.output.edgeTurn).toBe(0); expect(t.output.edgePitch).toBe(0);
};
describe('adaptive thumbs with an external Fire owner', () => {
  it('carries a cruising one-thumb throttle onto the move stick', () => {
    const t = new AdaptiveThumbs(); t.start(1, 120, 650); t.activate();
    t.move(1, 120, 590, W, H);
    const cruise = t.output.forward;
    expect(cruise).toBeCloseTo(thumbThrottle(60), 12);
    t.setExternal(true, 1000);
    expect(t.mode).toBe('dual'); expect(t.contacts.get(1)?.role).toBe('move'); expect(t.active).toBe(true);
    expect(Math.abs(t.output.forward - cruise)).toBeLessThan(1e-9); expect(t.output.strafe).toBe(0);
    quietLook(t);
    t.move(1, 100, 590, W, H);
    expect(t.output.strafe).toBeLessThan(0); expect(t.output.forward).toBeGreaterThan(0);
    quietLook(t);
  });
  it('gives zero output to a contact that was not flying yet', () => {
    const t = new AdaptiveThumbs(); t.start(1, 120, 650);
    expect(t.active).toBe(false);
    t.setExternal(true, 0);
    expect(t.mode).toBe('dual'); expect(t.active).toBe(true);
    expect(t.output.forward).toBe(0); expect(t.output.strafe).toBe(0); quietLook(t);
  });
  it('makes a contact that starts while external an active move stick at once', () => {
    const t = new AdaptiveThumbs(); t.setExternal(true, 0);
    expect(t.mode).toBe('idle');
    t.start(1, 90, 650);
    expect(t.mode).toBe('dual'); expect(t.active).toBe(true); expect(t.contacts.get(1)?.role).toBe('move');
    t.move(1, 90, 570, W, H);
    expect(t.output.forward).toBeGreaterThan(.8); quietLook(t);
  });
  it('blocks a second surface contact that starts while external (Fire counts as a thumb)', () => {
    const t = new AdaptiveThumbs(); t.setExternal(true, 0);
    t.start(1, 90, 650); t.start(2, 290, 650);
    expect(t.mode).toBe('blocked'); expect(t.active).toBe(false);
  });
  it('hands a cruising stick back to one-thumb flight when Fire is released', () => {
    const t = new AdaptiveThumbs(); t.start(1, 120, 650); t.activate(); t.move(1, 120, 590, W, H);
    const cruise = t.output.forward;
    t.setExternal(true, 0); t.setExternal(false, 10);
    expect(t.mode).toBe('single'); expect(t.contacts.get(1)?.role).toBe('single'); expect(t.active).toBe(true);
    expect(Math.abs(t.output.forward - cruise)).toBeLessThan(1e-6); expect(t.output.strafe).toBe(0);
    t.move(1, 121, 590, W, H);
    expect(Math.abs(t.output.forward - cruise)).toBeLessThan(1e-3);
    const idle = new AdaptiveThumbs(); idle.setExternal(true, 0); idle.setExternal(false, 1); expect(idle.mode).toBe('idle');
  });
  it('keeps the cruise a thumb pushed during Fire, and a pulled-back stick releases still', () => {
    const t = new AdaptiveThumbs(); t.start(1, 120, 650); t.setExternal(true, 0);
    t.move(1, 120, 570, W, H); const pushed = t.output.forward;
    t.setExternal(false, 10);
    expect(t.active).toBe(true); expect(Math.abs(t.output.forward - pushed)).toBeLessThan(1e-6);
    const back = new AdaptiveThumbs(); back.start(1, 120, 650); back.setExternal(true, 0);
    back.move(1, 120, 700, W, H); back.setExternal(false, 10);
    expect(back.active).toBe(false); expect(back.output.forward).toBe(0);
  });
  it('releases a thumb at stick-neutral to an inactive single thumb that does not launch until it slides', () => {
    const t = new AdaptiveThumbs(); t.start(1, 120, 650);
    t.setExternal(true, 0); t.setExternal(false, 10);
    expect(t.mode).toBe('single'); expect(t.active).toBe(false); expect(t.output.forward).toBe(0);
    t.activate(); expect(t.active).toBe(false);
    t.move(1, 121, 650, W, H); expect(t.active).toBe(false); expect(t.output.forward).toBe(0);
    t.move(1, 140, 650, W, H); expect(t.active).toBe(true); expect(t.output.forward).toBeGreaterThan(0);
  });
  it.each([[200, true], [251, false]] as const)('restores the move origin %i ms after the look thumb lifts: %s', (gap, restored) => {
    const t = new AdaptiveThumbs(); t.start(1, 90, 650); t.start(2, 290, 650);
    t.move(1, 90, 590, W, H);
    const cruise = t.output.forward;
    t.end(2, 1000);
    expect(t.mode).toBe('single'); expect(t.output.forward).toBe(0);
    t.setExternal(true, 1000 + gap);
    if (restored) expect(t.output.forward).toBe(cruise); else expect(t.output.forward).toBe(0);
    expect(t.output.strafe).toBe(0); quietLook(t);
  });
});
