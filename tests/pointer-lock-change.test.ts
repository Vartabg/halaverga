import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { exitOwnPointerLock, runtime, unlockExpected } from '../src/game/runtime';
import { saveControlFields, useGame, type ControlFields } from '../src/game/store';
import { selectControl } from '../src/ui/controls/selectControl';
import { pointerLockChanged } from '../src/ui/useInput';

// The Controls sheet frees a locked pointer when it switches control, and the lock handler must read that as expected whatever the new
// control is. useInput used to accept it only while desktopMode was still 'trackpad', so switching to or from Mouse + keys (the one
// profile that changes desktopMode) paused the game, against docs/controls-demo.md ("it never pauses"). Headless Chrome holds no
// pointer lock, so the browser tests cannot see this; this drives the same handler with a stubbed lock.
const doc: { pointerLockElement: object | null; exitPointerLock: () => void } = { pointerLockElement: null, exitPointerLock: () => {} };
const setup = (fields: ControlFields) => {
  saveControlFields(fields);
  useGame.setState({ started: true, paused: false, voteOpen: false, inputEpoch: 0 });
  runtime.trackpad.unlockUntil = -Infinity;
  doc.pointerLockElement = {};
  doc.exitPointerLock = () => { doc.pointerLockElement = null; };
};
/** The sheet picks `id` while the pointer is locked; the browser then reports the lock gone (pointerlockchange). */
const pickLocked = (id: Parameters<typeof selectControl>[0]) => {
  expect(selectControl(id, { family: 'desktop' })).toBe(true);
  expect(doc.pointerLockElement).toBeNull();
  pointerLockChanged();
};
const base: ControlFields = { controlLab: 'standard', touchScheme: 'classic', trackpadSteering: 'free', desktopMode: 'trackpad' };

let clock = Date.now();
// The clock is faked and moved on between tests: a game-requested release stays expected for a short window so its twin event is not read as an Esc.
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(clock += 10_000);
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {}, removeItem: () => {} });
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
  vi.stubGlobal('document', doc);
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); runtime.trackpad.unlockUntil = -Infinity; saveControlFields(base); });

describe('pointerLockChanged: a switch made from the Controls sheet never pauses', () => {
  for (const from of ['simple', 'flow', 'captured'] as const) {
    it(`locked ${from} to Mouse + keys (desktopMode is already 'mouse' when the event fires)`, () => {
      setup({ ...base, trackpadSteering: from });
      pickLocked('mouse-keys');
      expect(useGame.getState().desktopMode).toBe('mouse');
      expect(useGame.getState().paused).toBe(false);
      expect(unlockExpected()).toBe(true); // the window, not a one-shot flag: the twin event of the same release is covered too
    });
  }
  for (const lab of ['draw', 'conduct', 'brush'] as const) {
    it(`locked Mouse + keys to ${lab} (a lab pick leaves desktopMode on 'mouse')`, () => {
      setup({ ...base, desktopMode: 'mouse' });
      pickLocked(lab);
      expect(useGame.getState().controlLab).toBe(lab);
      expect(useGame.getState().paused).toBe(false);
    });
  }
  it('locked Captured to Cursor keeps playing and releases held input', () => {
    setup({ ...base, trackpadSteering: 'captured' });
    runtime.keys.add('KeyW');
    pickLocked('cursor');
    expect(useGame.getState().paused).toBe(false);
    expect(runtime.keys.size).toBe(0);
  });
});

describe('pointerLockChanged: any other exit still pauses', () => {
  for (const mode of ['trackpad', 'mouse'] as const) {
    it(`Esc or the browser ending the lock in desktopMode ${mode}`, () => {
      setup({ ...base, desktopMode: mode, trackpadSteering: mode === 'mouse' ? 'free' : 'captured' });
      doc.pointerLockElement = null;
      pointerLockChanged();
      expect(useGame.getState().paused).toBe(true);
    });
  }
  it('does nothing while a lock is still held, or when the game is already paused or not started', () => {
    setup(base);
    pointerLockChanged();
    expect(useGame.getState().paused).toBe(false);
    doc.pointerLockElement = null;
    useGame.setState({ paused: true });
    pointerLockChanged();
    expect(useGame.getState().paused).toBe(true);
    useGame.setState({ started: false, paused: false });
    pointerLockChanged();
    expect(useGame.getState().paused).toBe(false);
  });
  it('the expected window is short: an unlock after the release has settled pauses', () => {
    setup({ ...base, trackpadSteering: 'simple' });
    pickLocked('mouse-keys');
    vi.advanceTimersByTime(1000);
    doc.pointerLockElement = null;
    pointerLockChanged();
    expect(useGame.getState().paused).toBe(true);
  });
  it('a grant and a loss reported together for one game-requested release (a resize mid-press) never pause', () => {
    setup(base);
    exitOwnPointerLock();
    pointerLockChanged(); pointerLockChanged();
    expect(useGame.getState().paused).toBe(false);
  });
});
