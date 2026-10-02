import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { controlsFor, DEFAULT_CONTROL } from '@/game/controlTypes';
import { encodeEntry, decodeEntry } from '@/lib/vote/entry';
import { aggregate } from '@/server/vote/aggregate';
import { analyze, collect, decode, main, type AuditInput } from '../scripts/vote-audit.mjs';
import { createStore, handle, seedDemo } from '../scripts/fake-upstash.mjs';
import { D, ids, NOW, pairOf, spread, tag, type B } from './helpers/voteAgg';

const NS = 'hv:production', VOID = `${NS}:void:r3:s3`, two = (i: number): B['tried'] => [ids('desktop')[i % 8], ids('desktop')[(i + 1) % 8]];
const one = (i: number): Omit<B, 'tag'> => ({ favorite: ids('desktop')[i % 8], tried: two(i), last: two(i)[1] });
const at = (h: number, n: number, from: number, mk: (i: number) => Omit<B, 'tag'> = one): B[] => spread(n, (i) => ({ ...mk(i), hour: `${D}${String(h).padStart(2, '0')}` }), from);
const report = (bs: B[], over: Partial<AuditInput> = {}) => analyze({ pairs: bs.map(pairOf), voids: [], ctl: {}, rlg: {}, hlen: bs.length, ns: NS, now: NOW, hours: 48, ...over });
const has = (r: { flags: string[] }, re: RegExp) => r.flags.some((f) => re.test(f));

