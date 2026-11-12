// The limits hand back a view they tipped (2026-11-11). limitSteer's face nudge tips the view up to 1.25 rad to clear a slope; it
// used to leave it there for good, so a flight with weight climbed at a crawl and the older flight shot to the sky limit. These
// drive limitSteer directly at a synthetic slope (steady contact while the view points into it), so each rule is exact.
// tests/limit-momentum.test.ts flies the same thing through the real terrain.
import { beforeEach, describe, expect, it } from 'vitest';
import { idleLimitSteer, limitSteer, resetLimitSteer } from '../src/game/limitSteer';
import { S, STEER } from '../src/game/limitLatch';
import { WORLD, type Vec } from '../src/game/motion';

const DT = 1 / 60, at = (x: number, y: number, z: number): Vec => ({ x, y, z });
/** GENTLE: a 15 degree slope rising ahead of a pilot flying -z. The nudge pitches only (to 1.25 rad), and because the rock is
 * underfoot the floor peel joins in, which settles to level. FACE: a steep face (normal 0.47 rad up): the face nudge alone, which
 * tips the view to 0.47 rad and turns the heading; this is the one that hands back toward the pilot's own pitch. */
const GENTLE = at(0, Math.cos(.262), Math.sin(.262)), FACE = at(0, .45, Math.sqrt(1 - .45 * .45)), TIP = Math.asin(.45);
type Opts = { pitch?: number; leaves?: number; until?: number; y?: number };
/** `leaves`: the slope is pressed while the view points less than this far up. `until`: or only for this long. */
function world(normal: Vec, o: Opts = {}) {
  const rt = { yaw: 0, pitch: o.pitch ?? 0 }, p = at(0, o.y ?? 60, 0);
  const w = { rt, p, thrust: true, aiming: false, level: false, t: 0, rock: true,
    step() {
      const cp = Math.cos(rt.pitch), dir = at(-Math.sin(rt.yaw) * cp, Math.sin(rt.pitch), -Math.cos(rt.yaw) * cp), commanded = w.thrust ? 34 : 0;
      const pressed = w.rock && w.thrust && rt.pitch < (o.leaves ?? .36) && w.t < (o.until ?? 99);
      limitSteer(rt, { dt: DT, p, v: at(dir.x * 10, dir.y * 10, dir.z * 10), speed: 10, commanded, target: at(dir.x * commanded, dir.y * commanded, dir.z * commanded),
        contact: { active: pressed, normal }, scrape: { active: pressed, normal }, pitchFlies: !w.level, aiming: w.aiming });
      w.t += DT;
    },
    run(seconds: number, each?: () => void) { for (let i = 0; i < Math.round(seconds / DT); i++) { each?.(); w.step(); } return w; },
    /** Thrust held until the nudge has tipped the view and let go of the face; the angel is then clear of the rock (pass true to
     * leave the rock in its way). Returns how far it tipped. */
    tip(stay = false) { const from = rt.pitch; for (let i = 0; i < 600 && !(rt.pitch - from > .15 && !S.face && !S.peel); i++) w.step(); w.rock = stay; return rt.pitch; } };
  return w;
}
beforeEach(() => resetLimitSteer());

describe('a view the limits tip is handed back', () => {
  it('hands-off at a slope: tipped steeply up, then level again within three seconds, and exactly level', () => {
    const w = world(GENTLE), tipped = w.tip(); expect(tipped).toBeGreaterThan(1); expect(S.settle).toBe(true);
    let levelAt = -1; const from = w.t; w.run(4, () => { if (levelAt < 0 && w.rt.pitch === 0) levelAt = w.t - from; });
    expect(w.rt.pitch).toBe(0); expect(S.settle).toBe(false); expect(levelAt).toBeGreaterThan(STEER.settleS); expect(levelAt).toBeLessThan(3);
  });
  it('still handed back when the pilot turns in the first moments, lets go, or the wedge takes over: however the latch ends', () => {
    // The pilot yaws at a real rate 0.2 s into the latch: the nudge yields at once, part-tipped.
    const turn = world(GENTLE); turn.run(.4); expect(S.face).toBe(true); turn.run(.1, () => { turn.rt.yaw += 1.5 * DT; });
    expect(S.face).toBe(false); const part = turn.rt.pitch; expect(part).toBeGreaterThan(.2); expect(part).toBeLessThan(1);
    turn.rock = false; turn.run(4); expect(turn.rt.pitch).toBe(0);
    // Thrust let go 0.3 s into the latch, held again two seconds later.
    resetLimitSteer(); const pause = world(GENTLE); pause.run(.5); expect(S.face).toBe(true);
    pause.thrust = false; const held = pause.rt.pitch; pause.run(2, () => expect(pause.rt.pitch).toBe(held)); // nothing moves a hovering view
    expect(held).toBeGreaterThan(.3); pause.thrust = true; pause.rock = false; pause.run(4); expect(pause.rt.pitch).toBe(0);
  });
  it('through a hover, and through steps with the limits off (a strike, a landing approach, an aimed hover)', () => {
    const w = world(GENTLE), tipped = w.tip();
    w.thrust = false; w.run(1.5); expect(w.rt.pitch).toBe(tipped); expect(S.settle).toBe(true);
    for (let i = 0; i < 30; i++) idleLimitSteer(); // the limits are off: latches go, the debt stays
    expect(S.settle).toBe(true); expect(S.face).toBe(false);
    w.thrust = true; w.run(4); expect(w.rt.pitch).toBe(0);
  });
  it('a peel cut short by a pause is handed back too', () => {
    const w = world(GENTLE, { pitch: .8, y: WORLD.ceiling - .6 }); w.rock = false; w.run(.25);
    expect(S.peel).toBe(1); const part = w.rt.pitch; expect(part).toBeLessThan(.5); expect(part).toBeGreaterThan(-.8);
    w.thrust = false; w.run(1); expect(w.rt.pitch).toBe(part); expect(S.settle).toBe(true);
    w.p.y = 80; w.thrust = true; w.run(4); expect(w.rt.pitch).toBe(0);
  });
});

