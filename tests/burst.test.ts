import { beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { EVENT_RING, createShooter, type ShooterState } from '../src/game/combat';
import { ATTENUATE_FROM, BURST_GAP, advanceBurst, attenuated, burst, burstIndex, eventBurstIndex, lastShotIndex, markShotEvent,
  resetBurst } from '../src/game/burst';

/** One frame at clock t with n shots, the last `since` s ago; returns the index each shot used (as fireShot does). */
function frame(s: ShooterState, t: number, n: number, since = 0) {
  s.clock = t; s.weapon.sinceShot = since; advanceBurst(burst, s, n);
  const used: number[] = [];
  for (let k = 0; k < n; k++) used.push(burst.index++);
  return used;
}

describe('burst counter', () => {
  let s: ShooterState;
  beforeEach(() => { resetBurst(); s = createShooter(); });
  it('gives index 0 to the first shot', () => {
    expect(burstIndex()).toBe(0); expect(frame(s, 1, 1)).toEqual([0]);
    expect(burst.shots).toBe(1); expect(burst.lastT).toBe(1); expect(lastShotIndex()).toBe(0);
  });
  it('increments per shot, including several shots in one frame', () => {
    expect(frame(s, 1, 1)).toEqual([0]);
    expect(frame(s, 1 + 1 / 9, 1)).toEqual([1]);
    expect(frame(s, 1 + 4 / 9, 3)).toEqual([2, 3, 4]);
    expect(burst.shots).toBe(5); expect(lastShotIndex()).toBe(4);
    // No shot this frame: nothing changes.
    frame(s, 1.5, 0); expect(burst.index).toBe(5);
  });
  it('resets after a gap longer than .25 s, measured to the first shot of the frame', () => {
    frame(s, 1, 1); frame(s, 1 + BURST_GAP - .01, 1); expect(burst.index).toBe(2);
    expect(frame(s, 1.6, 1)).toEqual([0]);
    // Three shots in one frame whose first came .2 s after the previous shot continue the burst.
    expect(frame(s, 1.6 + .2 + 2 / 9, 3)).toEqual([1, 2, 3]);
    // The clock going backwards (epoch or clock reset) starts a new burst.
    expect(frame(s, .5, 1)).toEqual([0]);
  });
  it('attenuates from index 3 (the 4th shot)', () => {
    expect(ATTENUATE_FROM).toBe(3);
    const used = [0, 1, 2, 3, 4, 5].flatMap(k => frame(s, 1 + k / 9, 1));
    expect(used.map(attenuated)).toEqual([false, false, false, true, true, true]);
  });
  it('remembers each shot event\'s index by serial for later readers', () => {
    for (let serial = 1; serial <= EVENT_RING + 3; serial++) markShotEvent(serial, serial * 2);
    // Every event still in the ring (the last EVENT_RING serials) reads back its own index.
    for (let serial = 4; serial <= EVENT_RING + 3; serial++) expect(eventBurstIndex(serial)).toBe(serial * 2);
  });
  it('stays pure, landing-safe and small', () => {
    const src = readFileSync(new URL('../src/game/burst.ts', import.meta.url), 'utf8');
    expect(src).not.toMatch(/Math\.random\(|from 'three'|@react-three/); expect(src.split('\n').length).toBeLessThan(200);
  });
});
