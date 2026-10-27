import { describe, expect, it, beforeEach } from 'vitest';
import { applyHitstop, hitstopState, resetHitstop, stepHitstop, HITSTOP_DEFAULT_DURATION } from '../src/game/hitstop';

describe('hitstop engine', () => {
  beforeEach(() => {
    resetHitstop();
  });

  it('triggers hitstop with calibrated duration in seconds', () => {
    expect(hitstopState.active).toBe(false);
    applyHitstop(0.08);
    expect(hitstopState.active).toBe(true);
    expect(hitstopState.timer).toBeCloseTo(0.08, 3);
  });

  it('steps timer down and terminates hitstop when elapsed', () => {
    applyHitstop(0.08);
    // Frame 1: 0.03s elapsed
    const frozen1 = stepHitstop(0.03, false);
    expect(frozen1).toBe(true);
    expect(hitstopState.active).toBe(true);
    expect(hitstopState.timer).toBeCloseTo(0.05, 3);

    // Frame 2: 0.05s elapsed -> finishes
    const frozen2 = stepHitstop(0.05, false);
    expect(frozen2).toBe(false);
    expect(hitstopState.active).toBe(false);
    expect(hitstopState.timer).toBe(0);
  });

  it('suspends hitstop countdown while paused', () => {
    applyHitstop(0.08);
    const frozen = stepHitstop(0.05, true);
    expect(frozen).toBe(false);
    expect(hitstopState.active).toBe(true);
    expect(hitstopState.timer).toBeCloseTo(0.08, 3); // Unchanged
  });
});
