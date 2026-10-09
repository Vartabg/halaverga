import { describe, expect, it } from 'vitest';
import { networkOf, voteKeys } from '@/server/vote/netkeys';

const SALT = 'test-salt-test-salt-test-salt-test-salt';
const T0 = Date.UTC(2026, 8, 30, 14, 5);
const DAY = 86_400_000;
const bad = { unit: 'bad', block: 'bad' };
const same = (a: string, b: string) => expect(networkOf(a)).toEqual(networkOf(b));

describe('networkOf: IPv4', () => {
  it('cuts a strict dotted quad to its /32 unit and /24 block', () => {
    const n = networkOf('203.0.113.77');
    expect(n.unit).not.toBe(n.block);
    expect(networkOf('203.0.113.9').block).toBe(n.block);
    expect(networkOf('203.0.113.9').unit).not.toBe(n.unit);
    expect(networkOf('203.0.114.77').block).not.toBe(n.block);
    expect(networkOf('204.0.113.77').block).not.toBe(n.block);
    expect(networkOf('0.0.0.0')).not.toEqual(bad);
    expect(networkOf('255.255.255.255')).not.toEqual(bad);
  });
  it('maps every loose spelling to bad: leading zeros, ports, extra parts, out of range, junk', () => {
    for (const s of ['09.9.9.9', '9.09.9.9', '9.9.9.09', '009.9.9.9', '9.9.9.9:1', '1.2.3.4.0', '1.2.3', '1.2.3.', '.1.2.3', '256.1.1.1', '1.1.1.256', '999.1.1.1', '-1.2.3.4', '+1.2.3.4',
      '1.2.3.4/24', ' 1.2.3.4', '1.2.3.4 ', '1.2.3.4\n', '0x1.2.3.4', '1e1.2.3.4', '１.2.3.4', '1..3.4', '', ' ', 'garbage', 'localhost', 'unknown', 'LOCAL', 'None', 'BAD', 'null', '1.2.3.4,5.6.7.8']) {
      expect(networkOf(s), JSON.stringify(s)).toEqual(bad);
    }
  });
});

