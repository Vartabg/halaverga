import { beforeEach, describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { DESCEND_RATE, clearInput, readIntent, releaseHeldInput, releaseKeys, runtime } from '../src/game/runtime';
import { pressFire } from '../src/game/combat';
import { useGame } from '../src/game/store';
beforeEach(() => {
  clearInput(true);
  Object.assign(runtime.stick, { moves: 0, climbs: 0, lookTravel: 0 });
  useGame.setState({ trackpadSteering: 'simple', landing: false });
});
const stick = (patch: Partial<typeof runtime.stick>) => Object.assign(runtime.stick, patch);
describe('runtime touch input', () => {
  it('adds the stick to the intent inside the existing clamps', () => {
    stick({ forward: .6, strafe: -.4 });
    expect(readIntent()).toMatchObject({ forward: .6, strafe: -.4, vertical: 0 });
    runtime.keys.add('KeyW'); runtime.keys.add('KeyA');
    expect(readIntent()).toMatchObject({ forward: 1, strafe: -1 });
  });
  it('Rise climbs, Descend sinks at .7, both hover, and a spent Descend stops sinking', () => {
    stick({ rise: 1 }); expect(readIntent().vertical).toBe(1);
    stick({ rise: 0, descend: 1 }); expect(readIntent().vertical).toBeCloseTo(-.7, 12); expect(DESCEND_RATE).toBe(.7);
    stick({ rise: 1, descend: 1 }); expect(readIntent().vertical).toBe(0);
    stick({ rise: 0, descend: 1, descendUsed: true }); expect(readIntent().vertical).toBe(0);
    stick({ rise: 1, descend: 1, descendUsed: true }); expect(readIntent().vertical).toBe(0);
    runtime.keys.add('KeyR'); stick({ rise: 1, descend: 0, descendUsed: false }); expect(readIntent().vertical).toBe(1);
  });
  it('releaseHeldInput lets go of held input but keeps velocity, a latched Aim, the trackpad and the landing', () => {
    runtime.velocity.x = 9; runtime.velocity.y = -2;
    runtime.keys.add('KeyW'); runtime.tap.forward = 1; runtime.surge = true; runtime.lift = true;
    runtime.thumb.active = true; runtime.thumb.throttle = .5;
    stick({ forward: 1, strafe: .2, rise: 1, descend: 1, descendUsed: true, active: true, boost: true, cruise: true, moves: 3, climbs: 2, lookTravel: 1.5 });
    runtime.trackpad.active = true;
    const goal = new Vector3(1, 2, 3); runtime.landGoal = goal; useGame.setState({ landing: true });
    const s = runtime.shooter; s.input.aimLatched = true;
    pressFire(s, 'touch'); s.input.touchId = 4;
    const epoch = runtime.touchEpoch;
    releaseHeldInput();
    expect([runtime.velocity.x, runtime.velocity.y]).toEqual([9, -2]);
    expect(s.input.aimLatched).toBe(true); expect(runtime.trackpad.active).toBe(true);
    expect(runtime.landGoal).toBe(goal); expect(useGame.getState().landing).toBe(true);
    expect([s.input.fire, s.input.fireSource, s.input.touchId]).toEqual([false, 'none', null]);
    expect([runtime.keys.size, runtime.tap.forward, runtime.surge, runtime.lift, runtime.thumb.active, runtime.thumb.throttle]).toEqual([0, 0, false, false, false, 0]);
    const st = runtime.stick;
    expect([st.forward, st.strafe, st.rise, st.descend, st.descendUsed, st.active, st.boost, st.cruise]).toEqual([0, 0, 0, 0, false, false, false, false]);
    expect([st.moves, st.climbs, st.lookTravel]).toEqual([3, 2, 1.5]);
    expect(runtime.touchEpoch).toBe(epoch + 1);
    runtime.trackpad.active = false;
  });
  it('releaseKeys (touch-mode blur) drops only the keyboard: the stick, Rise, a touch Fire and the touch epoch stay', () => {
    runtime.keys.add('KeyW'); runtime.surge = true;
    stick({ forward: 1, strafe: .3, rise: 1, active: true, boost: true });
    const s = runtime.shooter; pressFire(s, 'touch'); s.input.touchId = 4;
    const epoch = runtime.touchEpoch;
    releaseKeys();
    expect([runtime.keys.size, runtime.surge]).toEqual([0, false]);
    expect([runtime.stick.forward, runtime.stick.strafe, runtime.stick.rise, runtime.stick.active, runtime.stick.boost]).toEqual([1, .3, 1, true, true]);
    expect([s.input.fire, s.input.fireSource, s.input.touchId]).toEqual([true, 'touch', 4]);
    expect(runtime.touchEpoch).toBe(epoch);
    clearInput(true); pressFire(s, 'keys'); releaseKeys();
    expect([s.input.fire, s.input.fireSource]).toEqual([false, 'none']); // a C-key hold cannot see its keyup either
  });
  it('leaves an auto-fire hold and another source\'s hold alone', () => {
    const s = runtime.shooter;
    pressFire(s, 'touch'); s.input.auto = true;
    releaseHeldInput();
    expect([s.input.fire, s.input.fireSource, s.input.auto]).toEqual([true, 'touch', true]);
    pressFire(s, 'keys'); releaseHeldInput();
    expect([s.input.fire, s.input.fireSource]).toEqual([true, 'keys']);
  });
  it('clearInput zeroes the stick (not its counters) and bumps the touch epoch', () => {
    stick({ forward: 1, strafe: 1, rise: 1, descend: 1, descendUsed: true, active: true, boost: true, cruise: true, moves: 5, climbs: 1, lookTravel: 2 });
    const epoch = runtime.touchEpoch;
    clearInput();
    const st = runtime.stick;
    expect([st.forward, st.strafe, st.rise, st.descend, st.descendUsed, st.active, st.boost, st.cruise]).toEqual([0, 0, 0, 0, false, false, false, false]);
    expect([st.moves, st.climbs, st.lookTravel]).toEqual([5, 1, 2]);
    expect(runtime.touchEpoch).toBe(epoch + 1);
  });
});
