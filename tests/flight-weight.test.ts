// The angel has weight (Garo 2026-11-11: "the flight mechanics make no sense"; docs/plans/2026-11-11-flight-weight.md). A release
// is a flare over a distance, a turn has an arc and a cost, and a strike's dash is not the angel's own speed.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { FLIGHT, momentumVelocity } from '../src/game/momentumFlight';
import { WATCH_AHEAD, WATCH_LINGER, createCombatCamera, createWatch, stepCombatCamera, stepWatch } from '../src/game/combatCamera';
import { STRIKE, beginStrike, cancelStrike, strike, strikeStep } from '../src/game/strike';
import type { Intent, Vec } from '../src/game/motion';

const idle: Intent = { forward: 0, strafe: 0, vertical: 0 }, thrust: Intent = { forward: 1, strafe: 0, vertical: 0 };
const speed = (v: Vec) => Math.hypot(v.x, v.y, v.z), level = (s: number): Vec => ({ x: 0, y: 0, z: -s });
type Run = { hz?: number; yawRate?: number; pitch?: number; surge?: boolean; brake?: boolean };
/** Flies for `seconds`, turning the view at `yawRate`. stopped: when the speed first reached exactly zero (-1: never). */
function fly(v: Vec, input: Intent, seconds: number, o: Run = {}) {
  const hz = o.hz ?? 60;
  let yaw = 0, path = 0, drop = 0, low = speed(v), rose = false, stopped = -1;
  for (let k = 0; k < Math.round(seconds * hz); k++) {
    yaw += (o.yawRate ?? 0) / hz;
    const next = momentumVelocity(v, input, yaw, o.pitch ?? 0, true, o.surge ?? false, 1 / hz, o.brake ?? false);
    if (speed(next) > speed(v) + 1e-9) rose = true;
    path += speed(next) / hz; drop -= next.y / hz; low = Math.min(low, speed(next)); v = next;
    if (stopped < 0 && speed(v) === 0) stopped = (k + 1) / hz;
  }
  return { v, path, drop, low, rose, stopped };
}
const within = (value: number, want: number, share = .12) => { expect(value).toBeGreaterThan(want * (1 - share)); expect(value).toBeLessThan(want * (1 + share)); };

describe('a release is a flare, not a freeze', () => {
  it.each([[21.5, 1.53, 15.2], [32.7, 2.02, 28.3], [81, 2.91, 74]])('let go at %f m/s: at rest after about %f s and %f m', (from, secs, metres) => {
    const r = fly(level(from), idle, 6);
    within(r.stopped, secs); within(r.path, metres); expect(r.rose).toBe(false); expect(speed(r.v)).toBe(0);
  });
  it.each([[21.5, .75, 7.6], [81, 1.6, 45]])('Brake at %f m/s: at rest after about %f s and %f m', (from, secs, metres) => {
    const r = fly(level(from), idle, 6, { brake: true });
    within(r.stopped, secs); within(r.path, metres); expect(r.rose).toBe(false);
    expect(r.path).toBeLessThan(fly(level(from), idle, 6).path * .7);
  });
  it('is the same stop at 30, 60 and 120 frames a second', () => {
    // The velocities are the same (fixed sub-steps); the path here is summed once a frame, so it differs by the frame's length.
    const runs = [30, 60, 120].map(hz => fly(level(32.7), idle, 6, { hz }));
    for (const r of runs) { within(r.path, runs[1].path, .03); expect(Math.abs(r.stopped - runs[1].stopped)).toBeLessThan(.05); }
  });
  it('a released dive pulls out level as it slows and is never sped up by its own fall', () => {
    const r = fly({ x: 0, y: -60, z: -60 }, idle, 6);
    expect(r.rose).toBe(false); expect(speed(r.v)).toBe(0);
    expect(r.drop).toBeGreaterThan(0); expect(r.drop).toBeLessThan(r.path * .55); // unlevelled it would be .71 of the path
  });
  it('a release going straight down stops on its line and as hard as Brake: letting go still ends a descent', () => {
    for (const from of [29, 44, 76]) {
      const r = fly({ x: 0, y: -from, z: 0 }, idle, 6), braked = fly(level(from), idle, 6, { brake: true });
      expect(speed(r.v)).toBe(0); expect(r.rose).toBe(false); within(r.path, braked.path, .03); expect(r.drop).toBeCloseTo(r.path, 6);
      expect(r.path).toBeLessThan(fly(level(from), idle, 6).path * .7);
    }
  });
  it('has no cliff between a fall that stops on its line and one that pulls out: a little drift changes little', () => {
    const drop = (drift: number) => fly({ x: 0, y: -80, z: -drift }, idle, 6);
    for (const [a, b] of [[.99, 1.01], [0, 4], [8, 9], [12.5, 13.5], [40, 41]]) {
      expect(Math.abs(drop(a).drop - drop(b).drop)).toBeLessThan(4); expect(Math.abs(drop(a).path - drop(b).path)).toBeLessThan(4);
    }
    expect(drop(4).drop).toBeGreaterThan(drop(60).drop + 10); // a real dive does pull out
  });
  it('Rise against a straight fall stops it on its line and climbs back: it is never flung sideways', () => {
    const rise: Intent = { forward: 0, strafe: 0, vertical: 1 }, sink: Intent = { forward: 0, strafe: 0, vertical: -1 };
    for (const yaw of [0, .7, Math.PI / 2, -.7, 2.5, -2.5]) for (const drift of [0, .5]) {
      let v: Vec = { x: drift, y: 0, z: 0 }, wide = 0, lowest = 0, height = 0;
      const run = (input: Intent, seconds: number) => { for (let k = 0; k < seconds * 60; k++) { v = momentumVelocity(v, input, yaw, 0, true, false, 1 / 60); wide = Math.max(wide, Math.hypot(v.x, v.z)); height += v.y / 60; lowest = Math.min(lowest, height); } };
      run(sink, 1.5); expect(v.y).toBeLessThan(-35); run(idle, .2);
      const fell = height, across = Math.hypot(v.x, v.z); expect(across).toBeLessThan(.2 * Math.abs(v.y)); wide = 0; run(rise, 2);
      // Sideways it never has more than it fell with; it is stopped inside 16 m and climbing again.
      expect(wide).toBeLessThanOrEqual(across + 1e-9); expect(v.y).toBeGreaterThan(10); expect(lowest).toBeGreaterThan(fell - 16);
    }
    // The same the other way: Descend against a straight climb.
    let v: Vec = { x: 0, y: 30, z: 0 }; for (let k = 0; k < 120; k++) { v = momentumVelocity(v, sink, 0, 0, true, false, 1 / 60); expect(Math.hypot(v.x, v.z)).toBeLessThan(1e-9); }
    expect(v.y).toBeLessThan(-10);
  });
  it('holds its height at rest: nothing pulls a hovering angel down', () => {
    const r = fly({ x: 0, y: 0, z: 0 }, idle, 5); expect(speed(r.v)).toBe(0); expect(r.drop).toBeCloseTo(0, 12);
  });
});