describe('networkOf: IPv6', () => {
  it('cuts to the /64 unit and the /48 block, however the address is written', () => {
    const n = networkOf('2001:db8:abcd:1234:1:2:3:4');
    expect(n).toEqual({ unit: '6:2001:db8:abcd:1234', block: '6:2001:db8:abcd' });
    same('2001:db8:abcd:1234:1:2:3:4', '2001:0db8:abcd:1234:0001:0002:0003:0004');
    same('2001:db8:abcd:1234:1:2:3:4', '2001:DB8:ABCD:1234:1:2:3:4');
    same('2001:db8:abcd:1234:9:9:9:9', '2001:db8:abcd:1234::9:9');
    same('2001:db8:0:0:0:0:0:1', '2001:db8::1');
    same('2001:db8:0:0:0:0:0:1', '2001:DB8::0001');
    expect(networkOf('2001:db8:abcd:1235::1').unit).not.toBe(n.unit);
    expect(networkOf('2001:db8:abcd:1235::1').block).toBe(n.block);
    expect(networkOf('2001:db8:abce:1234::1').block).not.toBe(n.block);
  });
  it('gives 1,000 different /64s inside one /48 one block and 1,000 units', () => {
    const nets = Array.from({ length: 1000 }, (_, i) => networkOf(`2001:db8:abcd:${(i * 65 + 1).toString(16)}::1`));
    expect(new Set(nets.map(n => n.block)).size).toBe(1);
    expect(new Set(nets.map(n => n.unit)).size).toBe(1000);
  });
  it('folds ::ffff:a.b.c.d (dotted or hex) to that IPv4 address', () => {
    same('::ffff:1.2.3.4', '1.2.3.4');
    same('::FFFF:1.2.3.4', '1.2.3.4');
    same('0:0:0:0:0:ffff:1.2.3.4', '1.2.3.4');
    same('::ffff:102:304', '1.2.3.4');
    expect(networkOf('::ffff:1.2.3.4').block).toBe(networkOf('1.2.3.99').block);
    expect(networkOf('::ffff:1.2.3.4')).not.toEqual(bad);
  });
  it('accepts an embedded IPv4 tail only when it is strict and last', () => {
    expect(networkOf('64:ff9b::1.2.3.4')).not.toEqual(bad);
    for (const s of ['::ffff:01.2.3.4', '::ffff:1.2.3', '::ffff:1.2.3.256', '1.2.3.4::', '::1.2.3.4:5', '::ffff:1.2.3.4.5', '1.2.3.4:5::']) expect(networkOf(s), s).toEqual(bad);
  });
  it('maps brackets, ports, zones and every malformed spelling to bad', () => {
    for (const s of ['[2001:db8::1]', '[2001:db8::1]:443', 'fe80::1%eth0', 'fe80::1%1', '2001:db8::1/64', '1:2:3:4:5:6:7:8:9', '1:2:3:4:5:6:7', '1::2::3', ':::', '::1:', ':1::2', '1:2:3:4:5:6:7:8::',
      '::12345', '::g', 'gggg::1', '2001:db8::1 ', ' 2001:db8::1', '1:2:3:4:5:6:7:8:', ':1:2:3:4:5:6:7:8', '2001:db8::1\n', '::ffff:1.2.3.4:5', ':', '::::']) {
      expect(networkOf(s), JSON.stringify(s)).toEqual(bad);
    }
  });
  it('accepts the shortest and longest legal forms', () => {
    expect(networkOf('::')).toEqual({ unit: '6:0:0:0:0', block: '6:0:0:0' });
    expect(networkOf('::1')).toEqual({ unit: '6:0:0:0:0', block: '6:0:0:0' });
    expect(networkOf('1:2:3:4:5:6:7:8')).toEqual({ unit: '6:1:2:3:4', block: '6:1:2:3' });
    expect(networkOf('1:2:3:4:5:6:7::')).toEqual({ unit: '6:1:2:3:4', block: '6:1:2:3' });
    expect(networkOf('::2:3:4:5:6:7:8')).toEqual({ unit: '6:0:2:3:4', block: '6:0:2:3' });
  });
});

describe('networkOf: the fixed buckets', () => {
  it('keeps local, none and bad as their own unit and block', () => {
    for (const s of ['local', 'none', 'bad']) expect(networkOf(s)).toEqual({ unit: s, block: s });
  });
  it('never collides a fixed bucket with a parsed address', () => {
    const keys = new Set(['local', 'none', 'bad', networkOf('1.2.3.4').unit, networkOf('::1').unit]);
    expect(keys.size).toBe(5);
  });
  it('never throws, for 20,000 random and hostile strings', () => {
    let seed = 12345;
    const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
    const alphabet = '0123456789abcdefABCDEF:.%[]/ \n\u0000gxz-+é😀';
    for (let i = 0; i < 20000; i++) {
      const s = Array.from({ length: Math.floor(rnd() * 45) }, () => alphabet[Math.floor(rnd() * alphabet.length)]).join('');
      const n = networkOf(s);
      expect(typeof n.unit).toBe('string');
      expect(typeof n.block).toBe('string');
      expect(() => voteKeys(s, SALT, T0)).not.toThrow();
    }
    for (const s of ['x'.repeat(100_000), ':'.repeat(100_000), '1.'.repeat(50_000), '0:'.repeat(50_000)]) expect(networkOf(s)).toEqual(bad);
  });
});

