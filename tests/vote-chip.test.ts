import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import VoteChip from '@/ui/controls/VoteChip';
// The top row's Vote pill and the picker's CSS contract for it and for the Controls button's dots (spec 6.2, addendum C1, C6, C7). Node only:
// which state shows the pill, the dots, the sheet's button and the pause card's door is tests/use-vote-state.test.ts; what a player sees
// while flying, the tap targets and the layout at 393x852 and 852x393 are tests/vote.spec.ts and tests/layout-fit.spec.ts.

const css = readFileSync(new URL('../src/ui/controls/ControlsPicker.module.css', import.meta.url), 'utf8');
const rule = (selector: string) => new RegExp(`\\n${selector.replace(/[.[\]()=:]/g, '\\$&')}\\{([^}]*)\\}`).exec(css)?.[1] ?? '';
const forced = css.slice(css.indexOf('@media (forced-colors:active)'));

describe('VoteChip (SSR)', () => {
  const m = renderToStaticMarkup(createElement(VoteChip));
  it('is one button: the visible word is Vote, the name carries the question, and it holds no progress text', () => {
    expect(m).toMatch(/^<button type="button" class="[^"]*_chip_[^"]*" data-testid="vote-chip" aria-label="Vote: Which way of flying felt best\?">Vote<\/button>$/);
    expect(m).not.toMatch(/\/2|·| s</); expect(m).not.toContain('data-ready'); expect(m).not.toContain('disabled');
  });
  it('the old copy is gone from the source', () => {
    const src = (f: string) => readFileSync(new URL(`../src/ui/controls/${f}`, import.meta.url), 'utf8');
    for (const f of ['VoteChip.tsx', 'ControlsPicker.tsx', 'ControlsSheet.tsx', 'PauseControls.tsx', 'useVoteState.ts']) {
      expect(src(f), f).not.toContain('which felt best'); expect(src(f), f).not.toMatch(/chipProgress|chipHint|chipSecs|chipMore/);
    }
  });
});

describe('the picker CSS contract: the pill, the dots and the constant width', () => {
  it('the root adds no box: the pill and the trigger are flex items of the header row, and neither is a grid cell', () => {
    expect(css).toMatch(/\.root,\.layer\{display:contents\}/);
    expect(css).not.toMatch(/grid-column:[23]\}/); expect(rule('.chip')).not.toContain('grid-column');
  });
  it('C6 the Controls button has one width: a 108 px minimum that holds the word, the gap and the reserved 20 px dots slot; the pill is 64, so the cluster is the 232 px the readout budgets', () => {
    const trigger = rule('.trigger');
    expect(trigger).toContain('flex:none'); expect(trigger).toContain('min-width:108px'); expect(trigger).toContain('gap:8px'); expect(trigger).toContain('padding:0 12px');
    expect(rule('.dots')).toMatch(/width:20px/);
    expect(rule('.chip')).toContain('flex:none'); expect(rule('.chip')).toContain('min-width:64px');
    expect(64 + 8 + 108 + 8 + 44).toBe(232); // Vote + gap + Controls + gap + Pause
    expect(css).not.toMatch(/\.trigger\{[^}]*min-width:88px/); expect(css).not.toMatch(/@media\(max-width:400px\)\{\.trigger/); // no width that changes with the viewport
  });
  it('the dots are 8 px circles 4 px apart that fill in the text colour, never lime', () => {
    expect(rule('.dots')).toContain('gap:4px');
    const dot = rule('.dots i'), on = rule('.dots i[data-on]');
    expect(dot).toContain('width:8px'); expect(dot).toContain('height:8px'); expect(dot).toContain('border-radius:50%');
    expect(on).toContain('background:var(--ink)'); expect(on).not.toContain('lime');
  });
  it('the pill is 44 px, lime (it only exists while the vote works), has a 3 px focus ring and no animation', () => {
    const chip = rule('.chip');
    expect(chip).toContain('min-height:44px'); expect(chip).toContain('background:var(--lime)'); expect(chip).not.toMatch(/animation|transition/);
    expect(css).toMatch(/\.chip:focus-visible\{outline:3px solid/);
    expect(css).not.toMatch(/\.chip\[data-ready\]|chipText|chipSecs|chipMore|chipDot/);
  });
  it('D4-style forced colors: the pill is Highlight, the dots follow CanvasText (counted: Highlight), and an open Controls button flips them to HighlightText', () => {
    expect(forced).toMatch(/\.chip\{[^}]*Highlight[^}]*forced-color-adjust:none\}/);
    expect(forced).toContain('.dots i{border-color:CanvasText}'); expect(forced).toContain('.dots i[data-on]{background:Highlight;border-color:Highlight}');
    expect(forced).toContain('.trigger[aria-expanded=true] .dots i{border-color:HighlightText}');
  });
  it('the primary button is lime; nothing styles the last button in the footer any more', () => {
    expect(css).toMatch(/\.action\.primary\{background:var\(--lime\)/); expect(css).not.toContain('.buttons .action:last-child');
  });
});
