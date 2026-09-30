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
import ControlsPicker from '@/ui/controls/ControlsPicker';
import ControlsSection from '@/ui/controls/ControlsSection';
import ControlsSheet from '@/ui/controls/ControlsSheet';
import VoteChip, { chipHint, chipProgress } from '@/ui/controls/VoteChip';
import { emptyPlay, livePlay, markVoted, TRIED_S } from '@/ui/vote/voteTracker';
// The header Vote chip, the sheet footer and the picker's CSS contract (spec 1.3). Node only: what a player sees while flying, the
// tap targets and the layout at 393x852 and 852x393 are tests/vote.spec.ts.

const css = readFileSync(new URL('../src/ui/controls/ControlsPicker.module.css', import.meta.url), 'utf8');
const html = (node: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(node);
const seedPlay = (secs: Record<string, number>) => { const p = livePlay(); for (const k of Object.keys(p.secs)) p.secs[k] = secs[k] ?? 0; };
const chip = (family: 'touch' | 'desktop' = 'desktop') => html(createElement(VoteChip, { family }));
const store: Record<string, string> = {};
afterEach(() => {
  seedPlay({}); vi.unstubAllGlobals(); for (const k of Object.keys(store)) delete store[k];
  useGame.setState({ started: false, voteOpen: false, controlLab: 'standard', touchScheme: 'classic', trackpadSteering: 'free', desktopMode: 'trackpad' });
});
const voted = (family: 'touch' | 'desktop') => {
  vi.stubGlobal('localStorage', { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; } });
  markVoted(family, Date.now());
};

describe('chipProgress and chipHint', () => {
  it('counts controls at 20 s of this family, and the seconds left on the one flown (default desktop: cursor)', () => {
    const p = emptyPlay();
    expect(chipProgress(p, 'desktop', 'cursor')).toEqual({ tried: 0, left: TRIED_S });
    p.secs['desktop:cursor'] = 6.2; p.secs['desktop:draw'] = 20; p.secs['touch:twin-stick'] = 90;
    expect(chipProgress(p, 'desktop', 'cursor')).toEqual({ tried: 1, left: 14 }); // 13.8 s left, shown as 14
    p.secs['desktop:cursor'] = 20;
    expect(chipProgress(p, 'desktop', 'cursor')).toEqual({ tried: 2, left: 0 });
    p.secs['desktop:cursor'] = 4000;
    expect(chipProgress(p, 'desktop', 'cursor').left).toBe(0);
    expect(chipProgress(p, 'touch', 'twin-stick')).toEqual({ tried: 1, left: 0 }); // the other family's seconds never count here
  });
  it('the spoken tail names what is missing, and never mentions the seconds', () => {
    expect(chipHint(0)).toBe('. Fly two ways for 20 seconds first.');
    expect(chipHint(1)).toBe('. Fly one more way for 20 seconds first.');
  });
});

describe('VoteChip (SSR)', () => {
  it('0/2: outline, the seconds needed for the control being flown are hidden from the accessible name, and a spoken tail is added', () => {
    const m = chip();
    expect(m).toContain('data-testid="vote-chip"'); expect(m).toContain('type="button"'); expect(m).not.toContain('data-ready');
    expect(m).toContain('Vote 0/2'); expect(m).toMatch(/<span aria-hidden="true"><span class="[^"]*_chipDot_[^"]*"> · <\/span>20 s<\/span>/);
    expect(m).toContain('<span class="sr-only">. Fly two ways for 20 seconds first.</span>');
    expect(m).not.toContain('aria-label'); // WCAG 2.5.3: the visible text is inside the name, so no aria-label that replaces it
  });
  it('1/2 with 14 s left on the current control', () => {
    seedPlay({ 'desktop:cursor': 6, 'desktop:draw': 25 });
    const m = chip();
    expect(m).toContain('Vote 1/2'); expect(m).toContain('14 s</span>'); expect(m).toContain('Fly one more way for 20 seconds first.');
  });
  it('1/2 with the current control already counted: no seconds part', () => {
    seedPlay({ 'desktop:cursor': 30 });
    const m = chip();
    expect(m).toContain('Vote 1/2'); expect(m).not.toContain(' s</span>'); expect(m).not.toContain('aria-hidden');
  });
  it('two tried: lime, wide label Vote: which felt best?, the tail visually hidden on a narrow screen but present for a screen reader', () => {
    seedPlay({ 'desktop:cursor': 30, 'desktop:draw': 21 });
    const m = chip();
    expect(m).toContain('data-ready=""'); expect(m).toMatch(/>Vote<span class="[^"]*_chipMore_[^"]*">: which felt best\?<\/span><\/span><\/button>/);
    expect(m).not.toContain('/2'); expect(m).not.toContain('aria-label');
  });
  it('follows the family: two tried touch controls do not make the desktop chip ready', () => {
    seedPlay({ 'touch:one-finger': 30, 'touch:draw': 30 });
    expect(chip('desktop')).not.toContain('data-ready'); expect(chip('desktop')).toContain('Vote 0/2');
    useGame.setState({ touchScheme: 'classic', controlLab: 'standard' });
    expect(chip('touch')).toContain('data-ready=""');
  });
  it('is gone after this family voted, and the other family keeps its chip', () => {
    voted('desktop');
    expect(chip('desktop')).toBe(''); expect(chip('touch')).toContain('data-testid="vote-chip"');
  });
  it('the picker mounts it right after the trigger, once the game has begun, and not when the picker is not started', () => {
    expect(html(createElement(ControlsPicker, { family: 'desktop' }))).toBe('');
    useGame.setState({ started: true });
    const m = html(createElement(ControlsPicker, { family: 'desktop' }));
    expect(m.indexOf('data-testid="controls-trigger"')).toBeGreaterThan(-1);
    expect(m.indexOf('data-testid="vote-chip"')).toBeGreaterThan(m.indexOf('data-testid="controls-trigger"'));
    expect(m).not.toContain('controls-sheet'); // the chip is not inside the sheet
    voted('desktop');
    expect(html(createElement(ControlsPicker, { family: 'desktop' }))).not.toContain('vote-chip');
  });
});

