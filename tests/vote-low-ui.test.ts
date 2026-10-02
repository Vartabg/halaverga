import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
// The hooks read the live store instead of its server snapshot, so the SSR markup follows each test's setup.
vi.mock('@/game/store', async importOriginal => {
  const m = await importOriginal<typeof import('@/game/store')>();
  const live = <T,>(sel: (s: ReturnType<typeof m.useGame.getState>) => T) => sel(m.useGame.getState());
  return { ...m, useGame: Object.assign(live, m.useGame) };
});
import { useGame } from '@/game/store';
import { validateVote, VOTE_ROUND } from '@/lib/vote/ballot';
import PauseControls, { ControlsRow } from '@/ui/controls/PauseControls';
import { savePending, readPending } from '@/ui/vote/pending';
import { pickFocus, type FocusPlan, type Pickable } from '@/ui/vote/restoreFocus';
import { needLine } from '@/ui/vote/VoteNeed';
import { PRIVACY_FULL } from '@/lib/vote/privacy';
import { STATUS_TEXT } from '@/ui/vote/voteClient';
import { memory } from './helpers/voteFetch';

// Third-review low findings, visitor side (spec-final 19). Node only: focus in a real page and the layout at 393 x 852 and 1440 x 900 are tests/vote-doors.spec.ts.
afterEach(() => { useGame.setState({ voteNudge: false }); });

describe('V6 the need-more line is right at 0 of 2 and at 1 of 2', () => {
  it('says two ways when nothing is flown and one more way after one, with the count in both, and clamps a count that cannot be', () => {
    expect(needLine(0)).toBe('Fly two ways for 20 seconds each, then vote. You have flown 0 of 2 so far.'); // before: "Fly a second way" at 0 of 2
    expect(needLine(1)).toBe('Fly one more way for 20 seconds, then vote. You have flown 1 of 2 so far.');
    expect(needLine(5)).toBe(needLine(1).replace('1 of 2', '2 of 2')); // never a count past the minimum
    expect(needLine(-3)).toBe(needLine(0));
  });
});

