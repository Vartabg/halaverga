// Public vote tally (spec 3.1). A server component with no client JS. connection() keeps it request-time; the store read
// is the same 30 s cached read as /api/results. Notes are counted here, never shown.
import type { Metadata } from 'next';
import { connection } from 'next/server';
import { VOTE_LABS, VOTE_ROUND, type VoteLab, type VoteResults } from '@/lib/vote/shape';
import { cachedRead } from '@/server/vote/cachedResults';
import { depsFromEnv } from '@/server/vote/handlers';
import s from './results.module.css';

export const metadata: Metadata = { title: 'Halaverga vote results', robots: { index: false, follow: false } };

const NAMES: Record<VoteLab, string> = { standard: 'Standard', draw: 'Draw', conduct: 'Conduct', brush: 'Brush' };
const pct = (n: number, of: number) => (of > 0 ? Math.round((n / of) * 100) : 0);

function Bar({ value }: { value: number }) {
  return <span className={s.track} aria-hidden="true"><span className={s.bar} style={{ width: `${value}%` }} /></span>;
}

function Tally({ r }: { r: VoteResults }) {
  const builds = Object.entries(r.builds).sort((a, b) => b[1] - a[1]);
  return (
    <>
      <p className={s.lead}>Round {r.round} · {r.total} {r.total === 1 ? 'vote' : 'votes'}</p>
      <table className={s.table}>
        <caption>Favorite style</caption>
        <thead><tr><th scope="col">Style</th><th scope="col">Votes</th><th scope="col">Share</th></tr></thead>
        <tbody>
          {VOTE_LABS.map((id) => (
            <tr key={id}>
              <th scope="row">{NAMES[id]}</th><td>{r.favorite[id]}</td>
              <td><span className={s.share}><Bar value={pct(r.favorite[id], r.total)} />{pct(r.favorite[id], r.total)}%</span></td>
            </tr>
          ))}
        </tbody>
      </table>
      <table className={s.table}>
        <caption>Average rating (1 low, 5 high)</caption>
        <thead><tr><th scope="col">Style</th><th scope="col">Average</th><th scope="col">Ratings</th></tr></thead>
        <tbody>
          {VOTE_LABS.map((id) => (
            <tr key={id}>
              <th scope="row">{NAMES[id]}</th>
              <td>{r.rating[id].avg === null ? <span className={s.muted}>fewer than 3 ratings</span> : r.rating[id].avg.toFixed(1)}</td>
              <td>{r.rating[id].n}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <table className={s.table}>
        <caption>Who tried each style, and favorites by device</caption>
        <thead><tr><th scope="col">Style</th><th scope="col">Tried</th><th scope="col">Favorite on touch</th><th scope="col">Favorite on desktop</th></tr></thead>
        <tbody>
          {VOTE_LABS.map((id) => (
            <tr key={id}>
              <th scope="row">{NAMES[id]}</th><td>{r.tried[id]}</td>
              <td>{r.favoriteByDevice.touch[id]}</td><td>{r.favoriteByDevice.desktop[id]}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <table className={s.table}>
        <caption>Devices</caption>
        <thead><tr><th scope="col">Device</th><th scope="col">Votes</th></tr></thead>
        <tbody>
          <tr><th scope="row">Touch</th><td>{r.device.touch}</td></tr>
          <tr><th scope="row">Desktop</th><td>{r.device.desktop}</td></tr>
        </tbody>
      </table>
      <table className={s.table}>
        <caption>Game version at the time of the vote</caption>
        <thead><tr><th scope="col">Build</th><th scope="col">Votes</th></tr></thead>
        <tbody>
          {builds.length === 0
            ? <tr><td colSpan={2} className={s.muted}>No votes yet.</td></tr>
            : builds.map(([b, n]) => <tr key={b}><th scope="row">{b}</th><td>{n}</td></tr>)}
        </tbody>
      </table>
      <p>Votes sent from a tab opened before the latest deploy: {r.stale}.</p>
    </>
  );
}

function Notes({ count, ns, round }: { count: number; ns: string; round: string }) {
  return (
    <p className={s.note}>
      {count} {count === 1 ? 'note' : 'notes'} written. Notes are private and deleted after about 90 days. Read them in
      Vercel → Storage → Open in Upstash → Data Browser, keys starting <code>{`${ns}:notes:${round}:`}</code>
    </p>
  );
}

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
