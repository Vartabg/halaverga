import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MIN_PUBLIC_TAGS } from '@/lib/vote/ballot';
import { depsFromEnv } from '@/server/vote/config';
import { handleVote } from '@/server/vote/handlers';
import { LEAD_MIN_GROUPS } from '@/server/vote/score';
import { readResults } from '@/server/vote/results';
import { FakeNeon } from './helpers/fakeNeon';
import { CS } from './helpers/neonKit';
import { agg, spread, type B } from './helpers/voteAgg';
import { NS, SALT, VOTES, blockIp, fire, setup, vote, voteBody, voteReq } from './helpers/voteBody';

// Regressions for fix round 1, part 2 (C1 R1 R3 CODE-1 V1 V2 V3; F1 F2 F3 are in vote-fix-round1.test.ts). Each test name carries
// its finding id; each fails on the code as it was before the fix.
afterEach(() => vi.restoreAllMocks());

describe('C1 an expired latch admits one probe, not everything that is in flight', () => {
  const burst = (s: ReturnType<typeof setup>, n: number) => Promise.all(Array.from({ length: n }, (_, i) => vote(s, blockIp(i))));

  it('C1 closed: 300 concurrent votes after the 30 s latch expires cost one gate A (5 commands), and 299 keep the 503', async () => {
    const s = setup({}, { mode: 'closed' });
    expect((await vote(s)).status).toBe(503);
    s.tick(30_001);
    const c = s.redis.commands, out = await burst(s, 300);
    expect(out.map((r) => r.status).every((x) => x === 503)).toBe(true);
    expect([s.redis.commands - c, s.redis.execCalls]).toEqual([5, 2]);
  });

  it('C1 the global limit: 300 concurrent votes at the expiry cost gate A and gate B once (11 commands)', async () => {
    const s = setup({}, { global: 1 });
    await vote(s);
    await vote(s, blockIp(1)); // latches the instance
    s.tick(60_001);
    const c = s.redis.commands, out = await burst(s, 300);
    expect(out.every((r) => r.status === 429)).toBe(true);
    expect(s.redis.commands - c).toBe(11);
  });

  it('C1 the ceiling: 300 concurrent votes at the expiry cost one gate A', async () => {
    const s = setup({}, { max: 100 });
    for (let i = 0; i < 100; i++) s.redis.admin(['HSETNX', VOTES, (i + 1).toString(16).padStart(32, '0'), '2026093014d0011000a3f'.slice(0, 18)]);
    await vote(s);
    s.tick(60_001);
    const c = s.redis.commands;
    await burst(s, 300);
    expect(s.redis.commands - c).toBe(5);
  });

  it('C1 a store that is down: one probe per 5 s window, however many votes arrive', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const s = setup();
    s.redis.failWith = new Error('down');
    expect((await vote(s)).status).toBe(502);
    for (let w = 0; w < 4; w++) {
      s.tick(5001);
      const c = s.redis.execCalls;
      const out = await burst(s, 100);
      expect(out.every((r) => r.status === 502), `window ${w}`).toBe(true);
      expect(s.redis.execCalls - c, `window ${w}`).toBe(1);
    }
    s.redis.failWith = null;
    s.tick(5001);
    expect((await vote(s, blockIp(999))).status).toBe(200); // the probe that succeeds closes the latch
    expect((await vote(s, blockIp(1000))).status).toBe(200);
  });

  it('C1 a store that recovers is found by the probe alone: the next request after it is a normal vote', async () => {
    const s = setup({}, { mode: 'closed' });
    await vote(s);
    s.redis.admin(['HDEL', `${NS}:ctl`, 'mode']);
    s.tick(30_001);
    const [first, ...rest] = await burst(s, 5);
    expect([first.status, rest.map((r) => r.status)]).toEqual([200, [503, 503, 503, 503]]);
    expect((await vote(s, blockIp(77))).status).toBe(200);
  });
});

describe('R1 a few networks all naming one control cannot take first place', () => {
  const touch = (n: number, favorite: 'one-finger' | 'brush' | 'conduct', other: 'brush' | 'draw', from: number): B[] =>
    spread(n, () => ({ device: 'touch' as const, favorite, tried: [favorite, other], last: favorite }), from);
  // 12 honest blocks x 5 ballots: one-finger 36 over brush, brush 24 over one-finger.
  const honest = () => [...spread(36, () => ({ device: 'touch' as const, favorite: 'one-finger' as const, tried: ['one-finger', 'brush'] as B['tried'], last: 'one-finger' as const }), 0),
    ...spread(24, () => ({ device: 'touch' as const, favorite: 'brush' as const, tried: ['one-finger', 'brush'] as B['tried'], last: 'brush' as const }), 36)];
  // Attacker groups: each fresh network sends 5 ballots (its cap) naming conduct over draw. Groups are the unit of cost.
  const attacked = (groups: number) => [...honest(), ...Array.from({ length: groups }, (_, g) => touch(5, 'conduct', 'draw', 100 + g * 5).map((b) => ({ ...b, tag: `${(0xa00 + g).toString(16)}` }))).flat()];
  const first = (groups: number) => agg(attacked(groups), [], { cap: 5, minVotes: 30 }).families.touch.order![0];

  it('R1 one block (5 ballots, all conduct over draw) does not lead: the honest first place stays first', () => {
    expect(first(0)).toBe('one-finger');
    expect(first(1)).toBe('one-finger');
    expect(first(2)).toBe('one-finger');
  });

  it(`R1 it takes at least ${LEAD_MIN_GROUPS} fresh blocks to lead (the raw Wilson bound needed one), and never before the lead rule allows`, () => {
    let need = 0;
    for (let g = 1; g <= 60 && !need; g++) if (first(g) === 'conduct') need = g;
    expect(need).toBeGreaterThanOrEqual(LEAD_MIN_GROUPS);
  });
});

