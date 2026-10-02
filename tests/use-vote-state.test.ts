import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
// The hooks read the live store instead of its server snapshot, so the SSR markup follows each test's setup.
vi.mock('@/game/store', async importOriginal => {
  const m = await importOriginal<typeof import('@/game/store')>();
  const live = <T,>(sel: (s: ReturnType<typeof m.useGame.getState>) => T) => sel(m.useGame.getState());
  return { ...m, useGame: Object.assign(live, m.useGame) };
});
import { useGame } from '@/game/store';
import { VOTE_ROUND } from '@/lib/vote/ballot';
import ControlsPicker from '@/ui/controls/ControlsPicker';
import { VoteButton } from '@/ui/controls/ControlsSheet';
import PauseControls from '@/ui/controls/PauseControls';
import { ballotNow, ballotOf, lockedTail, READY_TEXT, setBallot, VOTE_NAME, voteView } from '@/ui/controls/useVoteState';
import { QUESTION } from '@/ui/vote/question';
import { HEADING } from '@/ui/vote/VoteCard';
import { emptyPlay, livePlay, LOCK_MS, markVoted, type VoteMark } from '@/ui/vote/voteTracker';
// useVoteState (spec 6.2 and the addendum, C1 to C7): what a family's vote is, which one answer the top row, the Controls sheet and the
// pause card all read, and what each of them shows for it. Node only: the polling, the one ballot check and the Vote is ready toast are
// effects, so what a player sees for those is tests/vote.spec.ts and tests/layout-fit.spec.ts.