describe('vote-audit --self-test and the drift guard', () => {
  const run = (env: Record<string, string>, args = ['--self-test']) => execFileSync(process.execPath, ['scripts/vote-audit.mjs', ...args], { env: env as NodeJS.ProcessEnv, encoding: 'utf8', timeout: 10_000, stdio: ['ignore', 'pipe', 'pipe'] });
  it('runs with no environment and prints the registry ids and decoded samples that match src/lib/vote/entry.ts', () => {
    const out = JSON.parse(run({ PATH: process.env.PATH ?? '' })) as { familyIds: Record<string, string[]>; defaults: Record<string, string>; decoded: Record<string, unknown> };
    expect(out.familyIds).toEqual({ touch: controlsFor('touch').map((c) => c.id), desktop: controlsFor('desktop').map((c) => c.id) });
    expect(out.defaults).toEqual(DEFAULT_CONTROL); // the starting control the order check reads
    for (const k of Object.keys(out.decoded)) expect(out.decoded[k], k).toEqual(decodeEntry(k));
    expect(out.decoded['2026093014d2857a3f']).toEqual({ hour: '2026093014', device: 'desktop', favorite: 'flow', tried: ['cursor', 'flow', 'brush'], last: 'brush', tag: 'a3f' });
    expect(out.decoded['2026093014t415201c']).toMatchObject({ device: 'touch', favorite: 'brush', tried: ['one-finger', 'draw', 'brush'], last: 'draw', tag: '01c' });
    expect(out.decoded['2026093014dx052b20']).toMatchObject({ favorite: null, tried: ['cursor', 'flow'], last: 'flow' });
    expect(Object.values(out.decoded).filter((v) => v === null).length).toBeGreaterThanOrEqual(3);
  });
  it('decode agrees with decodeEntry on every well-formed shape and on mutated ones', () => {
    for (const device of ['touch', 'desktop']) for (const f of [...'0123456789abcdefx']) for (let m = 0; m < 256; m++) for (let l = 0; l < 16; l++) {
      const s = `2026093014${device[0]}${f}${m.toString(16).padStart(2, '0')}${l.toString(16)}a3f`;
      expect(decode(s)).toEqual(decodeEntry(s));
    }
    const good = '2026093014d2857a3f', muts = [good.slice(0, 17), `${good}0`, '2026133014d2857a3f', '2026093024d2857a3f', '2026023014d2857a3f', '2026093014D2857a3f', '2026093014d2857A3F', '2026093014z2857a3f', '2026093014d2857a3g', '00000000000000000x', '', ' ', 'x'.repeat(18)];
    for (const s of [good, ...muts, null, undefined, 7, {}, []]) expect(decode(s), String(s)).toEqual(decodeEntry(s));
  });
  it('refuses, before any network, a production read without --yes, missing credentials, a bad URL, a bad --hours; never echoes a URL, token or database string', () => {
    const marker = { UPSTASH_REDIS_REST_URL: 'http://audit-marker-host.example:9', UPSTASH_REDIS_REST_TOKEN: 'audit-marker-token' };
    const run2 = (env: Record<string, string>, args: string[]) => {
      try { return { code: 0, out: run({ PATH: process.env.PATH ?? '', ...env }, args) }; } catch (e) { const x = e as { status: number; stderr: string; stdout: string }; return { code: x.status, out: x.stderr + x.stdout }; }
    };
    const cases: [Record<string, string>, string[], RegExp][] = [
      [marker, [], /Add --yes/], [marker, ['--yes'], /https/], [{}, ['--yes'], /Set UPSTASH_REDIS_REST_URL/],
      [{ ...marker, UPSTASH_REDIS_REST_URL: 'https://x.example' }, ['--yes', '--hours', '0'], /usage/], [marker, ['--env', 'Bad Env', '--yes'], /usage/],
      [{ DATABASE_URL: 'postgresql://neon-marker-user:neon-marker-pw@ep-x.example/db' }, ['--yes'], /Neon/],
    ];
    for (const [env, args, re] of cases) {
      const r = run2(env, args);
      expect(r.code, args.join(' ')).toBe(2);
      expect(r.out).toMatch(re);
      expect(r.out).not.toMatch(/audit-marker|neon-marker|ep-x\.example/);
    }
  });
  it('is at most 150 lines and can only ever send the four read commands', () => {
    const src = readFileSync('scripts/vote-audit.mjs', 'utf8');
    expect(src.trimEnd().split('\n').length).toBeLessThanOrEqual(150);
    expect([...new Set([...src.matchAll(/\['([A-Z]+)'/g)].map((m) => m[1]))].sort()).toEqual(['GET', 'HGETALL', 'HLEN', 'SMEMBERS']);
  });
});

describe('vote-audit analyze', () => {
  const honest = at(9, 5, 0);
  const stuffed = at(9, 40, 100).map((b) => ({ ...b, tag: 'a3f' }));
  it('names a stuffed group, prints the ready-to-paste void line, and its counted figure is the reader\'s (voiding it works end to end)', () => {
    const all = [...honest, ...stuffed], r = report(all);
    expect(r.voidLines).toEqual([`SADD ${VOID} T:${D}:a3f`]);
    expect(has(r, /group a3f \(desktop\) has 40 entries on 20260930, over the cap of 5/)).toBe(true);
    expect(r.lines.join('\n')).toMatch(/day 20260930: rlg none, 45 entries, 10 counted after the cap, 35 capped; groups of 1,2,3,4,5\+: 5,0,0,0,1/);
    const pairs = all.map(pairOf);
    expect(aggregate(pairs.flat(), [], { cap: 5, minVotes: 10 }, NOW, true).families.desktop.votes).toBe(10);
    const member = r.voidLines[0].split(' ').pop();
    expect(aggregate(pairs.flat(), [member], { cap: 5, minVotes: 10 }, NOW, true).families.desktop.votes).toBe(5);
    const after = analyze({ pairs, voids: [member!], ctl: {}, rlg: {}, hlen: 45, ns: NS, now: NOW, hours: 48 });
    expect(after.flags).toEqual([]);
    expect(after.voidLines).toEqual([]);
    expect(after.lines[0]).toMatch(/5 entries in the last 48 h, 40 voided/);
  });
  it('CODE-5 a window that starts inside a stuffed group\'s day still flags it and prints the void line: groups are judged on their whole day, only the hourly lines follow the window', () => {
    const all = [...honest, ...stuffed]; // all 45 entries are at hour 09; NOW is 14:05, so --hours 4 starts at 10:05 and holds none of them
    const cut = report(all, { hours: 4 }), whole = report(all, { hours: 48 });
    expect(has(cut, /group a3f \(desktop\) has 40 entries on 20260930, over the cap of 5/)).toBe(true); // before: no flag, no void line
    expect(cut.voidLines).toEqual([`SADD ${VOID} T:${D}:a3f`]);
    expect(cut.lines[0]).toMatch(/0 entries in the last 4 h, 0 voided/); // the window count is still the window's
    expect(cut.lines.some((l) => l.startsWith('hour '))).toBe(false); // no hourly line for an hour outside the window
    expect(cut.lines.join('\n')).toMatch(/day 20260930: rlg none, 45 entries, 10 counted after the cap, 35 capped/);
    expect(cut.voidLines).toEqual(whole.voidLines);
    // a window that starts mid-day inside the stuffed hours still shows the group at its whole-day size, not its in-window size
    const mid = at(9, 30, 100).concat(at(13, 10, 200)).map((b) => ({ ...b, tag: 'a3f' }));
    expect(has(report(mid, { hours: 2 }), /group a3f \(desktop\) has 40 entries on 20260930, over the cap of 5/)).toBe(true);
    // and another day's entries older than the window's first day stay out
    const older = at(9, 40, 300).map((b) => ({ ...b, tag: 'b4f', hour: '2026092809' }));
    expect(report([...honest, ...older], { hours: 4 }).voidLines).toEqual([]);
  });
  it('honours ctl.cap (2 to 100 only) and votes voided by hour or by hour-and-group', () => {
    const all = [...honest, ...stuffed];
    expect(report(all, { ctl: { cap: '3' } }).lines.join('\n')).toMatch(/8 counted after the cap, 37 capped/);
    for (const bad of ['1', '101', 'x', '5.5', '']) expect(report(all, { ctl: { cap: bad } }).lines.join('\n'), bad).toMatch(/10 counted after the cap/);
    expect(report(all, { voids: [`${D}09`] }).lines[0]).toMatch(/0 entries in the last 48 h, 45 voided/);
    expect(report(all, { voids: [`T:${D}09:a3f`, 'junk', 'T:2026:a3f'] }).lines[0]).toMatch(/5 entries in the last 48 h, 40 voided.*3 void members/);
  });
  it('counts unreadable entries, drops entries outside --hours, and shows rlg and the knobs', () => {
    const old = at(7, 3, 300).map((b) => ({ ...b, hour: '2026092807' }));
    const r = report([...honest, ...old], { pairs: [...[...honest, ...old].map(pairOf), ['n1', 'garbage'], ['n2', '2026133014d2857a3f']], hours: 6, rlg: { [D]: 1201 }, ctl: { mode: 'open', unit: '4', cap: '3', junk: 'x' }, hlen: 8 });
    expect(r.lines[0]).toBe(`${NS} round r3:s3: HLEN 8, 5 entries in the last 6 h, 0 voided, 2 unreadable, 0 void members, cap 3, ctl: mode=open unit=4 cap=3`);
    expect(r.lines.join('\n')).toMatch(/day 20260930: rlg 1201, 5 entries/);
    expect(r.lines.join('\n')).not.toContain('20260928');
  });
  it('an hour with more than 3 times the median entries is flagged (the median is the upper one, so two hours never flag)', () => {
    const spike = (n: number) => [...at(8, 5, 0), ...at(9, 5, 10), ...at(10, 5, 20), ...at(11, 5, 30), ...at(12, n, 40)];
    expect(has(report(spike(40)), /hour 2026093012 has 40 entries, more than 3 times the median 5/)).toBe(true);
    for (const [n, want] of [[16, true], [15, false]] as const) expect(has(report(spike(n)), /^hour/), String(n)).toBe(want);
    expect(report([...at(8, 5, 0), ...at(12, 40, 40)]).flags.filter((f) => f.startsWith('hour'))).toEqual([]);
  });
  it('a flat count across 6 or more consecutive hours is flagged; a gap, an uneven count or 5 hours is not', () => {
    const run6 = (hs: number[], n: (i: number) => number) => hs.flatMap((h, i) => at(h, n(i), i * 50));
    expect(has(report(run6([8, 9, 10, 11, 12, 13], () => 10)), /a flat count of about 10 an hour across 6 consecutive hours from 2026093008/)).toBe(true);
    expect(has(report(run6([8, 9, 10, 11, 12], () => 10)), /flat/)).toBe(false);
    expect(has(report(run6([8, 9, 10, 12, 13, 14], () => 10)), /flat/)).toBe(false);
    expect(has(report(run6([8, 9, 10, 11, 12, 13], (i) => (i % 2 ? 20 : 10))), /flat/)).toBe(false);
  });
  it('flags one control at 70% of 30 or more entries of a family', () => {
    const skew = (n: number, hit: number) => at(9, n, 0, (i) => ({ favorite: i < hit ? 'flow' : 'cursor', tried: ['cursor', 'flow', 'brush'], last: 'brush' }));
    expect(has(report(skew(30, 22)), /20260930: flow is 73% of 30 desktop entries/)).toBe(true);
    expect(has(report(skew(30, 20)), /is \d+% of 30 desktop entries/)).toBe(false);
    expect(has(report(skew(29, 29)), /desktop entries/)).toBe(false);
  });
  describe('V1 the last-flown check is judged against chance for the ballots, not against a fixed 70%', () => {
    const two = ['cursor', 'flow'] as B['tried'], three = ['cursor', 'flow', 'brush'] as B['tried'];
    /** n picks of one family on one day: `wins` of them name the control flown last, the rest name another tried control; `extra` Can't tell ballots on top. */
    const picks = (n: number, wins: number, tried: B['tried'] = two, device: B['device'] = 'desktop', extra = 0) => [
      ...at(9, n, 0, (i) => ({ device, favorite: i < wins ? tried.at(-1)! : tried[i % (tried.length - 1)], tried, last: tried.at(-1)! })),
      ...at(9, extra, 2000, () => ({ device, favorite: 'tie' as const, tried, last: tried.at(-1)! })),
    ];
    const flagged = (bs: B[]) => has(report(bs), /the last-flown control won \d+% of \d+ \w+ picks/);

    it('two controls tried: half is chance, so 70% of 30 picks (the old alarm) is not a flag, 70% of 100 is', () => {
      expect(flagged(picks(30, 21))).toBe(false); // 2.2 standard errors: a fair poll does this about one day in fifty
      expect(flagged(picks(100, 70))).toBe(true);
      expect(report(picks(100, 70)).flags.find((f) => /last-flown/.test(f))).toBe('20260930: the last-flown control won 70% of 100 desktop picks, chance for these ballots is 50% (4.0 standard errors over)');
      expect(flagged(picks(100, 50))).toBe(false);
    });
    it('three controls tried: chance is a third, so 55% is a flag where the fixed 70% never was', () => {
      expect(flagged(picks(60, 33, three))).toBe(true); // 20 expected, 33 seen
      expect(flagged(picks(60, 24, three))).toBe(false); // 40%: a little over chance, inside the noise
      expect(report(picks(60, 33, three)).flags.find((f) => /last-flown/.test(f))).toMatch(/won 55% of 60 desktop picks, chance for these ballots is 33% \(3\.\d standard errors over\)/);
    });
    it('needs 30 picks, 3 standard errors and 10 points over chance: all three, not any one', () => {
      expect(flagged(picks(29, 29))).toBe(false); // too few picks, whatever the share
      expect(flagged(picks(30, 30))).toBe(true);
      expect(flagged(picks(1000, 560))).toBe(false); // 3.8 standard errors, but only 6 points over chance: ordinary novelty, printed in the summary, not flagged
      expect(flagged(picks(1000, 600))).toBe(true);
    });
    it('Can\'t tell is no pick: it neither dilutes the share nor counts as a loss', () => {
      expect(flagged(picks(60, 45, two, 'desktop', 100))).toBe(true); // 75% of 60 picks (it was 28% of 160 entries under the old rule)
      expect(flagged(picks(20, 20, two, 'desktop', 100))).toBe(false); // 20 picks are too few
    });
    it('is judged for each family and day on its own, and names the family', () => {
      const mixed = [...picks(60, 30, two, 'desktop'), ...at(9, 60, 3000, (i) => ({ device: 'touch' as const, favorite: i < 50 ? 'draw' as const : 'one-finger' as const, tried: ['one-finger', 'draw'] as B['tried'], last: 'draw' as const }))];
      const r = report(mixed);
      expect(r.flags.filter((f) => /last-flown/.test(f))).toEqual(['20260930: the last-flown control won 83% of 60 touch picks, chance for these ballots is 50% (5.2 standard errors over)']);
    });
    it('prints, per family, the last-flown share against chance and the default against the control flown last', () => {
      const bs = [...picks(60, 45), ...at(9, 10, 3000, () => ({ device: 'desktop' as const, favorite: 'brush' as const, tried: ['flow', 'brush'] as B['tried'], last: 'brush' as const }))];
      const line = report(bs).lines.find((l) => l.startsWith('order desktop:'))!;
      expect(line).toBe('order desktop: last-flown won 79% of 70 picks (chance 50%); default flown and another control last: last won 75%, default 25% of 60 picks (chance 50% each)');
      expect(report(bs).lines.some((l) => l.startsWith('order touch:'))).toBe(false); // no touch picks, no touch line
      expect(report([]).lines.some((l) => l.startsWith('order '))).toBe(false);
    });
  });
  it('flags 10 or more groups with the same count of 3, and a group that is 30% of a day', () => {
    const groups = (n: number, size = 3) => Array.from({ length: n }, (_, g) => at(9, size, g * 9).map((b) => ({ ...b, tag: tag(g) }))).flat();
    expect(has(report(groups(10)), /20260930: 10 groups with 3 entries/)).toBe(true);
    expect(has(report(groups(10, 4)), /20260930: 10 groups with 4 entries/)).toBe(true);
    for (const [n, size] of [[9, 3], [10, 2], [10, 1]]) expect(has(report(groups(n, size)), /groups with/), `${n}x${size}`).toBe(false);
    const share = [...at(9, 9, 0), ...at(9, 4, 50).map((b) => ({ ...b, tag: 'b20' }))];
    expect(has(report(share), /group b20 \(desktop\) is 31% of 20260930/)).toBe(true);
    expect(report(share).voidLines).toEqual([]);
  });
  it('the hour line names the top groups, the top pick and the last-flown share of picks against chance', () => {
    const r = report([...at(9, 3, 0).map((b) => ({ ...b, tag: 'a3f' })), ...at(9, 1, 5).map((b) => ({ ...b, tag: '0c1' }))]);
    expect(r.lines.find((l) => l.startsWith('hour 2026093009'))).toMatch(/^hour 2026093009: 4 entries; groups a3f:3 0c1:1; top d:\w[\w-]* \d+%; last-flown \d+% of \d+ picks \(chance \d+%\); picks d:/);
  });
});

describe('vote-audit against the fake store (no port: the fake\'s handler is the fetch)', () => {
  const TOKEN = 'audit-marker-token', BASE = 'https://audit-marker-host.example';
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
  function rig(prep?: (s: ReturnType<typeof createStore>) => void) {
    const store = createStore(), sent: { url: string; init: RequestInit; cmds: string[][] }[] = [];
    seedDemo(store, NS, NOW);
    store.run(['HSET', `${NS}:ctl`, 'cap', 4]);
    store.run(['SADD', VOID, 'T:20260930:000']);
    store.run(['SET', `${NS}:rlg:20260930`, 17, 'EX', 500]);
    prep?.(store);
    const fetchImpl = async (url: string, init: RequestInit) => {
      const headers = init.headers as Record<string, string>, cmds = JSON.parse(init.body as string) as string[][];
      sent.push({ url, init, cmds });
      const r = handle(store, TOKEN, init.method ?? 'GET', new URL(url).pathname, { authorization: headers.Authorization }, init.body as string);
      return { ok: r.status === 200, json: async () => r.body };
    };
    return { store, sent, fetchImpl };
  }
  it('collect reads in one read-only round trip with the bearer token, and changes nothing', async () => {
    const { store, sent, fetchImpl } = rig();
    const snap = () => [store.run(['HGETALL', `${NS}:vote:r3:s3`]), store.run(['SMEMBERS', VOID]), store.run(['HGETALL', `${NS}:ctl`]), store.run(['GET', `${NS}:rlg:20260930`])];
    const before = snap();
    const got = await collect(BASE, TOKEN, NS, ['20260929', '20260930'], fetchImpl);
    expect(sent).toHaveLength(1);
    expect(sent[0].url).toBe(`${BASE}/multi-exec`);
    expect(sent[0].init).toMatchObject({ method: 'POST', redirect: 'error' });
    expect((sent[0].init.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`);
    expect(sent[0].cmds.map((c) => c[0])).toEqual(['HGETALL', 'SMEMBERS', 'HGETALL', 'HLEN', 'GET', 'GET']);
    expect(store.commands).toBe(6);
    expect(got).toMatchObject({ hlen: 40, voids: ['T:20260930:000'], ctl: { cap: '4', unit: '200' }, rlg: { '20260929': null, '20260930': 17 } });
    expect(got.pairs).toHaveLength(40);
    expect(snap()).toEqual(before);
  });
  it('the CLI prints the report for the seeded votes, needs --yes only for production, and never prints the URL or the token', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    const { sent, fetchImpl } = rig(), log = vi.spyOn(console, 'log').mockImplementation(() => {}), err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const env = { KV_REST_API_URL: BASE, KV_REST_API_TOKEN: TOKEN };
    expect(await main(['--yes', '--hours', '24'], env, fetchImpl)).toBe(0);
    const out = log.mock.calls.flat().join('\n');
    expect(out).toContain(`${NS} round r3:s3: HLEN 40, 37 entries in the last 24 h, 3 voided`);
    expect(out).toMatch(/day 20260930: rlg 17, 37 entries/);
    expect(out).toMatch(/hour 2026093014: 37 entries/);
    expect(out).toMatch(/FLAG 20260930: 11 groups with 3 entries/);
    for (const text of [out, ...err.mock.calls.flat().map(String)]) expect(text).not.toMatch(/audit-marker/);
    expect(sent[0].cmds[0][1]).toBe(`${NS}:vote:r3:s3`);
    expect(await main([], env, fetchImpl)).toBe(2);
    expect(sent).toHaveLength(1);
    expect(await main(['--env', 'preview'], { ...env, VOTE_ENV: 'production' }, fetchImpl)).toBe(0);
    expect(sent[1].cmds[0][1]).toBe('hv:preview:vote:r3:s3');
  });
  it('a store failure prints one fixed line and returns 1, whatever the error carried', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {}), log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const env = { UPSTASH_REDIS_REST_URL: BASE, UPSTASH_REDIS_REST_TOKEN: TOKEN };
    const bad: Record<string, () => Promise<unknown>> = {
      http500: async () => ({ ok: false, json: async () => ({ error: `${BASE} ${TOKEN}` }) }),
      throws: async () => { throw new Error(`connect ECONNREFUSED ${BASE} ${TOKEN}`); },
      errorEntry: async () => ({ ok: true, json: async () => Array(6).fill({ error: `WRONGTYPE ${TOKEN}` }) }),
      wrongLength: async () => ({ ok: true, json: async () => [{ result: [] }] }),
      notJson: async () => ({ ok: true, json: async () => { throw new SyntaxError(`Unexpected token ${TOKEN}`); } }),
      internal: async () => ({ ok: true, json: async () => Array.from({ length: 6 }, () => ({ get result(): never { throw new Error(`boom ${TOKEN}`); } })) }),
    };
    for (const [name, f] of Object.entries(bad)) {
      err.mockClear();
      expect(await main(['--yes', '--hours', '24'], env, f as never), name).toBe(1);
      expect(err.mock.calls.flat().join('\n'), name).toBe(`audit failed: ${name === 'internal' ? 'internal error' : 'the store did not answer as expected'}`);
    }
    expect(log).not.toHaveBeenCalled();
  });
});
