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
import { VOTE_UI } from '@/lib/voteSwitch';
import ControlsPicker from '@/ui/controls/ControlsPicker';
import DemoNote from '@/ui/controls/DemoNote';
import PauseControls from '@/ui/controls/PauseControls';
import { livePlay } from '@/ui/vote/voteTracker';
import { setBallot } from '@/ui/controls/useVoteState';

// Garo, 2026-11-17: "the voting option which needs to go away". The switch is off, and with it off nothing about the vote is on screen,
// even for a player who has flown two ways with an open ballot (the state that used to show the lime Vote pill and the pause-card door).
const read = (f: string) => readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8');
const seed = (secs: Record<string, number>) => { const p = livePlay(); for (const k of Object.keys(p.secs)) p.secs[k] = secs[k] ?? 0; };
const flyTwo = () => seed({ 'desktop:cursor': 25, 'desktop:draw': 21 });

describe('the vote switch is off', () => {
  afterEach(() => { seed({}); useGame.setState({ started: false, paused: false, message: '' }); setBallot('unknown'); });
  it('is false', () => { expect(VOTE_UI).toBe(false); });
  it('the top row has the Controls button alone: no Vote pill, no dots', () => {
    flyTwo(); setBallot('open'); useGame.setState({ started: true, paused: false });
    const html = renderToStaticMarkup(createElement(ControlsPicker, { family: 'desktop' }));
    expect(html).toContain('data-testid="controls-trigger"');
    expect(html).not.toMatch(/vote-chip|vote-dots|Vote/);
  });
  it('the pause card has no vote door, and the tried line never asks for a vote', () => {
    flyTwo(); setBallot('open');
    const html = renderToStaticMarkup(createElement(PauseControls));
    expect(html).toContain('data-testid="controls-row"'); expect(html).not.toMatch(/vote-open|needed to vote|Vote/);
  });
  it('the start card has no "then vote" note', () => {
    expect(renderToStaticMarkup(createElement(DemoNote))).toBe('');
  });
  it('the vote card layer is not mounted, and no vote toast is published', () => {
    expect(read('ui/Experience.tsx')).toContain('{VOTE_UI && !failed && <Optional><VoteLayer onResume={enter} /></Optional>}');
    flyTwo(); setBallot('open'); useGame.setState({ started: true, paused: false });
    renderToStaticMarkup(createElement(ControlsPicker, { family: 'desktop' }));
    expect(useGame.getState().message).toBe('');
  });
});
