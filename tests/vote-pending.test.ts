import { describe, expect, it } from 'vitest';
import { VOTE_ROUND } from '@/lib/vote/ballot';
import { clearPending, PENDING_KEY, PENDING_MS, readPending, savePending, type Pending } from '@/ui/vote/pending';
import type { VoteStorage } from '@/ui/vote/voteTracker';

function memory(seed: Record<string, string> = {}): VoteStorage & { data: Record<string, string> } {
  const data = { ...seed };
  return { data, getItem: k => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = String(v); } };
}
const throwing: VoteStorage = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } };
const T0 = 1_760_000_000_000, N1 = '0123456789abcdef0123456789abcdef', N2 = 'fedcba9876543210fedcba9876543210';
const touch: Pending = { nonce: N1, favorite: 'draw', tried: ['one-finger', 'draw'], last: 'draw' };
const desktop: Pending = { nonce: N2, favorite: 'tie', tried: ['cursor', 'flow', 'brush'], last: 'flow' };
const raw = (o: unknown) => JSON.stringify(o);
const rec = (family: string, e: unknown) => memory({ [PENDING_KEY]: raw({ round: VOTE_ROUND, [family]: e }) });

describe('client:C2 one nonce until answered, saved pick returned', () => {
  it('a saved entry comes back whole for a retry, a reopen or a reload (same nonce, same pick)', () => {
    const s = memory();
    expect(readPending('touch', s, T0)).toBeNull();
    savePending('touch', touch, s, T0);
    expect(PENDING_KEY).toBe('halaverga.vote.pending');
    expect(readPending('touch', s, T0 + 1000)).toEqual(touch);
    expect(readPending('touch', s, T0 + 60_000)).toEqual(touch); // a reload a minute later
    expect(JSON.parse(s.data[PENDING_KEY])).toEqual({ round: VOTE_ROUND, touch: { ...touch, at: T0 } });
  });

  it('touch and desktop are kept side by side, and clearing one leaves the other', () => {
    const s = memory();
    savePending('touch', touch, s, T0);
    savePending('desktop', desktop, s, T0 + 5);
    expect(readPending('touch', s, T0 + 10)).toEqual(touch);
    expect(readPending('desktop', s, T0 + 10)).toEqual(desktop);
    clearPending('touch', s, T0 + 10);
    expect(readPending('touch', s, T0 + 10)).toBeNull();
    expect(readPending('desktop', s, T0 + 10)).toEqual(desktop);
    clearPending('desktop', s, T0 + 10);
    expect(readPending('desktop', s, T0 + 10)).toBeNull();
    expect(JSON.parse(s.data[PENDING_KEY])).toEqual({ round: VOTE_ROUND });
  });

  it('saving again with the same nonce and a changed pick keeps the nonce (the first counted pick still stands on the server)', () => {
    const s = memory();
    savePending('touch', touch, s, T0);
    savePending('touch', { ...touch, favorite: 'one-finger' }, s, T0 + 1000);
    expect(readPending('touch', s, T0 + 2000)).toEqual({ ...touch, favorite: 'one-finger' });
  });

  it('expires after 24 h (23 h 59 m 59 s still there, exactly 24 h gone), and an expired entry is dropped on the next write', () => {
    const s = memory();
    savePending('touch', touch, s, T0);
    expect(PENDING_MS).toBe(24 * 3600e3);
    expect(readPending('touch', s, T0 + PENDING_MS - 1)).toEqual(touch);
    expect(readPending('touch', s, T0 + PENDING_MS)).toBeNull();
    savePending('desktop', desktop, s, T0 + PENDING_MS + 1);
    expect(JSON.parse(s.data[PENDING_KEY]).touch).toBeUndefined();
  });

  it('an entry saved in the future (a clock that went backwards) is not offered', () => {
    const s = memory();
    savePending('touch', touch, s, T0 + 5000);
    expect(readPending('touch', s, T0)).toBeNull();
  });

  it('another round, or a record that fails any check, reads as nothing', () => {
    const good = { ...touch, at: T0 };
    expect(readPending('touch', memory({ [PENDING_KEY]: raw({ round: 'r2', touch: good }) }), T0)).toBeNull();
    expect(readPending('touch', rec('touch', good), T0)).toEqual(touch); // the control: the same record passes
    const bad: unknown[] = [
      { ...good, nonce: 'x' }, { ...good, nonce: N1.toUpperCase() }, { ...good, nonce: 5 }, { ...good, at: 'soon' }, { ...good, at: null },
      { ...good, tried: ['draw'] }, { ...good, tried: ['draw', 'draw'] }, { ...good, tried: ['draw', 'cursor'] }, { ...good, tried: 'draw' },
      { ...good, last: 'brush' }, { ...good, last: 'cursor' }, { ...good, favorite: 'brush' }, { ...good, favorite: 'cursor' }, { ...good, favorite: 7 },
      { ...good, tried: ['one-finger', 'twin-stick', 'draw', 'conduct', 'brush', 'brush'] }, null, [], 'x',
    ];
    for (const b of bad) expect(readPending('touch', rec('touch', b), T0), JSON.stringify(b)).toBeNull();
    // A touch entry is never read as desktop, whatever its ids.
    expect(readPending('desktop', rec('desktop', good), T0)).toBeNull();
  });

  it('unusable storage never throws and saves nothing', () => {
    expect(readPending('touch', throwing, T0)).toBeNull();
    expect(() => { savePending('touch', touch, throwing, T0); clearPending('touch', throwing, T0); }).not.toThrow();
    expect(readPending('touch', null, T0)).toBeNull();
    expect(() => savePending('touch', touch, null, T0)).not.toThrow();
    const corrupt = memory({ [PENDING_KEY]: '{not json' });
    expect(readPending('touch', corrupt, T0)).toBeNull();
    savePending('touch', touch, corrupt, T0);
    expect(readPending('touch', corrupt, T0)).toEqual(touch);
  });
});
