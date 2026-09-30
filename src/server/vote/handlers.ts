// POST /api/vote (spec 2, 3, 4.1), kept out of the route file so tests can inject every dependency. Checks run in a fixed order and
// each one costs less than the next: store present, the instance latch, origin, content type, declared size, the streamed body
// (2 s), the shape, the abusive-key memo (0 commands), the half-open latch claim, gate A (5), gate B (6, new ballots only), the write
// (1). Every refusal is honest: a vote that is not stored answers an error, never ok, and a Retry-After is only sent when it is true.
// Nothing here logs or echoes an address, a body, a nonce, a key or a token.
import { parseVote, mediaType, VOTE_KEY_TAG } from '@/lib/vote/ballot';
import { encodeEntry } from '@/lib/vote/entry';
import { clientAddress } from './clientIp';
import type { VoteDeps } from './config';
import { gateA, gateB, readGateA, readGateB, routeAfterA, routeAfterB, writeEntry } from './gate';
import { readBody, refuse, sameOrigin } from './guards';
import { secondsToUtcMidnight, utcDate, utcHour } from './limits';
import { voteKeys } from './netkeys';
import { STORE_TIMEOUT_MS, type Command } from './store';

/** The handler's total time, body read included: each store call gets min(the store's call budget, what is left). */
export const HANDLER_DEADLINE_MS = 6000;
/** 429 later. `after` is the true wait in seconds (the counters start over at UTC midnight), or null when it will not lift by itself. */
const later = (after: number | null) => refuse(429, 'later', after === null ? {} : { 'Retry-After': String(after) });
const answer = (h: { status: number; error: string; retryAfter: number | null }) => refuse(h.status, h.error, h.retryAfter === null ? {} : { 'Retry-After': String(h.retryAfter) });
const closed = () => refuse(503, 'closed', { 'Retry-After': '60' });

export function methodNotAllowed(): Response {
  return refuse(405, 'method', { Allow: 'POST' });
}

export async function handleVote(req: Request, deps: VoteDeps): Promise<Response> {
  const { store, latch, memo } = deps;
  const t0 = deps.now();
  if (!store) return closed();
  const held = latch.check(t0);
  if (held) return answer(held);
  if (!sameOrigin(req)) return refuse(403, 'cross-site');
  if (mediaType(req.headers.get('content-type')) !== 'application/json') return refuse(415, 'json-only');
  const body = await readBody(req);
  if (!body.ok) return refuse(body.status, body.error);
  const parsed = parseVote(body.text);
  if (!parsed.ok) return parsed.status === 413 ? refuse(413, 'too-large') : refuse(400, 'bad-vote');
  const { vote } = parsed;

  const now = deps.now(), day = utcDate(now);
  const keys = voteKeys(clientAddress(req.headers, deps.onVercel), deps.salt, now);
  memo.attempt(keys.unit, day);
  const midnight = secondsToUtcMidnight(now);
  if (memo.over(keys.unit, day, memo.limits.unit) || memo.over(keys.block, day, memo.limits.block)) return later(midnight);

  const { ns } = deps;
  const run = (cmds: Command[]) => {
    const left = HANDLER_DEADLINE_MS - (deps.now() - t0);
    if (left <= 0) throw new Error('vote deadline');
    return store.exec(cmds, { timeoutMs: Math.min(store.callBudgetMs ?? STORE_TIMEOUT_MS, left) });
  };
  const stop = (ms: number, status: 429 | 503, error: string, retryAfter: number | null) => latch.set(deps.now() + ms, status, error, retryAfter);
  const kept = latch.claim(deps.now()); // an expired latch lets exactly one request through to probe the store
  if (kept) return answer(kept);
  const probe = latch.probing; // true only for the request that claimed the expired latch
  try {
    const a = readGateA(await run(gateA(ns, VOTE_KEY_TAG, day, keys, vote.nonce)));
    memo.limits = a.limits;
    const first = routeAfterA(a);
    if (first === 'closed') { stop(30_000, 503, 'closed', 60); return closed(); }
    if (first === 'refuse-latch') { stop(60_000, 429, 'later', null); return later(null); } // the ceiling: the round is full
    if (first === 'refuse') return later(midnight);
    if (first === 'gateB') {
      memo.attempt(keys.block, day); // only a request that got past the unit limit counts against its block, here and in the store
      const b = readGateB(await run(gateB(ns, day, keys)));
      const second = routeAfterB(b, a);
      if (second === 'refuse-latch') { stop(60_000, 429, 'later', midnight); return later(midnight); }
      if (second === 'refuse') return later(midnight);
      if (second === 'refuse-round') return later(null);
      const entry = encodeEntry(vote, utcHour(now), keys.tag);
      const wrote = (await run(writeEntry(ns, VOTE_KEY_TAG, vote.nonce, entry)))[0];
      if (wrote !== 0 && wrote !== 1) throw new Error('vote write: bad reply'); // 0 is the same nonce resent: counted once, still ok
    } // replay: this nonce is already stored, still ok, and it spent no block, round or day budget
  } catch {
    latch.set(deps.now() + 5000, 502, 'store-failed', 5);
    console.error('[vote] store request failed');
    return refuse(502, 'store-failed', { 'Retry-After': '5' });
  } finally {
    if (probe) latch.settle(); // C1: the probe ends with the whole decision, not with gate A, so a day's-limit latch is set again before anyone else may probe
  }
  return Response.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
}