const now = Date.UTC(2026, 9, 1, 14, 5);
const noMark: VoteMark = { round: VOTE_ROUND };
const play = (secs: Record<string, number>) => { const p = emptyPlay(); Object.assign(p.secs, secs); return p; };
const TWO_DESK = { 'desktop:cursor': 25, 'desktop:draw': 21 }, TWO_TOUCH = { 'touch:one-finger': 25, 'touch:draw': 21 };
const seedPlay = (secs: Record<string, number>) => { const p = livePlay(); for (const k of Object.keys(p.secs)) p.secs[k] = secs[k] ?? 0; };
const store: Record<string, string> = {};
const voted = (family: 'touch' | 'desktop') => {
  vi.stubGlobal('localStorage', { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; } });
  markVoted(family, Date.now());
};
const html = (node: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(node);
const picker = (family: 'touch' | 'desktop' = 'desktop') => html(createElement(ControlsPicker, { family }));
const button = (family: 'touch' | 'desktop' = 'desktop') => html(createElement(VoteButton, { family }));
beforeEach(() => { setBallot('unknown'); useGame.setState({ started: true, paused: false, voteNudge: false }); });
afterEach(() => {
  seedPlay({}); setBallot('unknown'); vi.unstubAllGlobals(); for (const k of Object.keys(store)) delete store[k];
  useGame.setState({ started: false, paused: true, voteOpen: false, voteNudge: false, controlLab: 'standard', touchScheme: 'classic', trackpadSteering: 'free', desktopMode: 'trackpad' });
});

describe('voteView: the one state', () => {
  it('locked under two ways of 20 s, and the count is the tried ones of that family only', () => {
    expect(voteView(play({}), noMark, now, 'desktop', 'open')).toEqual({ state: 'locked', tried: 0 });
    expect(voteView(play({ 'desktop:cursor': 19.9 }), noMark, now, 'desktop', 'open')).toEqual({ state: 'locked', tried: 0 }); // 20 s is the line
    expect(voteView(play({ 'desktop:cursor': 20 }), noMark, now, 'desktop', 'open')).toEqual({ state: 'locked', tried: 1 });
    expect(voteView(play(TWO_TOUCH), noMark, now, 'desktop', 'open')).toEqual({ state: 'locked', tried: 0 }); // two touch ways never unlock desktop
    expect(voteView(play(TWO_TOUCH), noMark, now, 'touch', 'open')).toEqual({ state: 'ready', tried: 2 });
  });
  it('ready at two, per family, once the ballot is known not to be closed', () => {
    expect(voteView(play(TWO_DESK), noMark, now, 'desktop', 'open')).toEqual({ state: 'ready', tried: 2 });
    expect(voteView(play({ ...TWO_DESK, 'desktop:flow': 99 }), noMark, now, 'desktop', 'open')).toEqual({ state: 'ready', tried: 3 });
  });
  it('sent after this family voted, for 7 days, and the other family is still free; then it opens again', () => {
    const mark: VoteMark = { round: VOTE_ROUND, desktop: { at: now - 1000 } };
    expect(voteView(play(TWO_DESK), mark, now, 'desktop', 'open').state).toBe('sent');
    expect(voteView(play({}), mark, now, 'desktop', 'open').state).toBe('sent'); // a sent vote is sent whatever was flown after
    expect(voteView(play(TWO_TOUCH), mark, now, 'touch', 'open').state).toBe('ready');
    expect(voteView(play(TWO_DESK), mark, now + LOCK_MS + 1, 'desktop', 'open').state).toBe('ready');
  });
  it('the 24 h quiet after a Skip is ignored: a visitor who skipped the auto card still gets the button', () => {
    const mark: VoteMark = { round: VOTE_ROUND, desktop: { skippedAt: now - 60_000 } };
    expect(voteView(play(TWO_DESK), mark, now, 'desktop', 'open').state).toBe('ready');
  });
});

describe('C5 the ballot: only a known-closed one hides the button, an offline one does not', () => {
  it('two ways flown but the ballot not asked yet or known closed: off (no pill, no button, no dots)', () => {
    expect(voteView(play(TWO_DESK), noMark, now, 'desktop', 'unknown').state).toBe('off');
    expect(voteView(play(TWO_DESK), noMark, now, 'desktop', 'closed')).toEqual({ state: 'off', tried: 2 });
  });
  it('a closed ballot does not change locked or sent: the dots and the sent button follow the record, not the ballot', () => {
    expect(voteView(play({}), noMark, now, 'desktop', 'closed').state).toBe('locked');
    expect(voteView(play(TWO_DESK), { round: VOTE_ROUND, desktop: { at: now } }, now, 'desktop', 'closed').state).toBe('sent');
  });
  it('the probe says closed on a 503 or open:false; no connection, a bad answer or a 500 (results null, not closed) keeps the pill, and the card says so when it is tapped', () => {
    expect(ballotOf({ results: null, closed: true })).toBe('closed'); // a 503, or open:false with its numbers
    expect(ballotOf({ results: null, closed: false })).toBe('open'); // offline, timed out, a 500, an unreadable body
    expect(voteView(play(TWO_DESK), noMark, now, 'desktop', ballotOf({ results: null, closed: false })).state).toBe('ready');
    expect(voteView(play(TWO_DESK), noMark, now, 'desktop', ballotOf({ results: null, closed: true })).state).toBe('off');
  });
  it('setBallot is also the reset', () => {
    setBallot('closed'); expect(ballotNow()).toBe('closed');
    setBallot('unknown'); expect(ballotNow()).toBe('unknown');
  });
});

describe('the words', () => {
  it('C4 the question is the vote card heading, reused: the button name and the toast carry it, the visible word is only Vote', () => {
    expect(QUESTION).toBe('Which way of flying felt best?'); expect(HEADING).toBe(QUESTION);
    expect(VOTE_NAME).toBe(`Vote: ${HEADING}`); expect(VOTE_NAME.startsWith('Vote')).toBe(true); // WCAG 2.5.3: the visible label starts the name
    expect(READY_TEXT).toBe(`Vote is ready · ${HEADING}`);
  });
  it('C1 the dots have a text twin: the Controls name ends with it, the count never passes two', () => {
    expect(lockedTail(0)).toBe(': vote unlocks after two ways, 0 of 2 tried');
    expect(lockedTail(1)).toBe(': vote unlocks after two ways, 1 of 2 tried');
    expect(lockedTail(7)).toBe(': vote unlocks after two ways, 2 of 2 tried');
  });
});

describe('the top row', () => {
  const dots = (m: string) => /<span class="[^"]*_dots_[^"]*" data-testid="vote-dots" aria-hidden="true">([^]*?)<\/span>/.exec(m)![1];
  it('locked: two dots (aria-hidden) on the Controls button, none counted at 0, the name ends with their twin, and no Vote pill', () => {
    const m = picker();
    expect(m).not.toContain('vote-chip');
    expect(dots(m).match(/<i/g)).toHaveLength(2); expect(dots(m)).not.toContain('data-on');
    expect(m).toContain('aria-label="Controls: Cursor: vote unlocks after two ways, 0 of 2 tried"');
    expect(m).toMatch(/>Controls<span class="[^"]*_dots_/); // the visible text is the word; the dots are not text
  });
  it('one way counted fills one dot', () => {
    seedPlay({ 'desktop:cursor': 30 });
    const m = picker();
    expect(dots(m).match(/data-on=""/g)).toHaveLength(1); expect(m).toContain('1 of 2 tried"');
  });
  it('C6 the dots slot is there in every state, so the button is the same markup shape and width; only the pill comes and goes', () => {
    const locked = picker();
    setBallot('open'); seedPlay(TWO_DESK);
    const ready = picker();
    voted('desktop');
    const sent = picker();
    for (const m of [locked, ready, sent]) expect(m).toMatch(/<span class="[^"]*_dots_[^"]*" data-testid="vote-dots" aria-hidden="true">/);
    expect(dots(ready)).toBe(''); expect(dots(sent)).toBe(''); // the slot stays, empty
    expect(ready).not.toContain('vote unlocks'); expect(sent).not.toContain('vote unlocks');
    expect(ready).toContain('aria-label="Controls: Cursor"');
  });
  it('ready: the lime Vote pill and no dots; its visible word is Vote, its name carries the question, and it comes before Controls (C7)', () => {
    setBallot('open'); seedPlay(TWO_DESK);
    const m = picker(), tag = /<button[^>]*data-testid="vote-chip"[^>]*>/.exec(m)![0];
    expect(tag).toContain(`aria-label="Vote: ${QUESTION}"`); expect(tag).toContain('type="button"');
    expect(m).toMatch(/data-testid="vote-chip"[^>]*>Vote<\/button>/);
    expect(m.indexOf('data-testid="vote-chip"')).toBeLessThan(m.indexOf('data-testid="controls-trigger"'));
    expect(dots(m)).toBe(''); expect(m).not.toMatch(/\d\/2/); // no progress text, ever
  });
  it('a closed ballot (or one not asked yet): no pill and no dots, the Controls button alone', () => {
    seedPlay(TWO_DESK);
    for (const b of ['unknown', 'closed'] as const) {
      setBallot(b);
      const m = picker();
      expect(m).not.toContain('vote-chip'); expect(dots(m)).toBe(''); expect(m).not.toContain('vote unlocks');
    }
  });
  it('sent: nothing about the vote in the row, and the other family keeps its dots', () => {
    setBallot('open'); seedPlay({ ...TWO_DESK }); voted('desktop');
    expect(picker('desktop')).not.toContain('vote-chip'); expect(dots(picker('desktop'))).toBe('');
    expect(dots(picker('touch'))).toContain('<i'); // touch: nothing flown, still locked
  });
  it('follows the family: two tried touch controls do not make the desktop row ready', () => {
    setBallot('open'); seedPlay(TWO_TOUCH);
    expect(picker('desktop')).not.toContain('vote-chip'); expect(picker('touch')).toContain('vote-chip');
  });
});

