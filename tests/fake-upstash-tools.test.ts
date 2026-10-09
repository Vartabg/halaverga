import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { controlsFor } from '@/game/controlTypes';
import { decodeEntry } from '@/lib/vote/entry';
import { aggregate } from '@/server/vote/aggregate';
import type { Command } from '@/server/vote/store';
import { createStore, seedDemo, DEMO_TOUCH_CONTROLS } from '../scripts/fake-upstash.mjs';

const c = (...x: (string | number)[]): Command => x;

describe('fake-upstash --demo seed', () => {
  it('seeds 40 valid touch votes from 14 groups (at most 3 each), raises the ctl limits, and the reader ranks touch at once', () => {
    const s = createStore();
    const now = Date.UTC(2026, 8, 30, 14, 5);
    seedDemo(s, 'hv:local', now);
    expect(DEMO_TOUCH_CONTROLS).toBe(controlsFor('touch').length);
    const flat = s.run(c('HGETALL', 'hv:local:vote:r3:s3')) as string[];
    expect(flat).toHaveLength(80);
    const nonces = flat.filter((_, i) => i % 2 === 0), entries = flat.filter((_, i) => i % 2 === 1);
    expect(new Set(nonces).size).toBe(40);
    for (const n of nonces) expect(n).toMatch(/^[0-9a-f]{32}$/);
    const dec = entries.map((e) => decodeEntry(e));
    expect(dec.every((d) => d && d.device === 'touch' && d.hour === '2026093014' && d.tried.length >= 2 && d.tried.length <= 4)).toBe(true);
    expect(dec.every((d) => d && (d.favorite === null || d.tried.includes(d.favorite)) && d.tried.includes(d.last))).toBe(true);
    const perTag: Record<string, number> = {};
    for (const d of dec) perTag[d!.tag] = (perTag[d!.tag] ?? 0) + 1;
    expect(Object.keys(perTag).sort()).toEqual(Array.from({ length: 14 }, (_, i) => `00${i.toString(16)}`));
    expect(Math.max(...Object.values(perTag))).toBe(3);
    expect(s.run(c('HMGET', 'hv:local:ctl', 'unit', 'block', 'global', 'mode', 'cap'))).toEqual(['200', '200', '20000', null, null]);
    expect(new Set(dec.map((d) => d!.favorite)).size).toBeGreaterThan(2);
    const r = aggregate(flat, [], { cap: 5, minVotes: 30 }, now, true);
    expect(r.families.touch).toMatchObject({ votes: 40, ranked: true });
    expect(r.families.touch.order).toHaveLength(5);
    expect(r.families.desktop.ranked).toBe(false);
  });
  it('a second demo seed changes nothing (HSETNX), and the seed does not count as a /multi-exec command', () => {
    const s = createStore();
    seedDemo(s, 'hv:local');
    seedDemo(s, 'hv:local');
    expect(s.run(c('HLEN', 'hv:local:vote:r3:s3'))).toBe(40);
    expect(s.commands).toBe(0);
  });
});

describe('the dev scripts as processes (no port is opened)', () => {
  const node = (file: string, args: string[], env: Record<string, string> = {}) => {
    try { return { code: 0, out: execFileSync('node', [file, ...args], { env: { ...process.env, VERCEL: '', ...env }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 10_000 }) }; } catch (e) {
      const x = e as { status: number; stderr: string; stdout: string };
      return { code: x.status, out: x.stderr + x.stdout };
    }
  };
  it('fake-upstash refuses to run on Vercel and rejects bad arguments before binding', () => {
    expect(node('scripts/fake-upstash.mjs', [], { VERCEL: '1' })).toMatchObject({ code: 1 });
    expect(node('scripts/fake-upstash.mjs', ['--port', 'abc'])).toMatchObject({ code: 2 });
    expect(node('scripts/fake-upstash.mjs', ['--port', '70000'])).toMatchObject({ code: 2 });
    expect(node('scripts/fake-upstash.mjs', ['--nope'])).toMatchObject({ code: 2 });
    expect(node('scripts/fake-upstash.mjs', ['--ns', 'bad ns!'])).toMatchObject({ code: 2 });
  });
  it('vote-live-check carries the registry ids (drift guard), and refuses a missing or unknown phase without any network', () => {
    const r = node('scripts/vote-live-check.mjs', ['--self-test']);
    expect(r.code).toBe(0);
    expect(JSON.parse(r.out)).toEqual({ familyIds: { touch: controlsFor('touch').map((x) => x.id), desktop: controlsFor('desktop').map((x) => x.id) } });
    expect(node('scripts/vote-live-check.mjs', []).code).toBe(2);
    expect(node('scripts/vote-live-check.mjs', ['--app', 'http://127.0.0.1:9', '--store', 'http://127.0.0.1:9', '--phase', 'bogus']).code).toBe(2);
  });
});
