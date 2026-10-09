import { describe, expect, it } from 'vitest';
import { controlsFor, type ControlId } from '@/game/controlTypes';
import { MIN_PUBLIC_TAGS, NONCE_RE, VOTE_DEVICES, VOTE_KEY_TAG, VOTE_MAX_BYTES, VOTE_MIN_TRIED, VOTE_ROUND, VOTE_SCHEMA, byteLength, mediaType, parseVote } from '@/lib/vote/ballot';
import { PRIVACY_FULL, PRIVACY_SHORT } from '@/lib/vote/privacy';
import corpus from './fixtures/vote-payloads.json';

const NONCE = '3f9a0c1e5b7d42a88c6e1f0d9b3a7c25';
const desktop = { v: 3, device: 'desktop', favorite: 'flow', tried: ['cursor', 'flow', 'brush'], last: 'brush', nonce: NONCE };
const touch = { v: 3, device: 'touch', favorite: 'brush', tried: ['one-finger', 'draw', 'brush'], last: 'draw', nonce: NONCE };
const parse = (v: unknown) => parseVote(JSON.stringify(v));
const status = (v: unknown) => { const r = parse(v); return r.ok ? 200 : r.status; };
const without = (o: Record<string, unknown>, key: string) => { const { [key]: _drop, ...rest } = o; return rest; };
const ids = (d: 'touch' | 'desktop') => controlsFor(d).map(c => c.id);

describe('vote ballot constants', () => {
  it('pins the round, schema, key tag and limits', () => {
    expect([VOTE_ROUND, VOTE_SCHEMA, VOTE_KEY_TAG]).toEqual(['r3', 3, 'r3:s3']);
    expect([VOTE_MAX_BYTES, VOTE_MIN_TRIED, MIN_PUBLIC_TAGS]).toEqual([512, 2, 12]);
    expect(VOTE_DEVICES).toEqual(['touch', 'desktop']);
  });
  it('accepts a nonce of exactly 32 lowercase hex characters', () => {
    expect(NONCE_RE.test(NONCE)).toBe(true);
    for (const bad of [NONCE.slice(1), NONCE + '0', NONCE.toUpperCase(), '3f9a0c1e-5b7d-42a8-8c6e-1f0d9b3a7c25', '-'.repeat(16), '']) expect(NONCE_RE.test(bad), bad).toBe(false);
  });
  it('measures bytes and media types', () => {
    expect([byteLength('abc'), byteLength('é'), byteLength('€'), byteLength('😀'), byteLength('\ud800')]).toEqual([3, 2, 3, 4, 3]);
    expect(mediaType('Application/JSON; charset=utf-8')).toBe('application/json');
    expect([mediaType(null), mediaType(undefined), mediaType('')]).toEqual(['', '', '']);
  });
  it('keeps the privacy texts honest and short', () => {
    expect(PRIVACY_SHORT.split('. ')).toHaveLength(2);
    expect(PRIVACY_SHORT).toContain('about 4,000 networks');
    expect(PRIVACY_FULL).toContain('shared by about 4,000 different blocks');
    for (const t of [PRIVACY_SHORT, PRIVACY_FULL]) expect(t).toContain('No sign-in, no cookies, no text box.');
    expect(PRIVACY_FULL).not.toMatch(/IPs, bodies|never logged/i);
  });
});

