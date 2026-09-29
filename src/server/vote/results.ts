// Vote results (spec 3.1, schema 2): one multi-exec reads the round's tagged tally hash and builds hash, then parses them into
// public aggregates per family (touch, desktop), with a row for every control of the family. Notes are counted, never returned.
// Averages hide until a control has at least 3 ratings. Only the current schema's keys are read, so older data never mixes in.
import { controlsFor } from '@/game/controlTypes';
import { VOTE_DEVICES, VOTE_ROUND, VOTE_SCHEMA, voteKeyTag, type ControlResult, type FamilyResults, type VoteDevice, type VoteResults } from '@/lib/vote/shape';
import type { VoteDeps } from './handlers';
import type { VoteStore } from './store';

export const MIN_RATINGS = 3;
export type ResultsReader = (store: VoteStore, ns: string, round: string) => Promise<VoteResults>;

/** Upstash REST returns HGETALL as a flat [field, value, ...] array; tolerate an object form too. */
export function hashToCounts(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  const put = (k: unknown, v: unknown) => {
    const n = Number(v);
    if (typeof k === 'string' && Number.isFinite(n)) out[k] = n;
  };
  if (Array.isArray(raw)) for (let i = 0; i + 1 < raw.length; i += 2) put(raw[i], raw[i + 1]);
  else if (raw && typeof raw === 'object') for (const [k, v] of Object.entries(raw)) put(k, v);
  return out;
}

const round1 = (x: number) => Math.round(x * 10) / 10;

function family(d: VoteDevice, get: (k: string) => number): FamilyResults {
  const votes = get(`dev:${d}`), controls: FamilyResults['controls'] = {};
  for (const { id } of controlsFor(d)) {
    const favorite = get(`fav:${d}:${id}`), n = get(`rn:${d}:${id}`);
    const row: ControlResult = {
      favorite, share: votes > 0 ? Math.round((100 * favorite) / votes) : 0, tried: get(`tried:${d}:${id}`),
      rating: { avg: n >= MIN_RATINGS ? round1(get(`rsum:${d}:${id}`) / n) : null, n },
    };
    controls[id] = row;
  }
  return { votes, controls };
}

/** Unknown Redis fields (an old family or id) are never looked up, so they cannot appear in the result. */
export function toResults(round: string, tally: Record<string, number>, builds: Record<string, number>): VoteResults {
  const get = (k: string) => tally[k] ?? 0;
  const families = Object.fromEntries(VOTE_DEVICES.map(d => [d, family(d, get)])) as Record<VoteDevice, FamilyResults>;
  return { v: VOTE_SCHEMA, round, total: get('total'), notes: get('notes'), stale: get('stale'), builds, families };
}

export const readResults: ResultsReader = async (store, ns, round) => {
  const tag = voteKeyTag(round);
  const [tally, builds] = await store.exec([['HGETALL', `${ns}:vote:${tag}`], ['HGETALL', `${ns}:builds:${tag}`]]);
  return toResults(round, hashToCounts(tally), hashToCounts(builds));
};

/** GET /api/results. The reader is injected: the route passes the unstable_cache wrapper, tests pass a stub. */
export async function handleResults(deps: Pick<VoteDeps, 'store' | 'ns'>, read: ResultsReader = readResults): Promise<Response> {
  if (!deps.store) return Response.json({ ok: false, error: 'voting-not-set-up' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  try {
    const results = await read(deps.store, deps.ns, VOTE_ROUND);
    return Response.json(results, { headers: { 'Cache-Control': 'public, max-age=0, s-maxage=30' } });
  } catch {
    console.error('[vote] results read failed');
    return Response.json({ ok: false, error: 'store-failed' }, { status: 502, headers: { 'Cache-Control': 'no-store' } });
  }
}