describe('V5 where focus goes when the card closes', () => {
  type El = Pickable & { name: string };
  const el = (name: string, over: Partial<El> = {}): El => ({ name, isConnected: true, closest: () => null, ...over });
  const plan = (over: Partial<FocusPlan<El>> = {}): FocusPlan<El> => ({
    opener: null, flying: false, surface: () => el('surface'), doors: [() => null, () => null, () => el('trigger')], ...over,
  });
  it('a running game on a keyboard family gets the flight surface back; otherwise the opener if it is still there', () => {
    expect(pickFocus(plan({ flying: true, opener: el('chip') }))?.name).toBe('surface');
    expect(pickFocus(plan({ flying: false, opener: el('chip') }))?.name).toBe('chip');
    expect(pickFocus(plan({ flying: true, surface: () => null, opener: el('chip') }))?.name).toBe('chip');
  });
  it('an opener that left the page or is inert is skipped: the pause card door, then the header chip, then the Controls trigger', () => {
    const gone = el('door', { isConnected: false }), inert = el('sheet', { closest: (sel: string) => (sel === '[inert]' ? {} : null) });
    expect(pickFocus(plan({ opener: gone, doors: [() => el('vote-open'), () => el('chip'), () => el('trigger')] }))?.name).toBe('vote-open');
    expect(pickFocus(plan({ opener: inert, doors: [() => null, () => el('chip'), () => el('trigger')] }))?.name).toBe('chip');
    expect(pickFocus(plan({ opener: null }))?.name).toBe('trigger'); // the chip is gone after a sent vote
    expect(pickFocus(plan({ opener: null, doors: [] }))).toBeNull(); // nothing to focus: the page keeps its default rather than a guess
  });
  it('VoteLayer records the opener before the card mounts and refocuses through pickFocus after it closes, in a frame (never left on the page body)', () => {
    const src = readFileSync(new URL('../src/ui/vote/VoteLayer.tsx', import.meta.url), 'utf8');
    expect(src).toContain('opener.current = document.activeElement');
    expect(src.indexOf('opener.current = document.activeElement')).toBeLessThan(src.indexOf('setSession({'));
    expect(src).toMatch(/requestAnimationFrame\(\(\) => \{[\s\S]*pickFocus\(livePlan\(opener\.current/);
  });
});

describe('V4 the vote door in the pause card', () => {
  const door = (nudge: boolean) => { useGame.setState({ voteNudge: nudge }); return renderToStaticMarkup(createElement(PauseControls)); };
  const src = (file: string) => readFileSync(new URL(`../src/ui/${file}`, import.meta.url), 'utf8');
  it('an eligible player sees the ask and the door above the Controls row, so the door is right under Resume (it sat past the fold, at y 1310 on a 900 px desktop)', () => {
    const m = door(true);
    expect(m.indexOf('Which way of flying felt best?')).toBeGreaterThan(-1);
    expect(m.indexOf('data-testid="vote-open"')).toBeGreaterThan(m.indexOf('Which way of flying felt best?'));
    expect(m.indexOf('data-testid="vote-open"')).toBeLessThan(m.indexOf('data-testid="controls-row"'));
    expect(m).toContain('data-nudge=""');
    expect(m.match(/data-testid="vote-open"/g)).toHaveLength(1);
    expect(m.match(/data-testid="controls-row"/g)).toHaveLength(1);
  });
  it('a player who is not eligible has the button once, after the Controls row, and no ask line; the Flight settings row and the Field guide have no door at all', () => {
    const m = door(false);
    expect(m.match(/data-testid="vote-open"/g)).toHaveLength(1);
    expect(m.indexOf('data-testid="vote-open"')).toBeGreaterThan(m.indexOf('data-testid="controls-row"'));
    expect(m).not.toContain('Which way of flying felt best?'); expect(m).not.toContain('data-nudge');
    expect(renderToStaticMarkup(createElement(ControlsRow, { fromPanel: true }))).not.toContain('vote-open'); // what Flight settings carries
    for (const file of ['TestPanel.tsx', 'FieldGuide.tsx']) for (const word of ['vote-open', 'VoteDoor', 'PauseControls']) expect(src(file).replace("import { ControlsRow } from './controls/PauseControls';", ''), `${file} ${word}`).not.toContain(word);
  });
  it('the landing page carries none of it: PauseCard holds no vote words and no control names (the door and the Controls row are in the lazy Controls chunk, which took the pause card back under the zero-headroom budget)', () => {
    const card = src('PauseCard.tsx');
    for (const s of ['Which way of flying felt best', 'vote-open', 'voteNudge', 'voteAsk', 'Vote: which felt best', 'controls-row', 'ControlList', 'ControlsSheet', 'controlById']) expect(card, s).not.toContain(s);
    expect(card).toContain("from './LazyControls'");
  });
});

describe('CODE-9 one vote check, not two', () => {
  const now = Date.UTC(2026, 8, 30, 14, 5), nonce = 'a'.repeat(32);
  it('a saved (pending) vote is read back through validateVote: every shape the server refuses is refused here too, and the good one round-trips', () => {
    const s = memory(), good = { nonce, favorite: 'flow' as const, tried: ['cursor', 'flow'] as never, last: 'flow' as const };
    savePending('desktop', good, s, now);
    expect(readPending('desktop', s, now)).toEqual(good);
    expect(validateVote({ v: 3, device: 'desktop', favorite: 'flow', tried: ['cursor', 'flow'], last: 'flow', nonce })).not.toBeNull();
    for (const [k, v] of [['favorite', 'brush'], ['tried', ['cursor']], ['tried', ['cursor', 'cursor']], ['tried', ['cursor', 'twin-stick']], ['last', 'brush'], ['nonce', 'xyz']] as const) {
      const bad = { ...good, [k]: v };
      expect(validateVote({ v: 3, device: 'desktop', ...bad }), `${k}`).toBeNull();
      const t = memory(); t.data['halaverga.vote.pending'] = JSON.stringify({ round: VOTE_ROUND, desktop: { ...bad, at: now } });
      expect(readPending('desktop', t, now), `${k}`).toBeNull();
    }
    const old = memory(); old.data['halaverga.vote.pending'] = JSON.stringify({ round: VOTE_ROUND, desktop: { ...good, at: now - 25 * 3600e3 } });
    expect(readPending('desktop', old, now)).toBeNull();
  });
  it('the dead code the review named is gone: triedSummary, pairWeights().pair, PRELUDE_LEN', () => {
    for (const [file, gone] of [['ui/vote/voteClient.ts', 'triedSummary'], ['server/vote/neonSchema.ts', 'PRELUDE_LEN'], ['server/vote/score.ts', 'pair:']] as const) {
      expect(readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8'), gone).not.toContain(gone);
    }
  });
});

describe('CODE-8 the words are literally true', () => {
  it('the full privacy text names the block hash it keeps (not only the address hash), says who holds the key, and no longer claims the group code "cannot identify you"', () => {
    expect(PRIVACY_FULL).toContain('keyed hashes of your network address and of your network block for about a day');
    expect(PRIVACY_FULL).toContain('secret key that only we hold; whoever held it could test whether a known network voted');
    expect(PRIVACY_FULL).not.toContain('cannot identify you');
    expect(PRIVACY_FULL).toContain('on its own it does not identify you or link your votes across days');
  });
  it('a 429 does not say "Your pick is kept": with blocked storage a closed card keeps nothing', () => {
    expect(STATUS_TEXT.later).toBe('Voting is busy right now. Try again later.');
    for (const t of Object.values(STATUS_TEXT)) expect(t).not.toMatch(/pick is kept/i);
  });
});
