import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Vector3 } from 'three';
import { clearInput, readIntent, releaseHeldInput, runtime } from '../src/game/runtime';
import { pressFire } from '../src/game/combat';
import { clearGesture, gesture } from '../src/game/gesture/bus';
import { SNAP_INTENT } from '../src/game/gesture/tuning';
import { useGame } from '../src/game/store';
import { levelFlight } from '../src/game/touchFlight';
import { notePointer, resetPointerMode } from '../src/game/pointerMode';
// U9 wiring of the Gesture Lab bus into runtime.readIntent, clearInput and releaseHeldInput (spec 2.7, 2.8, 3.4).
const s = runtime.shooter;
function liveBus() {
  gesture.live = true; gesture.surge = true; gesture.intent.forward = .6; gesture.intent.vertical = -.3;
  gesture.yawRate = 1; gesture.offset.x = 4; gesture.spin = 2; gesture.facing = 2; gesture.velocityOn = true; gesture.request = { kind: 'lift' };
}
function expectZeroBus() {
  expect([gesture.live, gesture.surge, gesture.velocityOn, gesture.request, gesture.facing, gesture.spin, gesture.yawRate]).toEqual([false, false, false, null, 0, 0, 0]);
  expect([gesture.intent.forward, gesture.intent.strafe, gesture.intent.vertical, gesture.offset.x]).toEqual([0, 0, 0, 0]);
}
beforeEach(() => { clearInput(true); useGame.setState({ trackpadSteering: 'free', landing: false }); gesture.scheme = 'conduct'; clearGesture(); });
afterEach(() => { gesture.scheme = 'off'; gesture.step = null; clearGesture(); runtime.landGoal = null; clearInput(true); });

describe('readIntent with the Gesture Lab', () => {
  it('adds the gesture intent while live or with no landGoal, precise only while live, and snaps crumbs to 0', () => {
    gesture.intent.forward = .5; gesture.intent.strafe = .2; gesture.live = false;
    expect(readIntent()).toEqual({ forward: .5, strafe: .2, vertical: 0 });
    runtime.landGoal = new Vector3(0, 10, 0);
    expect(readIntent()).toEqual({ forward: 0, strafe: 0, vertical: 0 });
    gesture.live = true;
    expect(readIntent()).toEqual({ forward: .5, strafe: .2, vertical: 0, precise: true });
    runtime.landGoal = null; gesture.live = false; gesture.intent.forward = SNAP_INTENT / 2; gesture.intent.strafe = 0;
    expect(readIntent()).toEqual({ forward: 0, strafe: 0, vertical: 0 });
  });
  it('clamps the sum with keys and adds nothing while the scheme is off', () => {
    gesture.intent.forward = .8; runtime.keys.add('KeyW');
    expect(readIntent().forward).toBe(1);
    gesture.scheme = 'off';
    runtime.keys.clear(); expect(readIntent()).toEqual({ forward: 0, strafe: 0, vertical: 0 });
  });
  it('sets gesture.override from the other sources only (keys, tap pad, sticks), never from its own intent', () => {
    gesture.intent.forward = 1; gesture.live = true;
    readIntent(); expect(gesture.override).toBe(false);
    runtime.keys.add('KeyA'); readIntent(); expect(gesture.override).toBe(true);
    runtime.keys.clear(); readIntent(); expect(gesture.override).toBe(false);
    runtime.tap.vertical = 1; readIntent(); expect(gesture.override).toBe(true);
    runtime.tap.vertical = 0; runtime.stick.forward = .5; readIntent(); expect(gesture.override).toBe(true);
  });
});

describe('clearing input clears the lab', () => {
  it('clearInput zeroes the bus, bumps its epoch and releases the gesture trigger', () => {
    liveBus(); pressFire(s, 'gesture'); const epoch = gesture.epoch;
    clearInput();
    expectZeroBus(); expect(gesture.epoch).toBe(epoch + 1); expect(gesture.scheme).toBe('conduct');
    expect([s.input.fire, s.input.fireSource]).toEqual([false, 'none']);
  });
  it('releaseHeldInput (rotation, a lost gesture) zeroes the bus and releases only the gesture or a manual touch trigger', () => {
    liveBus(); pressFire(s, 'gesture');
    releaseHeldInput();
    expectZeroBus(); expect([s.input.fire, s.input.fireSource]).toEqual([false, 'none']);
    pressFire(s, 'keys'); liveBus();
    releaseHeldInput();
    expectZeroBus(); expect([s.input.fire, s.input.fireSource]).toEqual([true, 'keys']);
  });
});

describe('level flight', () => {
  it('never holds a lab scheme level on touch (a drawn dive pitches the flight); standard twin still flies level', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    notePointer('touch');
    expect(levelFlight({ touchScheme: 'twin', flyWhereILook: false, controlLab: 'standard' })).toBe(true);
    for (const controlLab of ['draw', 'conduct', 'brush']) expect(levelFlight({ touchScheme: 'twin', flyWhereILook: false, controlLab })).toBe(false);
    resetPointerMode(); vi.unstubAllGlobals();
  });
});
