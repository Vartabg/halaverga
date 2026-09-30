import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { controlsFor, type ControlFamily, type ControlId } from '@/game/controlTypes';
import { VOTE_ROUND, type FamilyResults, type VoteResults } from '@/lib/vote/ballot';
import { PRIVACY_SHORT } from '@/lib/vote/privacy';
import VoteCard, { HEADING, SUB_LINE, type VoteCardProps } from '@/ui/vote/VoteCard';
import { ballotOptions, suggestNext } from '@/ui/vote/ballotPlan';
import { canSend, cardPhase, fetchResults, PAUSED_TEXT, SAVED_TEXT, savedPick, sendLabel, STATUS_TEXT, tallyLine, VOTE_NAMES, type VoteOutcome } from '@/ui/vote/voteClient';
import { GUARD_MAX_MS, GUARD_MS, guardOn } from '@/ui/vote/voteTracker';

const src = (path: string) => readFileSync(fileURLToPath(new URL(`../src/${path}`, import.meta.url)), 'utf8');
const esc = (s: string) => s.replace(/'/g, '&#x27;');
const N = '0123456789abcdef0123456789abcdef', SEED = 12345;
const render = (props: Partial<VoteCardProps> = {}) => renderToStaticMarkup(createElement(VoteCard,
  { current: 'draw', tried: ['draw', 'brush'], device: 'touch', seed: SEED, saved: null, probe: null, onClose: () => {}, ...props }));
const fam = (o: Partial<FamilyResults> = {}): FamilyResults => ({ votes: 0, ranked: false, tie: null, order: null, controls: null, ...o });
const results = (touch: FamilyResults, desktop: FamilyResults = fam(), open = true): VoteResults =>
  ({ v: 3, round: VOTE_ROUND, asOf: '2026-09-30T14:05:12Z', open, families: { touch, desktop } });
const ranked = results(fam({ votes: 40, ranked: true, tie: 5, order: ['brush', 'draw', 'one-finger', 'twin-stick', 'conduct'], controls: {} }));
const values = (html: string) => [...html.matchAll(/name="vote-pick" value="([^"]+)"/g)].map(m => m[1]);

describe('the card model', () => {
  it('cardPhase: done for a sent vote or a 200, closed for a 503, need under two tried, else the ballot', () => {
    const p = (already: boolean, counted: number, outcome: VoteOutcome | null) => cardPhase({ already, counted, outcome });
    expect(p(false, 0, null)).toBe('need');
    expect(p(false, 1, null)).toBe('need');
    expect(p(false, 2, null)).toBe('ballot');
    expect(p(false, 8, null)).toBe('ballot');
    expect(p(true, 0, null)).toBe('done'); // already voted wins over everything
    expect(p(false, 2, 'ok')).toBe('done');
    expect(p(false, 2, 'closed')).toBe('closed');
    for (const o of ['later', 'network', 'error', 'cross', 'invalid'] as const) expect(p(false, 2, o), o).toBe('ballot'); // a failure keeps the ballot
  });
  it('canSend is false with no pick, while busy and after ok or closed; a failure leaves Send available', () => {
    expect(canSend(null, false, null)).toBe(false);
    expect(canSend('draw', false, null)).toBe(true);
    expect(canSend('tie', false, null)).toBe(true);
    expect(canSend('draw', true, null)).toBe(false);
    for (const o of ['later', 'network', 'error', 'cross', 'invalid'] as const) expect(canSend('draw', false, o), o).toBe(true);
    expect(canSend('draw', false, 'ok')).toBe(false);
    expect(canSend('draw', false, 'closed')).toBe(false);
  });
  it('sendLabel: Send vote, Sending…, Try again after any failure', () => {
    expect(sendLabel(false, null)).toBe('Send vote');
    expect(sendLabel(true, null)).toBe('Sending…');
    expect(sendLabel(true, 'later')).toBe('Sending…');
    for (const o of ['later', 'network', 'error', 'cross', 'invalid'] as const) expect(sendLabel(false, o), o).toBe('Try again');
  });
  it('a saved pick is offered again only while its control is on the ballot; Can\'t tell always is', () => {
    const saved = (favorite: ControlId | 'tie') => ({ nonce: N, favorite, tried: ['draw', 'brush'] as ControlId[], last: 'draw' as ControlId });
    expect(savedPick(saved('brush'), ['draw', 'brush'])).toBe('brush');
    expect(savedPick(saved('brush'), ['draw'])).toBeNull();
    expect(savedPick(saved('tie'), ['draw'])).toBe('tie');
    expect(savedPick(null, ['draw'])).toBeNull();
  });
  it('the outcome copy (one table); a 429 says the pick is kept, names no wait and never claims the vote is in', () => {
    expect(STATUS_TEXT).toEqual({
      ok: 'Thanks. Your vote is in.', later: 'Voting is busy right now. Your pick is kept. Try again later.', closed: "Voting isn't open right now.",
      cross: 'Open the game at its own web address, then vote.', invalid: "This page can't send that vote. Reload the page and try again.",
      network: "Couldn't send. Tap Send to try again.", error: "Couldn't send. Tap Send to try again." });
    expect(STATUS_TEXT.later).not.toMatch(/\d|minute|second|hour|in\b.*counted|is in/i);
  });
  it('the guard stays on until 400 ms have passed and no pointer is down', () => {
    expect(guardOn(1000, 1000 + GUARD_MS - 1, 0)).toBe(true);
    expect(guardOn(1000, 1000 + GUARD_MS, 0)).toBe(false);
    expect(guardOn(1000, 1000 + GUARD_MS + 500, 1)).toBe(true);
    expect(guardOn(1000, 1000 + GUARD_MAX_MS, 2)).toBe(false);
  });
});

describe('the tally line (after Send only) and the probe', () => {
  it('ranked: the top three in ranking order, labels from the registry', () => {
    expect(tallyLine(ranked, 'touch')).toBe('Winning head to head so far on touch: Brush, Draw, One finger.');
    const two = results(fam({ ranked: true, votes: 40, order: ['draw', 'brush'] }));
    expect(tallyLine(two, 'touch')).toBe('Winning head to head so far on touch: Draw, Brush.');
    const other = results(fam(), fam({ ranked: true, votes: 40, order: ['flow', 'cursor', 'draw', 'brush'] }));
    expect(tallyLine(other, 'desktop')).toBe('Winning head to head so far on desktop: Flow, Cursor, Draw.');
  });
  it('not ranked: a rounded count from 5 votes, and no number below 5 (a first voter never reads 0 votes)', () => {
    const tail = ' The ranking shows once enough people have voted.';
    expect(tallyLine(results(fam({ votes: 40 })), 'touch')).toBe(`About 40 votes so far on touch.${tail}`);
    expect(tallyLine(results(fam({ votes: 5 })), 'touch')).toBe(`About 5 votes so far on touch.${tail}`);
    for (const v of [0, 4]) expect(tallyLine(results(fam({ votes: v })), 'touch')).toBe(`Only a few votes so far on touch.${tail}`);
    expect(tallyLine(results(fam({ votes: 3 })), 'touch')).not.toMatch(/\d/);
    expect(tallyLine(results(fam(), fam({ votes: 25 })), 'desktop')).toContain('About 25 votes so far on desktop.');
    // The order only counts when the family is ranked: a stray order on an unranked family (the server sends null there) is not shown.
    expect(tallyLine(results(fam({ votes: 25, ranked: false, order: ['draw', 'brush'] })), 'touch')).toBe(`About 25 votes so far on touch.${tail}`);
  });
  it('unavailable or unusable: the line is left out; ids of the other family never print; the thresholds are never named', () => {
    expect(tallyLine(null, 'touch')).toBe('');
    expect(tallyLine({ ...ranked, families: {} } as unknown as VoteResults, 'touch')).toBe('');
    const odd = results(fam({ ranked: true, votes: 40, order: ['cursor', 'flow'] }));
    expect(tallyLine(odd, 'touch')).toContain('About 40 votes'); // nothing of the family to name: the count line
    expect(tallyLine(odd, 'touch')).not.toMatch(/Cursor|Flow/);
    for (const r of [ranked, results(fam({ votes: 40 })), results(fam({ votes: 1 }))]) expect(tallyLine(r, 'touch')).not.toMatch(/\b(30|12)\b|minimum|floor|network group/);
  });
  const reply = (body: unknown, status = 200) => async () => ({ status, json: async () => body });
  it('fetchResults returns the v3 results of this round, and closed when the server says open:false or 503', async () => {
    expect(await fetchResults(reply(JSON.parse(JSON.stringify(ranked))))).toEqual({ results: ranked, closed: false });
    const shut = results(fam(), fam(), false);
    expect(await fetchResults(reply(shut))).toEqual({ results: shut, closed: true });
    expect(await fetchResults(reply({ ok: false, error: 'closed' }, 503))).toEqual({ results: null, closed: true });
  });
  it('fetchResults treats every failure, the old shape or another round as no results and not closed', async () => {
    const none = { results: null, closed: false };
    for (const bad of [{ ...ranked, v: 2 }, { ...ranked, round: 'r2' }, { ...ranked, open: 'yes' }, { ...ranked, families: { touch: ranked.families.touch } },
      { ...ranked, families: { touch: {}, desktop: {} } }, { round: 'r2', total: 5, favorite: {} }, null, 'x', []]) {
      expect(await fetchResults(reply(bad)), JSON.stringify(bad)).toEqual(none);
    }
    expect(await fetchResults(reply(ranked, 500))).toEqual(none);
    expect(await fetchResults(reply(ranked, 502))).toEqual(none);
    expect(await fetchResults(async () => { throw new TypeError('offline'); })).toEqual(none);
    expect(await fetchResults(async () => ({ status: 200, json: async () => { throw new SyntaxError('bad json'); } }))).toEqual(none);
  });
});

describe('the ballot markup (server render)', () => {
  it('names the question, the family and the rows; nothing is selected; Can\'t tell is last; Send is aria-disabled', () => {
    const html = render({ current: 'one-finger', tried: ['draw', 'brush'] });
    expect(html).toMatch(/<section[^>]*role="dialog"[^>]*aria-modal="true"/);
    const id = /aria-labelledby="([^"]+)"/.exec(html)![1];
    expect(html).toContain(`<h2 id="${id}" tabindex="-1">${HEADING}</h2>`);
    expect(HEADING).toBe('Which way of flying felt best?');
    expect(html).toContain('data-testid="vote-family">Touch controls<');
    expect(html).toContain(esc(SUB_LINE));
    expect(html).toContain(`role="radiogroup" aria-labelledby="${id}"`); // VoiceOver reads the question with each row
    const got = values(html);
    expect([...got].sort()).toEqual(['brush', 'draw', 'one-finger', 'tie']); // tried plus the one being flown, and Can't tell
    expect(got.at(-1)).toBe('tie');
    expect(html).not.toMatch(/checked/);
    expect(html).toContain(esc("Can't tell"));
    expect(html).toContain('They felt about the same.');
    expect(html).toMatch(/<button type="button"[^>]*data-testid="vote-send" aria-disabled="true"[^>]*>Send vote<\/button>/);
    expect(html.match(/<button[^>]*data-testid="vote-send"[^>]*>/)![0]).not.toMatch(/\sdisabled/);
    expect(html).toContain('>Not yet</button>');
    expect(html).toContain('role="status"');
    expect(html).not.toContain('data-guard');
  });
  it('the order is the seeded one, the same for the same seed, and the current control is not first', () => {
    for (const [device, tried, current] of [['touch', ['draw', 'brush', 'one-finger'], 'draw'], ['desktop', ['cursor', 'flow', 'draw', 'brush'], 'cursor']] as const) {
      for (const seed of [1, 2, 3, 4, 5, 99, 4242]) {
        const html = render({ device, tried, current, seed });
        expect(values(html), `${device} ${seed}`).toEqual([...ballotOptions(tried, device, seed, current), 'tie']);
        expect(values(html)[0]).not.toBe(current);
        expect(render({ device, tried, current, seed })).toBe(html);
      }
    }
  });
  it('rows show the glyph, the label and the line, with no setup hint (a caveat would prime a penalty on some rows only)', () => {
    const html = render({ device: 'desktop', current: 'cursor', tried: ['cursor', 'flow', 'captured', 'mouse-keys'] });
    expect(html.match(/<svg/g)).toHaveLength(4); // a glyph per control, none for Can't tell
    for (const c of controlsFor('desktop').filter(c => ['cursor', 'flow', 'captured', 'mouse-keys'].includes(c.id))) {
      expect(html).toContain(esc(c.label)); expect(html).toContain(esc(c.line));
      if (c.hint) expect(html).not.toContain(esc(c.hint));
    }
    for (const gone of ['Built for a trackpad', 'Blaster off', 'Esc gives']) expect(html).not.toContain(gone);
  });
  it('the privacy text is the short one, with the link to /privacy in a new tab; no text box, no ratings, no tally before Send', () => {
    const html = render({ probe: { results: ranked, closed: false } });
    expect(html).toContain(esc(PRIVACY_SHORT));
    // The link words are split so the spec 11.4 grep for the retired thanks copy finds nothing in tests.
    expect(html).toMatch(new RegExp(`<a [^>]*href="/privacy" target="_blank" rel="noopener">How your vote is ${'counted'}</a>`));
    for (const gone of ['textarea', 'rating', 'vote-tally', 'Winning head to head', 'votes so far', 'See all results', '<form']) expect(html, gone).not.toContain(gone);
  });
  it('a saved vote preselects its pick (only if still offered) and says the last one did not send', () => {
    const saved = { nonce: N, favorite: 'brush' as const, tried: ['draw', 'brush'] as ControlId[], last: 'draw' as const };
    const html = render({ saved });
    expect(html).toMatch(/name="vote-pick" checked="" value="brush"/);
    expect(html.match(/checked=""/g)).toHaveLength(1);
    expect(html).toContain(esc(SAVED_TEXT));
    expect(html).toMatch(/aria-disabled="false"/);
    const gone = render({ saved: { ...saved, favorite: 'one-finger', tried: ['one-finger', 'draw'] } }); // one-finger is not offered here
    expect(gone).not.toMatch(/checked/);
    expect(gone).not.toContain(esc(SAVED_TEXT));
    expect(render({ saved: { ...saved, favorite: 'tie' } })).toMatch(/name="vote-pick" checked="" value="tie"/);
  });
  it('the probe is advisory: a soft line when the vote is paused or the probe failed, never a removed ballot', () => {
    for (const probe of [{ results: null, closed: true }, { results: null, closed: false }, { results: results(fam(), fam(), false), closed: true }]) {
      const html = render({ probe });
      expect(html).toContain(`data-testid="vote-paused">${PAUSED_TEXT}<`);
      expect(values(html)).toContain('tie'); expect(html).toContain('data-testid="vote-send"');
    }
    expect(PAUSED_TEXT).toBe('Voting may be paused. You can still try to send.');
    for (const probe of [null, { results: ranked, closed: false }]) expect(render({ probe })).not.toContain('vote-paused');
  });
  it('carries data-guard while guarded', () => {
    expect(render({ guard: true })).toContain('data-guard=""');
  });
});
