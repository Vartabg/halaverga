import { afterEach, describe, expect, it, vi } from 'vitest';
import { createNudges, type NudgeKey } from '../src/ui/nudges';
afterEach(() => { vi.useRealTimers(); });
describe('keyboard nudges for Rise and Descend', () => {
  const setup = (heldKeys: NudgeKey[] = []) => {
    const v: Record<NudgeKey, number> = { rise: 0, descend: 0 };
    return { v, n: createNudges((k, x) => { v[k] = x; }, k => heldKeys.includes(k), 400) };
  };
  it('Rise then Descend within 400 ms: both end on their own timers (Rise is never stuck on)', () => {
    vi.useFakeTimers(); const { v, n } = setup();
    n.pulse('rise'); vi.advanceTimersByTime(100); n.pulse('descend');
    expect(v).toEqual({ rise: 1, descend: 1 });
    vi.advanceTimersByTime(300); expect(v).toEqual({ rise: 0, descend: 1 });
    vi.advanceTimersByTime(100); expect(v).toEqual({ rise: 0, descend: 0 });
  });
  it('a repeat press restarts that key only; a finger still holding the key keeps it', () => {
    vi.useFakeTimers(); const { v, n } = setup(['descend']);
    n.pulse('rise'); vi.advanceTimersByTime(300); n.pulse('rise'); vi.advanceTimersByTime(300);
    expect(v.rise).toBe(1); vi.advanceTimersByTime(100); expect(v.rise).toBe(0);
    n.pulse('descend'); vi.advanceTimersByTime(500); expect(v.descend).toBe(1);
  });
  it('clear cancels pending ends', () => {
    vi.useFakeTimers(); const { v, n } = setup();
    n.pulse('rise'); n.clear(); vi.advanceTimersByTime(1000); expect(v.rise).toBe(1);
  });
});
