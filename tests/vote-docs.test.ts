import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { controlsFor } from '@/game/controlTypes';
import { MIN_PUBLIC_TAGS, VOTE_MAX_BYTES, VOTE_MIN_TRIED } from '@/lib/vote/ballot';
import { PRIVACY_FULL, PRIVACY_SHORT } from '@/lib/vote/privacy';
import { BLOCK_LIMIT, CAP_DEFAULT, GLOBAL_LIMIT, limitsFrom, MAX_ENTRIES, MINV_DEFAULT, ROUND_LIMIT, UNIT_LIMIT } from '@/server/vote/limits';
import { RESULTS_MAX_STALE_MS, RESULTS_RETRY_MS, RESULTS_TTL_MS } from '@/server/vote/cachedResults';
import { aggregate } from '@/server/vote/aggregate';
import { encodeEntry } from '@/lib/vote/entry';
import { gateA, gateB } from '@/server/vote/gate';
import { HANDLER_DEADLINE_MS } from '@/server/vote/handlers';
import { NEON_TIMEOUT_MS, DDL, CLEAN } from '@/server/vote/neonSchema';
import { runbook } from '@/server/vote/neonRunbook';
import { readResults } from '@/server/vote/results';
import { STORE_TIMEOUT_MS } from '@/server/vote/store';
import { FIRST_20_LINE, NOISE_LINE, noisePoints } from '@/app/results/markup';
import { LAST_FLOWN_MIN } from '@/server/vote/lastFlown';
import { PICK_FIRST, PAUSED_TEXT, SAVED_TEXT, STATUS_TEXT } from '@/ui/vote/voteClient';
import { PENDING_KEY, PENDING_MS } from '@/ui/vote/pending';
import { SEED_KEY } from '@/ui/vote/ballotPlan';
import { GUARD_MS, LOCK_MS, PLAY_KEY, SKIP_QUIET_MS, TRIED_S, VOTE_KEY } from '@/ui/vote/voteTracker';
import { blockIp, fire, setup, shape, vote } from './helpers/voteBody';

const read = (f: string) => readFileSync(f, 'utf8');
const voting = read('docs/voting.md'), runbookMd = read('docs/vote-runbook.md');
const n = (x: number) => x.toLocaleString('en-US');
const inDocs = (s: string) => expect(voting, s).toContain(s);

