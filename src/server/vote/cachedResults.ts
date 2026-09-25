// Cached results read (spec 3.1, M6). This repo does not enable cacheComponents, so the previous caching model applies and
// unstable_cache is the tool (see node_modules/next/dist/docs/01-app/03-api-reference/04-functions/unstable_cache.md).
// The key is fixed per namespace and round, so query strings on /api/results or /results cannot bypass it: Upstash is read
// about once per 30 s per deployment. A throw is not cached, so a store outage recovers on the next request.
// If cacheComponents is ever enabled, replace this with a 'use cache' function plus cacheLife({ revalidate: 30 }).
// Callers must only call this when a store exists (handleResults and the results page check first).
import { unstable_cache } from 'next/cache';
import { readResults, type ResultsReader } from './results';

export const RESULTS_REVALIDATE_S = 30;

export const cachedRead: ResultsReader = (store, ns, round) =>
  unstable_cache(() => readResults(store, ns, round), ['vote-results', ns, round], { revalidate: RESULTS_REVALIDATE_S })();
