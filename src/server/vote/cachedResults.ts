// The one shared results snapshot (spec 5.3). A module-level single flight replaces unstable_cache: in this Next version its cache
// is per request, so it cannot bound the reads. Fresh (under the TTL) is served with 0 commands; stale or none makes one shared read
// that every concurrent request awaits, so the first visitor after an idle spell never gets an old copy (no background refresh, R7).
// A failed read is not retried for 15 s: the stale snapshot is served (its asOf is honest), or the error when there is none.
// Callers must only call this when a store exists (handleResults and the results page check first).
import type { VoteResults } from '@/lib/vote/ballot';
import { readResults, type ResultsReader } from './results';

export const RESULTS_TTL_MS = 120_000;
export const RESULTS_RETRY_MS = 15_000;

export function createResultsCache(read: ResultsReader, ttlMs = RESULTS_TTL_MS, now: () => number = Date.now): ResultsReader {
  let snap: { key: string; at: number; value: VoteResults } | null = null;
  let inflight: { key: string; p: Promise<VoteResults> } | null = null;
  let failedUntil = 0;
  return (store, ns, round) => {
    const key = `${ns}|${round}`, t = now();
    const mine = snap && snap.key === key ? snap : null;
    if (mine && t - mine.at < ttlMs) return Promise.resolve(mine.value);
    if (t < failedUntil) return mine ? Promise.resolve(mine.value) : Promise.reject(new Error('vote results unavailable'));
    if (inflight?.key === key) return inflight.p;
    const p = new Promise<VoteResults>((res) => res(read(store, ns, round, t))).then(
      (value) => { snap = { key, at: now(), value }; return value; },
      (e: unknown) => { failedUntil = now() + RESULTS_RETRY_MS; if (mine) return mine.value; throw e; },
    ).finally(() => { if (inflight?.p === p) inflight = null; });
    inflight = { key, p };
    return p;
  };
}

export const cachedRead: ResultsReader = createResultsCache(readResults);