describe('voteKeys', () => {
  const k = voteKeys('203.0.113.77', SALT, T0);
  it('gives a unit key and a block key of 6 hex characters and a tag of 3', () => {
    expect(k.unit).toMatch(/^[0-9a-f]{6}$/);
    expect(k.block).toMatch(/^[0-9a-f]{6}$/);
    expect(k.tag).toMatch(/^[0-9a-f]{3}$/);
  });
  it('makes unit, block and tag unrelated values (the kind is in the message)', () => {
    expect(k.unit).not.toBe(k.block);
    expect(k.block.slice(0, 3)).not.toBe(k.tag);
    const many = Array.from({ length: 200 }, (_, i) => voteKeys(`10.${i}.0.1`, SALT, T0));
    expect(many.filter(x => x.block.slice(0, 3) === x.tag).length).toBeLessThan(10); // independent: about 1 in 4,096
  });
  it('is stable for the same address, salt and day', () => expect(voteKeys('203.0.113.77', SALT, T0)).toEqual(k));
  it('shares the block key and tag inside one /24 and gives each address its own unit key', () => {
    const a = voteKeys('203.0.113.1', SALT, T0), b = voteKeys('203.0.113.200', SALT, T0);
    expect(a.block).toBe(b.block);
    expect(a.tag).toBe(b.tag);
    expect(a.unit).not.toBe(b.unit);
    expect(voteKeys('203.0.114.1', SALT, T0).block).not.toBe(a.block);
  });
  it('shares one block key and one tag across 1,000 /64s in one /48', () => {
    const list = Array.from({ length: 1000 }, (_, i) => voteKeys(`2001:db8:abcd:${(i + 1).toString(16)}::1`, SALT, T0));
    expect(new Set(list.map(x => x.block)).size).toBe(1);
    expect(new Set(list.map(x => x.tag)).size).toBe(1);
    expect(new Set(list.map(x => x.unit)).size).toBe(1000);
  });
  it('folds the spellings of one address into one set of keys', () => {
    expect(voteKeys('::ffff:1.2.3.4', SALT, T0)).toEqual(voteKeys('1.2.3.4', SALT, T0));
    expect(voteKeys('2001:DB8::1', SALT, T0)).toEqual(voteKeys('2001:0db8:0:0:0:0:0:1', SALT, T0));
    for (const s of ['09.9.9.9', '9.9.9.9:1', '9.09.9.9', '1.2.3.4.0', 'garbage']) expect(voteKeys(s, SALT, T0)).toEqual(voteKeys('bad', SALT, T0));
  });
  it('changes all three values with the UTC date, and only with the date', () => {
    const next = voteKeys('203.0.113.77', SALT, T0 + DAY);
    expect(next.unit).not.toBe(k.unit);
    expect(next.block).not.toBe(k.block);
    expect(next.tag).not.toBe(k.tag);
    const lateSameDay = voteKeys('203.0.113.77', SALT, Date.UTC(2026, 8, 30, 23, 59, 59));
    expect(lateSameDay).toEqual(voteKeys('203.0.113.77', SALT, Date.UTC(2026, 8, 30, 0, 0, 0)));
    expect(voteKeys('203.0.113.77', SALT, Date.UTC(2026, 9, 1, 0, 0, 0))).not.toEqual(lateSameDay);
  });
  it('changes all three values with the salt', () => {
    const other = voteKeys('203.0.113.77', SALT + 'x', T0);
    expect(other.unit).not.toBe(k.unit);
    expect(other.block).not.toBe(k.block);
  });
  it('keeps the fixed buckets apart and never puts an address, salt or network in a key', () => {
    const fixed = ['local', 'none', 'bad'].map(s => voteKeys(s, SALT, T0));
    expect(new Set(fixed.map(x => x.unit)).size).toBe(3);
    for (const x of [k, ...fixed]) expect(JSON.stringify(x)).not.toMatch(/203|113|salt|test/);
  });
  it('spreads 4,000 blocks over most of the 4,096 tags (the tag is a group, not an identity)', () => {
    const tags = new Set(Array.from({ length: 4000 }, (_, i) => voteKeys(`${(i >> 8) + 1}.${i & 255}.7.1`, SALT, T0).tag));
    expect(tags.size).toBeGreaterThan(2000);
    expect(tags.size).toBeLessThanOrEqual(4096);
  });
});
