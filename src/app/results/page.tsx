// Public vote tally (spec 5.4). A server component with no client JS, ignoring its query string; connection() keeps it request-time.
// The store read is the same shared 120 s snapshot as /api/results. The table markup is in Tally.tsx.
import type { Metadata } from 'next';
import { connection } from 'next/server';
import { VOTE_ROUND, type VoteResults } from '@/lib/vote/ballot';
import { cachedRead } from '@/server/vote/cachedResults';
import { depsFromEnv } from '@/server/vote/config';
import { ResultsView } from './Tally';

export const metadata: Metadata = { title: 'Halaverga vote results', robots: { index: false, follow: false } };

export default async function ResultsPage() {
  await connection();
  const deps = depsFromEnv();
  let results: VoteResults | null = null;
  let failed = false;
  if (deps.store) {
    try { results = await cachedRead(deps.store, deps.ns, VOTE_ROUND); } catch { failed = true; }
  }
  return <ResultsView r={results} status={!deps.store ? 'unset' : failed ? 'failed' : null} />;
}