describe('a turn has an arc and a cost', () => {
  it.each([[6, FLIGHT.turnRate], [21.5, FLIGHT.turnG / 21.5], [32.7, FLIGHT.turnG / 32.7], [60, FLIGHT.turnG / 60], [81, FLIGHT.turnG / 81]])(
    'at %f m/s the travel turns at no more than %f rad/s', (s, rate) => {
      const v = momentumVelocity(level(s), thrust, Math.PI / 2, 0, true, true, 1 / 60);
      const turned = Math.atan2(-v.x, -v.z); // the view asked for a quarter turn to the left
      expect(turned * 60).toBeCloseTo(Math.min(FLIGHT.turnRate, rate), 1);
    });
  it('pulling up keeps its own, higher limit and costs nothing: a dive still becomes a climb', () => {
    const v = momentumVelocity(level(60), thrust, 0, .8, true, true, 1 / 60), climb = Math.asin(v.y / speed(v));
    expect(climb * 60).toBeCloseTo(Math.min(FLIGHT.turnRate, FLIGHT.pullG / 60), 1); expect(Math.abs(v.x)).toBeLessThan(1e-9);
    expect(FLIGHT.pullG).toBeGreaterThan(FLIGHT.turnG * 2);
    // A quarter of a second pulling up spends less speed than the same time turning round.
    const pulled = fly(level(60), thrust, .25, { surge: true, pitch: .3 }), round = fly(level(60), thrust, .25, { surge: true, yawRate: 1.2 });
    expect(speed(pulled.v)).toBeGreaterThan(speed(round.v));
  });
  it('fast flight cannot follow a quick view turn: it trails the view round a wide arc', () => {
    // A quarter turn asked for at once: at 60 m/s the travel is still well short of it after a second.
    const r = fly(level(60), thrust, 1, { yawRate: 0, surge: true });
    expect(Math.abs(r.v.x)).toBeLessThan(1e-9);
    let v = level(60); for (let k = 0; k < 60; k++) v = momentumVelocity(v, thrust, Math.PI / 2, 0, true, true, 1 / 60);
    const turned = Math.atan2(-v.x, -v.z); expect(turned).toBeGreaterThan(.5); expect(turned).toBeLessThan(1.1);
  });
  it.each([[false, 21.5, 16.3], [true, 32.7, 22]])('a held turn at the one-thumb rate (surge %s) slows %f m/s to about %f, and flying straight gives it back', (surge, cruise, turning) => {
    const straight = fly({ x: 0, y: 0, z: 0 }, thrust, 8, { surge }); within(speed(straight.v), cruise, .05);
    const turn = fly(straight.v, thrust, 6, { surge, yawRate: 1.5 }); within(speed(turn.v), turning, .1);
    // The view keeps turning for the test's "straight" leg, so hold the heading it ended on.
    let v = turn.v; const yaw = 1.5 * 6; for (let k = 0; k < 480; k++) v = momentumVelocity(v, thrust, yaw, 0, true, surge, 1 / 60);
    within(speed(v), cruise, .05);
  });
  it('costs nothing to fly straight, and a gentle turn costs less than a hard one', () => {
    const from = level(32.7), hard = fly(from, thrust, 2, { surge: true, yawRate: 1.5 }), gentle = fly(from, thrust, 2, { surge: true, yawRate: .4 }), none = fly(from, thrust, 2, { surge: true });
    expect(speed(none.v)).toBeGreaterThan(speed(gentle.v)); expect(speed(gentle.v)).toBeGreaterThan(speed(hard.v) + 3);
  });
});

