// Vote server configuration from the environment (spec 8.1). Fails closed: with no usable store, salt or environment the vote
// answers 503 closed after 0 commands. There is no fallback from the salt to the store token (PRIV-1), and a preview deployment
// never shares the production store unless the owner opts in (W5). The instance memo and latch live here, one pair per process.
import { Latch, MemoLimit } from './memo';
import { selectBackend, storeFromEnv, type FetchLike, type VoteEnv, type VoteStore } from './store';

export interface VoteDeps {
  store: VoteStore | null;
  salt: string;
  ns: string;
  onVercel: boolean;
  now: () => number;
  memo: MemoLimit;
  latch: Latch;
}

export const MIN_SALT_LENGTH = 32;
const instanceMemo = new MemoLimit();
const instanceLatch = new Latch();
let logged = false;
// One store per process (CODE-1): the Neon store keeps its DDL-done and last-cleanup state in its closure, so building one per request
// re-sent the DDL prelude and the cleanup with every vote. Keyed by backend, credentials and the production flag (and the injected
// fetch, for tests), so a changed environment builds a new store and an unchanged one reuses it.
let storeCache: { key: string; fetchImpl: FetchLike | undefined; store: VoteStore | null } | null = null;

function cachedStore(env: VoteEnv, fetchImpl?: FetchLike): VoteStore | null {
  const key = `${JSON.stringify(selectBackend(env))}|${env.VERCEL_ENV === 'production'}`;
  if (storeCache && storeCache.key === key && storeCache.fetchImpl === fetchImpl) return storeCache.store;
  const store = storeFromEnv(env, fetchImpl);
  storeCache = { key, fetchImpl, store };
  return store;
}

const envName = (v: string | undefined) => (v === 'production' || v === 'preview' || v === 'development' ? v : v ? 'other' : 'unset');

export function depsFromEnv(env: VoteEnv = process.env, fetchImpl?: FetchLike): VoteDeps {
  const salt = env.VOTE_SALT ?? '';
  const previewOff = env.VERCEL_ENV === 'preview' && env.VOTE_ALLOW_PREVIEW !== '1';
  const store = salt.length >= MIN_SALT_LENGTH && !previewOff ? cachedStore(env, fetchImpl) : null;
  if (!logged) {
    logged = true;
    // Words only: no value, URL, token or salt ever reaches a log.
    console.log(`[vote] config store=${store ? 'ok' : 'missing'} salt=${salt ? (salt.length >= MIN_SALT_LENGTH ? 'ok' : 'short') : 'missing'} env=${envName(env.VERCEL_ENV)}`);
  }
  return {
    store, salt, ns: `hv:${env.VERCEL_ENV || 'local'}`, onVercel: env.VERCEL === '1', now: Date.now,
    memo: instanceMemo, latch: instanceLatch,
  };
}
