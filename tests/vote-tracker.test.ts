import { describe, expect, it } from 'vitest';
import { controlKey, controlsFor, type ControlFamily } from '@/game/controlTypes';
import { VOTE_MIN_TRIED, VOTE_ROUND } from '@/lib/vote/ballot';
import { autoNeed, canVote, eligible, emptyPlay, inputRecent, livePlay, LOCK_MS, markSkipped, markVoted, NUDGE_TRIED, PLAY_KEY,
  readMark, readPlay, savePlay, skipCounts, SKIP_QUIET_MS, tick, TRIED_S, triedIds, VOTE_KEY, type VotePlay, type VoteStorage } from '@/ui/vote/voteTracker';

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
const none = { round: VOTE_ROUND };
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
    savePlay(p, s);
    expect(readPlay(s).secs['touch:draw']).toBe(40);
    expect(readPlay(s, 'r2').secs['touch:draw']).toBe(0); // another round starts from zero
    expect(Object.keys(emptyPlay().secs)).toHaveLength(13); // 5 touch + 8 desktop
  });

  it('touch:draw and desktop:draw are separate keys', () => {
    const p = played({ 'touch:draw': 25 });
    expect(triedIds(p, 'touch')).toEqual(['draw']);
    expect(triedIds(p, 'desktop')).toEqual([]);
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
  it('the nudge and the auto-open both need two tried controls, the ballot minimum', () => {
    expect(VOTE_MIN_TRIED).toBe(2);
    expect(NUDGE_TRIED()).toBe(2);
    expect(autoNeed()).toBe(2);
  });

  it('is family-scoped: two tried touch controls do not make a desktop player eligible', () => {
    const p = played({ 'touch:one-finger': 20, 'touch:twin-stick': 20 });
    expect(eligible(p, none, T0, 'touch', autoNeed())).toBe(true);
    expect(eligible(p, none, T0, 'desktop', autoNeed())).toBe(false);
  });

  it('two controls at 20 s each are enough: there is no total-play rule', () => {
    for (const [family, a, b] of [['touch', 'one-finger', 'draw'], ['desktop', 'cursor', 'brush']] as const) {
      const key = (id: string) => controlKey(family, id as never);
      expect(eligible(played({ [key(a)]: 20, [key(b)]: 20 }), none, T0, family, autoNeed()), family).toBe(true); // 40 s in all
      expect(eligible(played({ [key(a)]: 20, [key(b)]: 19.9 }), none, T0, family, autoNeed()), `${family} 19.9 s`).toBe(false);
      expect(eligible(played({ [key(a)]: 500 }), none, T0, family, autoNeed()), `${family} one control, however long`).toBe(false);
    }
  });

  it('the control being flown (under 20 s) never counts: eligibility reads triedIds without `current`', () => {
    const p = played({ 'desktop:cursor': 200, 'desktop:draw': 10 });
    expect(triedIds(p, 'desktop', 'draw')).toEqual(['cursor', 'draw']); // the card offers it...
    expect(eligible(p, none, T0, 'desktop', autoNeed())).toBe(false); // ...but it does not make the visitor eligible
  });

  it('no vote this round and no skip in 24 h; another round never carries over', () => {
    const good = played(allOf('touch', 40)), need = autoNeed();
    expect(eligible(good, { round: VOTE_ROUND, touch: { at: T0 - 1000 } }, T0, 'touch', need)).toBe(false);
    expect(eligible(good, { round: VOTE_ROUND, touch: { skippedAt: T0 - 1000 } }, T0, 'touch', need)).toBe(false);
    expect(eligible(good, { round: VOTE_ROUND, touch: { skippedAt: T0 - SKIP_QUIET_MS - 1 } }, T0, 'touch', need)).toBe(true);
    expect(eligible(good, { round: 'r2', touch: { at: T0 - 1000 } }, T0, 'touch', need)).toBe(true); // last round's vote does not lock this one
    expect(eligible(good, none, T0, 'touch', need, 'r4')).toBe(false); // the play record is for another round
  });

  it('locks the device for 7 days after a vote, and a new round opens voting again', () => {
    const s = memory();
    markVoted('touch', T0, s);
    const mark = readMark(s);
    expect(mark.round).toBe(VOTE_ROUND);
    expect(mark.touch?.at).toBe(T0);
    expect(canVote(mark, T0 + 1000, 'touch')).toBe(false);
    expect(canVote(mark, T0 + LOCK_MS - 1, 'touch')).toBe(false);
    expect(canVote(mark, T0 + LOCK_MS + 1, 'touch')).toBe(true);
    expect(canVote(readMark(s, 'r4'), T0 + 1000, 'touch', 'r4')).toBe(true);
    // A skip keeps the vote mark, and a vote keeps the skip.
    markSkipped('touch', T0 + 5, s);
    expect(readMark(s)).toEqual({ round: VOTE_ROUND, touch: { at: T0, skippedAt: T0 + 5 } });
  });

  it('the lock and the skip belong to one family: a touch vote leaves desktop open (a touch laptop, an iPad)', () => {
    const s = memory(), good = played(allOf('desktop', 40)), need = autoNeed();
    markVoted('touch', T0, s);
    markSkipped('touch', T0 + 1, s);
    const mark = readMark(s);
    expect(canVote(mark, T0 + 1000, 'touch')).toBe(false);
    expect(canVote(mark, T0 + 1000, 'desktop')).toBe(true);
    expect(eligible(good, mark, T0 + 1000, 'desktop', need)).toBe(true);
    markVoted('desktop', T0 + 2, s);
    expect(readMark(s)).toEqual({ round: VOTE_ROUND, touch: { at: T0, skippedAt: T0 + 1 }, desktop: { at: T0 + 2 } });
    expect(canVote(readMark(s), T0 + 1000, 'desktop')).toBe(false);
    expect(eligible(good, readMark(s), T0 + 1000, 'desktop', need)).toBe(false);
  });

  it('a Skip keeps quiet for 24 h only, and only an auto-open Skip is recorded', () => {
    expect(SKIP_QUIET_MS).toBe(24 * 3600e3);
    expect(LOCK_MS).toBe(7 * 24 * 3600e3);
    expect(skipCounts('skip', 'auto')).toBe(true);
    expect(skipCounts('skip', 'pause')).toBe(false); // a manual Not yet or Escape on a card the visitor opened
    expect(skipCounts('done', 'auto')).toBe(false); // Done, Keep playing, Try
    expect(skipCounts('done', 'pause')).toBe(false);
  });
});

