// The public tally as plain server markup (no client JS): one table per family in registry order, then builds, stale votes and
// the notes count. Split from page.tsx so tests can render it with results read from a stub store (a page file may only export
// the page itself).
import { controlsFor, CONTROL_FAMILIES, type ControlFamily } from '@/game/controlTypes';
import { voteKeyTag, type VoteResults } from '@/lib/vote/shape';
import { MIN_RATINGS } from '@/server/vote/results';
import s from './results.module.css';

export const UNVERIFIED_LINE = 'Anonymous, unverified counts, so treat them as a guide, not a ballot.';
const FAMILY_NAME: Record<ControlFamily, string> = { touch: 'Touch', desktop: 'Desktop' };

function Bar({ value }: { value: number }) {
  return <span className={s.track} aria-hidden="true"><span className={s.bar} style={{ width: `${value}%` }} /></span>;
}

function FamilyTable({ family, r }: { family: ControlFamily; r: VoteResults }) {
  const f = r.families[family];
  return (
    <table className={s.table} data-testid={`results-${family}`}>
      <caption>{FAMILY_NAME[family]}: {f.votes} {f.votes === 1 ? 'vote' : 'votes'}</caption>
      <thead>
        <tr>
          <th scope="col">Control</th><th scope="col">Favorite votes</th><th scope="col">Share</th>
          <th scope="col">Tried</th><th scope="col">Mean rating</th><th scope="col">Ratings</th>
        </tr>
      </thead>
      <tbody>
        {controlsFor(family).map(({ id, label }) => {
          const c = f.controls[id] ?? { favorite: 0, share: 0, tried: 0, rating: { avg: null, n: 0 } };
          return (
            <tr key={id}>
              <th scope="row">{label}</th><td>{c.favorite}</td>
              <td><span className={s.share}><Bar value={c.share} />{c.share}%</span></td>
              <td>{c.tried}</td>
              <td>{c.rating.avg === null ? <span className={s.muted}>fewer than {MIN_RATINGS} ratings</span> : c.rating.avg.toFixed(1)}</td>
              <td>{c.rating.n}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function Tally({ r }: { r: VoteResults }) {
  const builds = Object.entries(r.builds).sort((a, b) => b[1] - a[1]);
  return (
    <>
      <p className={s.lead}>Round {r.round} · {r.total} {r.total === 1 ? 'vote' : 'votes'}</p>
      <p>{UNVERIFIED_LINE} The only protection against repeat votes is a limit of 20 votes per hour from one network.</p>
      {CONTROL_FAMILIES.map((family) => <FamilyTable key={family} family={family} r={r} />)}
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

export function Notes({ count, ns, round }: { count: number; ns: string; round: string }) {
  return (
    <p className={s.note}>
      {count} {count === 1 ? 'note' : 'notes'} written. Notes are private and deleted after about 90 days. Read them in
      Vercel → Storage → Open in Upstash → Data Browser, keys starting <code>{`${ns}:notes:${voteKeyTag(round)}:`}</code>
    </p>
  );
}
