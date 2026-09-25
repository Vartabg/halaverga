import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import VoteCard, { PRIVACY_LINE } from '@/ui/vote/VoteCard';
import { canSend, favoriteOptions, favoritesLine, ratingLabs, STATUS_TEXT } from '@/ui/vote/voteClient';
import { GUARD_MAX_MS, GUARD_MS, guardOn } from '@/ui/vote/voteTracker';
import type { VoteResults } from '@/lib/vote/shape';

const read = (name: string) => readFileSync(fileURLToPath(new URL(`../src/ui/vote/${name}`, import.meta.url)), 'utf8');
const render = (props: Partial<Parameters<typeof VoteCard>[0]> = {}) => renderToStaticMarkup(createElement(VoteCard,
  { current: 'draw', tried: ['draw', 'brush'], device: 'touch', onClose: () => {}, ...props }));

describe('vote card model', () => {
  it('offers the tried styles as favorites, current first (all four when none)', () => {
    expect(favoriteOptions(['standard', 'draw', 'brush'], 'brush')).toEqual(['brush', 'standard', 'draw']);
    expect(favoriteOptions([], 'conduct')).toEqual(['conduct', 'standard', 'draw', 'brush']);
  });
  it('has no rating group for untried styles', () => {
    expect(ratingLabs(['draw', 'brush'], 'brush')).toEqual(['brush', 'draw']);
    expect(ratingLabs([], 'draw')).toEqual([]);
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
    const r = { favorite: { standard: 2, draw: 4, conduct: 0, brush: 1 } } as unknown as VoteResults;
    expect(favoritesLine(r)).toBe('Favorites so far: Draw 4 · Standard 2 · Brush 1');
    expect(favoritesLine(null)).toBe('');
  });
});

describe('vote card markup (server render)', () => {
  it('shows the tried favorites, rating groups only for them, the privacy line and a disabled Send', () => {
    const html = render();
    expect(html).toContain('data-testid="vote-card"');
    expect(html).toMatch(/<section[^>]*aria-labelledby="([^"]+)"[\s\S]*<h2 id="\1"[^>]*tabindex="-1"[^>]*>Which controls did you like\?<\/h2>/);
    expect(html.match(/name="vote-favorite"/g)).toHaveLength(2);
    expect(html.indexOf('value="draw"')).toBeLessThan(html.indexOf('value="brush"'));
    expect(html).toContain('data-testid="vote-rating-draw"');
    expect(html).toContain('data-testid="vote-rating-brush"');
    expect(html).not.toContain('vote-rating-standard');
    expect(html).toContain('1 low · 5 high');
    expect(html).toContain('maxLength="280"');
    expect(PRIVACY_LINE).toContain('90 days');
    expect(html).toContain(PRIVACY_LINE.replace(/'/g, '&#x27;'));
    expect(html).toMatch(/<button type="submit"[^>]*disabled=""[^>]*>Send vote<\/button>/);
    expect(html).toContain('>Skip</button>');
    expect(html).toContain('role="status"');
    expect(html).not.toContain('data-guard');
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
    for (const f of ['VoteLayer.tsx', 'VoteCard.tsx', 'VoteRatings.tsx', 'voteClient.ts', 'voteTracker.ts', 'VoteCard.module.css']) {
      expect(read(f).split('\n').length, f).toBeLessThan(200);
    }
    expect(read('voteClient.ts')).not.toMatch(/labStats|strokeLog/);
  });
});
