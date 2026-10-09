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
    // The third finger lifting leaves the two thumbs as they were (limits plan S8): the left one moves again at once. With one left
    // the hand is single, and it lifts and idles as usual.
    t.end(3); expect(t.mode).toBe('dual'); t.move(1, 90, 500, 393, 852); expect(t.output.forward).toBeGreaterThan(.9);
    t.end(2); expect(t.mode).toBe('single'); t.end(1); expect(t.mode).toBe('idle');
    t.start(4, 90, 650); t.activate(); expect(t.output.forward).toBeGreaterThan(0);
    t.cancel(); expect(t.contacts.size).toBe(0); expect(t.output.forward).toBe(0);
  });
});
describe('a blocked hand recovers without lifting every finger (limits plan S8)', () => {
  it('three fingers, two lift: the last one is single at once, rests without launching, and flies on its first move', () => {
    const t = new AdaptiveThumbs();
    t.start(1, 90, 650); t.activate(); t.start(2, 290, 650); t.start(3, 190, 500);
    expect(t.mode).toBe('blocked');
    t.end(3); expect(t.mode).toBe('dual'); t.end(2);
    expect(t.mode).toBe('single'); expect(t.contacts.size).toBe(1);
    expect(t.output.forward).toBe(0); expect(t.active).toBe(false); // no launch while it rests
    const p = t.contacts.get(1)!; expect([p.originX, p.originY]).toEqual([p.x, p.y]); // rebased where it is
    t.move(1, p.x + 2, p.y - 1, 393, 852); // finger noise, well under the 8 px deadzone: still resting, no cruise
    expect(t.active).toBe(false); expect(t.output.forward).toBe(0);
    t.move(1, p.x + 2, p.y - 20, 393, 852); // a deliberate slide flies it again, wherever it is
    expect(t.active).toBe(true); expect(t.output.forward).toBeGreaterThan(0);
    t.move(1, p.x + 2, p.y - 60, 393, 852); expect(t.output.forward).toBeGreaterThan(.3);
  });
  it('the original finger lifting leaves any remaining one the same way', () => {
    const t = new AdaptiveThumbs();
    t.start(1, 90, 650); t.start(2, 290, 650); t.start(3, 190, 500);
    t.end(1); expect(t.mode).toBe('dual'); t.end(3); expect(t.mode).toBe('single'); expect([...t.contacts.keys()]).toEqual([2]);
    t.move(2, 292, 640, 393, 852); expect(t.active).toBe(true);
  });
  it('a plain single thumb is not armed: a resting single still needs the deadzone', () => {
    const t = new AdaptiveThumbs(); t.start(1, 90, 650); t.start(2, 290, 650); t.end(2);
    expect(t.mode).toBe('single'); t.move(1, 93, 650, 393, 852); expect(t.active).toBe(false);
  });
  it('three fingers, only the third lifts: the two thumbs are back (left moves, right looks) and fly without lifting anything else', () => {
    const t = new AdaptiveThumbs();
    t.start(1, 90, 650); t.start(2, 290, 650); t.start(3, 190, 500);
    expect(t.mode).toBe('blocked'); t.move(1, 90, 500, 393, 852); expect(t.output.forward).toBe(0);
    t.end(3);
    expect(t.mode).toBe('dual'); expect(t.active).toBe(true); expect(t.output.forward).toBe(0); // rebased: no launch while they rest
    expect(t.contacts.get(1)!.role).toBe('move'); expect(t.contacts.get(2)!.role).toBe('look');
    t.move(1, 90, 560, 393, 852); expect(t.output.forward).toBeGreaterThan(.7);
    t.move(2, 320, 640, 393, 852); expect(t.output.lookX).toBeGreaterThan(0);
  });
  it('a fourth finger keeps the hand blocked until the count is two', () => {
    const t = new AdaptiveThumbs();
    t.start(1, 90, 650); t.start(2, 290, 650); t.start(3, 190, 500); t.start(4, 240, 500);
    t.end(4); expect(t.mode).toBe('blocked'); t.end(3); expect(t.mode).toBe('dual');
  });
});
