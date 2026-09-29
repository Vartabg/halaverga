import { afterEach, describe, expect, it, vi } from 'vitest';
import { exitOwnPointerLock, runtime, unlockExpected } from '@/game/runtime';

// Chrome dispatches two pointerlockchange events when a lock is granted and released at once (a resize right after a press).
// Both read as "unlocked", so our own exit must stay expected for a window, not for a single event (a one-shot flag paused the game).
describe('own pointer-lock exit', () => {
  afterEach(() => { vi.useRealTimers(); runtime.trackpad.unlockUntil = -Infinity; });
  it('is expected for every event inside the window and lapses after it', () => {
    vi.useFakeTimers({ toFake: ['performance'] });
    expect(unlockExpected()).toBe(false);
    exitOwnPointerLock();
    expect(unlockExpected()).toBe(true);
    expect(unlockExpected()).toBe(true); // the second event of the pair
    vi.advanceTimersByTime(399); expect(unlockExpected()).toBe(true);
    vi.advanceTimersByTime(2); expect(unlockExpected()).toBe(false); // a later Escape still pauses
  });
});
