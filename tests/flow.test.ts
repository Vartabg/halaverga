import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FlowStroke, flowSpeed } from '../src/game/flowFlight';
import { advanceVelocity, moving } from '../src/game/motion';
import { brakeFlow, clearInput, readIntent, runtime, setFlowThrottle, startFlow } from '../src/game/runtime';
import { useGame } from '../src/game/store';
const wheel = (deltaY: number, momentum?: boolean) => ({ deltaX: 0, deltaY, deltaMode: 0, momentum });
beforeEach(() => { useGame.setState(useGame.getInitialState()); clearInput(true); });
afterEach(() => { clearInput(true); useGame.setState(useGame.getInitialState()); });
describe('Flow strokes', () => {
  it('provides a continuous precise range and caps a whole stroke regardless of event count', () => {
    expect(flowSpeed(0)).toBe(0); expect(flowSpeed(1)).toBe(34);
    expect(flowSpeed(.1)).toBeCloseTo(1.105);
    const one = new FlowStroke(), many = new FlowStroke(); let u = 0;
    for (let n = 0; n < 100; n++) u = many.apply(u, wheel(-10, false), n, 1000);
    expect(u).toBeCloseTo(one.apply(0, wheel(-1000, false), 0, 1000));
    expect(u).toBeCloseTo(.2);
  });
  it('normalizes wheel units and supports reversing direction', () => {
    const stroke = () => new FlowStroke();
    expect(stroke().apply(.5, { ...wheel(-2, false), deltaMode: 1 }, 0, 1000)).toBe(stroke().apply(.5, wheel(-32, false), 0, 1000));
    expect(stroke().apply(.5, { ...wheel(-.032, false), deltaMode: 2 }, 0, 1000)).toBe(stroke().apply(.5, wheel(-32, false), 0, 1000));
    expect(stroke().apply(.5, wheel(32, false), 0, 1000, true)).toBe(stroke().apply(.5, wheel(-32, false), 0, 1000));
  });
  it('ignores horizontal, nonfinite and tagged inertia events', () => {
    const s = new FlowStroke(); s.stop(0);
    expect(s.apply(0, wheel(-160, true), 500, 1000)).toBe(0);
    expect(s.apply(0, { ...wheel(-10, false), deltaX: 20 }, 600, 1000)).toBe(0);
    expect(s.apply(0, wheel(NaN, false), 700, 1000)).toBe(0);
    expect(s.apply(0, wheel(-20, false), 710, 1000)).toBeGreaterThan(0);
  });
  it('requires both quiet and cumulative forward evidence when momentum metadata is absent', () => {
    const s = new FlowStroke(); s.stop(0);
    expect(s.apply(0, wheel(-50), 100, 1000)).toBe(0);
    expect(s.apply(0, wheel(-50), 300, 1000)).toBe(0);
    expect(s.apply(0, wheel(-4), 600, 1000)).toBe(0);
    expect(s.apply(0, wheel(-4), 610, 1000)).toBe(0);
    expect(s.apply(0, wheel(-4), 620, 1000)).toBeGreaterThan(0);
  });
  it('scrolls all the way to hover and blocks an untagged tail from restarting', () => {
    const s = new FlowStroke();
    expect(s.apply(.1, wheel(160, false), 0, 1000)).toBe(0);
    expect(s.apply(0, wheel(-160), 20, 1000)).toBe(0);
    expect(s.apply(0, wheel(-160, true), 500, 1000)).toBe(0);
    expect(s.apply(0, wheel(-40), 800, 1000)).toBeGreaterThan(0);
  });
  it('does not let a backward stroke disarm the missing-metadata restart guard', () => {
    const s = new FlowStroke(); s.stop(0);
    expect(s.apply(0, wheel(30, false), 300, 1000)).toBe(0);
    expect(s.apply(0, wheel(-30), 310, 1000)).toBe(0);
    expect(s.apply(0, wheel(-30), 600, 1000)).toBeGreaterThan(0);
  });
  it('does not treat horizontal noise as a vertical stroke', () => {
    const s = new FlowStroke(); s.stop(0);
    expect(s.apply(0, { ...wheel(-10), deltaX: 80 }, 200, 1000)).toBe(0);
    expect(s.apply(0, wheel(-20), 260, 1000)).toBeGreaterThan(0);
  });
});
describe('Flow translation and engagement', () => {
  it('lifts into hover, preserves capture when braking, and cannot restore thrust on release', () => {
    useGame.setState({ trackpadSteering: 'flow' }); startFlow();
    expect(runtime.lift).toBe(true); expect(runtime.trackpad.capture).toBe('engaged');
    expect(moving(readIntent())).toBe(false);
    setFlowThrottle(.7); runtime.keys.add('KeyW'); runtime.tap.vertical = 1;
    runtime.trackpad.held = true; brakeFlow();
    expect(moving(readIntent())).toBe(false); expect(runtime.lift).toBe(false);
    expect(runtime.trackpad.capture).toBe('engaged'); expect(runtime.trackpad.held).toBe(true);
    runtime.trackpad.held = false; expect(runtime.trackpad.selectedSpeed).toBe(0);
    clearInput(true); expect(runtime.trackpad.capture).toBe('idle');
  });
  it('recaptures airborne in hover and permits sub-3 m/s flight without changing the default deadzone', () => {
    useGame.setState({ trackpadSteering: 'flow', flying: true }); startFlow();
    expect(runtime.lift).toBe(false); setFlowThrottle(.05);
    const intent = readIntent(); expect(moving(intent)).toBe(true);
    expect(moving({ forward: intent.forward, strafe: 0, vertical: 0 })).toBe(false);
    let v = { x: 0, y: 0, z: 0 };
    for (let i = 0; i < 180; i++) v = advanceVelocity(v, intent, 0, 0, true, true, 1 / 60);
    expect(-v.z).toBeCloseTo(flowSpeed(.05), 3);
  });
  it('starts braking on the first step and stops from maximum speed within one second', () => {
    useGame.setState({ trackpadSteering: 'flow', flying: true }); startFlow(); setFlowThrottle(1); brakeFlow();
    let v = { x: 0, y: 0, z: -34 };
    v = advanceVelocity(v, readIntent(), 0, 0, true, true, 1 / 60); expect(-v.z).toBeLessThan(34);
    for (let i = 1; i < 60; i++) v = advanceVelocity(v, readIntent(), 0, 0, true, true, 1 / 60);
    expect(Math.hypot(v.x, v.y, v.z)).toBeLessThan(.1);
  });
});