describe('parseVote', () => {
  it('parses a valid payload for each family into exactly six keys', () => {
    for (const p of [desktop, touch]) {
      const r = parse(p);
      expect(r).toEqual({ ok: true, vote: p });
      expect(r.ok && Object.keys(r.vote).sort()).toEqual(['device', 'favorite', 'last', 'nonce', 'tried', 'v']);
    }
  });

  it('accepts every control of a family as favorite, or tie, and the whole family as tried', () => {
    for (const device of VOTE_DEVICES) {
      const all = ids(device);
      for (const favorite of all) {
        const other = all.find(i => i !== favorite)!;
        expect(status({ v: 3, device, favorite, tried: [favorite, other], last: other, nonce: NONCE }), `${device}:${favorite}`).toBe(200);
      }
      const full = { v: 3, device, favorite: 'tie', tried: all, last: all[0], nonce: NONCE };
      expect(status(full)).toBe(200);
      expect(status({ ...full, tried: [...all, all[0]] })).toBe(400); // one more than the family holds
    }
  });

  it('needs exactly the six keys: any missing or extra key is 400', () => {
    for (const k of Object.keys(desktop)) expect(status(without(desktop, k)), `missing ${k}`).toBe(400);
    for (const k of ['ratings', 'note', 'build', 'why', 'constructor']) expect(status({ ...desktop, [k]: 'x' }), `extra ${k}`).toBe(400);
    expect(parseVote('{"__proto__":{"a":1},' + JSON.stringify(desktop).slice(1))).toEqual({ ok: false, status: 400 });
    expect(status({ ...without(desktop, 'last'), stale: 'brush' })).toBe(400); // six keys, one of them unknown
  });

  it('needs v 3 and a known device', () => {
    for (const v of [2, 4, '3', [3], null, 3.5]) expect(status({ ...desktop, v }), String(v)).toBe(400);
    for (const device of ['Touch', 'mobile', '', ['touch'], null, '__proto__']) expect(status({ ...desktop, device }), String(device)).toBe(400);
  });

  it('needs a nonce of 32 hex characters and rejects 16 dashes', () => {
    expect(status({ ...desktop, nonce: '-'.repeat(16) })).toBe(400);
    expect(status({ ...desktop, nonce: '3f9a0c1e-5b7d-42a8-8c6e-1f0d9b3a7c25' })).toBe(400);
    for (const nonce of [NONCE.slice(1), NONCE + '0', NONCE.toUpperCase(), 5, null, [NONCE]]) expect(status({ ...desktop, nonce })).toBe(400);
  });

  it('needs 2 to N unique tried ids of the ballot family', () => {
    expect(status({ ...desktop, tried: ['flow'], last: 'flow' })).toBe(400);
    expect(status({ ...desktop, tried: [] })).toBe(400);
    expect(status({ ...desktop, tried: ['cursor', 'flow', 'flow'] })).toBe(400);
    expect(status({ ...desktop, tried: ['cursor', 'twin-stick'], favorite: 'cursor', last: 'cursor' })).toBe(400); // wrong family
    expect(status({ ...touch, tried: ['one-finger', 'flow'], favorite: 'one-finger', last: 'one-finger' })).toBe(400);
    expect(status({ ...touch, tried: [...ids('touch'), 'draw'] })).toBe(400);
    expect(status({ ...desktop, tried: { cursor: 1, flow: 1 } })).toBe(400);
  });

  it('needs the favorite in tried, or the literal tie, and last in tried', () => {
    expect(status({ ...desktop, favorite: 'draw' })).toBe(400);
    expect(status({ ...desktop, favorite: 'tie' })).toBe(200);
    for (const favorite of ['Tie', 'tie ', 'TIE', null, ['flow'], 0]) expect(status({ ...desktop, favorite })).toBe(400);
    expect(status({ ...desktop, last: 'draw' })).toBe(400);
    expect(status({ ...desktop, last: 'tie' })).toBe(400);
    expect(status({ ...desktop, last: 'flow' })).toBe(200);
  });

  it('rejects prototype keys, arrays for objects, huge numbers and a byte order mark', () => {
    for (const id of ['__proto__', 'constructor', 'toString']) {
      expect(status({ ...desktop, favorite: id }), id).toBe(400);
      expect(status({ ...desktop, tried: ['cursor', id] }), id).toBe(400);
    }
    for (const text of ['[]', 'null', '"x"', '3', '{}', '[' + JSON.stringify(desktop) + ']']) expect(parseVote(text), text).toEqual({ ok: false, status: 400 });
    expect(parseVote(JSON.stringify(desktop).replace('"v":3', '"v":1e999'))).toEqual({ ok: false, status: 400 });
    expect(parseVote(JSON.stringify(desktop).replace('["cursor","flow","brush"]', '[9007199254740993,1e999]'))).toEqual({ ok: false, status: 400 });
    expect(parseVote('﻿' + JSON.stringify(desktop))).toEqual({ ok: false, status: 400 });
    expect(parseVote(JSON.stringify(desktop).replace('"flow"', '"\\ud800"'))).toEqual({ ok: false, status: 400 });
  });

  it('gives 413 over 512 bytes, 200 at exactly 512, and never 413 for a smaller bad body', () => {
    const body = JSON.stringify(desktop);
    expect(parseVote(body + ' '.repeat(512 - byteLength(body)))).toEqual({ ok: true, vote: desktop });
    expect(parseVote(body + ' '.repeat(513 - byteLength(body)))).toEqual({ ok: false, status: 413 });
    expect(parseVote('x'.repeat(513))).toEqual({ ok: false, status: 413 }); // size first, even for a body that is not JSON
    expect(parseVote('x'.repeat(512))).toEqual({ ok: false, status: 400 });
    expect(parseVote(JSON.stringify({ ...desktop, note: 'x'.repeat(600) }))).toEqual({ ok: false, status: 413 });
  });

  it('does not treat a non-string body as a vote', () => {
    for (const bad of [undefined, null, 5, {}, ['x']]) expect(parseVote(bad as unknown as string)).toEqual({ ok: false, status: 400 });
  });

  it('P1 payload corpus: every hostile body gives its status, and no key ever collides or pollutes', () => {
    const table = corpus as { label: string; status: number; body: string }[];
    expect(table.length).toBeGreaterThan(100);
    const before = Object.getOwnPropertyNames(Object.prototype).sort();
    for (const { label, status: want, body } of table) {
      const r = parseVote(body);
      expect(r.ok ? 200 : r.status, label).toBe(want);
      if (r.ok) {
        expect(Object.keys(r.vote).sort(), label).toEqual(['device', 'favorite', 'last', 'nonce', 'tried', 'v']);
        expect(Object.getPrototypeOf(r.vote), label).toBe(Object.prototype);
      }
    }
    expect(Object.getOwnPropertyNames(Object.prototype).sort()).toEqual(before);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    const counts = { 200: 0, 400: 0, 413: 0 } as Record<number, number>;
    for (const r of table) counts[r.status]++;
    expect(counts[200]).toBeGreaterThan(10);
    expect(counts[400]).toBeGreaterThan(80);
    expect(counts[413]).toBeGreaterThanOrEqual(3);
  });

  it('keeps the parsed vote independent of the input arrays', () => {
    const r = parse(desktop);
    expect(r.ok && r.vote.tried).not.toBe(desktop.tried);
    expect(r.ok && (r.vote.tried satisfies ControlId[])).toEqual(desktop.tried);
  });
});
