// GET /results as a response (CODE-6, WEB-L2, R5, C4): the CDN may keep only a page that shows a real tally. Not set up (503) and a
// failed read (502) are never cached, so a store blip cannot be pinned at the edge; the JSON route does the same. Kept out of route.ts
// so a test can inject the store and the reader.
import { RESULTS_CACHE } from '@/config/securityHeaders';
import { VOTE_ROUND, type VoteResults } from '@/lib/vote/ballot';
import type { VoteDeps } from '@/server/vote/config';
import type { ResultsReader } from '@/server/vote/results';
import { resultsDocument, type ResultsStatus } from './markup';

const page = (status: number, r: VoteResults | null, why: ResultsStatus, cache: string, extra: Record<string, string> = {}) =>
  new Response(resultsDocument(r, why), { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': cache, ...extra } });

export async function respondResults(deps: Pick<VoteDeps, 'store' | 'ns'>, read: ResultsReader): Promise<Response> {
  if (!deps.store) return page(503, null, 'unset', 'no-store', { 'Retry-After': '60' });
  try {
    return page(200, await read(deps.store, deps.ns, VOTE_ROUND), null, RESULTS_CACHE);
  } catch {
    console.error('[vote] results read failed');
    return page(502, null, 'failed', 'no-store', { 'Retry-After': '5' });
  }
}
