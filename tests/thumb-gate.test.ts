import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThumbGate } from '../src/game/thumbGate';
import { advanceVelocity } from '../src/game/motion';
import { TAP_MS, TAP_SLOP_TOUCH } from '../src/game/gesture/tuning';
// Dynamics review S1 (2026-09-28): a second finger that misses every drone used to join the thumbs at once and neutral() the held
// thumb (forward .48 -> 0, edgeTurn .74 -> 0, speed 13 m/s -> 0 in 2 s, back only after an 8 px slide). Every second finger is now
// pending until it lifts, slides 10 px or holds 250 ms. Node math on the real gate, AdaptiveThumbs and motion; not iPhone validation.
const W = 390, H = 844, DT = 1 / 60;
const snap = (g: ThumbGate) => ({ mode: g.thumbs.mode, active: g.thumbs.active, forward: g.thumbs.output.forward, strafe: g.thumbs.output.strafe, edgeTurn: g.thumbs.output.edgeTurn });
let changed = 0;
/** A flying thumb at the right edge of the phone, sliding 60 px up from its origin: forward .48, edgeTurn .74, cruising. */
function flying() {
  const g = new ThumbGate({ expired: () => false, paused: () => false, changed: () => { changed++; } });
  g.down(1, 380, 500, 0, -1); g.thumbs.activate(); g.move(1, 380, 440, W, H);
  return g;
}
const speedAfter = (forward: number, seconds: number) => {
  let v = { x: 0, y: 0, z: -13 };
  for (let k = 0; k < seconds / DT; k++) v = advanceVelocity(v, { forward, strafe: 0, vertical: 0 }, 0, 0, true, forward > 0, DT);
  return Math.hypot(v.x, v.y, v.z);
};
beforeEach(() => { vi.useFakeTimers(); changed = 0; });
afterEach(() => vi.useRealTimers());

describe('a quick second-finger tap leaves the flying thumb alone', () => {
  it('a tap that misses every drone: flight state bit-identical, no thumb ever starts, speed at 2 s unchanged', () => {
    const g = flying(), before = snap(g);
    expect(before.forward).toBeCloseTo(.48, 2); expect(before.edgeTurn).toBeCloseTo(.74, 2); expect(before.mode).toBe('single');
    const contacts = g.thumbs.contacts.size, calls = changed;
    g.down(2, 120, 300, 130, -1);
    expect(snap(g)).toEqual(before); expect(g.thumbs.contacts.size).toBe(contacts); expect(g.busy).toBe(true);
    vi.advanceTimersByTime(120);
    const lift = g.up(2, 121, 301, 250, W, H);
    expect(lift).toEqual({ kind: 'tap', blast: null });
    expect(snap(g)).toEqual(before); expect(g.thumbs.active).toBe(true); expect(g.thumbs.contacts.size).toBe(contacts);
    expect(changed).toBe(calls); // the thumbs were never resynced: not even a neutral frame
    vi.advanceTimersByTime(1000); expect(snap(g)).toEqual(before); // and the pending timer is gone
    expect(speedAfter(g.thumbs.output.forward, 2)).toBe(speedAfter(before.forward, 2));
    expect(speedAfter(g.thumbs.output.forward, 2)).toBeGreaterThan(16); // 16.2 m/s toward the .48 x 34 cruise; the old gate left forward 0 and 0 m/s at 2 s
  });
  it('100% of quick missed taps in a grid of positions and durations keep the same output', () => {
    let missed = 0;
    for (let x = 20; x <= 370; x += 70) for (let y = 120; y <= 800; y += 170) for (const ms of [30, 90, 160, 240]) {
      const g = flying(), before = snap(g);
      g.down(2, x, y, 0, -1); vi.advanceTimersByTime(ms - 1);
      expect(g.up(2, x + 3, y - 3, ms, W, H).kind).toBe('tap'); expect(snap(g)).toEqual(before); missed++;
    }
    expect(missed).toBe(6 * 5 * 4);
  });
  it('a quick tap on a drone blasts it and leaves the flight state identical', () => {
    const g = flying(), before = snap(g);
    g.down(2, 200, 300, 0, 3); expect(snap(g)).toEqual(before);
    expect(g.up(2, 201, 300, 100, W, H)).toEqual({ kind: 'tap', blast: { x: 201, y: 300, drone: 3 } });
    expect(snap(g)).toEqual(before);
  });
});

