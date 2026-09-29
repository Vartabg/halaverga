import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { controlsFor } from '@/game/controlTypes';
import { VOTE_KEY_TAG, VOTE_ROUND, type VoteResults } from '@/lib/vote/shape';
import { Notes, Tally, UNVERIFIED_LINE } from '@/app/results/Tally';
import { hashToCounts, MIN_RATINGS, readResults, toResults } from '@/server/vote/results';
import { FakeRedis } from './fixtures/fake-redis';

const NS = 'hv:test';
const seed = async (redis: FakeRedis, key: string, fields: Record<string, number>) => {
  await redis.exec(Object.entries(fields).map(([f, n]) => ['HINCRBY', key, f, n] as ['HINCRBY', string, string, number]));
};

describe('toResults', () => {
  const tally = {
    total: 10, notes: 2, stale: 1, 'dev:touch': 6, 'dev:desktop': 4,
    'fav:touch:one-finger': 3, 'fav:touch:draw': 2, 'fav:touch:twin-stick': 1,
    'tried:touch:one-finger': 6, 'tried:touch:draw': 4,
    'rsum:touch:draw': 13, 'rn:touch:draw': 3, 'rsum:touch:one-finger': 9, 'rn:touch:one-finger': 2,
    'fav:desktop:cursor': 1, 'fav:desktop:draw': 3, 'tried:desktop:draw': 4, 'rsum:desktop:draw': 20, 'rn:desktop:draw': 4,
  };
  const r = toResults('r2', tally, { '2026-09-25 · abc1234': 10 });

  it('has the v2 shape with one group per family and a row for every registry id of it (zeros included)', () => {
    expect(r).toMatchObject({ v: 2, round: 'r2', total: 10, notes: 2, stale: 1, builds: { '2026-09-25 · abc1234': 10 } });
    expect(Object.keys(r.families.touch.controls)).toEqual(controlsFor('touch').map((c) => c.id));
    expect(Object.keys(r.families.desktop.controls)).toEqual(controlsFor('desktop').map((c) => c.id));
    expect(r.families.touch.votes).toBe(6);
    expect(r.families.desktop.votes).toBe(4);
    expect(r.families.touch.controls.brush).toEqual({ favorite: 0, share: 0, tried: 0, rating: { avg: null, n: 0 } });
    expect(r.families.desktop.controls['mouse-keys']).toBeDefined();
  });

  it('share is the integer percent of that family\'s votes; 0 with no votes', () => {
    expect(r.families.touch.controls['one-finger'].share).toBe(50);
    expect(r.families.touch.controls.draw.share).toBe(33);
    expect(r.families.touch.controls['twin-stick'].share).toBe(17);
    expect(r.families.desktop.controls.draw.share).toBe(75);
    const none = toResults('r2', {}, {});
    for (const f of [none.families.touch, none.families.desktop]) for (const row of Object.values(f.controls)) expect(row).toEqual({ favorite: 0, share: 0, tried: 0, rating: { avg: null, n: 0 } });
  });

  it('draw is a separate row in each family', () => {
    expect(r.families.touch.controls.draw).toMatchObject({ favorite: 2, tried: 4 });
    expect(r.families.desktop.controls.draw).toMatchObject({ favorite: 3, tried: 4 });
  });

  it('the mean is rounded to 0.1 and hidden below 3 ratings', () => {
    expect(MIN_RATINGS).toBe(3);
    expect(r.families.touch.controls.draw.rating).toEqual({ avg: 4.3, n: 3 });
    expect(r.families.desktop.controls.draw.rating).toEqual({ avg: 5, n: 4 });
    expect(r.families.touch.controls['one-finger'].rating).toEqual({ avg: null, n: 2 });
  });

  it('ignores Redis fields it does not know (old ids, other families, made-up names)', () => {
    const odd = toResults('r2', { ...tally, 'fav:standard': 9, 'fav:desktop:one-finger': 9, 'fav:touch:cursor': 9, 'tried:desktop:twin-stick': 9, evil: 1, 'fav:__proto__': 5 }, {});
    expect(odd.families).toEqual(r.families);
    expect(JSON.stringify(odd)).not.toContain('standard');
  });

  it('hashToCounts reads both Upstash shapes and skips non-numbers', () => {
    expect(hashToCounts(['a', '1', 'b', 'x', 'c', '3'])).toEqual({ a: 1, c: 3 });
    expect(hashToCounts({ a: '2', b: 'no' })).toEqual({ a: 2 });
    expect(hashToCounts(null)).toEqual({});
  });
});

