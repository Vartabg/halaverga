import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createShooter, pressAim, type ShooterState } from '../src/game/combat';
import { runtime, startFlow, stopTrackpad } from '../src/game/runtime';
import { useGame } from '../src/game/store';
import { keyDown, keyUp, lockedClickFire, lookSourceFor, mouseDown, mouseUp, simplePrimaryPress, swallowsPress, type ShooterEnv } from '../src/ui/shooterKeys';
// One finger + keyboard with the blaster: keys fly, the finger looks, a locked click fires. Blaster off keeps PR #12's click brake.
const on: ShooterEnv = { enabled: true, started: true, paused: false, aimToggle: false, desktopMode: 'trackpad', steering: 'simple', locked: false };
const off = { ...on, enabled: false };
const click = (extra: Partial<{ button: number; ctrlKey: boolean; metaKey: boolean; altKey: boolean }> = {}) =>
  ({ button: 0, ctrlKey: false, metaKey: false, altKey: false, ...extra });
const key = (code: string, repeat = false) => ({ code, repeat, metaKey: false, ctrlKey: false, altKey: false, targetTag: 'BODY' });
let s: ShooterState;
beforeEach(() => { s = createShooter(); });

describe('simple profile primary press', () => {
  it('the first, engaging click never fires: it engages capture on release', () => {
    expect(simplePrimaryPress(click(), on, false)).toBe('engage');
    expect(mouseDown(0, on, s)).toBe(false); mouseUp(0, on, s);
    expect([s.input.fire, s.input.fireSource, s.input.pressSerial]).toEqual([false, 'none', 0]);
  });
  it('a locked click fires with source click, never brakes, and a hold keeps firing until release', () => {
    const locked = { ...on, locked: true };
    expect(simplePrimaryPress(click(), locked, false)).toBe('fire');
    expect(mouseDown(0, locked, s)).toBe(true);
    expect([s.input.fire, s.input.fireSource, s.input.pressSerial]).toEqual([true, 'click', 1]);
    // Held: nothing but a release (or an interruption) ends automatic fire.
    keyUp('KeyC', locked, s); keyUp('KeyQ', locked, s);
    expect(s.input.fire).toBe(true);
    mouseUp(0, locked, s);
    expect([s.input.fire, s.input.fireSource]).toEqual([false, 'none']);
    expect(mouseDown(0, locked, s)).toBe(true); expect(s.input.pressSerial).toBe(2);
  });
  it('with the blaster off a locked or pending click brakes exactly as PR #12, and never fires', () => {
    expect(simplePrimaryPress(click(), { ...off, locked: true }, false)).toBe('brake');
    expect(simplePrimaryPress(click(), off, true)).toBe('brake');
    expect(simplePrimaryPress(click(), off, false)).toBe('engage');
    expect(mouseDown(0, { ...off, locked: true }, s)).toBe(false);
    expect([s.input.fire, s.input.pressSerial]).toEqual([false, 0]);
  });
  it('a click while capture is still pending brakes (the lock has not arrived, so it is not a shot)', () => {
    expect(simplePrimaryPress(click(), on, true)).toBe('brake');
    expect(mouseDown(0, on, s)).toBe(false);
  });
  it('ignores paused, modified and non-primary presses; a paused locked click neither fires nor brakes', () => {
    for (const e of [click({ ctrlKey: true }), click({ metaKey: true }), click({ altKey: true }), click({ button: 1 }), click({ button: 2 })])
      expect(simplePrimaryPress(e, { ...on, locked: true }, false)).toBe('ignore');
    expect(simplePrimaryPress(click(), { ...on, locked: true, paused: true }, false)).toBe('ignore');
    expect(simplePrimaryPress(click(), { ...off, locked: true, paused: true }, false)).toBe('ignore');
  });
  it('free, captured and Flow keep C: a locked click there is never a shot', () => {
    for (const steering of ['free', 'captured', 'flow']) expect(mouseDown(0, { ...on, steering, locked: true }, s)).toBe(false);
    expect(s.input.pressSerial).toBe(0);
  });
  it('Q aims (hold or toggle), right-click never aims, and the trackpad look source drives assist', () => {
    const locked = { ...on, locked: true };
    expect(keyDown(key('KeyQ'), locked, s)).toBe(true); expect(s.input.aim).toBe(true);
    keyUp('KeyQ', locked, s); expect(s.input.aim).toBe(false);
    const toggle = { ...locked, aimToggle: true };
    keyDown(key('KeyQ'), toggle, s); keyUp('KeyQ', toggle, s); expect(s.input.aimLatched).toBe(true);
    expect(mouseDown(2, locked, createShooter())).toBe(false);
    expect(lookSourceFor('mouse', 'trackpad')).toBe('trackpad');
  });
  it('keyboard auto-repeat cannot start fire or aim', () => {
    expect(keyDown(key('KeyC', true), on, s)).toBe(false); expect(keyDown(key('KeyQ', true), on, s)).toBe(false);
    expect([s.input.fire, s.input.aim, s.input.pressSerial]).toEqual([false, false, 0]);
  });
});

