// Vote results (spec 5.3): one exec reads the vote hash, the void set and the ctl knobs, and aggregate() turns them into public
// numbers per family. The tally is computed on read, so the owner's void set, `cap` and `minv` re-score it and nothing else can.
import { VOTE_KEY_TAG, VOTE_ROUND, type VoteResults } from '@/lib/vote/ballot';
import { aggregate, hashToPairs } from './aggregate';
import type { VoteDeps } from './config';
import { CTL_FIELDS, limitsFrom } from './limits';
import { refuse } from './guards';
import type { VoteStore } from './store';

export type ResultsReader = (store: VoteStore, ns: string, round: string, now?: number) => Promise<VoteResults>;

export const readResults: ResultsReader = async (store, ns, round, now = Date.now()) => {
  if (round !== VOTE_ROUND) throw new Error('vote results: unknown round'); // only the current round has a key tag and a scorer
  const rt = VOTE_KEY_TAG;
  const out = await store.exec([['HGETALL', `${ns}:vote:${rt}`], ['SMEMBERS', `${ns}:void:${rt}`], ['HMGET', `${ns}:ctl`, ...CTL_FIELDS]]);
  if (out.length !== 3 || !Array.isArray(out[2])) throw new Error('vote results: bad reply');
  const limits = limitsFrom(out[2]);
  // open is false when the owner closed voting and also when the round is full (F3), so the card says so instead of "try again later".
  const open = limits.mode === 'open' && hashToPairs(out[0]).length < limits.max;
  return aggregate(out[0], out[1], { cap: limits.cap, minVotes: limits.minv }, now, open);
};

/** GET /api/results. The reader is injected: the route passes the shared single-flight cache, tests pass a stub. */
export async function handleResults(deps: Pick<VoteDeps, 'store' | 'ns'>, read: ResultsReader = readResults): Promise<Response> {
  if (!deps.store) return refuse(503, 'closed', { 'Retry-After': '60' });
  try {
    const results = await read(deps.store, deps.ns, VOTE_ROUND);
    return Response.json(results, { headers: { 'Cache-Control': 'public, max-age=0, s-maxage=120' } });
  } catch {
    console.error('[vote] results read failed');
    return refuse(502, 'store-failed', { 'Retry-After': '5' });
  }
}
