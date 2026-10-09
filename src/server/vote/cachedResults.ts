// The one shared results snapshot (spec 5.3). A module-level single flight replaces unstable_cache: in this Next version its cache
// is per request, so it cannot bound the reads. Fresh (under the TTL) is served with 0 commands; stale or none makes one shared read
// that every concurrent request awaits, so the first visitor after an idle spell never gets an old copy (no background refresh, R7).
// A failed read is not retried for 15 s: the stale snapshot is served (its asOf is honest) but only for RESULTS_MAX_STALE_MS from its
// read, after that the error is (C5, R6: an outage or a mistyped key shows as an error, never as an old tally for ever), and every
// failed read logs one fixed line. The instance is per process, not per route bundle (WEB-L1): see shared.ts.
// Callers must only call this when a store exists (the results routes check first).
import type { VoteResults } from '@/lib/vote/ballot';
import { readResults, type ResultsReader } from './results';
import { once } from './shared';

export const RESULTS_TTL_MS = 120_000;
export const RESULTS_RETRY_MS = 15_000;
/** How long after its read a snapshot may still be served while the store cannot be read. */
export const RESULTS_MAX_STALE_MS = 600_000;

export function createResultsCache(read: ResultsReader, ttlMs = RESULTS_TTL_MS, now: () => number = Date.now, maxStaleMs = RESULTS_MAX_STALE_MS): ResultsReader {
  let snap: { key: string; at: number; value: VoteResults } | null = null;
  let inflight: { key: string; p: Promise<VoteResults> } | null = null;
  let failedUntil = 0;
  return (store, ns, round) => {
    const key = `${ns}|${round}`, t = now();
    const mine = snap && snap.key === key ? snap : null;
    if (mine && t - mine.at < ttlMs) return Promise.resolve(mine.value);
    const usable = (at: number) => mine !== null && at - mine.at < maxStaleMs;
    if (t < failedUntil) return usable(t) ? Promise.resolve(mine!.value) : Promise.reject(new Error('vote results unavailable'));
    if (inflight?.key === key) return inflight.p;
    const p = new Promise<VoteResults>((res) => res(read(store, ns, round, t))).then(
      (value) => { snap = { key, at: now(), value }; return value; },
      (e: unknown) => {
        failedUntil = now() + RESULTS_RETRY_MS;
        console.error('[vote] results refresh failed');
        if (usable(now())) return mine!.value;
        throw e;
      },
    ).finally(() => { if (inflight?.p === p) inflight = null; });
    inflight = { key, p };
    return p;
  };
}

export const cachedRead: ResultsReader = once('results', () => createResultsCache(readResults));
