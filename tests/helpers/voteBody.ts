import { VOTE_KEY_TAG } from '@/lib/vote/ballot';
import type { VoteDeps } from '@/server/vote/config';
import { handleVote } from '@/server/vote/handlers';
import { Latch, MemoLimit } from '@/server/vote/memo';
import { FakeRedis } from '../fixtures/fake-redis';

// Shared by the U3 server tests: a valid v3 body, a same-origin request carrying it, and deps around a FakeRedis with a fake clock.
export const NS = 'hv:test';
export const SALT = 'test-salt-test-salt-test-salt-test-salt';
export const T0 = Date.UTC(2026, 8, 30, 14, 5, 0);
export const D = '20260930';
export const VOTES = `${NS}:vote:${VOTE_KEY_TAG}`;
export const CTL = `${NS}:ctl`;

let seq = 0xb0000;
export const freshNonce = () => (++seq).toString(16).padStart(32, '0');

/** A valid v3 body (desktop, flow over cursor); `over` replaces or adds fields. A fresh nonce each call unless `over` gives one. */
export const voteBody = (over: Record<string, unknown> = {}): Record<string, unknown> =>
  ({ v: 3, device: 'desktop', favorite: 'flow', tried: ['cursor', 'flow'], last: 'flow', nonce: freshNonce(), ...over });

export interface ReqOpts { ip?: string; headers?: Record<string, string>; onVercel?: boolean }

/** A same-origin browser POST. On Vercel the address is in x-vercel-forwarded-for and a spoofed x-forwarded-for rides along; off it, only the latter. */
export function voteReq(body: unknown = voteBody(), { ip = '203.0.113.9', headers = {}, onVercel = true }: ReqOpts = {}): Request {
  const h: Record<string, string> = {
    host: 'halaverga.test', origin: 'https://halaverga.test', 'sec-fetch-site': 'same-origin', 'content-type': 'application/json',
    'x-forwarded-for': `198.51.100.${(seq % 200) + 1}, 10.0.0.1`,
  };
  if (onVercel) h['x-vercel-forwarded-for'] = ip; else h['x-forwarded-for'] = ip;
  return new Request('https://halaverga.test/api/vote', { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body), headers: { ...h, ...headers } });
}

/** deps around a fresh FakeRedis and a clock the test moves with tick(). `ctl` seeds the owner's knobs. */
export function setup(over: Partial<VoteDeps> = {}, ctl: Record<string, string | number> = {}) {
  let now = T0;
  const redis = new FakeRedis(() => now);
  const deps: VoteDeps = { store: redis, salt: SALT, ns: NS, onVercel: true, now: () => now, memo: new MemoLimit(), latch: new Latch(), ...over };
  const setCtl = (f: Record<string, string | number>) => { if (Object.keys(f).length) redis.admin(['HSET', CTL, ...Object.entries(f).flat()]); };
  setCtl(ctl);
  return { redis, deps, setCtl, tick: (ms: number) => { now += ms; }, at: () => now };
}
export type Setup = ReturnType<typeof setup>;

/** One vote through the handler from `ip` (a fresh body unless `over` is given). */
export const vote = (s: Setup, ip = '203.0.113.9', over: Record<string, unknown> = {}) => handleVote(voteReq(voteBody(over), { ip }), s.deps);
export const json = async (r: Response) => ({ status: r.status, body: await r.json() as Record<string, unknown> });

/** A different /24 for every `i` (0..65535): a fresh block, so no block counter is shared. */
export const blockIp = (i: number) => `10.${(i >> 8) & 255}.${i & 255}.7`;

/** Send `n` votes, the address of request i from ipOf(i); each answer's status and the store commands it cost. */
export async function fire(s: Setup, n: number, ipOf: (i: number) => string, over: (i: number) => Record<string, unknown> = () => ({})) {
  const out: { status: number; cost: number }[] = [];
  for (let i = 0; i < n; i++) {
    const before = s.redis.commands;
    out.push({ status: (await vote(s, ipOf(i), over(i))).status, cost: s.redis.commands - before });
  }
  return out;
}
/** The requests in `out` from index `from` (inclusive) to `to` (exclusive) as a sorted list of `status@cost` counts, e.g. { '200@9': 20 }. */
export function shape(out: { status: number; cost: number }[], from = 0, to = out.length): Record<string, number> {
  const r: Record<string, number> = {};
  for (const { status, cost } of out.slice(from, to)) r[`${status}@${cost}`] = (r[`${status}@${cost}`] ?? 0) + 1;
  return r;
}
