import { describe, expect, it } from 'vitest';
import { controlsFor, type ControlId } from '@/game/controlTypes';
import { BUILD_RE, NOTE_MAX, NONCE_RE, VOTE_KEY_TAG, VOTE_MAX_BYTES, VOTE_ROUND, VOTE_SCHEMA, byteLength, cleanNote, mediaType, parseVote, voteKeyTag,
  type VoteControl } from '@/lib/vote/shape';

// Type-level: the vote's controls are exactly the registry's ids. pnpm typecheck fails if either union drifts.
type Eq<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
const sameAsRegistry: Eq<VoteControl, ControlId> = true;

const NONCE = '0f8fad5b-d9cb-469f-a165-70867728950e';
const build = '2026-09-25 · b649104';
const desktop = { v: 2, favorite: 'draw', ratings: { draw: 5, cursor: 3 }, tried: ['cursor', 'draw'], device: 'desktop', build, nonce: NONCE };
const touch = { v: 2, favorite: 'twin-stick', ratings: { 'twin-stick': 4 }, tried: ['one-finger', 'twin-stick'], device: 'touch', build, nonce: NONCE };
const parse = (v: unknown) => parseVote(JSON.stringify(v));
const status = (v: unknown) => { const r = parse(v); return r.ok ? 200 : r.status; };
const without = (o: Record<string, unknown>, key: string) => { const { [key]: _drop, ...rest } = o; return rest; };

