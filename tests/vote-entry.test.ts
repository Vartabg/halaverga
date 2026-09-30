import { describe, expect, it } from 'vitest';
import { controlsFor, type ControlId } from '@/game/controlTypes';
import { VOTE_DEVICES, VOTE_ROUND } from '@/lib/vote/ballot';
import { decodeEntry, encodeEntry } from '@/lib/vote/entry';

const ids = (d: 'touch' | 'desktop') => controlsFor(d).map(c => c.id);
const HOUR = '2026093014';
const bits = (n: number, len: number) => Array.from({ length: len }, (_, i) => i).filter(i => n & (1 << i));

describe('registry order snapshot (frozen per round)', () => {
  it('pins the vote registry order to round r3: change the order or the members, bump VOTE_ROUND', () => {
    expect(VOTE_ROUND).toBe('r3');
    expect(ids('touch')).toEqual(['one-finger', 'twin-stick', 'draw', 'conduct', 'brush']);
    expect(ids('desktop')).toEqual(['cursor', 'one-finger-keys', 'flow', 'captured', 'mouse-keys', 'draw', 'conduct', 'brush']);
  });
});

describe('vote entry: the three worked examples of section 4', () => {
  it('encodes desktop flow over cursor, flow, brush (last brush, tag a3f)', () => {
    const e = encodeEntry({ device: 'desktop', favorite: 'flow', tried: ['cursor', 'flow', 'brush'], last: 'brush' }, HOUR, 'a3f');
    expect(e).toBe('2026093014d2857a3f');
    expect(decodeEntry(e)).toEqual({ hour: HOUR, device: 'desktop', favorite: 'flow', tried: ['cursor', 'flow', 'brush'], last: 'brush', tag: 'a3f' });
  });
  it('encodes touch brush over one-finger, draw, brush (last draw, tag 01c)', () => {
    const e = encodeEntry({ device: 'touch', favorite: 'brush', tried: ['one-finger', 'draw', 'brush'], last: 'draw' }, HOUR, '01c');
    expect(e).toBe('2026093014t415201c');
    expect(decodeEntry(e)?.favorite).toBe('brush');
  });
  it('encodes a desktop tie over cursor and flow (last flow, tag b20)', () => {
    const e = encodeEntry({ device: 'desktop', favorite: 'tie', tried: ['cursor', 'flow'], last: 'flow' }, HOUR, 'b20');
    expect(e).toBe('2026093014dx052b20');
    expect(decodeEntry(e)).toEqual({ hour: HOUR, device: 'desktop', favorite: null, tried: ['cursor', 'flow'], last: 'flow', tag: 'b20' });
  });
  it('is always 18 characters and ignores the order of tried', () => {
    const a = encodeEntry({ device: 'desktop', favorite: 'flow', tried: ['brush', 'cursor', 'flow'], last: 'brush' }, HOUR, 'a3f');
    expect(a).toBe('2026093014d2857a3f');
    expect(a).toHaveLength(18);
  });
});

describe('vote entry round trip', () => {
  it('round trips every family, tried mask, favorite (or tie), last and a spread of tags', () => {
    let n = 0;
    for (const device of VOTE_DEVICES) {
      const list = ids(device);
      for (let mask = 1; mask < 1 << list.length; mask++) {
        const tried = bits(mask, list.length).map(i => list[i]);
        if (tried.length < 2) continue;
        for (const favorite of [...tried, 'tie'] as (ControlId | 'tie')[]) for (const last of tried) {
          const tag = ((n * 2654435761) >>> 0).toString(16).padStart(3, '0').slice(-3);
          const e = encodeEntry({ device, favorite, tried, last }, HOUR, tag);
          expect(e).toHaveLength(18);
          expect(decodeEntry(e), e).toEqual({ hour: HOUR, device, favorite: favorite === 'tie' ? null : favorite, tried, last, tag });
          n++;
        }
      }
    }
    expect(n).toBeGreaterThan(1000);
  });

  it('keeps every hour of a day and a leap day', () => {
    for (const hour of ['2026010100', '2026123123', '2028022923', '2026093000']) {
      expect(decodeEntry(encodeEntry({ device: 'touch', favorite: 'tie', tried: ['one-finger', 'twin-stick'], last: 'one-finger' }, hour, '000'))?.hour).toBe(hour);
    }
  });

  it('refuses to encode what could not decode', () => {
    const v = { device: 'desktop', favorite: 'flow', tried: ['cursor', 'flow'], last: 'flow' } as const;
    expect(() => encodeEntry(v, '2026093014', 'A3F')).toThrow();
    expect(() => encodeEntry(v, '2026093014', 'a3')).toThrow();
    expect(() => encodeEntry(v, '2026133014', 'a3f')).toThrow();
    expect(() => encodeEntry(v, '20260930', 'a3f')).toThrow();
    expect(() => encodeEntry({ ...v, tried: ['cursor', 'twin-stick'] }, HOUR, 'a3f')).toThrow();
    expect(() => encodeEntry({ ...v, favorite: 'twin-stick' }, HOUR, 'a3f')).toThrow();
  });
});