describe('interruptions clear a held click shot', () => {
  const doc = { pointerLockElement: {} as unknown, exitPointerLock: vi.fn() };
  beforeEach(() => {
    vi.stubGlobal('document', doc); doc.pointerLockElement = {}; doc.exitPointerLock.mockClear();
    useGame.setState({ started: true, paused: false, shooter: true, desktopMode: 'trackpad', trackpadSteering: 'simple' });
  });
  afterEach(() => { vi.unstubAllGlobals(); useGame.setState({ started: false, paused: true }); });
  it('blur, Escape and hidden pages pause: fire and aim clear and the pointer is freed', async () => {
    const { pause } = await import('../src/ui/useInput');
    const sh = runtime.shooter;
    mouseDown(0, { ...on, locked: true }, sh); pressAim(sh, false);
    expect([sh.input.fire, sh.input.aim]).toEqual([true, true]);
    pause();
    expect([sh.input.fire, sh.input.fireSource, sh.input.aim]).toEqual([false, 'none', false]);
    expect(useGame.getState().paused).toBe(true); expect(doc.exitPointerLock).toHaveBeenCalledOnce();
  });
});

describe('one gate decides a firing press', () => {
  const presses = [click(), click({ ctrlKey: true }), click({ metaKey: true }), click({ altKey: true }), click({ button: 1 }), click({ button: 2 })];
  const grid = (steering: string, desktopMode: 'trackpad' | 'mouse', check: (e: ReturnType<typeof click>, env: ShooterEnv, requesting: boolean) => void) => {
    for (const enabled of [true, false]) for (const started of [true, false]) for (const paused of [true, false]) for (const locked of [true, false])
      for (const requesting of [true, false]) for (const e of presses) check(e, { ...on, enabled, started, paused, locked, steering, desktopMode }, requesting);
  };
  it('in simple, the capture-phase gate swallows exactly the presses the flight surface routes to fire (never fire and brake)', () => {
    let fired = 0;
    grid('simple', 'trackpad', (e, env, requesting) => {
      const route = simplePrimaryPress(e, env, requesting);
      expect(swallowsPress(e, env, requesting)).toBe(route === 'fire');
      if (route === 'fire') { fired++; expect(env.locked && env.enabled).toBe(true); }
    });
    expect(fired).toBe(2);
  });
  it('mouse mode and the other trackpad profiles keep the base locked-click gate', () => {
    grid('free', 'mouse', (e, env) => expect(swallowsPress(e, env, false)).toBe(e.button === 0 && lockedClickFire(env)));
    for (const steering of ['free', 'captured', 'flow']) grid(steering, 'trackpad', (e, env, requesting) => expect(swallowsPress(e, env, requesting)).toBe(false));
  });
});

describe('the capture click on the ground', () => {
  afterEach(() => { stopTrackpad(); runtime.lift = false; useGame.setState({ flying: false, shooter: true, trackpadSteering: 'simple' }); });
  const capture = (patch: Partial<ReturnType<typeof useGame.getState>>) => { useGame.setState({ flying: false, ...patch }); startFlow(); return runtime.lift; };
  it('with the blaster in one finger + keyboard only frees the view: keys lift, the click never does', () => {
    expect(capture({ trackpadSteering: 'simple', shooter: true })).toBe(false);
    expect(runtime.trackpad.active).toBe(true); expect(useGame.getState().trackpadFlying).toBe(true);
  });
  it('keeps the lift into hover with the blaster off (PR #12) and in Flow, and never lifts an airborne suit', () => {
    expect(capture({ trackpadSteering: 'simple', shooter: false })).toBe(true);
    expect(capture({ trackpadSteering: 'flow', shooter: true })).toBe(true);
    expect(capture({ trackpadSteering: 'flow', shooter: false })).toBe(true);
    expect(capture({ trackpadSteering: 'simple', shooter: false, flying: true })).toBe(false);
  });
});
