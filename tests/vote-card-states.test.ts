import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { VOTE_ROUND, type FamilyResults, type VoteResults } from '@/lib/vote/ballot';
import VoteCard, { type VoteCardProps } from '@/ui/vote/VoteCard';
import VoteNeed from '@/ui/vote/VoteNeed';
import { suggestNext } from '@/ui/vote/ballotPlan';
import { ALREADY_TEXT, STATUS_TEXT, VOTE_NAMES, type VoteOutcome } from '@/ui/vote/voteClient';

const read = (path: string) => readFileSync(fileURLToPath(new URL(`../src/${path}`, import.meta.url)), 'utf8');
const esc = (s: string) => s.replace(/'/g, '&#x27;');
const SEED = 12345;
const render = (props: Partial<VoteCardProps> = {}) => renderToStaticMarkup(createElement(VoteCard,
  { current: 'draw', tried: ['draw', 'brush'], device: 'touch', seed: SEED, saved: null, probe: null, onClose: () => {}, ...props }));
const fam = (o: Partial<FamilyResults> = {}): FamilyResults => ({ votes: 0, ranked: false, tie: null, order: null, controls: null, lastFlown: null, ...o });
const ranked: VoteResults = { v: 3, round: VOTE_ROUND, asOf: '2026-09-30T14:05:12Z', open: true, families: {
  touch: fam({ votes: 40, ranked: true, tie: 5, order: ['brush', 'draw', 'one-finger', 'twin-stick', 'conduct'], controls: {} }), desktop: fam({ votes: 12 }) } };
const noRadios = (html: string) => expect(html).not.toContain('name="vote-pick"');

describe('r2p:3 the need-more state: never a dead end', () => {
  it('V6 under two tried: what is missing, a Try button for the seeded suggestion, Keep playing; no ballot, no Send', () => {
    for (const [tried, n] of [[['draw'], 1], [[], 0]] as const) {
      const html = render({ current: 'one-finger', tried: [...tried] });
      const want = suggestNext('touch', [...tried, 'one-finger'], SEED)!;
      expect(html).toContain('data-phase="need"');
      const line = n === 0 ? 'Fly two ways for 20 seconds each' : 'Fly one more way for 20 seconds'; // V6: right at 0 of 2 and at 1 of 2
      expect(html).toContain(`data-testid="vote-need-more">${line}, then vote. You have flown ${n} of 2 so far.<`);
      expect(html).toContain('data-testid="vote-try"');
      expect(html).toContain(`Try ${VOTE_NAMES[want]} for 20 seconds</button>`);
      expect([...tried, 'one-finger']).not.toContain(want); // never a control already flown or being flown
      expect(html).toContain('>Keep playing</button>');
      for (const gone of ['vote-send', 'radiogroup', 'Not yet', 'textarea']) expect(html, gone).not.toContain(gone);
      noRadios(html);
    }
  });
  it('with nothing left to suggest the copy says to open Controls, and there is no Try button', () => {
    const html = renderToStaticMarkup(createElement(VoteNeed, { count: 1, suggestion: null, onTry: () => {}, onKeep: () => {} }));
    expect(html).toContain('You have flown 1 of 2 so far. Open Controls to switch.<');
    expect(html).not.toContain('vote-try');
    expect(html).toContain('>Keep playing</button>');
    const withOne = renderToStaticMarkup(createElement(VoteNeed, { count: 1, suggestion: 'draw', onTry: () => {}, onKeep: () => {} }));
    expect(withOne).not.toContain('Open Controls');
    expect(withOne).toContain('Try Draw for 20 seconds</button>');
  });
  it('the suggestion is never flow, captured or mouse-keys, on any seed', () => {
    for (let seed = 0; seed < 200; seed++) {
      const html = render({ device: 'desktop', current: 'cursor', tried: [], seed });
      expect(html).toMatch(/data-testid="vote-try"/);
      for (const bad of ['Try Flow', 'Try Captured', 'Try Mouse + keys']) expect(html, `${seed} ${bad}`).not.toContain(bad);
    }
  });
  it('a vote already sent is done even with nothing tried; nothing else changes it', () => {
    const html = render({ tried: [], already: true });
    expect(html).toContain('data-phase="done"');
    expect(html).not.toContain('vote-need-more');
  });
});

describe('the other card states', () => {
  it('done (already voted): thanks, the tally from the probe, See all results, Done; no ballot', () => {
    const html = render({ already: true, probe: { results: ranked, closed: false } });
    expect(html).toContain('data-phase="done"');
    expect(html).toContain(`role="status">${ALREADY_TEXT}<`);
    expect(ALREADY_TEXT).toBe('Your vote is in. Thanks.');
    expect(html).toContain('data-testid="vote-tally">Winning head to head so far on touch: Brush, Draw, One finger.<');
    expect(html).toMatch(/<a [^>]*href="\/results" target="_blank" rel="noopener">See all results<\/a>/);
    expect(html).toContain('data-testid="vote-done"');
    for (const gone of ['vote-send', 'Not yet', 'radiogroup']) expect(html).not.toContain(gone);
    noRadios(html);
    expect(render({ already: true })).not.toContain('vote-tally'); // no results yet: the line is left out
    expect(render({ already: true, probe: { results: { ...ranked, families: { touch: fam({ votes: 2 }), desktop: fam() } }, closed: false } }))
      .toContain('Only a few votes so far on touch.');
  });
  it('done after a 200: the Thanks line', () => {
    const html = render({ start: { pick: 'draw', outcome: 'ok' }, probe: { results: ranked, closed: false } });
    expect(html).toContain('data-phase="done"');
    expect(html).toContain('role="status">Thanks. Your vote is in.<');
    expect(html).toContain('vote-tally');
    noRadios(html);
  });
  it('closed after a 503: the closed line and Keep playing; no ballot', () => {
    const html = render({ start: { pick: 'draw', outcome: 'closed' } });
    expect(html).toContain('data-phase="closed"');
    expect(html).toContain('data-testid="vote-closed">Voting isn&#x27;t open right now.<');
    expect(html).toContain('data-testid="vote-keep">Keep playing</button>');
    for (const gone of ['vote-send', 'Not yet', 'vote-tally', 'Thanks']) expect(html).not.toContain(gone);
    noRadios(html);
  });
  it.each(['later', 'network', 'error', 'cross', 'invalid'] as VoteOutcome[])('after %s: the ballot stays, the pick stays, the outcome text shows, Send says Try again, never Thanks', outcome => {
    const html = render({ start: { pick: 'brush', outcome } });
    expect(html).toContain('data-phase="ballot"');
    expect(html).toContain(`role="status">${esc(STATUS_TEXT[outcome])}<`);
    expect(html).toMatch(/name="vote-pick" checked="" value="brush"/);
    expect(html).toMatch(/aria-disabled="false" aria-busy="false">Try again<\/button>/);
    expect(html).toContain('>Not yet</button>');
    for (const gone of ['Thanks', 'Your vote is in', 'vote-tally']) expect(html).not.toContain(gone);
  });
  it('the auto-open card carries the guard in every state', () => {
    for (const props of [{}, { tried: [] }, { already: true }, { start: { outcome: 'closed' as const } }]) expect(render({ guard: true, ...props })).toContain('data-guard=""');
  });
});

describe('the card sources', () => {
  const dir = fileURLToPath(new URL('../src/ui/vote/', import.meta.url));
  it('every vote module stays under 200 lines, and no vote code reads lab stats', () => {
    for (const f of readdirSync(dir)) {
      const text = read(`ui/vote/${f}`);
      expect(text.split('\n').length, f).toBeLessThan(200);
      expect(text, f).not.toMatch(/labStats|strokeLog/);
    }
  });
  it('the stylesheet: guard rule, 56 px rows, 44 px links, focus ring, no motion, safe-area padding, forced colors, no note or rating styles', () => {
    const css = read('ui/vote/VoteCard.module.css');
    expect(css).toMatch(/\.card\[data-guard\]\{pointer-events:none\}/);
    expect(css).toMatch(/\.row\{[^}]*min-height:56px/);
    expect(css).toMatch(/\.link\{[^}]*min-height:44px/);
    expect(css).toMatch(/\.send\{[^}]*min-height:48px/);
    expect(css).toMatch(/outline:3px solid var\(--accent\)/);
    expect(css).toMatch(/prefers-reduced-motion:reduce/);
    expect(css).toMatch(/forced-colors:active/);
    expect(css).toMatch(/env\(safe-area-inset-bottom\)/);
    expect(css).toMatch(/\.foot\[data-ballot\]\{position:sticky;bottom:calc\(-1\*max\(12px,env\(safe-area-inset-bottom\)\)\)/); // V1, V2: Send, Not yet and the status line stay pinned in every orientation
    expect(css).not.toMatch(/@media\(max-height:500px\)[^@]*\.buttons\{position:sticky/); // and not only in short landscape
    expect(css).toMatch(/forced-colors:active[^@]*\.row:has\(input:checked\):hover\{background:Highlight/); // V3: the hover accent never beats Highlight
    expect(css).toMatch(/\.row svg \*\{animation:none!important\}/);
    expect(css).toMatch(/\.send\[aria-disabled=true\]/);
    expect(css).not.toMatch(/@keyframes|transition:(?!none)|noteBox|\.rating|\.scale|\.step/);
  });
  it('VoteLayer records a Skip only through skipCounts, and hands the card the Try handler', () => {
    const layer = read('ui/vote/VoteLayer.tsx');
    expect(layer.match(/markSkipped\(/g)).toHaveLength(1);
    expect(layer).toMatch(/skipCounts\(kind, session\.origin\)\) markSkipped\(session\.family\)/);
    expect(layer).toMatch(/onTry=\{tryControl\}/);
    expect(layer).toMatch(/close\('done'\);\s*if \(family\) selectControl\(id, \{ family \}\)/); // the close comes first: selectControl refuses while the card is open
  });
  it('nothing in the landing first load imports the vote client, plan, pending or card', () => {
    for (const f of ['ui/Experience.tsx', 'ui/PauseCard.tsx', 'game/store.ts']) {
      const imports = read(f).split('\n').filter(l => /^\s*import\b/.test(l) || /import\(/.test(l));
      const vote = imports.filter(l => /vote\//.test(l));
      expect(vote.every(l => /import\('\.\/vote\/VoteLayer'\)/.test(l)), f).toBe(true);
    }
  });
});