describe('vote entry: malformed strings decode to null', () => {
  // Parts of a good desktop entry (hour, device, favorite, mask, last, tag); each case changes exactly one part.
  const good = { hour: HOUR, d: 'd', f: '2', mm: '85', l: '7', tag: 'a3f' };
  const mk = (over: Partial<typeof good>) => { const p = { ...good, ...over }; return p.hour + p.d + p.f + p.mm + p.l + p.tag; };
  it('decodes the good one, so the table below breaks it one part at a time', () => expect(decodeEntry(mk({}))).not.toBeNull());

  const bad: [string, unknown][] = [
    ['not a string', null], ['a number', 20260930142857], ['undefined', undefined], ['an object', { hour: HOUR }], ['an array', [mk({})]],
    ['empty', ''], ['17 characters', mk({}).slice(1)], ['19 characters', mk({}) + '0'], ['a trailing newline', mk({}) + '\n'],
    ['month 13', mk({ hour: '2026133014' })], ['month 00', mk({ hour: '2026003014' })], ['Feb 30', mk({ hour: '2026023014' })], ['Apr 31', mk({ hour: '2026043114' })],
    ['Feb 29 in a common year', mk({ hour: '2027022914' })], ['day 00', mk({ hour: '2026090014' })], ['hour 24', mk({ hour: '2026093024' })],
    ['non-digit hour', mk({ hour: '20260930xx' })], ['a sign in the hour', mk({ hour: '+026093014' })],
    ['unknown device x', mk({ d: 'x' })], ['uppercase device', mk({ d: 'D' })], ['a space for the device', mk({ d: ' ' })],
    ['favorite outside the family (touch has 5)', mk({ d: 't', f: '5', mm: '1f', l: '2' })], ['favorite not in the mask', mk({ f: '3' })],
    ['uppercase X favorite', mk({ f: 'X', mm: '05', l: '2' })], ['non-hex favorite', mk({ f: 'g' })], ['favorite index 8 on desktop', mk({ f: '8', mm: 'ff' })],
    ['touch mask bit 5 (beyond the family)', mk({ d: 't', f: 'x', mm: '21', l: '0' })], ['touch mask 0x3f', mk({ d: 't', f: 'x', mm: '3f', l: '0' })],
    ['a non-hex mask', mk({ mm: 'zz' })], ['an uppercase mask', mk({ mm: '8A' })],
    ['one bit only', mk({ f: '0', mm: '01', l: '0' })], ['no bits', mk({ f: 'x', mm: '00', l: '0' })],
    ['last not in the mask', mk({ l: '6' })], ['last non-hex', mk({ l: 'g' })], ['last outside the family', mk({ l: 'f' })], ['an uppercase last digit', mk({ f: 'x', mm: 'ff', l: 'F' })],
    ['an uppercase tag', mk({ tag: 'A3F' })], ['a non-hex tag', mk({ tag: 'zzz' })], ['a tag with a dash', mk({ tag: 'a-f' })], ['a space in the tag', mk({ tag: 'a f' })],
  ];
  for (const [label, s] of bad) it(`null for ${label}`, () => expect(decodeEntry(s)).toBeNull());

  it('keeps the boundary cases that are valid, so the nulls above are for the stated part', () => {
    expect(decodeEntry(mk({ d: 't', f: 'x', mm: '1f', l: '4' }))).not.toBeNull(); // touch: all 5 bits
    expect(decodeEntry(mk({ f: '7', mm: 'ff', l: '0' }))).not.toBeNull(); // desktop: all 8 bits
    expect(decodeEntry(mk({ hour: '2028022923' }))).not.toBeNull(); // leap day
    expect(decodeEntry(mk({ f: 'x', mm: '05', l: '2' }))).not.toBeNull();
    expect(decodeEntry(mk({ tag: '000' }))?.tag).toBe('000');
  });
});