describe('docs/voting.md numbers are the code\'s numbers', () => {
  it('states the limits, the clamps, the sizes and every timeout that the code defines', () => {
    for (const s of [`**${UNIT_LIMIT} a day**`, `**${BLOCK_LIMIT} a day**`, `**${ROUND_LIMIT}** counted votes per 30 days`, `**${n(GLOBAL_LIMIT)} counted votes a day**`, `**${n(MAX_ENTRIES)}**`, `**${CAP_DEFAULT}** counted votes`,
      `**${MINV_DEFAULT}** counted votes and **${MIN_PUBLIC_TAGS}** distinct`, `${VOTE_MAX_BYTES} bytes, 2 s`, `${HANDLER_DEADLINE_MS / 1000} s, each store call`,
      `${STORE_TIMEOUT_MS / 1000} s for Upstash`, `${NEON_TIMEOUT_MS / 1000} s for Neon`, `refreshed at most once per ${RESULTS_TTL_MS / 1000} s`, `not retried for ${RESULTS_RETRY_MS / 1000} s`,
      `at least ${VOTE_MIN_TRIED} tried`, `after ${TRIED_S} seconds`, `${GUARD_MS} ms`, `${LOCK_MS / 86400e3} days`, `${SKIP_QUIET_MS / 3600e3}-hour quiet`, `${PENDING_MS / 3600e3} hours pass`,
      PLAY_KEY, VOTE_KEY, PENDING_KEY, SEED_KEY]) inDocs(s);
    const clamp = { unit: [1, 200], block: [1, 2000], global: [1, 20000], max: [100, 20000], cap: [2, 100], minv: [10, 1000], round: [1, 1000] } as const;
    const at = (k: string, v: number) => limitsFrom(['open', ...['unit', 'block', 'global', 'max', 'cap', 'minv', 'round'].map((f) => (f === k ? String(v) : null))])[k as 'unit'];
    for (const [k, [lo, hi]] of Object.entries(clamp)) {
      expect([at(k, lo), at(k, hi)], k).toEqual([lo, hi]);
      expect([at(k, lo - 1) === lo - 1, at(k, hi + 1) === hi + 1], k).toEqual([false, false]);
      inDocs(`\`${k}\`, ${lo} to ${hi}`);
    }
    expect([gateA('hv:x', 'r3:s3', '20260930', { unit: 'a' }, 'n')[3][4], gateB('hv:x', '20260930', { block: 'b', round: 'r' })[2][4]]).toEqual([90000, 2592000]);
    for (const s of ['25 h (90,000 s)', '| 30 days |', 'expire after 90,000 s']) inDocs(s);
    expect(read('src/ui/vote/voteClient.ts')).toMatch(/opts\.timeoutMs \?\? 7000[\s\S]*opts\.retryDelayMs \?\? 1000/);
    for (const s of ['7 s per attempt, one retry after 1 s']) inDocs(s);
    expect(read('scripts/check-first-load.mjs')).toContain('const BUDGET_KB = 636;');
    inDocs('636 KB, printed 636.0 KB');
  });
  it('quotes the card and page texts, the outcome copy and the results sentence word for word, and names every control', () => {
    inDocs(PRIVACY_SHORT);
    inDocs(PRIVACY_FULL);
    for (const t of new Set(Object.values(STATUS_TEXT))) inDocs(t);
    for (const t of [PICK_FIRST, PAUSED_TEXT, SAVED_TEXT, NOISE_LINE.slice(0, 58), FIRST_20_LINE]) inDocs(t);
    for (const family of ['touch', 'desktop'] as const) for (const c of controlsFor(family)) inDocs(c.label);
  });
  it('states everything the spec lists for this page', () => {
    const listed = ['Votes, not people', 'a script can vote', 'Clearing site data and changing network allows another vote', 'The first counted pick stands on a resend',
      '**A shared address (CGNAT, campus, venue Wi-Fi, iCloud Private Relay) is limited together, counts for a few votes a day, and beyond its limit gets 429 until the next UTC day.**',
      'On a busy day your vote may be refused; your pick is kept on the device', "Our code never logs an address, body, nonce, key or token; Vercel's platform logs do",
      '**r2 to r3 (2026-09-29).**', '## Launch gates', '## Fallback: no store', 'What this cannot do:', '`VOTE_SALT` | **required**', '`DATABASE_URL`', 'pnpm test:pg',
      'If the plan cannot rate limit `/api/vote`, do not publish the link', 'node scripts/fake-upstash.mjs --demo'];
    for (const s of listed) inDocs(s);
    expect(voting).not.toMatch(/IPs, bodies and tokens are never logged/);
    for (const s of ['node scripts/fake-upstash.mjs --demo', 'demo data seeded: 40 votes, 14 groups; ctl unit, block, global, round raised, minv 30']) { inDocs(s); expect(runbookMd).toContain(s); }
  });
  it('costs of a request are the ones the handler really spends, and the latches last as long as the docs say', async () => {
    const one = setup(), out = await fire(one, 17, () => '203.0.113.9');
    expect(shape(out)).toEqual({ '200@12': 8, '429@5': 8, '429@0': 1 });
    expect(out[16].cost).toBe(0);
    const blk = await fire(setup(), 125, (i) => `203.0.113.${(i % 250) + 1}`);
    expect([blk[59].status, blk[60].cost, blk[120].cost, blk[121].cost]).toEqual([200, 11, 11, 0]);
    const glob = setup({}, { global: 1 });
    expect(shape(await fire(glob, 2, blockIp))).toEqual({ '200@12': 1, '429@11': 1 });
    glob.tick(59_000);
    expect(shape(await fire(glob, 1, () => blockIp(90)))).toEqual({ '429@0': 1 });
    glob.tick(2_000);
    expect(shape(await fire(glob, 1, () => blockIp(91)))).toEqual({ '429@11': 1 });
    const closed = setup({}, { mode: 'closed' });
    expect(shape(await fire(closed, 1, () => '203.0.113.1'))).toEqual({ '503@5': 1 });
    closed.tick(29_000);
    expect(shape(await fire(closed, 1, () => '203.0.113.2'))).toEqual({ '503@0': 1 });
    closed.tick(2_000);
    expect(shape(await fire(closed, 1, () => '203.0.113.3'))).toEqual({ '503@5': 1 });
    const bad = setup(), calls = () => bad.redis.execCalls;
    bad.redis.failWith = new Error('down');
    expect((await vote(bad)).status).toBe(502);
    const first = calls();
    bad.tick(4_000);
    await vote(bad, '203.0.113.4');
    expect(calls()).toBe(first);
    bad.tick(2_000);
    await vote(bad, '203.0.113.5');
    expect(calls()).toBeGreaterThan(first);
    const readCost = setup(), before = readCost.redis.commands;
    await readResults(readCost.redis, 'hv:test', 'r3');
    expect(readCost.redis.commands - before).toBe(3);
    for (const s of ['| Counted vote | 3 | **12** |', '| A resend of the same code (answers 200, spends no budget: gate A, then one `DECR` of the address counter) | 2 | **6** |', '| 1 | **5** |', '| 2 | **11** |', '| 0 | **0** |', '| 1 | **3** |',
      'closed for 30 s (503)', 'reached for 60 s (429)', 'a store error for 5 s (502)', '17th attempt from one address, 121st from one block', '`Retry-After` = the seconds left to the next UTC midnight', '`Retry-After: 5`', '`Retry-After: 60`', 'exactly one request goes to the store as a probe']) inDocs(s);
    const codes = await Promise.all([fire(setup(), 9, () => '203.0.113.9'), fire(setup({}, { mode: 'closed' }), 1, () => '203.0.113.9')]);
    expect(codes.map((c) => c.at(-1)?.status)).toEqual([429, 503]);
  });
});

