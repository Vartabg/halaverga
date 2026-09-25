// Vote results (spec 3.1): one multi-exec reads the round's tally hash and its builds hash, then parses them into public
// aggregates. Notes are counted, never returned. Averages hide until a style has at least 3 ratings.
import { VOTE_DEVICES, VOTE_LABS, VOTE_ROUND, type VoteDevice, type VoteLab, type VoteResults } from '@/lib/vote/shape';
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
const perLab = <T>(f: (id: VoteLab) => T) => Object.fromEntries(VOTE_LABS.map((id) => [id, f(id)])) as Record<VoteLab, T>;
const perDevice = <T>(f: (d: VoteDevice) => T) => Object.fromEntries(VOTE_DEVICES.map((d) => [d, f(d)])) as Record<VoteDevice, T>;

export function toResults(round: string, tally: Record<string, number>, builds: Record<string, number>): VoteResults {
  const get = (k: string) => tally[k] ?? 0;
  return {
    round,
    total: get('total'),
    favorite: perLab((id) => get(`fav:${id}`)),
    favoriteByDevice: perDevice((d) => perLab((id) => get(`favdev:${d}:${id}`))),
    rating: perLab((id) => {
      const n = get(`rn:${id}`);
      return { avg: n >= MIN_RATINGS ? round1(get(`rsum:${id}`) / n) : null, n };
    }),
    tried: perLab((id) => get(`tried:${id}`)),
    device: perDevice((d) => get(`dev:${d}`)),
    builds,
    notes: get('notes'),
    stale: get('stale'),
  };
}

export const readResults: ResultsReader = async (store, ns, round) => {
  const [tally, builds] = await store.exec([['HGETALL', `${ns}:vote:${round}`], ['HGETALL', `${ns}:builds:${round}`]]);
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