describe('readResults', () => {
  it('reads the schema-tagged keys and never an untagged or s1 key', async () => {
    const redis = new FakeRedis();
    await seed(redis, `${NS}:vote:${VOTE_ROUND}`, { total: 50, 'dev:touch': 50, 'fav:touch:draw': 50 });
    await seed(redis, `${NS}:vote:${VOTE_ROUND}:s1`, { total: 40, 'dev:touch': 40, 'fav:touch:draw': 40 });
    await seed(redis, `${NS}:vote:r1`, { total: 30 });
    await seed(redis, `${NS}:builds:${VOTE_ROUND}:s1`, { old: 40 });
    expect((await readResults(redis, NS, VOTE_ROUND)).total).toBe(0);
    await seed(redis, `${NS}:vote:${VOTE_KEY_TAG}`, { total: 2, 'dev:desktop': 2, 'fav:desktop:cursor': 2 });
    await seed(redis, `${NS}:builds:${VOTE_KEY_TAG}`, { 'the build': 2 });
    const res = await readResults(redis, NS, VOTE_ROUND);
    expect(res.total).toBe(2);
    expect(res.builds).toEqual({ 'the build': 2 });
    expect(res.families.desktop.controls.cursor.favorite).toBe(2);
    expect(res.families.touch.votes).toBe(0);
  });
});

describe('results page markup (server render, no client JS)', () => {
  const html = renderToStaticMarkup(createElement(Tally, { r: toResults('r2', {
    total: 3, 'dev:touch': 2, 'dev:desktop': 1, 'fav:touch:draw': 2, 'fav:desktop:flow': 1,
    'rsum:touch:draw': 12, 'rn:touch:draw': 3, stale: 1,
  }, { '2026-09-25 · abc1234': 3 }) }));
  const table = (family: string) => html.slice(html.indexOf(`data-testid="results-${family}"`)).split('</table>')[0];

  it('renders one table per family, in registry order, with a caption and scoped headers', () => {
    expect(html.match(/data-testid="results-/g)).toHaveLength(2);
    for (const [family, rows] of [['touch', 5], ['desktop', 8]] as const) {
      const t = table(family);
      expect(t).toMatch(new RegExp(`<caption>${family === 'touch' ? 'Touch' : 'Desktop'}: \\d votes?</caption>`));
      expect(t.match(/<th scope="col">/g)).toHaveLength(6);
      for (const h of ['Control', 'Favorite votes', 'Share', 'Tried', 'Mean rating', 'Ratings']) expect(t).toContain(`<th scope="col">${h}</th>`);
      expect(t.match(/<th scope="row">/g)).toHaveLength(rows);
      const labels = [...t.matchAll(/<th scope="row">([^<]+)<\/th>/g)].map((m) => m[1].replace('&amp;', '&'));
      expect(labels).toEqual(controlsFor(family).map((c) => c.label));
    }
    expect(html.indexOf('results-touch')).toBeLessThan(html.indexOf('results-desktop'));
  });

  it('shows the counts, the hidden-mean note, the version table and the honest sentence', () => {
    expect(table('touch')).toContain('>4.0<');
    expect(table('desktop')).toContain('fewer than 3 ratings');
    expect(html).toContain(UNVERIFIED_LINE);
    expect(UNVERIFIED_LINE).toBe('Anonymous, unverified counts, so treat them as a guide, not a ballot.');
    expect(html).toContain('20 votes per hour');
    expect(html).toContain('2026-09-25 · abc1234');
    expect(html).toContain('Votes sent from a tab opened before the latest deploy: 1.');
  });

  it('names the tagged notes key, and the page is server-rendered, noindex and has no client JS', () => {
    const notes = renderToStaticMarkup(createElement(Notes, { count: 2, ns: NS, round: 'r2' }));
    expect(notes).toContain(`${NS}:notes:r2:s2:`);
    const page = readFileSync(fileURLToPath(new URL('../src/app/results/page.tsx', import.meta.url)), 'utf8');
    const tally = readFileSync(fileURLToPath(new URL('../src/app/results/Tally.tsx', import.meta.url)), 'utf8');
    expect(page).not.toMatch(/['"]use client['"]/);
    expect(tally).not.toMatch(/['"]use client['"]|useState|useEffect/);
    expect(page).toMatch(/robots: \{ index: false, follow: false \}/);
    expect(page).toContain("Voting isn&apos;t set up on this deployment yet.");
    expect(page).toContain('Couldn&apos;t reach the vote store right now. Try again in a minute.');
  });
});