describe('only a slide or a hold joins the second finger as a thumb', () => {
  it.each([-1, 3])('a slide past 10 px joins at once, for a finger on empty space or on a drone (%s)', drone => {
    const g = flying(); g.down(2, 100, 400, 0, drone);
    expect(g.move(2, 100 + TAP_SLOP_TOUCH, 400, W, H)).toBe(false); expect(g.thumbs.mode).toBe('single'); // exactly the slop is still a tap
    expect(g.move(2, 100 + TAP_SLOP_TOUCH + 1, 400, W, H)).toBe(true);
    expect(g.thumbs.mode).toBe('dual'); expect(g.thumbs.contacts.size).toBe(2);
    // Empty space joins where it landed (the whole slide still looks or moves, as before the gate); a finger on a drone joins where
    // the slide crossed the slop (the drone tap path, unchanged).
    expect(g.thumbs.contacts.get(2)!.originX).toBe(drone < 0 ? 100 : 100 + TAP_SLOP_TOUCH + 1);
  });
  it('a 35 px flick of the second finger in one event still drives it (the empty-space slide is not eaten by the join)', () => {
    const g = flying(); g.down(2, 290, 650, 0, -1);
    expect(g.move(2, 325, 640, W, H)).toBe(true);
    const o = g.thumbs.output; // finger 2 is the left one: the move thumb
    expect(g.thumbs.mode).toBe('dual'); expect(Math.hypot(o.forward, o.strafe)).toBeGreaterThan(.3);
  });
  it('a still hold of 250 ms joins, 249 ms does not', () => {
    const g = flying(); g.down(2, 100, 400, 0, -1);
    vi.advanceTimersByTime(TAP_MS - 1); expect(g.thumbs.mode).toBe('single');
    vi.advanceTimersByTime(1); expect(g.thumbs.mode).toBe('dual'); expect(g.thumbs.active).toBe(true);
    expect(g.up(2, 100, 400, TAP_MS + 5, W, H).kind).toBe('thumb'); // a joined finger lifts as a thumb, never as a tap
  });
  it('a third finger still blocks the thumbs, and a first finger starts at once', () => {
    const g = flying(); g.down(2, 100, 400, 0, -1); g.down(3, 200, 300, 40, -1);
    expect(g.thumbs.mode).toBe('blocked'); expect(g.thumbs.contacts.size).toBe(3); // the second joined when the third landed
    const fresh = new ThumbGate({ expired: () => false, paused: () => false, changed: () => {} });
    fresh.down(1, 100, 700, 0, -1); expect(fresh.thumbs.contacts.size).toBe(1); expect(fresh.thumbs.mode).toBe('single');
  });
});

