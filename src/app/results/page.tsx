// Public vote tally (spec 3.1, schema 2). A server component with no client JS; the tables are in Tally.tsx. connection() keeps
// it request-time; the store read is the same 30 s cached read as /api/results. Notes are counted here, never shown.
import type { Metadata } from 'next';
import { connection } from 'next/server';
import { VOTE_ROUND, type VoteResults } from '@/lib/vote/shape';
import { cachedRead } from '@/server/vote/cachedResults';
import { depsFromEnv } from '@/server/vote/handlers';
import { Notes, Tally } from './Tally';
import s from './results.module.css';

export const metadata: Metadata = { title: 'Halaverga vote results', robots: { index: false, follow: false } };

export default async function ResultsPage() {
  await connection();
  const deps = depsFromEnv();
  let results: VoteResults | null = null;
  let failed = false;
  if (deps.store) {
    try { results = await cachedRead(deps.store, deps.ns, VOTE_ROUND); } catch { failed = true; }
  }
  return (
    <main className={s.page}>
      <h1 className={s.title}>Halaverga vote results</h1>
      {!deps.store && <p role="status">Voting isn&apos;t set up on this deployment yet.</p>}
      {failed && <p role="status">Couldn&apos;t reach the vote store right now. Try again in a minute.</p>}
      {results && <><Tally r={results} /><Notes count={results.notes} ns={deps.ns} round={results.round} /></>}
      <p><a href="/">Back to the game</a></p>
    </main>
  );
}