describe('V1 results that do not over-claim: the docs say what the code does', () => {
  const demo = read('docs/controls-demo.md');
  it('voting.md documents the order check, its floor, the noise figure and the 20-second limit, and says what the vote cannot tell', () => {
    for (const s of [`at least **${LAST_FLOWN_MIN}** such counted picks`, '`LAST_FLOWN_MIN`', '340 / sqrt(N)', '34 at 100 votes, 24 at 200, 17 at 400, 12 at 800, 9 at 1,600', '`lastFlown` is `{n, last, first, even}`',
      '6. **Order and novelty: what the vote can and cannot tell.**', 'a challenger that beats a practiced default is the informative result', 'no score reads it', 'it cannot show which control is better over minutes of play',
      'the audit simulations disagree on how fast a strong preference shows', '`/results` shows the count and nothing else', 'With about n votes, two controls can end up about x points apart by luck alone.',
      'what each would get if every control tried were liked equally', 'That baseline is equal liking, not "order did nothing"', 'a gap from the baseline is order, liking or both and the vote cannot say which']) inDocs(s);
    expect([100, 200, 400, 800, 1600].map(noisePoints)).toEqual([34, 24, 17, 12, 9]); // the figures the paragraph quotes are the code's
    expect(voting).not.toMatch(/Twenty fresh blocks|about 26 comparisons|100 votes need 20 groups/);
  });
  it('the runbook describes the baseline check by its real thresholds, and its minv example raises the floor instead of lowering it', () => {
    for (const s of ['**The last-flown check**', 'at least 30 picks', '3 standard errors', 'at least 10 points', '1 in k chance', 'order <family>: last-flown won X% of N picks (chance Y%)',
      '"Chance" here is equal liking', 'It is not "order does nothing"', 'the suggested controls being simply better liked than the default (no order effect needed']) expect(runbookMd, s).toContain(s);
    expect(runbookMd).not.toMatch(/70% or more of 30\+ entries/);
    const minv = runbook('hv:production', '20260930', '2026093014', 'a3f').find((i) => i.id === 'minv')!;
    expect(Number(/ minv (\d+)$/.exec(minv.redis)![1])).toBeGreaterThan(MINV_DEFAULT);
    expect(runbookMd).toContain(`its default of ${MINV_DEFAULT}`);
  });
  it('no owner doc still calls the order check baseline "if order did not matter": it is equal liking, and order and liking cannot be told apart', () => {
    for (const [name, text] of [['voting.md', voting], ['controls-demo.md', demo], ['vote-runbook.md', runbookMd]] as const) expect(text, name).not.toMatch(/order did not matter|even odds/i);
    expect(demo).toContain('if every control tried were liked equally, with a plain note that order and liking cannot be told apart from those numbers');
    expect(read('docs/launch-readiness.md')).toContain('If every control tried were liked equally, each would win about X%. Order and liking cannot be told apart here.');
  });
  it('controls-demo.md carries the limits and the floor the code has (it said 20 a day per block and 30 votes)', () => {
    for (const s of [`${UNIT_LIMIT} votes a day per network address`, `${BLOCK_LIMIT} a day per network block`, `${ROUND_LIMIT} per network over 30 days`, `${n(GLOBAL_LIMIT)} a day for the whole site`, `at least ${MINV_DEFAULT} counted votes from at least ${MIN_PUBLIC_TAGS} different networks`,
      FIRST_20_LINE.charAt(0).toLowerCase() + FIRST_20_LINE.slice(1, -1)]) expect(demo, s).toContain(s);
    expect(demo).not.toMatch(/20 a day per network block|at least 30 counted votes|head-to-head wins and losses/);
  });
});