describe('lifting a joined second thumb', () => {
  it('the held thumb flies on where it is instead of going dead until an 8 px slide (the old neutral() left it inactive)', () => {
    const g = flying(); g.down(2, 100, 400, 0, -1); vi.advanceTimersByTime(TAP_MS);
    expect(g.thumbs.mode).toBe('dual'); expect(g.thumbs.output.forward).toBe(0);
    expect(g.up(2, 100, 400, 400, W, H).kind).toBe('thumb');
    expect(g.thumbs.mode).toBe('single'); expect(g.thumbs.active).toBe(true);
    expect(g.thumbs.output.forward).toBeCloseTo(.24, 2); // back to a cruise at the thumb's spot (thumbThrottle(0)), not 0
    expect(g.thumbs.output.edgeTurn).toBeCloseTo(.74, 2); // still turning at the edge with no re-grip
    expect(g.thumbs.output.lookX).toBe(0); expect(g.thumbs.output.lookY).toBe(0);
  });
  it('after real two-thumb use (a thumb slid past the 8 px deadzone) main stays: the remaining thumb hovers until it slides', () => {
    const g = flying(); g.down(2, 100, 400, 0, -1); vi.advanceTimersByTime(TAP_MS);
    g.move(2, 100, 380, W, H); // the joined thumb slid 20 px
    g.up(2, 100, 380, 400, W, H);
    expect(g.thumbs.mode).toBe('single'); expect(g.thumbs.active).toBe(false); expect(g.thumbs.output.forward).toBe(0);
  });
  it('a resting joined thumb that drifts under the deadzone still resumes the held thumb', () => {
    const g = flying(); g.down(2, 100, 400, 0, -1); vi.advanceTimersByTime(TAP_MS);
    g.move(2, 104, 402, W, H); g.up(2, 104, 402, 400, W, H);
    expect(g.thumbs.active).toBe(true); expect(g.thumbs.output.edgeTurn).toBeCloseTo(.74, 2);
  });
  it('lifting the flying thumb instead keeps main: the second thumb waits, inactive, for an 8 px slide', () => {
    const g = flying(); g.down(2, 100, 400, 0, -1); vi.advanceTimersByTime(TAP_MS);
    g.up(1, 380, 440, 400, W, H);
    expect(g.thumbs.mode).toBe('single'); expect(g.thumbs.active).toBe(false); expect(g.thumbs.output.forward).toBe(0);
  });
  it('a second thumb joined while the first was only resting (not yet flying) does not launch it when it lifts', () => {
    const g = new ThumbGate({ expired: () => false, paused: () => false, changed: () => {} });
    g.down(1, 300, 600, 0, -1); g.down(2, 100, 600, 10, -1); g.move(2, 100, 620, W, H); // slid: joins before the 180 ms hold lifts thumb 1
    expect(g.thumbs.mode).toBe('dual'); g.up(2, 100, 620, 400, W, H);
    expect(g.thumbs.active).toBe(false); expect(g.thumbs.output.forward).toBe(0);
  });
});

describe('review follow-ups (2026-09-28)', () => {
  const gate = () => new ThumbGate({ expired: () => false, paused: () => false, changed: () => {} });
  it('two thumbs landing together and resting: no 70 ms launch blip, dual at 250 ms, and lifting the unused one never launches the other', () => {
    const g = gate(); g.down(1, 300, 600, 0, -1); g.down(2, 100, 600, 0, -1);
    vi.advanceTimersByTime(190); // the first thumb's 180 ms lift falls due, but it waits on the pending finger
    expect(g.thumbs.mode).toBe('single'); expect(g.thumbs.active).toBe(false); expect(g.thumbs.output.forward).toBe(0);
    vi.advanceTimersByTime(70); expect(g.thumbs.mode).toBe('dual'); expect(g.thumbs.output.forward).toBe(0);
    g.up(2, 100, 600, 400, W, H);
    expect(g.thumbs.mode).toBe('single'); expect(g.thumbs.active).toBe(false); expect(g.thumbs.output.forward).toBe(0); // main's hover, not .24
  });
  it('a quick second-finger tap that outlasts the first thumb\'s hold lifts it when the tap resolves, exactly as if there had been no tap', () => {
    const g = gate(); g.down(1, 300, 600, 0, -1); vi.advanceTimersByTime(100); g.down(2, 100, 300, 100, -1);
    vi.advanceTimersByTime(100); expect(g.thumbs.active).toBe(false); // 200 ms: the lift is due, waiting
    expect(g.up(2, 100, 300, 200, W, H).kind).toBe('tap');
    expect(g.thumbs.mode).toBe('single'); expect(g.thumbs.active).toBe(true); expect(g.thumbs.output.forward).toBeCloseTo(.24, 2);
    vi.advanceTimersByTime(1000); expect(g.thumbs.output.forward).toBeCloseTo(.24, 2);
  });
  it('a tap that ends before the first thumb\'s hold is due changes nothing: the lift still comes at 180 ms', () => {
    const g = gate(); g.down(1, 300, 600, 0, -1); g.down(2, 100, 300, 10, -1); vi.advanceTimersByTime(50);
    g.up(2, 100, 300, 60, W, H); expect(g.thumbs.active).toBe(false);
    vi.advanceTimersByTime(129); expect(g.thumbs.active).toBe(false); vi.advanceTimersByTime(1); expect(g.thumbs.active).toBe(true);
  });
  it('the held thumb that keeps steering while the joined second thumb only rests still resumes when the second lifts (its own travel is not two-thumb use)', () => {
    const g = flying(); g.down(2, 100, 400, 0, -1); vi.advanceTimersByTime(TAP_MS);
    expect(g.thumbs.mode).toBe('dual');
    g.move(1, 380, 420, W, H); g.move(1, 376, 380, W, H); // the flier steers 60 px while thumb 2 rests
    g.up(2, 100, 400, 500, W, H);
    expect(g.thumbs.mode).toBe('single'); expect(g.thumbs.active).toBe(true);
    expect(g.thumbs.output.edgeTurn).toBeGreaterThan(.5); expect(g.thumbs.output.forward).toBeGreaterThan(0);
  });
  it.each([-1, 3])('a second finger lifted after 250 ms but before its timer ran (a hitch, drone %s) is a hold: it joins, never blasts, and never counts as a tap', drone => {
    const g = flying(), before = snap(g); g.down(2, 100, 400, 0, drone);
    // No timers run: the pointerup is dispatched ahead of the 250 ms callback.
    const lift = g.up(2, 100, 400, TAP_MS + 40, W, H);
    expect(lift).toEqual({ kind: 'thumb', blast: null });
    expect(g.thumbs.mode).toBe('single'); expect(g.thumbs.active).toBe(true); expect(snap(g).edgeTurn).toBeCloseTo(before.edgeTurn, 2);
    vi.advanceTimersByTime(1000); expect(g.thumbs.contacts.size).toBe(1); // and no timer joins it later
    const quick = flying(); quick.down(2, 100, 400, 0, drone);
    expect(quick.up(2, 100, 400, TAP_MS, W, H).kind).toBe('tap'); // exactly TAP_MS is still a tap
  });
});

