import { describe, expect, it } from 'vitest';
import type { ControlLab } from '@/game/store';
import type { LabId } from '@/ui/gesture/labStats';
import { BUILD_RE, NOTE_MAX, VOTE_LABS, VOTE_MAX_BYTES, byteLength, cleanNote, mediaType, parseVote, type VoteLab } from '@/lib/vote/shape';

// Type-level: the vote's labs are exactly the game's labs. pnpm typecheck fails if either union drifts.
type Eq<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
const sameAsControlLab: Eq<VoteLab, ControlLab> = true;
const sameAsLabId: Eq<VoteLab, LabId> = true;

const good = { favorite: 'draw', ratings: { draw: 5, standard: 3 }, tried: ['standard', 'draw'], device: 'touch', build: '2026-09-25 · b649104' };
const parse = (v: unknown) => parseVote(JSON.stringify(v));
const status = (v: unknown) => { const r = parse(v); return r.ok ? 200 : r.status; };

describe('vote shape', () => {
  it('keeps the lab union aligned with the game', () => {
    expect(sameAsControlLab && sameAsLabId).toBe(true);
    expect([...VOTE_LABS]).toEqual(['standard', 'draw', 'conduct', 'brush']);
  });

  it('parses a valid payload and cleans the note', () => {
    const r = parse({ ...good, note: '  great\n\n\n\nfun  ' });
    expect(r).toEqual({ ok: true, vote: { ...good, note: 'great\n\nfun' } });
  });

  it('accepts missing or empty ratings, and drops an empty note', () => {
    expect(status({ ...good, ratings: {} })).toBe(200);
    const { ratings: _r, ...noRatings } = good;
    expect(status(noRatings)).toBe(200);
    const r = parse({ ...good, note: ' \n\u0007 ' });
    expect(r.ok).toBe(true);
    expect(r.ok && 'note' in r.vote).toBe(false);
  });

  it.each([
    ['extra key', { ...good, ip: '1.2.3.4' }],
    ['non-object', 'draw'],
    ['number', 5],
    ['null', null],
    ['array', [good]],
    ['favorite not in tried', { ...good, favorite: 'brush' }],
    ['favorite unknown', { ...good, favorite: 'fly', tried: ['fly'] }],
    ['rating 0', { ...good, ratings: { draw: 0 } }],
    ['rating 6', { ...good, ratings: { draw: 6 } }],
    ['rating 2.5', { ...good, ratings: { draw: 2.5 } }],
    ['rating string', { ...good, ratings: { draw: '5' } }],
    ['rating key not in tried', { ...good, ratings: { brush: 4 } }],
    ['ratings array', { ...good, ratings: [5] }],
    ['duplicate tried', { ...good, tried: ['draw', 'draw'] }],
    ['5 tried', { ...good, tried: ['standard', 'draw', 'conduct', 'brush', 'draw'] }],
    ['empty tried', { ...good, tried: [] }],
    ['bad device', { ...good, device: 'tablet' }],
    ['non-string note', { ...good, note: 42 }],
    ['note over 400', { ...good, note: 'x'.repeat(401) }],
    ['build not a string', { ...good, build: 7 }],
    ['build over 40', { ...good, build: 'b'.repeat(41) }],
    ['missing build', { favorite: 'draw', ratings: {}, tried: ['draw'], device: 'touch' }],
  ])('rejects %s with 400', (_name, v) => {
    expect(status(v)).toBe(400);
  });

  it('rejects bad JSON with 400', () => {
    expect(parseVote('{"favorite":')).toEqual({ ok: false, status: 400 });
  });

  it('accepts any short build hint, including the local and short-sha stamps', () => {
    expect(status({ ...good, build: 'local development build' })).toBe(200);
    expect(status({ ...good, build: '2026-09-25 · 1a2b3c4d' })).toBe(200);
    expect(status({ ...good, build: 'anything else' })).toBe(200);
    expect(BUILD_RE.test('local development build')).toBe(true);
    expect(BUILD_RE.test('2026-09-25 · 1a2b3c4d')).toBe(true);
    expect(BUILD_RE.test('2026-09-25 · uncommitted')).toBe(true);
    expect(BUILD_RE.test('unknown')).toBe(false);
  });

  it('gives 413 for a body over 2048 bytes', () => {
    const big = JSON.stringify({ ...good, note: 'é'.repeat(1100) });
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
