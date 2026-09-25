import { describe, expect, it } from 'vitest';
import { canVote, eligible, emptyPlay, LOCK_MS, markSkipped, markVoted, PLAY_KEY, readMark, readPlay, savePlay, SKIP_QUIET_MS, tick,
  totalSecs, tried, VOTE_KEY, type VoteStorage } from '@/ui/vote/voteTracker';

function memory(seed: Record<string, string> = {}): VoteStorage & { data: Record<string, string> } {
  const data = { ...seed };
  return { data, getItem: k => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = String(v); } };
}
const throwing: VoteStorage = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } };
const played = (secs: Partial<Record<'standard' | 'draw' | 'conduct' | 'brush', number>>) => {
  const p = emptyPlay();
  for (const [lab, s] of Object.entries(secs)) for (let left = s as number; left > 0; left -= 60) tick(p, lab as 'draw', Math.min(60, left));
  return p;
};
const T0 = 1_760_000_000_000;

describe('vote tracker', () => {
  it('accumulates seconds per lab and saves them for this round', () => {
    const s = memory(), p = readPlay(s);
    for (let i = 0; i < 40; i++) tick(p, 'draw', 1);
    for (let i = 0; i < 5; i++) tick(p, 'brush', 1);
    tick(p, 'standard', Number.NaN); tick(p, 'standard', -3); tick(p, 'conduct', 1e9);
    expect(p.secs).toEqual({ standard: 0, draw: 40, conduct: 60, brush: 5 });
    expect(totalSecs(p)).toBe(105);
    savePlay(p, s);
    expect(readPlay(s).secs.draw).toBe(40);
    // Another round starts from zero.
    expect(readPlay(s, 'r2').secs.draw).toBe(0);
  });

  it('tried means 30 s or more, plus the current style', () => {
    const p = played({ draw: 30, brush: 29, conduct: 100 });
    expect(tried(p)).toEqual(['draw', 'conduct']);
    expect(tried(p, 'standard')).toEqual(['standard', 'draw', 'conduct']);
    expect(tried(p, 'brush')).toEqual(['draw', 'conduct', 'brush']);
  });

  it('eligible needs 2+ tried styles, 180 s in all, no vote this round and no skip in 24 h', () => {
    const none = { round: 'r1' };
    expect(eligible(played({ draw: 200 }), none, T0)).toBe(false);
    expect(eligible(played({ draw: 60, brush: 60 }), none, T0)).toBe(false);
    const good = played({ draw: 120, brush: 60 });
    expect(eligible(good, none, T0)).toBe(true);
    // The current style alone does not count toward the two.
    expect(eligible(played({ draw: 179, brush: 1, standard: 20 }), none, T0)).toBe(false);
    expect(eligible(good, { round: 'r1', at: T0 - 1000 }, T0)).toBe(false);
    expect(eligible(good, { round: 'r1', skippedAt: T0 - 1000 }, T0)).toBe(false);
    expect(eligible(good, { round: 'r1', skippedAt: T0 - SKIP_QUIET_MS - 1 }, T0)).toBe(true);
  });

  it('locks the device for 7 days after a vote, and a new round opens voting again', () => {
    const s = memory();
    markVoted(T0, s);
    const mark = readMark(s);
    expect(mark.at).toBe(T0);
    expect(canVote(mark, T0 + 1000)).toBe(false);
    expect(canVote(mark, T0 + LOCK_MS - 1)).toBe(false);
    expect(canVote(mark, T0 + LOCK_MS + 1)).toBe(true);
    expect(canVote(readMark(s, 'r2'), T0 + 1000, 'r2')).toBe(true);
    // A skip keeps the vote mark, and a vote keeps the skip.
    markSkipped(T0 + 5, s);
    expect(readMark(s)).toEqual({ round: 'r1', at: T0, skippedAt: T0 + 5 });
  });

  it('throwing or corrupt storage gives safe defaults', () => {
    expect(readPlay(throwing)).toEqual(emptyPlay());
    expect(readMark(throwing)).toEqual({ round: 'r1' });
    expect(() => { savePlay(emptyPlay(), throwing); markVoted(T0, throwing); markSkipped(T0, throwing); }).not.toThrow();
    const corrupt = memory({ [PLAY_KEY]: '{not json', [VOTE_KEY]: '[1,2]' });
    expect(readPlay(corrupt)).toEqual(emptyPlay());
    expect(readMark(corrupt)).toEqual({ round: 'r1' });
    const odd = memory({ [PLAY_KEY]: JSON.stringify({ round: 'r1', secs: { draw: 'x', brush: -5, conduct: 40, evil: 99 } }),
      [VOTE_KEY]: JSON.stringify({ round: 'r1', at: 'soon' }) });
    expect(readPlay(odd).secs).toEqual({ standard: 0, draw: 0, conduct: 40, brush: 0 });
    expect(canVote(readMark(odd), T0)).toBe(true);
    expect(readPlay(null)).toEqual(emptyPlay());
  });
});
