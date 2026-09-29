import { describe, expect, it } from 'vitest';
import { controlKey, controlsFor, type ControlFamily } from '@/game/controlTypes';
import { autoNeed, canVote, eligible, ELIGIBLE_TOTAL_S, emptyPlay, inputRecent, livePlay, LOCK_MS, markSkipped, markVoted, NUDGE_TRIED, PLAY_KEY,
  readMark, readPlay, savePlay, SKIP_QUIET_MS, tick, totalSecs, TRIED_S, triedIds, VOTE_KEY, type VotePlay, type VoteStorage } from '@/ui/vote/voteTracker';

function memory(seed: Record<string, string> = {}): VoteStorage & { data: Record<string, string> } {
  const data = { ...seed };
  return { data, getItem: k => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = String(v); } };
}
const throwing: VoteStorage = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } };
/** A play record with these seconds, by controlKey ('touch:draw'). */
const played = (secs: Record<string, number>): VotePlay => {
  const p = emptyPlay();
  for (const [key, s] of Object.entries(secs)) for (let left = s; left > 0; left -= 60) tick(p, key, Math.min(60, left));
  return p;
};
const T0 = 1_760_000_000_000;
const none = { round: 'r2' };
const ids = (f: ControlFamily) => controlsFor(f).map(c => c.id);
/** Every id of a family played for `each` seconds. */
const allOf = (f: ControlFamily, each: number) => Object.fromEntries(ids(f).map(id => [controlKey(f, id), each]));

describe('vote tracker: play time', () => {
  it('accumulates seconds per family and control, and saves them under the v2 key for this round', () => {
    const s = memory(), p = readPlay(s);
    expect(PLAY_KEY).toBe('halaverga.vote.play.v2');
    for (let i = 0; i < 40; i++) tick(p, 'touch:draw', 1);
    for (let i = 0; i < 5; i++) tick(p, 'desktop:draw', 1);
    tick(p, 'touch:brush', Number.NaN); tick(p, 'touch:brush', -3); tick(p, 'touch:conduct', 1e9);
    tick(p, 'touch:flow', 5); tick(p, 'standard', 5); tick(p, 'desktop:one-finger', 5); // not controls of that family
    expect(p.secs['touch:draw']).toBe(40);
    expect(p.secs['desktop:draw']).toBe(5);
    expect(p.secs['touch:brush']).toBe(0);
    expect(p.secs['touch:conduct']).toBe(60);
    expect('touch:flow' in p.secs).toBe(false);
    expect('standard' in p.secs).toBe(false);
    expect(totalSecs(p, 'touch')).toBe(100);
    expect(totalSecs(p, 'desktop')).toBe(5);
    savePlay(p, s);
    expect(readPlay(s).secs['touch:draw']).toBe(40);
    expect(readPlay(s, 'r3').secs['touch:draw']).toBe(0); // another round starts from zero
    expect(Object.keys(emptyPlay().secs)).toHaveLength(13); // 5 touch + 8 desktop
  });

  it('touch:draw and desktop:draw are separate keys', () => {
    const p = played({ 'touch:draw': 25 });
    expect(triedIds(p, 'touch')).toEqual(['draw']);
    expect(triedIds(p, 'desktop')).toEqual([]);
    expect(totalSecs(p, 'desktop')).toBe(0);
  });

  it('tried means 20 s or more (19.9 no, 20 yes), in registry order, plus the current control', () => {
    expect(TRIED_S).toBe(20);
    expect(triedIds(played({ 'desktop:cursor': 19.9 }), 'desktop')).toEqual([]);
    expect(triedIds(played({ 'desktop:cursor': 20 }), 'desktop')).toEqual(['cursor']);
    const p = played({ 'desktop:draw': 30, 'desktop:flow': 19, 'desktop:cursor': 100, 'desktop:brush': 19.9 });
    expect(triedIds(p, 'desktop')).toEqual(['cursor', 'draw']);
    expect(triedIds(p, 'desktop', 'captured')).toEqual(['cursor', 'captured', 'draw']);
    expect(triedIds(p, 'desktop', 'cursor')).toEqual(['cursor', 'draw']);
    expect(triedIds(played({}), 'touch', 'twin-stick')).toEqual(['twin-stick']);
    expect(triedIds(played({}), 'touch', 'cursor')).toEqual([]); // a control of the other family is never offered
  });

  it('livePlay is one shared in-memory instance', () => {
    expect(livePlay()).toBe(livePlay());
    tick(livePlay(), 'touch:draw', 3);
    expect(livePlay().secs['touch:draw']).toBe(3);
  });

  it('inputRecent: within 2000 ms yes, after no, and never for a missing input', () => {
    expect(inputRecent(1000, 2999)).toBe(true); // 1999 ms
    expect(inputRecent(1000, 3000)).toBe(true);
    expect(inputRecent(1000, 3001)).toBe(false); // 2001 ms
    expect(inputRecent(1000, 1000)).toBe(true);
    expect(inputRecent(1000, 999)).toBe(false); // a clock that went backwards
    expect(inputRecent(-Infinity, 5)).toBe(false);
    expect(inputRecent(Number.NaN, 5)).toBe(false);
    expect(inputRecent(1000, 1500, 400)).toBe(false);
    expect(inputRecent(1000, 1399, 400)).toBe(true);
  });
});

