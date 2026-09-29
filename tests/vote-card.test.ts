import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import VoteCard, { NOTHING_TRIED_TEXT, PRIVACY_LINE } from '@/ui/vote/VoteCard';
import { canSend, favoriteOptions, favoritesLine, ratingLabs, STATUS_TEXT } from '@/ui/vote/voteClient';
import { toResults } from '@/server/vote/results';
import { GUARD_MAX_MS, GUARD_MS, guardOn } from '@/ui/vote/voteTracker';

const read = (name: string) => readFileSync(fileURLToPath(new URL(`../src/ui/vote/${name}`, import.meta.url)), 'utf8');
const render = (props: Partial<Parameters<typeof VoteCard>[0]> = {}) => renderToStaticMarkup(createElement(VoteCard,
  { current: 'draw', tried: ['draw', 'brush'], device: 'touch', onClose: () => {}, ...props }));

describe('vote card model', () => {
  it('offers the tried controls of the family as favorites, current first', () => {
    expect(favoriteOptions(['one-finger', 'draw', 'brush'], 'brush', 'touch')).toEqual(['brush', 'one-finger', 'draw']);
    expect(favoriteOptions([], 'conduct', 'touch')).toEqual(['conduct']);
    expect(favoriteOptions(['cursor', 'flow'], 'flow', 'desktop')).toEqual(['flow', 'cursor']);
  });
  it('has no rating group for untried controls', () => {
    expect(ratingLabs(['draw', 'brush'], 'brush', 'touch')).toEqual(['brush', 'draw']);
    expect(ratingLabs([], 'draw', 'touch')).toEqual([]);
  });
  it('Send is disabled with no favorite, while busy and after ok or closed', () => {
    expect(canSend(null, false, null)).toBe(false);
    expect(canSend('draw', false, null)).toBe(true);
    expect(canSend('draw', true, null)).toBe(false);
    expect(canSend('draw', false, 'later')).toBe(true);
    expect(canSend('draw', false, 'network')).toBe(true);
    expect(canSend('draw', false, 'ok')).toBe(false);
    expect(canSend('draw', false, 'closed')).toBe(false);
  });
  it('the guard stays on until 400 ms have passed and no pointer is down', () => {
    expect(guardOn(1000, 1000 + GUARD_MS - 1, 0)).toBe(true);
    expect(guardOn(1000, 1000 + GUARD_MS, 0)).toBe(false);
    expect(guardOn(1000, 1000 + GUARD_MS + 500, 1)).toBe(true);
    expect(guardOn(1000, 1000 + GUARD_MAX_MS, 2)).toBe(false);
  });
  it('the status copy and the tally line', () => {
    expect(STATUS_TEXT.later).toMatch(/^Too many votes from this network/);
    expect(STATUS_TEXT.closed).toMatch(/isn't open/);
    expect(STATUS_TEXT.invalid).toMatch(/Reload the page and try again\.$/);
    const r = toResults('r2', { total: 7, 'dev:touch': 7, 'fav:touch:one-finger': 2, 'fav:touch:draw': 4, 'fav:touch:brush': 1 }, {});
    expect(favoritesLine(r, 'touch')).toBe('Favorites so far on touch: Draw 4 · One finger 2 · Brush 1');
    expect(favoritesLine(r, 'desktop')).toBe('');
    expect(favoritesLine(null, 'touch')).toBe('');
  });
});

describe('vote card markup (server render)', () => {
  it('shows the tried favorites, rating groups only for them, the privacy line and a disabled Send', () => {
    const html = render({ tried: ['draw', 'brush', 'one-finger'] });
    expect(html).toContain('data-testid="vote-card"');
    expect(html).toMatch(/<section[^>]*aria-labelledby="([^"]+)"[\s\S]*<h2 id="\1"[^>]*tabindex="-1"[^>]*>Which controls did you like\?<\/h2>/);
    expect(html.match(/name="vote-favorite"/g)).toHaveLength(3);
    expect(html.indexOf('value="draw"')).toBeLessThan(html.indexOf('value="one-finger"')); // the current control first
    expect(html.indexOf('value="one-finger"')).toBeLessThan(html.indexOf('value="brush"'));
    expect(html).toContain('>One finger</span>');
    expect(html).toContain('data-testid="vote-rating-draw"');
    expect(html).toContain('data-testid="vote-rating-brush"');
    expect(html).not.toContain('vote-rating-twin-stick');
    expect(html).not.toContain('vote-rating-conduct');
    expect(html).toContain('1 low · 5 high');
    expect(html).toContain('maxLength="280"');
    expect(PRIVACY_LINE).toContain('90 days');
    expect(html).toContain(PRIVACY_LINE.replace(/'/g, '&#x27;'));
    expect(html).toMatch(/<button type="submit"[^>]*disabled=""[^>]*>Send vote<\/button>/);
    expect(html).toContain('>Not yet</button>'); // controls left to try: the same quiet close, said honestly
    expect(html).toContain('role="status"');
    expect(html).not.toContain('data-guard');
  });
  it('says Tried X of N and which controls are not tried yet, per family', () => {
    const touch = render({ tried: ['draw', 'brush'] });
    expect(touch).toContain('data-testid="vote-tried"');
    expect(touch).toMatch(/Tried 2 of 5\./);
    expect(touch).toContain('Not tried yet: One finger, Twin stick, Conduct. You can keep playing and vote later.');
    const desktop = render({ device: 'desktop', current: 'cursor', tried: ['cursor', 'draw', 'flow'] });
    expect(desktop).toMatch(/Tried 3 of 8\./);
    expect(desktop).toContain('Not tried yet: One finger + keys, Captured, Mouse + keys, Conduct, Brush. You can keep playing and vote later.');
    expect(desktop).not.toContain('name="vote-rate-twin-stick"');
  });
  it('with every control tried there is no not-tried line and the close button says Skip', () => {
    const all = render({ tried: ['one-finger', 'twin-stick', 'draw', 'conduct', 'brush'], current: 'one-finger' });
    expect(all).toMatch(/Tried 5 of 5\./);
    expect(all).not.toContain('Not tried yet');
    expect(all).toContain('>Skip</button>');
    expect(all).not.toContain('>Not yet</button>');
  });
  it('with nothing played there is no form: a vote needs 20 s of play on a control, not just opening the sheet', () => {
    const empty = render({ tried: [], current: 'one-finger' });
    expect(empty).toContain('data-testid="vote-nothing"');
    expect(empty).toContain(NOTHING_TRIED_TEXT.replace(/'/g, '&#x27;'));
    expect(NOTHING_TRIED_TEXT).toContain('20 seconds');
    for (const gone of ['vote-favorite', 'vote-tried', 'name="vote-rate', 'type="submit"', 'vote-card-note', '>Skip</button>', '>Not yet</button>']) expect(empty, gone).not.toContain(gone);
    expect(empty).toContain('>Keep playing</button>');
    // The current control alone (nothing played on it) is never a favorite: the form only exists once something is tried.
    expect(render({ tried: ['draw'], current: 'one-finger' })).toContain('vote-favorite');
  });
  it('carries data-guard while guarded, and shows thanks with Done when this device already voted', () => {
    expect(render({ guard: true })).toContain('data-guard=""');
    const done = render({ already: true });
    expect(done).not.toContain('vote-favorite');
    expect(done).toContain('>Done</button>');
  });
  it('the stylesheet: guard rule, 44 px targets, focus ring, no motion under reduced motion, safe-area padding', () => {
    const css = read('VoteCard.module.css');
    expect(css).toMatch(/\.card\[data-guard\]\{pointer-events:none\}/);
    expect(css).toMatch(/min-height:44px;min-width:44px/);
    expect(css).toMatch(/outline:3px solid var\(--lime\)/);
    expect(css).toMatch(/prefers-reduced-motion:reduce/);
    expect(css).toMatch(/env\(safe-area-inset-bottom\)/);
    expect(css).not.toMatch(/@keyframes|transition:(?!none)/);
  });
  it('every vote module stays under 200 lines and sends no lab stats', () => {
    for (const f of ['VoteLayer.tsx', 'VoteCard.tsx', 'VoteRatings.tsx', 'voteClient.ts', 'voteTracker.ts', 'playInput.ts', 'VoteCard.module.css']) {
      expect(read(f).split('\n').length, f).toBeLessThan(200);
    }
    expect(read('voteClient.ts')).not.toMatch(/labStats|strokeLog/);
  });
});