describe('vote tracker: storage', () => {
  it('throwing or corrupt storage gives safe defaults', () => {
    expect(readPlay(throwing)).toEqual(emptyPlay());
    expect(readMark(throwing)).toEqual({ round: VOTE_ROUND });
    expect(() => { savePlay(emptyPlay(), throwing); markVoted('touch', T0, throwing); markSkipped('touch', T0, throwing); }).not.toThrow();
    const corrupt = memory({ [PLAY_KEY]: '{not json', [VOTE_KEY]: '[1,2]' });
    expect(readPlay(corrupt)).toEqual(emptyPlay());
    expect(readMark(corrupt)).toEqual({ round: VOTE_ROUND });
    const odd = memory({ [PLAY_KEY]: JSON.stringify({ round: VOTE_ROUND, secs: { 'touch:draw': 'x', 'touch:brush': -5, 'touch:conduct': 40, 'desktop:flow': 25, evil: 99, standard: 60 } }),
      [VOTE_KEY]: JSON.stringify({ round: VOTE_ROUND, at: 'soon' }) });
    const play = readPlay(odd);
    expect(play.secs['touch:draw']).toBe(0);
    expect(play.secs['touch:brush']).toBe(0);
    expect(play.secs['touch:conduct']).toBe(40);
    expect(play.secs['desktop:flow']).toBe(25);
    expect('evil' in play.secs || 'standard' in play.secs).toBe(false);
    expect(canVote(readMark(odd), T0, 'touch')).toBe(true);
    expect(readPlay(null)).toEqual(emptyPlay());
    // Secs that is not an object, or a play record from the old key format, is ignored.
    expect(readPlay(memory({ [PLAY_KEY]: JSON.stringify({ round: VOTE_ROUND, secs: 5 }) }))).toEqual(emptyPlay());
    expect(readPlay(memory({ 'halaverga.vote.play.v1': JSON.stringify({ round: VOTE_ROUND, secs: { draw: 500 } }) }))).toEqual(emptyPlay());
  });
});