describe('a strike never leaves the angel faster than it arrived', () => {
  const p = { x: 0, y: 0, z: 0 }, step = (v: Vec) => strikeStep(v, p, 1 / 60, false);
  /** Ends any strike and drops a dash another test left to be taken back. */
  const clear = () => { cancelStrike(); step({ x: 0, y: 0, z: 0 }); };
  /** A dive entered at `entry` m/s and under way for a fifth of a second; returns its dash velocity. */
  function dive(entry: number) {
    clear(); beginStrike(0, { x: 0, y: 0, z: -400 }, 400);
    const v = level(entry); for (let k = 0; k < 12; k++) step(v);
    expect(speed(v)).toBeGreaterThan(100); return v;
  }
  it('the least a dash hands back is the ordinary cruise', () => { expect(STRIKE.keep).toBe(FLIGHT.cruise); });
  it.each([[0, STRIKE.keep], [15, STRIKE.keep], [60, 60]])('a dive entered at %f m/s and cancelled by the fight hands back %f', (entry, cap) => {
    const v = dive(entry); cancelStrike();
    expect(step(v)).toBe(false); expect(speed(v)).toBeCloseTo(cap, 6); expect(v.z).toBeLessThan(0);
  });
  it('a dive that never connects hands flight back at no more than it came in with', () => {
    const v = dive(15); let n = 0; while (strike.phase && n++ < 80) step(v);
    expect(strike.phase).toBe(0); expect(strike.landed).toBe(false); expect(speed(v)).toBeGreaterThan(100); // its last step, still the dash
    step(v); expect(speed(v)).toBeCloseTo(STRIKE.keep, 6);
  });
  it('takes the old dash back before a new dive launches from it, and the new dive still reaches its own speed', () => {
    const v = dive(15); cancelStrike(); beginStrike(1, { x: 0, y: 0, z: -400 }, 400); // both between two physics steps
    step(v); expect(strike.entrySpeed).toBeCloseTo(STRIKE.keep, 6); // launched from the angel's own speed, not from the old dash
    for (let k = 0; k < 12; k++) step(v);
    expect(speed(v)).toBeGreaterThan(100);
    cancelStrike(); step(v); expect(speed(v)).toBeCloseTo(STRIKE.keep, 6);
  });
  it('leaves a running strike alone, and ordinary flight afterwards: the dash is taken back once', () => {
    const v = dive(15); step(v); expect(speed(v)).toBeGreaterThan(100);
    cancelStrike(); step(v);
    const fast = level(70); expect(step(fast)).toBe(false); expect(speed(fast)).toBe(70);
  });
  it('a step-in has no arrival speed of its own: cut short, it hands back the ordinary cruise at most', () => {
    dive(80); cancelStrike(); beginStrike(0, { x: 0, y: 0, z: -11 }, 11, .17);
    const v = level(0); step(v); expect(speed(v)).toBeGreaterThan(40);
    cancelStrike(); step(v); expect(speed(v)).toBeCloseTo(STRIKE.keep, 6);
  });
});