describe('the Controls sheet footer', () => {
  it('locked: no Vote button at all, the plain line says how far along it is; Done is the only button', () => {
    for (const family of ['touch', 'desktop'] as const) expect(button(family)).toBe('');
  });
  it('ready: the lime primary Vote, named with the question; sent: the outlined Vote sent: see results; closed or unchecked: nothing', () => {
    setBallot('open'); seedPlay({ ...TWO_DESK, ...TWO_TOUCH });
    const ready = button('desktop');
    expect(ready).toMatch(/<button[^>]*data-testid="controls-vote"[^>]*>Vote<\/button>/); expect(ready).toContain(`aria-label="Vote: ${QUESTION}"`);
    expect(/<button[^>]*>/.exec(ready)![0]).toMatch(/_primary_/);
    voted('desktop');
    const sent = button('desktop');
    expect(sent).toMatch(/data-testid="controls-vote"[^>]*>Vote sent: see results<\/button>/); expect(sent).toContain('data-sent=""'); expect(sent).not.toMatch(/_primary_/);
    expect(button('touch')).toContain('>Vote</button>'); // the other family still has its Vote
    setBallot('closed'); expect(button('touch')).toBe('');
    setBallot('unknown'); expect(button('touch')).toBe('');
  });
});

describe('the pause card', () => {
  const door = (nudge = false) => { useGame.setState({ voteNudge: nudge }); return html(createElement(PauseControls)); };
  it('locked: the Controls row and the muted tried line, no vote door and no ask', () => {
    const m = door(true);
    expect(m).toContain('data-testid="controls-row"'); expect(m).toContain('Tried 0 of 2 needed to vote');
    expect(m).not.toContain('vote-open'); expect(m).not.toContain(QUESTION);
  });
  it('ready: the door comes first, right under Resume, named with the question; the ask line sits above it only for a player who is asked', () => {
    setBallot('open'); seedPlay(TWO_DESK);
    const asked = door(true), quiet = door(false);
    expect(asked).toMatch(/<button[^>]*data-testid="vote-open"[^>]*>Vote<\/button>/); expect(asked).toContain(`aria-label="Vote: ${QUESTION}"`);
    expect(asked.indexOf(QUESTION)).toBeLessThan(asked.indexOf('data-testid="vote-open"'));
    expect(asked.indexOf('data-testid="vote-open"')).toBeLessThan(asked.indexOf('data-testid="controls-row"'));
    expect(asked).toContain('data-nudge=""');
    expect(quiet.indexOf('data-testid="vote-open"')).toBeLessThan(quiet.indexOf('data-testid="controls-row"')); // ready is first for everyone
    expect(quiet.match(/>Which way of flying felt best\?</g)).toBeNull(); expect(quiet).not.toContain('data-nudge');
  });
  it('sent, closed or unchecked: no door', () => {
    setBallot('open'); seedPlay(TWO_DESK); voted('desktop');
    expect(door(true)).not.toContain('vote-open');
    vi.unstubAllGlobals(); setBallot('closed');
    expect(door(true)).not.toContain('vote-open');
    setBallot('unknown');
    expect(door(true)).not.toContain('vote-open');
  });
});
