import { describe, expect, it } from 'vitest';
import { AdaptiveThumbs } from '../src/game/adaptiveThumbs';
describe('adaptive thumb ownership', () => {
  it.each([true, false])('assigns left movement/right view regardless of arrival order (%s)', leftFirst => {
    const t = new AdaptiveThumbs();
    t.start(1, leftFirst ? 90 : 290, 650); t.activate();
    t.start(2, leftFirst ? 290 : 90, 650);
    expect(t.mode).toBe('dual'); expect(t.output.forward).toBe(0);
    const left = leftFirst ? 1 : 2, right = leftFirst ? 2 : 1;
    t.move(left, 130, 570, 393, 852);
    expect(t.output.forward).toBeGreaterThan(.6); expect(t.output.strafe).toBeGreaterThan(.3);
    expect(t.output.lookX).toBe(0); expect(t.output.lookY).toBe(0);
    const forward = t.output.forward;
    t.move(right, 330, 600, 393, 852);
    expect(t.output.forward).toBe(forward); expect(t.output.lookX).toBe(64); expect(t.output.lookY).toBe(-80);
  });
  it('uses a neutral deadzone and bounded reverse/diagonal motion', () => {
    const t = new AdaptiveThumbs(); t.start(1, 90, 650); t.start(2, 290, 650);
    t.move(1, 93, 653, 393, 852); expect(t.output.forward).toBe(0); expect(t.output.strafe).toBe(0);
    t.move(1, 220, 800, 393, 852);
    expect(t.output.forward).toBeLessThan(0); expect(Math.hypot(t.output.forward, t.output.strafe)).toBeCloseTo(1);
    t.move(2, 200, 600, 393, 852); expect(t.output.lookX).toBeLessThan(0);
    expect(t.contacts.get(1)?.role).toBe('move');
  });
  it.each([1, 2])('rebases the remaining thumb after releasing %s, with no automatic throttle', released => {
    const t = new AdaptiveThumbs(); t.start(1, 90, 650); t.activate(); t.start(2, 290, 650);
    t.move(1, 90, 570, 393, 852); t.move(2, 330, 600, 393, 852); t.end(released);
    expect(t.mode).toBe('single'); expect(t.active).toBe(false); expect(t.output.forward).toBe(0);
    const p = [...t.contacts.values()][0];
    t.move(p.id, p.x + 20, p.y, 393, 852);
    expect(t.active).toBe(true); expect(t.output.lookX).toBe(32); expect(t.output.forward).toBeGreaterThan(0);
    expect(t.output.strafe).toBe(0);
  });
  it('ignores late activation after switching modes and blocks extra contacts until all lift', () => {
    const t = new AdaptiveThumbs(); t.start(1, 90, 650); t.start(2, 290, 650); t.activate();
    expect(t.output.forward).toBe(0);
    t.start(3, 190, 500); expect(t.mode).toBe('blocked'); expect(t.active).toBe(false);
    t.end(3); t.move(1, 90, 500, 393, 852); expect(t.mode).toBe('blocked'); expect(t.output.forward).toBe(0);
    t.end(2); t.end(1); expect(t.mode).toBe('idle');
    t.start(4, 90, 650); t.activate(); expect(t.output.forward).toBeGreaterThan(0);
    t.cancel(); expect(t.contacts.size).toBe(0); expect(t.output.forward).toBe(0);
  });
});
