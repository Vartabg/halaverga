// The public tally as one HTML string (spec 5.4, no script, no client JS): the page body and, around it, the whole /results document.
// /results is a route handler (CODE-6), and a route handler cannot import react-dom/server (Next refuses it), so this is a plain string
// builder; every dynamic piece is a number, a registry label or a fixed word, and esc() covers the rest. One block per family: below
// the ranking floor only a count (no bar, no percent, no control name), or a table in ranking order with the noise note for that count
// and, once there are enough picks, the order check. Nothing here names the store, its keys, a limit, a build or a count that is not
// already public.
import { controlsFor, CONTROL_FAMILIES, type ControlFamily } from '@/game/controlTypes';
import type { LastFlown, VoteResults } from '@/lib/vote/ballot';
import { BASE_CSS, RESULTS_CSS } from './resultsCss';

export type ResultsStatus = 'unset' | 'failed' | null;
export const NOISE_LINE =
  'Votes, not people. Anonymous counts, a guide, not a ballot. Every vote is weighted the same, one network counts for only a few votes a day, numbers are rounded down to the nearest 5, and the order uses a cautious estimate.';
const FAMILY_NAME: Record<ControlFamily, string> = { touch: 'Touch', desktop: 'Desktop' };
const pct = (n: number | null) => Math.min(100, Math.max(0, Math.round(n ?? 0)));
const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#x27;' };
export const esc = (s: string | number) => String(s).replace(/[&<>"']/g, (c) => ESC[c]);
export const FIRST_20_LINE = 'The vote measures the first 20 seconds of flying each way.';
/** How far two shares can sit apart by luck alone at `votes` votes: about 340 / sqrt(votes) points (the 95th percentile of the top-to-bottom spread of five equal controls, audit 2026-10-02: 34 at 100, 24 at 200, 17 at 400, 12 at 800, 9 at 1600). */
export const noisePoints = (votes: number): number => Math.round(340 / Math.sqrt(Math.max(1, votes || 1)));
export const noiseNote = (votes: number): string => `With about ${esc(votes)} votes, two controls can end up about ${noisePoints(votes)} points apart by luck alone.`;
/** The order check line: the control flown last against the starting control, and what equal liking would give each. Equal liking, not "no order effect": a control that is simply better liked also leaves that share, so order and liking cannot be told apart from these numbers. */
export const orderNote = (o: LastFlown): string =>
  `Order check, about ${esc(o.n)} votes: the control flown last won ${pct(o.last)}% of picks and the starting control ${pct(o.first)}%. If every control tried were liked equally, each would win about ${pct(o.even)}%. Order and liking cannot be told apart here.`;

const bar = (value: number) => `<span class="vr-track" aria-hidden="true"><span class="vr-bar" style="width:${pct(value)}%"></span></span>`;

function family(fam: ControlFamily, r: VoteResults): string {
  const f = r.families[fam], name = FAMILY_NAME[fam], head = `<section data-testid="results-${fam}"><h2 class="vr-head">${name} controls</h2>`;
  const about = f.votes >= 5 ? `<p class="vr-muted">About ${f.votes} votes so far.</p>` : '';
  if (!f.ranked || !f.order || !f.controls) return `${head}<p>Not enough votes for a ranking yet on ${name.toLowerCase()}.</p>${about}</section>`;
  const label = new Map(controlsFor(fam).map((c) => [c.id as string, c.label]));
  const rows = f.order.map((id) => {
    const c = f.controls![id];
    return `<tr><th scope="row">${esc(label.get(id) ?? id)}</th><td>${c.tried === 0 ? 'under 5 tried' : `about ${c.picked} of ${c.tried} tried`}</td>`
      + `<td><span class="vr-share">${bar(pct(c.rate))}${c.rate === null ? 'none yet' : `${c.rate}%`}</span></td></tr>`;
  }).join('');
  return `${head}${about}<table class="vr-table"><caption class="vr-muted">In ranking order, best first</caption><thead><tr><th scope="col">Control</th>`
    + `<th scope="col">Picked</th><th scope="col">Head to head</th></tr></thead><tbody>${rows}</tbody></table><p>Can&#x27;t tell: about ${f.tie ?? 0}</p>`
    + `<p class="vr-muted">${noiseNote(f.votes)}</p>${f.lastFlown ? `<p class="vr-muted">${orderNote(f.lastFlown)}</p>` : ''}</section>`;
}

/** The tally, or one plain line saying why there is none. */
export function resultsBody(r: VoteResults | null, status: ResultsStatus): string {
  const note = status === 'unset' ? '<p role="status">Voting isn&#x27;t set up on this deployment yet.</p>'
    : status === 'failed' ? '<p role="status">Couldn&#x27;t reach the vote store right now. Try again in a minute.</p>' : '';
  const tally = r ? `<p class="vr-lead">As of ${esc(r.asOf.slice(11, 19))} UTC</p><p class="vr-muted">${FIRST_20_LINE}</p>${CONTROL_FAMILIES.map((f) => family(f, r)).join('')}<p class="vr-fine">${NOISE_LINE}</p>` : '';
  return `<main class="vr-page"><h1 class="vr-title">Halaverga vote results</h1>${note}${tally}<p><a href="/">Back to the game</a> · <a href="/privacy">How your vote is counted</a></p></main>`;
}

/** The whole document: charset, viewport, robots, one inline stylesheet, the body. */
export function resultsDocument(r: VoteResults | null, status: ResultsStatus): string {
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">'
    + '<meta name="robots" content="noindex, nofollow"><meta name="theme-color" content="#162b32"><title>Halaverga vote results</title>'
    + '<link rel="icon" href="/icon.svg" type="image/svg+xml">'
    + `<style>${BASE_CSS}${RESULTS_CSS}</style></head><body>${resultsBody(r, status)}</body></html>`;
}
