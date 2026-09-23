import { describe, expect, it } from 'vitest';
import { AdaptiveThumbs } from '../src/game/adaptiveThumbs';
// Claw grip: Fire pressed with a third finger during two-thumb flight mutes the look thumb instead of freezing movement.
const W = 844, H = 390;
const flying = () => {
  const t = new AdaptiveThumbs(); t.start(1, 90, 300); t.start(2, 290, 300);
  t.move(1, 90, 240, W, H);
  return t;
};
describe('adaptive thumbs: Fire during two-thumb flight', () => {
  it('(a) keeps the move stick and its throttle, and mutes the look thumb', () => {
    const t = flying(); const cruise = t.output.forward;
    t.setExternal(true, 0);
    expect(t.mode).toBe('dual'); expect(t.active).toBe(true);
    expect(t.output.forward).toBe(cruise); expect(t.output.lookX).toBe(0);
    t.move(2, 320, 280, W, H);
    expect(t.output.lookX).toBe(0); expect(t.output.lookY).toBe(0); expect(t.output.edgeTurn).toBe(0);
    expect(t.output.forward).toBe(cruise);
    t.move(1, 90, 230, W, H);
    expect(t.output.forward).toBeGreaterThan(cruise); expect(t.output.lookX).toBe(0);
  });
  it('(b) restores dual on release; the look thumb resumes from where it is, without a jump', () => {
    const t = flying(); const cruise = t.output.forward;
    t.setExternal(true, 0); t.move(2, 330, 280, W, H);
    t.setExternal(false, 10);
    expect(t.mode).toBe('dual'); expect(t.active).toBe(true);
    expect(t.contacts.get(1)?.role).toBe('move'); expect(t.contacts.get(2)?.role).toBe('look');
    expect(t.output.forward).toBe(cruise);
    t.move(2, 340, 280, W, H);
    expect(t.output.lookX).toBeCloseTo(16, 12); expect(t.output.lookY).toBe(0);
  });
  it('(c) lifting the muted thumb under Fire keeps the move stick with no yaw writer', () => {
    const t = flying(); const cruise = t.output.forward;
    t.setExternal(true, 0); t.end(2, 5);
    expect(t.mode).toBe('dual'); expect(t.active).toBe(true); expect(t.contacts.get(1)?.role).toBe('move');
    expect(t.output.forward).toBe(cruise);
    t.move(1, 95, 235, W, H);
    expect(t.output.forward).toBeGreaterThan(0); expect(t.output.lookX).toBe(0); expect(t.output.lookY).toBe(0);
  });
  it('(d) lifting the move thumb under Fire makes the muted thumb a move stick from rest', () => {
    const t = flying();
    t.setExternal(true, 0); t.end(1, 5);
    expect(t.mode).toBe('dual'); expect(t.active).toBe(true); expect(t.contacts.get(2)?.role).toBe('move');
    expect(t.output.forward).toBe(0);
    t.move(2, 290, 240, W, H);
    expect(t.output.forward).toBeGreaterThan(0); expect(t.output.lookX).toBe(0); expect(t.output.lookY).toBe(0);
  });
  it('(e) a third surface contact still blocks, before or during Fire', () => {
    const t = flying(); t.setExternal(true, 0);
    t.start(3, 500, 300);
    expect(t.mode).toBe('blocked'); expect(t.active).toBe(false); expect(t.output.forward).toBe(0);
    const three = new AdaptiveThumbs(); three.start(1, 90, 300); three.start(2, 290, 300); three.start(3, 500, 300);
    three.setExternal(true, 0); expect(three.mode).toBe('blocked');
  });
});
