// The public tally as plain server markup (spec 5.4, no client JS). One block per family: not enough votes yet, or a table in
// ranking order. Split from page.tsx so tests can render it from a stub result (a page file may only export the page itself).
// Nothing here names the store, its keys, a limit, a build or a count that is not already public.
import { controlsFor, CONTROL_FAMILIES, type ControlFamily } from '@/game/controlTypes';
import type { VoteResults } from '@/lib/vote/ballot';
import s from './results.module.css';

export const NOISE_LINE =
  'Votes, not people. Anonymous counts, a guide, not a ballot. Every vote is weighted the same, one network counts for only a few votes a day, numbers are rounded down to the nearest 5, and the order uses a cautious estimate. Fewer than 200 votes and gaps under 10 points are mostly noise.';
const FAMILY_NAME: Record<ControlFamily, string> = { touch: 'Touch', desktop: 'Desktop' };
const pct = (n: number | null) => Math.min(100, Math.max(0, n ?? 0));

function Bar({ value }: { value: number }) {
  return <span className={s.track} aria-hidden="true"><span className={s.bar} style={{ width: `${pct(value)}%` }} /></span>;
}

function Family({ family, r }: { family: ControlFamily; r: VoteResults }) {
  const f = r.families[family], name = FAMILY_NAME[family];
  const about = f.votes >= 5 ? <p className={s.muted}>About {f.votes} votes so far.</p> : null;
  if (!f.ranked || !f.order || !f.controls) {
    return <section data-testid={`results-${family}`}><h2 className={s.head}>{name} controls</h2><p>Not enough votes for a ranking yet on {name.toLowerCase()}.</p>{about}</section>;
  }
  const label = new Map(controlsFor(family).map((c) => [c.id as string, c.label]));
  return (
    <section data-testid={`results-${family}`}>
      <h2 className={s.head}>{name} controls</h2>
      {about}
      <table className={s.table}>
        <caption className={s.muted}>In ranking order, best first</caption>
        <thead>
          <tr><th scope="col">Control</th><th scope="col">Picked</th><th scope="col">Head to head</th></tr>
        </thead>
        <tbody>
          {f.order.map((id) => {
            const c = f.controls![id];
            return (
              <tr key={id}>
                <th scope="row">{label.get(id) ?? id}</th><td>{c.tried === 0 ? 'under 5 tried' : `about ${c.picked} of ${c.tried} tried`}</td>
                <td><span className={s.share}><Bar value={pct(c.rate)} />{c.rate === null ? 'none yet' : `${c.rate}%`}</span></td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p>Can&apos;t tell: about {f.tie ?? 0}</p>
    </section>
  );
}

export function Tally({ r }: { r: VoteResults }) {
  return (
    <>
      <p className={s.lead}>As of {r.asOf.slice(11, 19)} UTC</p>
      {CONTROL_FAMILIES.map((family) => <Family key={family} family={family} r={r} />)}
      <p className={s.note}>{NOISE_LINE}</p>
    </>
  );
}

/** The whole page body: the tally, or one plain line saying why there is none. */
export function ResultsView({ r, status }: { r: VoteResults | null; status: 'unset' | 'failed' | null }) {
  return (
    <main className={s.page}>
      <h1 className={s.title}>Halaverga vote results</h1>
      {status === 'unset' && <p role="status">Voting isn&apos;t set up on this deployment yet.</p>}
      {status === 'failed' && <p role="status">Couldn&apos;t reach the vote store right now. Try again in a minute.</p>}
      {r && <Tally r={r} />}
      <p><a href="/">Back to the game</a> · <a href="/privacy">How your vote is counted</a></p>
    </main>
  );
}