describe('dead states recover without lifting every finger (limits plan S8)', () => {
  it('a third finger lifts and then the second: the original thumb flies again on its first move', () => {
    const g = flying(); const id = 1;
    g.down(2, 120, 300, 0, -1); vi.advanceTimersByTime(TAP_MS + 10);
    g.down(3, 200, 400, 300, -1); vi.advanceTimersByTime(TAP_MS + 10);
    expect(g.thumbs.mode).toBe('blocked');
    g.up(3, 200, 400, 600, W, H); g.up(2, 120, 300, 620, W, H);
    expect(g.thumbs.mode).toBe('single'); expect(g.thumbs.contacts.has(id)).toBe(true);
    g.move(id, 379, 439, W, H);
    expect(g.thumbs.active).toBe(true); expect(g.thumbs.output.forward).toBeGreaterThan(0);
  });
  it('a third finger lifts alone: the two thumbs are back at once (limits review F11), not blocked until every finger lifts', () => {
    const g = flying();
    g.down(2, 120, 300, 0, -1); vi.advanceTimersByTime(TAP_MS + 10);
    g.down(3, 200, 400, 300, -1); vi.advanceTimersByTime(TAP_MS + 10);
    expect(g.thumbs.mode).toBe('blocked');
    g.up(3, 200, 400, 600, W, H);
    expect(g.thumbs.mode).toBe('dual'); expect(g.thumbs.active).toBe(true); expect(g.thumbs.output.forward).toBe(0);
    g.move(2, 120, 200, W, H); expect(g.thumbs.output.forward).toBeGreaterThan(.5); // the left thumb moves again
    g.move(1, 400, 380, W, H); expect(g.thumbs.output.lookX).not.toBe(0); // and the right one looks
  });
  it('rearm: a finger still down after held input was released is a fresh grip that flies at once', () => {
    const g = new ThumbGate({ expired: () => false, paused: () => false, changed: () => { changed++; } });
    g.reset(); g.rearm(7, 200, 500, 1000);
    expect(g.thumbs.mode).toBe('single'); expect(g.thumbs.active).toBe(true); expect(g.thumbs.output.forward).toBeGreaterThan(0);
    g.move(7, 200, 440, W, H); expect(g.thumbs.output.forward).toBeGreaterThan(.2); expect(g.thumbs.output.lookX).toBe(0);
    vi.advanceTimersByTime(400); expect(g.thumbs.active).toBe(true); // the 180 ms hold timer never fires late and resets the throttle
    expect(g.thumbs.output.forward).toBeGreaterThan(.2);
  });
});