describe('the sheet footer and the settings copy', () => {
  const foot = (family: 'touch' | 'desktop') => html(createElement(ControlsSheet, { family, onClose: () => {} }));
  it('Vote: which felt best? is the lime primary and comes first; Done is the outline button', () => {
    const m = foot('touch');
    const vote = /<button[^>]*data-testid="controls-vote"[^>]*>/.exec(m)![0], done = /<button[^>]*data-testid="controls-done"[^>]*>/.exec(m)![0];
    expect(vote).toMatch(/class="[^"]*_primary_/); expect(done).not.toMatch(/_primary_/);
    expect(m).toContain('>Vote: which felt best?</button>'); expect(m).not.toMatch(/Vote on the\scontrols/); // the retired copy
    expect(m.indexOf('controls-vote')).toBeLessThan(m.indexOf('controls-done'));
  });
  it('the line says Tried n of 2 needed to vote under two, then Tried n of total', () => {
    expect(foot('touch')).toContain('Tried 0 of 2 needed to vote');
    seedPlay({ 'desktop:cursor': 30 });
    expect(foot('desktop')).toContain('Tried 1 of 2 needed to vote');
    seedPlay({ 'desktop:cursor': 30, 'desktop:draw': 30 });
    expect(foot('desktop')).toContain('Tried 2 of 8'); expect(foot('desktop')).not.toContain('needed to vote');
    expect(html(createElement(ControlsSection, { name: 'control-pause', vote: true }))).toContain('Tried 2 of 8');
  });
  it('the settings and pause-card section keeps the outline button with the same words', () => {
    const m = html(createElement(ControlsSection, { name: 'control-settings', vote: true }));
    expect(m).toMatch(/<button[^>]*data-testid="controls-vote"[^>]*>Vote: which felt best\?<\/button>/);
    expect(/<button[^>]*data-testid="controls-vote"[^>]*>/.exec(m)![0]).not.toMatch(/_primary_/);
  });
});

describe('the picker CSS contract for the chip', () => {
  it('the root is a three-column grid with equal side columns and the trigger in the middle, so the trigger does not move', () => {
    expect(css).toMatch(/\.root\{display:grid;grid-template-columns:minmax\(0,1fr\) minmax\(0,auto\) minmax\(0,1fr\)/);
    expect(css).toMatch(/\.root>\.trigger\{grid-column:2\}/); expect(css).toMatch(/\.chip\{[^}]*grid-column:3/);
  });
  it('the chip is 44 px, has a 3 px focus ring, no animation, and keeps forced-colors styles', () => {
    const rule = /\n\.chip\{[^}]*\}/.exec(css)![0];
    expect(rule).toContain('min-height:44px'); expect(rule).toContain('min-width:44px'); expect(rule).not.toMatch(/animation|transition/);
    expect(css).toMatch(/\.chip:focus-visible\{outline:3px solid/);
    expect(css.slice(css.indexOf('@media (forced-colors:active)'))).toMatch(/\.chip\{[^}]*ButtonText/);
  });
  it('up to 520 px the tail of the label is clipped (not display:none, so it stays in the accessible name) and the seconds sit under the count', () => {
    const narrow = /@media\(max-width:520px\)\{[^@]*\}\n\}/.exec(css)![0];
    expect(narrow).toMatch(/\.chipMore\{position:absolute;width:1px;height:1px[^}]*clip:rect/); expect(narrow).toMatch(/\.chipText\{display:flex;flex-direction:column/);
    expect(narrow.match(/display:none/g)).toEqual(['display:none']); // only the dot before the seconds
  });
  it('the primary button is lime; nothing styles the last button in the footer any more', () => {
    expect(css).toMatch(/\.action\.primary\{background:var\(--lime\)/); expect(css).not.toContain('.buttons .action:last-child');
  });
});