describe('the view stays on the heading while the angel is flown', () => {
  const DT = 1 / 60, hover = { cast: 3, casting: true, flown: false, looked: false, open: true, ahead: 20, dt: DT };
  it('from a hover it follows the demon down, stays a beat on where it struck, and lets go', () => {
    const w = createWatch();
    for (let n = 0; n < 60; n++) { stepWatch(w, hover); expect(w.falling).toBe(true); expect(w.watching).toBe(true); expect(w.dropped).toBe(false); }
    let beat = 0, drops = 0;
    for (let n = 0; n < 60; n++) { stepWatch(w, { ...hover, casting: false }); expect(w.falling).toBe(false); if (w.watching) beat += DT; if (w.dropped) drops++; }
    expect(beat).toBeCloseTo(WATCH_LINGER, 1); expect(drops).toBe(1); expect(w.watching).toBe(false);
  });
  it('asking for movement drops it on that frame, and it does not come back for that cast when the key is let go', () => {
    const w = createWatch(); for (let n = 0; n < 20; n++) stepWatch(w, hover);
    stepWatch(w, { ...hover, flown: true }); expect(w.watching).toBe(false); expect(w.dropped).toBe(true);
    stepWatch(w, { ...hover, flown: true }); expect(w.dropped).toBe(false); // told once
    for (let n = 0; n < 60; n++) { stepWatch(w, hover); expect(w.watching).toBe(false); } // a tapped key: no bounce back
    for (let n = 0; n < 30; n++) { stepWatch(w, { ...hover, casting: false }); expect(w.watching).toBe(false); } // nor a beat on the landing
  });
  it('looking elsewhere drops it for good too, and flying through the landing ends the beat', () => {
    const w = createWatch(); for (let n = 0; n < 20; n++) stepWatch(w, hover);
    stepWatch(w, { ...hover, looked: true }); expect(w.watching).toBe(false); expect(w.dropped).toBe(true);
    for (let n = 0; n < 60; n++) { stepWatch(w, hover); expect(w.watching).toBe(false); }
    const beat = createWatch(); for (let n = 0; n < 20; n++) stepWatch(beat, hover);
    stepWatch(beat, { ...hover, casting: false }); expect(beat.watching).toBe(true);
    stepWatch(beat, { ...hover, casting: false, flown: true }); expect(beat.watching).toBe(false); expect(beat.dropped).toBe(true);
  });
  it('the next demon cast down is watched afresh; one behind the pilot, or while a dive owns the view, is not', () => {
    const w = createWatch(); for (let n = 0; n < 5; n++) stepWatch(w, hover);
    stepWatch(w, { ...hover, flown: true }); for (let n = 0; n < 5; n++) stepWatch(w, hover); expect(w.watching).toBe(false);
    stepWatch(w, { ...hover, cast: 5 }); expect(w.watching).toBe(true); // straight on to another demon
    const again = createWatch(); stepWatch(again, { ...hover, flown: true }); stepWatch(again, { ...hover, casting: false, ahead: 0 });
    stepWatch(again, hover); expect(again.watching).toBe(true); // the same demon cast down again later
    for (const off of [{ ahead: WATCH_AHEAD }, { ahead: -30 }, { open: false }, { cast: -1, casting: false }]) {
      const none = createWatch(); stepWatch(none, { ...hover, ...off }); expect(none.watching).toBe(false); expect(none.dropped).toBe(false);
    }
  });
  it('a dropped watch does not leave the planner turning the pilot down at the demon', () => {
    const s = createCombatCamera();
    const at = { yaw: 0, pitch: 0, pilotYaw: 0, pilotPitch: 0, epoch: 1, enabled: true, reduced: false, target: 0, aim: { x: 0, y: -30, z: -30 }, hero: { x: 0, y: 20, z: 0 }, aspect: 1.6, dt: DT };
    for (let n = 0; n < 12; n++) stepCombatCamera(s, { ...at, phase: 1 }); // the view on the falling demon
    expect(s.tracking).toBe(true); expect(s.pitch).toBeLessThan(-.2);
    // Left alone, its hold keeps it tracking through the strike's last beat (phase 2): that is what turned the pilot.
    const kept = { ...s }; stepCombatCamera(kept, { ...at, phase: 2 }); expect(kept.tracking).toBe(true);
    stepCombatCamera(s, { ...at, phase: 2, release: true }); expect(s.tracking).toBe(false);
  });
  it('is wired through the rig and the physics step (their own code is not unit-testable: pinned as text)', () => {
    const rig = readFileSync('src/game/CameraRig.tsx', 'utf8'), player = readFileSync('src/game/Player.tsx', 'utf8');
    expect(rig).toContain("stepWatch(watch, { cast, casting, flown: runtime.flown, looked: combat.current.manual > 0, open: finisher < 0 && !stringing && strike.phase !== 1,");
    expect(rig).toContain('release: watch.dropped });'); expect(rig).toContain('const watching = watch.watching;');
    expect(rig.indexOf('stepWatch(watch')).toBeLessThan(rig.indexOf('stepCombatCamera(combat.current')); // decided before the planner steps
    expect(player).toContain('runtime.flown = moving(intent) || gesture.live && gesture.velocityOn;');
    expect(player.indexOf('runtime.flown = ')).toBeLessThan(player.indexOf('strikeStep(v, p, dt, state.reduced, runtime.flown)'));
  });
});
