import { describe, expect, it } from 'vitest';
import { HOVER, HOVER_KEYS, flightKey, hoverFires, type FlightKeyCtx, type HoverEnv } from '../src/ui/hoverPress';
const ENV: HoverEnv = { shooter: true, started: true, paused: false, desktopMode: 'trackpad', steering: 'free', touch: false };
const KEY: FlightKeyCtx = { ...ENV, cruising: false, flying: false, landing: false, canLand: false, repeat: false, targetTag: 'MAIN' };
const hover = { ...KEY, flying: true };
describe('hoverFires', () => {
  it('is true only for the free trackpad with the blaster on, live, on a desktop pointer and not cruising', () => {
    expect(hoverFires(ENV, false)).toBe(true);
    const off: [string, Partial<HoverEnv>, boolean][] = [
      ['blaster off', { shooter: false }, false], ['simple', { steering: 'simple' }, false], ['captured', { steering: 'captured' }, false],
      ['flow', { steering: 'flow' }, false], ['mouse', { desktopMode: 'mouse' }, false], ['touch', { touch: true }, false],
      ['cruising', {}, true], ['paused', { paused: true }, false], ['not started', { started: false }, false],
    ];
    for (const [name, patch, cruising] of off) expect([name, hoverFires({ ...ENV, ...patch }, cruising)]).toEqual([name, false]);
  });
});
describe('flightKey', () => {
  it('W walks on the ground and starts the cruise in hover', () => {
    expect(HOVER_KEYS.wLiftsFromGround).toBe(false);
    expect(flightKey('KeyW', KEY)).toBe('default');
    expect(flightKey('KeyW', hover)).toBe('cruise');
    const stay: [string, Partial<FlightKeyCtx>][] = [
      ['landing', { landing: true }], ['repeat', { repeat: true }], ['cruising', { cruising: true }],
      ['blaster off', { shooter: false }], ['input', { targetTag: 'INPUT' }], ['select', { targetTag: 'SELECT' }], ['textarea', { targetTag: 'TEXTAREA' }],
    ];
    for (const [name, patch] of stay) expect([name, flightKey('KeyW', { ...hover, ...patch })]).toEqual([name, 'default']);
  });
  it('Space lifts and cruises unless it lands, cancels a landing or activates a focused button', () => {
    expect(flightKey('Space', KEY)).toBe('cruise');
    expect(flightKey('Space', { ...KEY, canLand: true })).toBe('cruise');
    expect(flightKey('Space', hover)).toBe('cruise');
    expect(flightKey('Space', { ...hover, canLand: true })).toBe('default');
    expect(flightKey('Space', { ...hover, landing: true })).toBe('default');
    expect(flightKey('Space', { ...KEY, landing: true })).toBe('default');
    expect(flightKey('Space', { ...hover, targetTag: 'BUTTON' })).toBe('default');
    expect(flightKey('Space', { ...hover, touch: true })).toBe('default');
    expect(flightKey('Space', { ...hover, steering: 'simple' })).toBe('default');
    expect(flightKey('KeyS', hover)).toBe('default');
    expect(flightKey('KeyC', hover)).toBe('default');
  });
});
describe('keyboard brake while cruising', () => {
  const cruise = { ...hover, cruising: true };
  it('Space stops the cruise to hover unless a surface is in reach (then it lands), a landing runs or a button has focus', () => {
    expect(flightKey('Space', cruise)).toBe('brake');
    expect(flightKey('Space', { ...cruise, flying: false })).toBe('brake');
    const stay: [string, Partial<FlightKeyCtx>][] = [
      ['can land', { canLand: true }], ['landing', { landing: true }], ['button', { targetTag: 'BUTTON' }], ['input', { targetTag: 'INPUT' }],
      ['repeat', { repeat: true }], ['blaster off', { shooter: false }], ['simple', { steering: 'simple' }], ['captured', { steering: 'captured' }],
      ['touch', { touch: true }], ['mouse', { desktopMode: 'mouse' }], ['paused', { paused: true }],
    ];
    for (const [name, patch] of stay) expect([name, flightKey('Space', { ...cruise, ...patch })]).toEqual([name, 'default']);
  });
  it('other keys keep their meaning while cruising (W adds thrust, as at 7945430)', () => {
    for (const code of ['KeyW', 'KeyS', 'KeyC', 'KeyQ', 'ShiftLeft']) expect([code, flightKey(code, cruise)]).toEqual([code, 'default']);
  });
});
describe('HOVER', () => {
  it('keeps the 7945430 drag threshold and has no hold-to-fire timer', () => {
    expect(HOVER).toEqual({ dragPx: 6 });
  });
});
