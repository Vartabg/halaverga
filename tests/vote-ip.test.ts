import { describe, expect, it } from 'vitest';
import { clientAddress } from '@/server/vote/clientIp';
import { voteKeys } from '@/server/vote/netkeys';

const SALT = 'test-salt-test-salt-test-salt-test-salt';
const T0 = Date.UTC(2026, 8, 30, 14, 5);
const h = (o: Record<string, string>) => new Headers(o);

describe('clientAddress on Vercel', () => {
  it('reads x-vercel-forwarded-for and nothing else', () => {
    expect(clientAddress(h({ 'x-vercel-forwarded-for': '203.0.113.9' }), true)).toBe('203.0.113.9');
    expect(clientAddress(h({ 'x-vercel-forwarded-for': '203.0.113.9', 'x-real-ip': '198.51.100.1' }), true)).toBe('203.0.113.9');
  });
  it('takes the last entry of a list and trims it', () => {
    expect(clientAddress(h({ 'x-vercel-forwarded-for': '6.6.6.6, 7.7.7.7 ,  203.0.113.9 ' }), true)).toBe('203.0.113.9');
  });
  it('F6 x-real-ip is never read on Vercel: without the platform header it is the shared none key, however many values a caller spoofs', () => {
    expect(clientAddress(h({ 'x-real-ip': '203.0.113.9' }), true)).toBe('none');
    expect(clientAddress(h({ 'x-real-ip': '6.6.6.6,203.0.113.9' }), true)).toBe('none');
    expect(clientAddress(h({ 'x-vercel-forwarded-for': '', 'x-real-ip': '203.0.113.9' }), true)).toBe('none');
    expect(new Set(Array.from({ length: 30 }, (_, i) => clientAddress(h({ 'x-real-ip': `198.51.100.${i}` }), true)))).toEqual(new Set(['none']));
  });
  it('gives none for no header, an empty one or an empty last entry', () => {
    expect(clientAddress(h({}), true)).toBe('none');
    expect(clientAddress(h({ 'x-vercel-forwarded-for': '' }), true)).toBe('none');
    expect(clientAddress(h({ 'x-vercel-forwarded-for': '   ' }), true)).toBe('none');
    expect(clientAddress(h({ 'x-vercel-forwarded-for': '1.2.3.4,' }), true)).toBe('none');
  });
  it('F3: never reads x-forwarded-for or forwarded, prepended or alone', () => {
    expect(clientAddress(h({ 'x-forwarded-for': '6.6.6.6' }), true)).toBe('none');
    expect(clientAddress(h({ forwarded: 'for=6.6.6.6' }), true)).toBe('none');
    expect(clientAddress(h({ 'x-forwarded-for': '6.6.6.6', 'x-vercel-forwarded-for': '203.0.113.9' }), true)).toBe('203.0.113.9');
    expect(clientAddress(h({ 'x-forwarded-for': '6.6.6.6, 203.0.113.9', 'x-real-ip': '198.51.100.1' }), true)).toBe('none');
    expect(clientAddress(h({ 'x-forwarded-for': '6.6.6.6', 'x-forwarded-host': 'x', forwarded: 'for=1.1.1.1;by=2.2.2.2' }), true)).toBe('none');
  });
  it('F3: 25 spoofed x-forwarded-for values on one platform address share one key set', () => {
    const keys = new Set(Array.from({ length: 25 }, (_, i) => {
      const raw = clientAddress(h({ 'x-vercel-forwarded-for': '203.0.113.9', 'x-forwarded-for': `10.0.${i}.1, 10.9.9.9` }), true);
      return JSON.stringify(voteKeys(raw, SALT, T0));
    }));
    expect(keys.size).toBe(1);
  });
  it('never reads a header whose name only looks like one', () => {
    expect(clientAddress(h({ 'x-vercel-forwarded-for-2': '1.2.3.4', 'x-client-ip': '1.2.3.4', 'cf-connecting-ip': '1.2.3.4', 'true-client-ip': '1.2.3.4' }), true)).toBe('none');
  });
});

describe('clientAddress off Vercel', () => {
  it('is always local, whatever the headers claim', () => {
    for (const headers of [{}, { 'x-vercel-forwarded-for': '203.0.113.9' }, { 'x-real-ip': '1.2.3.4' }, { 'x-forwarded-for': '6.6.6.6' }] as Record<string, string>[]) expect(clientAddress(h(headers), false)).toBe('local');
  });
  it('F3: 25 distinct x-forwarded-for values are one bucket', () => {
    const keys = new Set(Array.from({ length: 25 }, (_, i) => JSON.stringify(voteKeys(clientAddress(h({ 'x-forwarded-for': `10.0.${i}.1`, 'x-real-ip': `10.1.${i}.1` }), false), SALT, T0))));
    expect(keys.size).toBe(1);
  });
});

describe('P5: nine spellings of one address are one key or bad', () => {
  const vercel = (v: string) => voteKeys(clientAddress(h({ 'x-vercel-forwarded-for': v }), true), SALT, T0);
  it('routes every loose spelling to the bad key, and the strict one to its own', () => {
    const real = vercel('1.2.3.4'), badKeys = vercel('garbage');
    expect(real).not.toEqual(badKeys);
    for (const s of ['09.9.9.9', '9.9.9.9:1', '9.09.9.9', '1.2.3.4.0', '1.2.3.04', '[1.2.3.4]', '0x1.2.3.4', 'garbage']) expect(vercel(s), s).toEqual(badKeys);
    expect(vercel('::ffff:1.2.3.4')).toEqual(real);
    expect(vercel('  1.2.3.4  ')).toEqual(real);
  });
});