describe('vote tracker: eligibility', () => {
  it('the nudge needs 3 tried controls of the family and the auto-open needs every one', () => {
    expect(NUDGE_TRIED('touch')).toBe(3);
    expect(NUDGE_TRIED('desktop')).toBe(3);
    expect(autoNeed('touch')).toBe(5);
    expect(autoNeed('desktop')).toBe(8);
    expect(ELIGIBLE_TOTAL_S).toBe(180);
  });

  it('is family-scoped: three tried touch controls do not make a desktop player eligible', () => {
    const p = played({ 'touch:one-finger': 100, 'touch:twin-stick': 100, 'touch:draw': 100 });
    expect(eligible(p, none, T0, 'touch', NUDGE_TRIED('touch'))).toBe(true);
    expect(eligible(p, none, T0, 'desktop', NUDGE_TRIED('desktop'))).toBe(false);
  });

  it('the pause-card nudge: 3 tried and 180 s of the family', () => {
    const need = NUDGE_TRIED('desktop');
    expect(eligible(played({ 'desktop:cursor': 200 }), none, T0, 'desktop', need)).toBe(false);
    expect(eligible(played({ 'desktop:cursor': 60, 'desktop:draw': 60 }), none, T0, 'desktop', need)).toBe(false);
    expect(eligible(played({ 'desktop:cursor': 60, 'desktop:draw': 60, 'desktop:flow': 59 }), none, T0, 'desktop', need)).toBe(false); // 179 s
    expect(eligible(played({ 'desktop:cursor': 60, 'desktop:draw': 60, 'desktop:flow': 60 }), none, T0, 'desktop', need)).toBe(true);
    // Twenty seconds each on three controls is tried, but not 180 s in all.
    expect(eligible(played({ 'desktop:cursor': 20, 'desktop:draw': 20, 'desktop:flow': 20 }), none, T0, 'desktop', need)).toBe(false);
  });

  it('the auto-open only when every control of the family is tried (5 touch, 8 desktop) and 180 s are played', () => {
    for (const [family, n] of [['touch', 5], ['desktop', 8]] as const) {
      const need = autoNeed(family), each = Math.ceil(180 / n) + 1;
      expect(eligible(played(allOf(family, each)), none, T0, family, need), family).toBe(true);
      const last = ids(family)[n - 1], missing = allOf(family, each);
      missing[controlKey(family, last)] = 19.9;
      expect(eligible(played(missing), none, T0, family, need), `${family} one short`).toBe(false);
      // The current control alone never counts: triedIds without `current` is what eligibility reads.
      const oneShort = { ...missing, [controlKey(family, last)]: 0, [controlKey(family, ids(family)[0])]: 200 };
      expect(eligible(played(oneShort), none, T0, family, need)).toBe(false);
      expect(eligible(played(oneShort), none, T0, family, need - 1)).toBe(true);
    }
    // Eight tried but only 160 s of play in all: not enough.
    expect(eligible(played(allOf('desktop', 20)), none, T0, 'desktop', autoNeed('desktop'))).toBe(false);
  });

  it('no vote this round and no skip in 24 h; another round never carries over', () => {
    const good = played(allOf('touch', 40)), need = autoNeed('touch');
    expect(eligible(good, { round: 'r2', touch: { at: T0 - 1000 } }, T0, 'touch', need)).toBe(false);
    expect(eligible(good, { round: 'r2', touch: { skippedAt: T0 - 1000 } }, T0, 'touch', need)).toBe(false);
    expect(eligible(good, { round: 'r2', touch: { skippedAt: T0 - SKIP_QUIET_MS - 1 } }, T0, 'touch', need)).toBe(true);
    expect(eligible(good, { round: 'r1', touch: { at: T0 - 1000 } }, T0, 'touch', need)).toBe(true); // last round's vote does not lock this one
    expect(eligible(good, none, T0, 'touch', need, 'r3')).toBe(false); // the play record is for another round
  });

  it('locks the device for 7 days after a vote, and a new round opens voting again', () => {
    const s = memory();
    markVoted('touch', T0, s);
    const mark = readMark(s);
    expect(mark.round).toBe('r2');
    expect(mark.touch?.at).toBe(T0);
    expect(canVote(mark, T0 + 1000, 'touch')).toBe(false);
    expect(canVote(mark, T0 + LOCK_MS - 1, 'touch')).toBe(false);
    expect(canVote(mark, T0 + LOCK_MS + 1, 'touch')).toBe(true);
    expect(canVote(readMark(s, 'r3'), T0 + 1000, 'touch', 'r3')).toBe(true);
    // A skip keeps the vote mark, and a vote keeps the skip.
    markSkipped('touch', T0 + 5, s);
    expect(readMark(s)).toEqual({ round: 'r2', touch: { at: T0, skippedAt: T0 + 5 } });
  });

  it('the lock and the skip belong to one family: a touch vote leaves desktop open (a touch laptop, an iPad)', () => {
    const s = memory(), good = played(allOf('desktop', 40)), need = autoNeed('desktop');
    markVoted('touch', T0, s);
    markSkipped('touch', T0 + 1, s);
    const mark = readMark(s);
    expect(canVote(mark, T0 + 1000, 'touch')).toBe(false);
    expect(canVote(mark, T0 + 1000, 'desktop')).toBe(true);
    expect(eligible(good, mark, T0 + 1000, 'desktop', need)).toBe(true);
    // The other family's own vote is kept beside the first, and each locks only itself.
    markVoted('desktop', T0 + 2, s);
    expect(readMark(s)).toEqual({ round: 'r2', touch: { at: T0, skippedAt: T0 + 1 }, desktop: { at: T0 + 2 } });
    expect(canVote(readMark(s), T0 + 1000, 'desktop')).toBe(false);
    expect(eligible(good, readMark(s), T0 + 1000, 'desktop', need)).toBe(false);
  });

  it('a Skip keeps quiet for 24 h only', () => {
    expect(SKIP_QUIET_MS).toBe(24 * 3600e3);
    expect(LOCK_MS).toBe(7 * 24 * 3600e3);
  });
});