describe('R3 a handful of fresh blocks cannot publish an attacker-only ranking', () => {
  const all = ['cursor', 'one-finger-keys', 'flow', 'captured', 'mouse-keys', 'draw', 'conduct', 'brush'];
  it('R3 36 ballots from 12 fresh blocks, every one claiming all 8 controls for conduct, do not rank the family (the floor is 300 votes)', async () => {
    const s = setup();
    const out = await fire(s, 36, (i) => blockIp(i % 12), () => ({ favorite: 'conduct', tried: all, last: 'conduct' }));
    expect(out.every((o) => o.status === 200)).toBe(true);
    const f = (await readResults(s.redis, NS, 'r3', s.at())).families.desktop;
    expect([f.ranked, f.controls, f.order]).toEqual([false, null, null]);
  });

  // 150 unanimous blocks would be exactly 300, but a group code has 4,096 values, so a few blocks share one and count for 2 between them: 170 blocks rank with room to spare.
  it(`R3 ranking takes ${MIN_PUBLIC_TAGS}+ groups and 300 counted votes: 149 unanimous blocks x 5 (2 count each, R1) do not rank, 170 do`, async () => {
    for (const [blocks, ranked] of [[149, false], [170, true]] as const) {
      const s = setup();
      await fire(s, blocks * 5, (i) => blockIp(i % blocks), () => ({ favorite: 'conduct', tried: all, last: 'conduct' }));
      expect((await readResults(s.redis, NS, 'r3', s.at())).families.desktop.ranked, `${blocks} blocks`).toBe(ranked);
    }
  });
});

describe('CODE-1 the store is built once per process, not once per request', () => {
  const env = { DATABASE_URL: CS, VOTE_SALT: SALT, VERCEL: '0' };
  it('CODE-1 depsFromEnv twice gives the same store; a changed connection string gives a new one', () => {
    const neon = new FakeNeon(Date.now, CS);
    const a = depsFromEnv(env, neon.fetch), b = depsFromEnv({ ...env }, neon.fetch);
    expect(a.store).not.toBeNull();
    expect(b.store).toBe(a.store);
    const other = depsFromEnv({ ...env, DATABASE_URL: CS.replace('neondb', 'otherdb') }, neon.fetch);
    expect(other.store).not.toBe(a.store);
    expect(depsFromEnv(env, neon.fetch).store).not.toBe(a.store); // and back: the cache holds the latest, it is not a registry
    expect(depsFromEnv({ ...env, DATABASE_URL: '' }, neon.fetch).store).toBeNull();
  });

  it('CODE-1 four votes through depsFromEnv send the DDL prelude once and the cleanup once, and no vote is held back', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const fresh = { ...env, DATABASE_URL: CS.replace('neondb', 'freshdb') }, neon = new FakeNeon(Date.now, fresh.DATABASE_URL);
    for (let i = 0; i < 4; i++) expect((await handleVote(voteReq(voteBody(), { ip: `10.0.0.${i + 1}`, onVercel: false }), depsFromEnv(fresh, neon.fetch))).status).toBe(200);
    const ddl = neon.calls.filter((c) => c.queries.some((q) => q.query.includes('pg_advisory_xact_lock')));
    const cleanup = neon.calls.filter((c) => c.queries.some((q) => q.query.startsWith('DELETE FROM public.hv_kv')));
    expect([ddl.length, cleanup.length]).toEqual([1, 1]);
    expect(neon.violations).toEqual([]);
  });
});

describe('V1 V2 V3 the ballot foot and the forced-colors row', () => {
  const src = (p: string) => readFileSync(fileURLToPath(new URL(`../src/ui/vote/${p}`, import.meta.url)), 'utf8');
  const css = src('VoteCard.module.css'), tsx = src('VoteCard.tsx');

  it('V1 V2 the status line and both buttons live in one sticky foot on the ballot, in every orientation', () => {
    const foot = tsx.slice(tsx.indexOf('className={styles.foot}'), tsx.indexOf('</section>'));
    expect(foot).toContain('role="status"');
    expect(foot).toContain('data-testid="vote-send"');
    expect(foot).toContain('data-testid="vote-not-yet"');
    expect(css).toMatch(/\.foot\[data-ballot\]\{position:sticky;bottom:calc\(/);
    expect(css.split('@media')[0]).toMatch(/\.foot\[data-ballot\]\{position:sticky/); // outside every media query, so portrait too
  });

  it('V3 in forced colors a checked row keeps Highlight even under the pointer', () => {
    const forced = css.slice(css.indexOf('@media(forced-colors:active)'));
    expect(forced).toMatch(/\.row:has\(input:checked\):hover\{background:Highlight/);
    expect(css).toMatch(/\.row:has\(input:checked\):hover\{background:#e3ffad\}/); // the ordinary hover rule the override has to beat
  });
});