describe('third-review low findings: the docs say what the code does', () => {
  const decisions = read('docs/DECISIONS.md');
  it('CODE-7 DECISIONS.md carries an r3 entry and marks the r2 rules superseded, not current', () => {
    expect(decisions).toMatch(/\n- Public vote, round r3 \(owner intent 2026-09-29/);
    expect(decisions).toMatch(/the vote rules in this entry are round r2 and are superseded by the r3 entry below/);
    const r3 = decisions.slice(decisions.indexOf('- Public vote, round r3'));
    for (const s of ['`r3:s3`', '8-command', 'no cookies', 'shared 120 s snapshot', 'a resend of a stored vote is 200']) expect(r3, s).toContain(s);
    expect(r3).not.toMatch(/20 votes per hour|r2:s2|3 tried controls plus 180/); // r3 restates none of the r2 rules as current
  });
  it('CODE-3 the ranking floor is documented as group-days everywhere it appears, and the code counts exactly that', () => {
    expect(voting).toContain('**12** distinct group-days');
    expect(voting).toMatch(/at least 12 distinct group-days \(a group is one network group code on one UTC day and one family/);
    expect(voting).not.toMatch(/12 distinct network groups|from at least 6 distinct network groups/);
    // one group code seen on 12 different days is 12 group-days: it ranks (the round limit, not the floor, bounds one network across days)
    const days = Array.from({ length: 12 }, (_, i) => `202609${String(10 + i).padStart(2, '0')}`);
    const es = days.flatMap((d, i) => Array.from({ length: 9 }, (_, j) => [`${(i * 9 + j).toString(16).padStart(32, '0')}`, encodeEntry({ device: 'desktop', favorite: (['flow', 'cursor', 'draw'] as const)[j % 3], tried: ['cursor', 'flow', 'draw'], last: 'flow' }, `${d}12`, 'a3f')]));
    expect(aggregate(es.flat(), [], { cap: 9, minVotes: 100 }, Date.UTC(2026, 8, 30), true).families.desktop.ranked).toBe(true);
    expect(aggregate(es.slice(0, 99).flat(), [], { cap: 9, minVotes: 100 }, Date.UTC(2026, 8, 30), true).families.desktop.ranked).toBe(false); // 11 group-days
  });
  it('R4 exposure bias is stated in the scoring section, with what it does not fix', () => {
    expect(voting).toMatch(/\*\*Exposure bias \(R4\):\*\* at equal true preference the control every visitor flies/);
    expect(voting).toMatch(/neither removes the bias/);
  });
  it('C3, F4, F5, F6, CODE-2 and the results caching are in voting.md as the code has them', () => {
    for (const s of ['**A slow store can spend an honest voter\'s budget (C3).**', '**The main ceiling can overshoot under concurrency (F4).**', 'or until UTC midnight, whichever is first', '`x-real-ip` never are',
      'takes the address counter\'s increment back with one `DECR`', 'only until it is 10 minutes old', '[vote] results refresh failed', 'every failure (502) and the not-set-up answer (503) of `/results` and `/api/results` is `no-store`',
      '`/results` is a route handler', '`Allow: GET, HEAD, OPTIONS`', '`Allow: POST, OPTIONS`', '**Only a Neon host parses: `*.neon.tech`**', 'PG PARITY SUITE SKIPPED']) inDocs(s);
    expect(RESULTS_MAX_STALE_MS).toBe(10 * 60_000);
    expect(voting).not.toMatch(/else `x-real-ip`/);
  });
});

describe('docs/vote-runbook.md matches the Neon runbook and the schema', () => {
  it('carries every console line (Redis and SQL), the five DDL statements and the cleanup, verbatim', () => {
    const items = runbook('hv:production', '20260930', '2026093014', 'a3f');
    expect(items.length).toBe(19);
    const lines = runbookMd.split('\n');
    for (const it of items) { expect(lines, it.id).toContain(it.sql); if (it.redis) expect(lines, it.id).toContain(it.redis); }
    for (const s of [...DDL, CLEAN]) expect(runbookMd).toContain(s);
    for (const s of ['node scripts/vote-audit.mjs --hours 48 --env production --yes', 'DATABASE_URL', 'POSTGRES_URL', 'VOTE_SALT', 'VOTE_ALLOW_PREVIEW', '## If the store is Neon', 'dev-token', 'ctl unit 200 block 200 global 20000']) expect(runbookMd).toContain(s);
  });
});

describe('the other docs are not stale, and every relative link resolves', () => {
  const files = ['README.md', 'docs/voting.md', 'docs/vote-runbook.md', 'docs/controls-demo.md', 'docs/gesture-lab.md'];
  it('says VOTE_SALT is required, keeps the real-device vote NOT DONE, and has none of the old vote claims', () => {
    expect(read('README.md')).toMatch(/`VOTE_SALT` is \*\*required\*\*/);
    expect(read('docs/gesture-lab.md')).toMatch(/Vote on a real iPhone \(Safari, portrait and landscape\) and with a desktop trackpad \| NOT DONE/);
    const history = (t: string) => t.replace(/^.*(earlier text|r1 to r2|r2 to r3|r2 held).*$/gm, ''); // the history lines may name what was removed
    const stale = [/Vote on the controls/, /20 votes (per|an) hour/, /600 votes per hour/, /unstable_cache/, /r2:s2/, /round r2\b/, /schema 2\b/, /optional 1-5 rating/, /optional note/, /Mean rating/,
      /every control of your family has been tried/, /leads with the vote after 3 tried/];
    for (const f of files) for (const re of stale) expect(history(read(f)), `${f}: ${re}`).not.toMatch(re);
  });
  it('every relative markdown link points at a file that exists', () => {
    for (const f of files) for (const m of read(f).matchAll(/\]\(([^)#\s]+?)(?:#[^)]*)?\)/g)) {
      if (/^(https?:|mailto:)/.test(m[1])) continue;
      expect(existsSync(join(dirname(f), m[1])), `${f} -> ${m[1]}`).toBe(true);
    }
  });
});