describe('vote tracker: storage', () => {
  it('throwing or corrupt storage gives safe defaults', () => {
    expect(readPlay(throwing)).toEqual(emptyPlay());
    expect(readMark(throwing)).toEqual({ round: 'r2' });
    expect(() => { savePlay(emptyPlay(), throwing); markVoted('touch', T0, throwing); markSkipped('touch', T0, throwing); }).not.toThrow();
    const corrupt = memory({ [PLAY_KEY]: '{not json', [VOTE_KEY]: '[1,2]' });
    expect(readPlay(corrupt)).toEqual(emptyPlay());
    expect(readMark(corrupt)).toEqual({ round: 'r2' });
    const odd = memory({ [PLAY_KEY]: JSON.stringify({ round: 'r2', secs: { 'touch:draw': 'x', 'touch:brush': -5, 'touch:conduct': 40, 'desktop:flow': 25, evil: 99, standard: 60 } }),
      [VOTE_KEY]: JSON.stringify({ round: 'r2', at: 'soon' }) });
    const play = readPlay(odd);
    expect(play.secs['touch:draw']).toBe(0);
    expect(play.secs['touch:brush']).toBe(0);
    expect(play.secs['touch:conduct']).toBe(40);
    expect(play.secs['desktop:flow']).toBe(25);
    expect('evil' in play.secs || 'standard' in play.secs).toBe(false);
    expect(canVote(readMark(odd), T0, 'touch')).toBe(true);
    expect(readPlay(null)).toEqual(emptyPlay());
    // Secs that is not an object, or a play record from the old key format, is ignored.
    expect(readPlay(memory({ [PLAY_KEY]: JSON.stringify({ round: 'r2', secs: 5 }) }))).toEqual(emptyPlay());
    expect(readPlay(memory({ 'halaverga.vote.play.v1': JSON.stringify({ round: 'r2', secs: { draw: 500 } }) }))).toEqual(emptyPlay());
  });
});