describe('it goes back toward what the pilot held, and no further than level', () => {
  it('a climb the pilot chose is returned to, not flattened', () => {
    const w = world(FACE, { pitch: .2 }), tipped = w.tip(); expect(tipped).toBeCloseTo(TIP, 6); expect(S.settleTo).toBe(.2);
    w.run(4); expect(w.rt.pitch).toBe(.2); expect(S.settle).toBe(false);
  });
  it('a dive into the slope is returned to level only: the view is not pointed back into the rock', () => {
    const w = world(FACE, { pitch: -.3 }), tipped = w.tip(); expect(tipped).toBeCloseTo(TIP, 6);
    w.run(4); expect(w.rt.pitch).toBe(0);
    // And from level it is level again.
    resetLimitSteer(); const flat = world(FACE); expect(flat.tip()).toBeCloseTo(TIP, 6); flat.run(4); expect(flat.rt.pitch).toBe(0);
  });
  it('a nudge that only touches the pitch owes nothing: a steep climb grazing a steeper face keeps its climb', () => {
    // Climbing at 0.43 rad into a face whose normal stands 0.47 rad up: the nudge moves the pitch by 0.04 (and turns the heading).
    const w = world(FACE, { pitch: .43, leaves: 9, until: 1 }); w.run(1.2); expect(w.rt.pitch).toBeCloseTo(TIP, 6);
    w.run(4); expect(w.rt.pitch).toBeCloseTo(TIP, 6); expect(TIP - .43).toBeLessThan(STEER.tipped); expect(S.settle).toBe(false);
  });
  it('a second tip while the first is still owed goes back to the pilot\'s pitch, not to the half-settled one', () => {
    const w = world(FACE, { pitch: .2 }); w.tip(); w.run(STEER.settleS + .1); // the hand-back is under way
    const mid = w.rt.pitch; expect(mid).toBeLessThan(TIP - .05); expect(mid).toBeGreaterThan(.25); expect(S.settle).toBe(true);
    // The pilot turns back into the face (the first escape turned the heading away from it) and meets it again, mid hand-back.
    w.rock = true; w.rt.yaw = 0; let top = 0; w.run(1.5, () => { top = Math.max(top, w.rt.pitch); });
    expect(top).toBeCloseTo(TIP, 6); expect(S.base).toBe(.2);
    w.rock = false; w.run(5); expect(w.rt.pitch).toBe(.2);
  });
});

describe('the pilot always wins', () => {
  it('pitching at a real rate takes the view for good', () => {
    const w = world(GENTLE); w.tip(); w.rock = false; w.run(.25, () => { w.rt.pitch -= .8 * DT; });
    const own = w.rt.pitch; expect(S.settle).toBe(false); w.run(4); expect(w.rt.pitch).toBe(own);
  });
  it('pitching against the hand-back, however slowly, keeps the view where the pilot put it', () => {
    const w = world(GENTLE); w.tip(); w.rock = false; w.run(STEER.settleS + .3); expect(S.settle).toBe(true);
    w.run(.1, () => { w.rt.pitch += .2 * DT; }); // 0.2 rad/s up, under the yield rate
    const own = w.rt.pitch; expect(S.settle).toBe(false); w.run(4); expect(w.rt.pitch).toBe(own); expect(own).toBeGreaterThan(.3);
  });
  it('looking down with the hand-back is not fought: it still ends level', () => {
    const w = world(GENTLE); w.tip(); w.rock = false; w.run(STEER.settleS + .3);
    w.run(.2, () => { w.rt.pitch -= .2 * DT; }); w.run(4); expect(w.rt.pitch).toBe(0);
  });
  it('a view moved at all while hovering is the pilot\'s: the next push does not level it', () => {
    const w = world(GENTLE), tipped = w.tip(); w.thrust = false; w.run(1, () => { w.rt.pitch -= .2 * DT; });
    const own = w.rt.pitch; expect(own).toBeLessThan(tipped - .15); expect(S.settle).toBe(false);
    w.thrust = true; w.rock = false; w.run(4); expect(w.rt.pitch).toBe(own);
  });
  it('an aim while flying takes it over; level flight is never pitched at all', () => {
    const w = world(GENTLE), tipped = w.tip(); w.aiming = true; w.run(1); expect(S.settle).toBe(false);
    w.aiming = false; w.rock = false; w.run(4); expect(w.rt.pitch).toBe(tipped);
    resetLimitSteer(); const flat = world(GENTLE); flat.level = true; flat.run(4); expect(flat.rt.pitch).toBe(0);
  });
  it('a view the fight camera or the pilot moved while the limits were off is theirs', () => {
    const w = world(GENTLE), tipped = w.tip(); for (let i = 0; i < 30; i++) idleLimitSteer();
    w.rt.pitch = tipped - .3; w.rock = false; w.run(4); expect(w.rt.pitch).toBe(tipped - .3);
  });
});