describe('vote shape', () => {
  it('keeps the vote controls aligned with the registry, and tags every key with round and schema', () => {
    expect(sameAsRegistry).toBe(true);
    expect(VOTE_ROUND).toBe('r2');
    expect(VOTE_SCHEMA).toBe(2);
    expect(VOTE_KEY_TAG).toBe('r2:s2');
    expect(voteKeyTag('r9', 3)).toBe('r9:s3');
  });

  it('parses a valid payload for each family and cleans the note', () => {
    expect(parse({ ...desktop, note: '  great\n\n\n\nfun  ' })).toEqual({ ok: true, vote: { ...desktop, note: 'great\n\nfun' } });
    expect(parse(touch)).toEqual({ ok: true, vote: touch });
  });

  it('accepts every control of a family as favorite, and the whole family as tried', () => {
    for (const device of ['touch', 'desktop'] as const) {
      const ids = controlsFor(device).map(c => c.id);
      for (const favorite of ids) expect(status({ v: 2, favorite, ratings: {}, tried: [favorite], device, build, nonce: NONCE }), `${device}:${favorite}`).toBe(200);
      const all = { v: 2, favorite: ids[0], ratings: Object.fromEntries(ids.map(id => [id, 5])), tried: ids, device, build, nonce: NONCE };
      expect(status(all)).toBe(200);
      expect(status({ ...all, tried: [...ids, ids[0]] })).toBe(400); // one more than the family holds
    }
    expect(controlsFor('touch')).toHaveLength(5);
    expect(controlsFor('desktop')).toHaveLength(8);
  });

  it('accepts missing or empty ratings, and drops an empty note', () => {
    expect(status({ ...desktop, ratings: {} })).toBe(200);
    expect(status(without(desktop, 'ratings'))).toBe(200);
    const r = parse({ ...desktop, note: ' \n\u0007 ' });
    expect(r.ok).toBe(true);
    expect(r.ok && 'note' in r.vote).toBe(false);
  });

  it.each([
    ['v missing', without(desktop, 'v')],
    ['v 1', { ...desktop, v: 1 }],
    ['v 3', { ...desktop, v: 3 }],
    ['v as a string', { ...desktop, v: '2' }],
    ['nonce missing', without(desktop, 'nonce')],
    ['nonce not a string', { ...desktop, nonce: 42 }],
    ['nonce empty', { ...desktop, nonce: '' }],
    ['nonce short', { ...desktop, nonce: 'short' }],
    ['nonce uppercase', { ...desktop, nonce: 'X'.repeat(20) }],
    ['nonce over 64', { ...desktop, nonce: 'a'.repeat(65) }],
    ['nonce with a space', { ...desktop, nonce: '0f8fad5b d9cb-469f-a165' }],
    ['a v1 body', { favorite: 'draw', ratings: { draw: 5 }, tried: ['standard', 'draw'], device: 'touch', build }],
    ['twin-stick on desktop', { ...desktop, favorite: 'twin-stick', ratings: {}, tried: ['twin-stick'] }],
    ['cursor on touch', { ...touch, favorite: 'cursor', ratings: {}, tried: ['cursor'] }],
    ['one-finger on desktop', { ...desktop, tried: ['one-finger', 'draw'] }],
    ['a cross-family tried id', { ...touch, tried: ['one-finger', 'twin-stick', 'flow'] }],
    ['a cross-family rating', { ...touch, ratings: { 'twin-stick': 4, flow: 3 } }],
    ['legacy standard as favorite', { ...desktop, favorite: 'standard', tried: ['standard'] }],
    ['legacy standard in tried', { ...desktop, tried: ['standard', 'draw'] }],
    ['extra key', { ...desktop, ip: '1.2.3.4' }],
    ['non-object', 'draw'],
    ['number', 5],
    ['null', null],
    ['array', [desktop]],
    ['favorite not in tried', { ...desktop, favorite: 'brush' }],
    ['favorite unknown', { ...desktop, favorite: 'fly', tried: ['fly'] }],
    ['rating 0', { ...desktop, ratings: { draw: 0 } }],
    ['rating 6', { ...desktop, ratings: { draw: 6 } }],
    ['rating 2.5', { ...desktop, ratings: { draw: 2.5 } }],
    ['rating string', { ...desktop, ratings: { draw: '5' } }],
    ['rating for an untried id', { ...desktop, ratings: { brush: 4 } }],
    ['ratings array', { ...desktop, ratings: [5] }],
    ['duplicate tried', { ...desktop, tried: ['draw', 'draw'] }],
    ['tried over the family size', { ...touch, tried: ['one-finger', 'twin-stick', 'draw', 'conduct', 'brush', 'draw'] }],
    ['empty tried', { ...desktop, tried: [] }],
    ['tried not an array', { ...desktop, tried: 'draw' }],
    ['bad device', { ...desktop, device: 'tablet' }],
    ['non-string note', { ...desktop, note: 42 }],
    ['note over 400', { ...desktop, note: 'x'.repeat(401) }],
    ['build not a string', { ...desktop, build: 7 }],
    ['build over 40', { ...desktop, build: 'b'.repeat(41) }],
    ['missing build', without(desktop, 'build')],
  ])('rejects %s with 400', (_name, v) => {
    expect(status(v)).toBe(400);
  });

  it('the nonce is 16-64 hex or dash characters', () => {
    expect(NONCE_RE.test(NONCE)).toBe(true);
    expect(status({ ...desktop, nonce: 'a'.repeat(16) })).toBe(200);
    expect(status({ ...desktop, nonce: 'a'.repeat(64) })).toBe(200);
  });

  it('rejects bad JSON with 400', () => {
    expect(parseVote('{"favorite":')).toEqual({ ok: false, status: 400 });
  });

  it('accepts any short build hint, including the local and short-sha stamps', () => {
    expect(status({ ...desktop, build: 'local development build' })).toBe(200);
    expect(status({ ...desktop, build: '2026-09-25 · 1a2b3c4d' })).toBe(200);
    expect(status({ ...desktop, build: 'anything else' })).toBe(200);
    expect(BUILD_RE.test('local development build')).toBe(true);
    expect(BUILD_RE.test('2026-09-25 · 1a2b3c4d')).toBe(true);
    expect(BUILD_RE.test('2026-09-25 · uncommitted')).toBe(true);
    expect(BUILD_RE.test('unknown')).toBe(false);
  });

  it('gives 413 for a body over 2048 bytes', () => {
    const big = JSON.stringify({ ...desktop, note: 'é'.repeat(1100) });
    expect(byteLength(big)).toBeGreaterThan(VOTE_MAX_BYTES);
    expect(parseVote(big)).toEqual({ ok: false, status: 413 });
    expect(byteLength('😀')).toBe(4);
    expect(byteLength('é')).toBe(2);
  });

  it('cleanNote caps at 280 code points without splitting an emoji', () => {
    const out = cleanNote('😀'.repeat(300));
    expect(Array.from(out)).toHaveLength(NOTE_MAX);
    expect(out).toBe('😀'.repeat(NOTE_MAX));
    expect(cleanNote('a\r\nb\u0000c\td')).toBe('a\nbcd');
  });

  it('mediaType keeps only the lowercase type', () => {
    expect(mediaType('application/json; charset=utf-8')).toBe('application/json');
    expect(mediaType(' Application/JSON ')).toBe('application/json');
    expect(mediaType(null)).toBe('');
    expect(mediaType('text/plain')).toBe('text/plain');
  });
});
