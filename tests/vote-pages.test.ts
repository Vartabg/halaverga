import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import PrivacyPage from '@/app/privacy/page';
import { esc, NOISE_LINE, resultsBody, resultsDocument, type ResultsStatus } from '@/app/results/markup';
import type { VoteResults } from '@/lib/vote/ballot';
import { PRIVACY_FULL } from '@/lib/vote/privacy';
import { aggregate } from '@/server/vote/aggregate';
import { NOW, OPTS, agg, flat, spread } from './helpers/voteAgg';

const html = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el);
const view = (r: VoteResults | null, status: ResultsStatus = null) => resultsBody(r, status);
const ranked = () => aggregate(flat(spread(30, (i) => ({ favorite: i % 4 === 0 ? 'tie' : 'flow', tried: ['cursor', 'flow', 'captured'] }))), [], OPTS, NOW, true); // 30 groups, 30 votes, published
const src = (p: string) => readFileSync(fileURLToPath(new URL(`../src/app/${p}`, import.meta.url)), 'utf8');

describe('W8 results page markup', () => {
  const page = view(ranked());

  it('shows the title, the read time, one block per family, the ranked table in order and the fixed noise sentence', () => {
    expect(page).toContain('<h1');
    expect(page).toContain('Halaverga vote results');
    expect(page).toContain('As of 14:05:12 UTC');
    expect(page).toContain('data-testid="results-touch"');
    expect(page).toContain('Not enough votes for a ranking yet on touch.');
    expect(page).toContain('data-testid="results-desktop"');
    expect(page).toContain('Desktop controls');
    for (const th of ['Control', 'Picked', 'Head to head']) expect(page).toContain(`>${th}</th>`);
    for (const gone of ['Wins', 'Losses']) expect(page).not.toContain(`>${gone}</th>`); // R2: no column that re-adds to the exact ballot count
    expect(page).toContain('Flow');
    expect(page).toMatch(/about \d+ of 30 tried/);
    expect(page).toMatch(/Can(&#x27;|')t tell: about 5\b/); // 8 ties are published as 5
    expect(page).toContain(NOISE_LINE);
    expect(page.indexOf('>Flow<')).toBeLessThan(page.indexOf('>Cursor<')); // best first: the ranking order, not the registry order
  });

  it('carries no store key, vendor, limit, note, build, stale or held text, and no script', () => {
    for (const bad of [/hv:/i, /upstash/i, /vercel/i, /redis/i, /\bnotes?\b/i, /\bbuilds?\b/i, /stale/i, /held/i, /limit/i, /per hour/i, /rl:/, /<script/]) expect(page).not.toMatch(bad);
    expect(page).not.toMatch(/\d+ votes? (per|an) hour/);
  });

  it('links to the game and to /privacy, and to nothing else', () => {
    const hrefs = [...page.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);
    expect(hrefs.sort()).toEqual(['/', '/privacy']);
  });

  it('an unranked family says so, and gives a count only from 5 votes', () => {
    const few = view(agg(spread(3, () => ({ favorite: 'flow', tried: ['flow', 'captured'] }))));
    expect(few).toContain('Not enough votes for a ranking yet on desktop.');
    expect(few).not.toMatch(/About \d+ votes/);
    const some = view(agg(spread(12, () => ({ favorite: 'flow', tried: ['flow', 'captured'] })), [], { cap: 5, minVotes: 100 }));
    expect(some).toContain('About 10 votes so far.');
    expect(some).not.toContain('<table');
  });

  it('clamps a bar to 0..100 and words a control nobody met', () => {
    const r = ranked(), rows = r.families.desktop.controls!;
    rows.flow.rate = 250; rows.cursor.rate = -40; rows.brush.rate = null;
    const out = view(r);
    expect(out).toContain('width:100%');
    expect(out).toContain('width:0%');
    expect(out).not.toMatch(/width:(250|-40)/);
    expect(out).toContain('none yet');
  });

  it('says why there is no tally when there is none: not set up, or the store is unreachable', () => {
    expect(view(null, 'unset')).toMatch(/Voting isn(&#x27;|')t set up on this deployment yet\./);
    expect(view(null, 'failed')).toMatch(/Couldn(&#x27;|')t reach the vote store right now\. Try again in a minute\./);
    expect(view(null, 'unset')).not.toContain('<table');
  });

  it('is a server component: no client JS, no store call in the markup module', () => {
    expect(src('results/markup.ts')).not.toMatch(/use client|from '@\/server|from 'react-dom/); // a route handler cannot import react-dom/server: this is a string builder
  });
});

describe('CODE-6 the /results document', () => {
  const doc = resultsDocument(ranked(), null);
  it('is a standalone page (no root layout in a route handler): doctype, charset, viewport, noindex, a title, one inline stylesheet, no script, and the same body', () => {
    expect(doc.startsWith('<!doctype html><html lang="en"><head><meta charset="utf-8">')).toBe(true);
    for (const s of ['name="viewport"', 'name="robots" content="noindex, nofollow"', '<title>Halaverga vote results</title>', '.vr-page', ':root{color-scheme:dark']) expect(doc).toContain(s);
    expect(doc.match(/<style>/g)).toHaveLength(1);
    expect(doc).not.toMatch(/<script|src=|href="http|@import|url\(/i);
    expect(doc).toContain(resultsBody(ranked(), null));
    expect(doc.endsWith('</main></body></html>')).toBe(true);
  });
  it('escapes what it prints (a control label from the registry is trusted, but the builder never relies on that)', () => {
    expect(esc('<img src=x onerror=1>&"\'')).toBe('&lt;img src=x onerror=1&gt;&amp;&quot;&#x27;');
    expect(esc(5)).toBe('5');
  });
});

describe('W8 /privacy page', () => {
  const page = html(createElement(PrivacyPage));

  it('renders PRIVACY_FULL under the title Halaverga vote privacy, with a way back to the game', () => {
    expect(page).toContain('Halaverga vote privacy');
    expect(page).toContain(html(createElement('p', null, PRIVACY_FULL)).slice(3, -4));
    expect(page).toContain('href="/"');
  });

  it('shows no vote data and makes no store call: static, no client JS, no request-time API', () => {
    const code = src('privacy/page.tsx');
    expect(code).not.toMatch(/use client|@\/server|connection|cookies|headers\(/);
    expect(page).not.toMatch(/<table|About \d+ votes|hv:/);
  });
});
