import { beforeEach, describe, expect, it } from 'vitest';
import { aimHeld, createShooter, pressFire, resetShooterInput, type ShooterState } from '../src/game/combat';
import { keyDown, keyUp, lockedClickFire, lookSourceFor, mouseDown, mouseUp, OWN_LOOK_SELECTOR, type ShooterEnv } from '../src/ui/shooterKeys';
const base: ShooterEnv = { enabled: true, started: true, paused: false, aimToggle: false, desktopMode: 'trackpad', steering: 'free', locked: false };
const key = (code: string, extra: Partial<Parameters<typeof keyDown>[0]> = {}) =>
  ({ code, repeat: false, metaKey: false, ctrlKey: false, altKey: false, targetTag: 'BODY', ...extra });
let s: ShooterState;
beforeEach(() => { s = createShooter(); });
const idle = (st: ShooterState) => expect([st.input.fire, st.input.fireSource, st.input.aim, st.input.aimLatched, st.input.pressSerial]).toEqual([false, 'none', false, false, 0]);
describe('keyDown gating', () => {
  const cases: [string, ReturnType<typeof key>, Partial<ShooterEnv>][] = [
    ['disabled', key('KeyC'), { enabled: false }], ['paused', key('KeyC'), { paused: true }], ['not started', key('KeyC'), { started: false }],
    ['meta', key('KeyC', { metaKey: true }), {}], ['ctrl', key('KeyC', { ctrlKey: true }), {}], ['alt', key('KeyQ', { altKey: true }), {}],
    ['input', key('KeyC', { targetTag: 'INPUT' }), {}], ['select', key('KeyQ', { targetTag: 'SELECT' }), {}], ['textarea', key('KeyC', { targetTag: 'TEXTAREA' }), {}],
    ['repeat', key('KeyC', { repeat: true }), {}], ['repeat Q', key('KeyQ', { repeat: true }), {}],
  ];
  for (const [name, e, env] of cases) it(`ignores ${name}`, () => {
    expect(keyDown(e, { ...base, ...env }, s)).toBe(false); idle(s);
  });
  it('leaves every other key to useInput', () => {
    for (const code of ['KeyE', 'KeyR', 'KeyF', 'Space', 'ShiftLeft', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowLeft', 'ArrowUp']) expect(keyDown(key(code), base, s)).toBe(false);
    idle(s);
  });
  it('still handles keys on buttons (only form fields are skipped)', () => expect(keyDown(key('KeyC', { targetTag: 'BUTTON' }), base, s)).toBe(true));
});
describe('keyDown effects', () => {
  it('C fires with source keys', () => {
    expect(keyDown(key('KeyC'), base, s)).toBe(true);
    expect([s.input.fire, s.input.fireSource, s.input.pressSerial]).toEqual([true, 'keys', 1]);
  });
  it('Q holds aim until Q up', () => {
    expect(keyDown(key('KeyQ'), base, s)).toBe(true);
    expect([s.input.aim, s.input.aimLatched, aimHeld(s)]).toEqual([true, false, true]);
    keyUp('KeyQ', base, s); expect(aimHeld(s)).toBe(false);
  });
  it('with aimToggle Q toggles and key up does not release', () => {
    const env = { ...base, aimToggle: true };
    keyDown(key('KeyQ'), env, s); keyUp('KeyQ', env, s);
    expect([s.input.aim, s.input.aimLatched]).toEqual([false, true]);
    keyDown(key('KeyQ'), env, s); keyUp('KeyQ', env, s);
    expect(aimHeld(s)).toBe(false);
  });
});
describe('keyUp', () => {
  it('releases only its own source', () => {
    pressFire(s, 'touch'); keyUp('KeyC', base, s);
    expect([s.input.fire, s.input.fireSource]).toEqual([true, 'touch']);
    keyDown(key('KeyC'), base, s); keyUp('KeyC', base, s);
    expect([s.input.fire, s.input.fireSource]).toEqual([false, 'none']);
  });
  it('is ungated, so a hold ends even after pause or disable', () => {
    keyDown(key('KeyC'), base, s); keyDown(key('KeyQ'), base, s);
    const off = { ...base, enabled: false, paused: true, started: false };
    keyUp('KeyC', off, s); keyUp('KeyQ', off, s);
    expect([s.input.fire, s.input.aim]).toEqual([false, false]);
  });
  it('a press and release before any frame still bumps pressSerial', () => {
    keyDown(key('KeyC'), base, s); keyUp('KeyC', base, s);
    expect(s.input.fire).toBe(false); expect(s.input.pressSerial).toBe(1);
    keyDown(key('KeyC'), base, s); keyUp('KeyC', base, s);
    expect(s.input.pressSerial).toBe(2);
  });
});
describe('mouseDown and mouseUp', () => {
  const mouse = { ...base, desktopMode: 'mouse' as const, locked: true }, simple = { ...base, steering: 'simple', locked: true };
  it('lockedClickFire holds only for locked mouse mode or locked trackpad simple', () => {
    expect(lockedClickFire(mouse)).toBe(true); expect(lockedClickFire(simple)).toBe(true);
    for (const steering of ['free', 'captured', 'flow']) expect(lockedClickFire({ ...base, steering, locked: true })).toBe(false);
    expect(lockedClickFire({ ...mouse, locked: false })).toBe(false); expect(lockedClickFire({ ...simple, locked: false })).toBe(false);
    for (const env of [{ enabled: false }, { paused: true }, { started: false }]) expect(lockedClickFire({ ...mouse, ...env })).toBe(false);
  });
  it('fires on LMB when locked in mouse mode or simple', () => {
    for (const env of [mouse, simple]) {
      const st = createShooter();
      expect(mouseDown(0, env, st)).toBe(true);
      expect([st.input.fire, st.input.fireSource, st.input.pressSerial]).toEqual([true, 'click', 1]);
    }
  });
  it('does not fire for free, captured or flow profiles, or unlocked', () => {
    for (const steering of ['free', 'captured', 'flow']) expect(mouseDown(0, { ...base, steering, locked: true }, s)).toBe(false);
    expect(mouseDown(0, { ...mouse, locked: false }, s)).toBe(false);
    expect(mouseDown(0, { ...simple, locked: false }, s)).toBe(false);
    idle(s);
  });
  it('RMB aims only in mouse mode', () => {
    expect(mouseDown(2, simple, s)).toBe(false); idle(s);
    expect(mouseDown(2, mouse, s)).toBe(true); expect(s.input.aim).toBe(true);
    mouseUp(2, mouse, s); expect(s.input.aim).toBe(false);
    mouseDown(2, { ...mouse, aimToggle: true }, s); mouseUp(2, { ...mouse, aimToggle: true }, s);
    expect(s.input.aimLatched).toBe(true);
    expect(mouseDown(1, mouse, s)).toBe(false);
  });
  it('mouseUp is ungated and releases only click fire', () => {
    mouseDown(0, mouse, s); mouseDown(2, mouse, s);
    mouseUp(0, base, s); mouseUp(2, { ...base, enabled: false }, s);
    expect([s.input.fire, s.input.aim, s.input.pressSerial]).toEqual([false, false, 1]);
    pressFire(s, 'keys'); mouseUp(0, mouse, s);
    expect(s.input.fireSource).toBe('keys');
  });
});
describe('look source and selector', () => {
  it('maps pointer types', () => {
    for (const mode of ['trackpad', 'mouse'] as const) { expect(lookSourceFor('touch', mode)).toBe('touch'); expect(lookSourceFor('pen', mode)).toBe('touch'); }
    expect(lookSourceFor('mouse', 'mouse')).toBe('mouse'); expect(lookSourceFor('mouse', 'trackpad')).toBe('trackpad');
  });
  it('covers the tap pad and the Fire/Aim wrapper', () => {
    expect(OWN_LOOK_SELECTOR).toContain('[aria-label="Tap flight controls"]');
    expect(OWN_LOOK_SELECTOR).toContain('[data-shooter-controls]');
    expect(OWN_LOOK_SELECTOR.split(',').map(p => p.trim())).toEqual(['[aria-label="Tap flight controls"]', '[data-shooter-controls]']);
  });
});
it('resetShooterInput after holds clears everything but keeps the serial', () => {
  const env = { ...base, desktopMode: 'mouse' as const, locked: true };
  keyDown(key('KeyC'), env, s); keyDown(key('KeyQ'), { ...env, aimToggle: true }, s); mouseDown(2, env, s);
  s.input.touchId = 7; s.input.tapFireUntil = 3;
  resetShooterInput(s);
  expect(s.input).toMatchObject({ fire: false, fireSource: 'none', aim: false, aimLatched: false, touchId: null, tapFireUntil: 0, pressSerial: 1 });
  expect(aimHeld(s)).toBe(false);
});
