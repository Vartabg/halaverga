// Vote storage: Upstash Redis REST (Vercel Marketplace, plain fetch to /multi-exec) or Neon Postgres (neonStore.ts), no npm dependency.
// Only env var NAMES live here; values come from the deployment. Errors never carry the token, the URL or command args.
// storeFromEnv is the one place that picks a backend: handlers and config only ever see a VoteStore.
import { parseNeonUrl } from './neonConn';
import { createNeonStore } from './neonStore';

export type Command = (string | number)[];
/** callBudgetMs: the longest one call may take when the backend has its own figure (Neon 3 s, a cold compute wakes on the first call); absent means STORE_TIMEOUT_MS. */
export interface VoteStore { readonly callBudgetMs?: number; exec(cmds: Command[], opts?: { timeoutMs?: number }): Promise<unknown[]> }
export type VoteEnv = Record<string, string | undefined>;
export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

/** Each store round trip gives up after this long (the handler passes less when its 6 s deadline is near), so a hung store never holds the function open. */
export const STORE_TIMEOUT_MS = 2000;

/** One atomic MULTI/EXEC round trip. Returns each command's result; throws on a non-2xx status, any error entry or a timeout. */
export function createUpstashStore(url: string, token: string, fetchImpl: FetchLike = fetch, timeoutMs = STORE_TIMEOUT_MS): VoteStore {
  const endpoint = `${url.replace(/\/+$/, '')}/multi-exec`;
  return {
    async exec(cmds, opts) {
      const res = await fetchImpl(endpoint, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(cmds),
        signal: AbortSignal.timeout(Math.max(1, opts?.timeoutMs ?? timeoutMs)),
      });
      if (!res.ok) throw new Error(`vote store http ${res.status}`);
      const data: unknown = await res.json();
      if (!Array.isArray(data)) throw new Error('vote store bad reply');
      return data.map((entry) => {
        if (typeof entry !== 'object' || entry === null || 'error' in entry) throw new Error('vote store command failed');
        return (entry as { result?: unknown }).result;
      });
    },
  };
}

/** The Marketplace integration may name the pair UPSTASH_REDIS_REST_* or KV_REST_API_*; either works, UPSTASH_* wins. */
export function envCredentials(env: VoteEnv): { url: string; token: string } | null {
  const url = env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN;
  return url && token ? { url, token } : null;
}

export type Backend = { kind: 'upstash'; url: string; token: string } | { kind: 'neon'; connectionString: string };

/** Upstash wins when its URL and token are both present; else DATABASE_URL (or POSTGRES_URL) when it parses; else null (closed). */
export function selectBackend(env: VoteEnv): Backend | null {
  const c = envCredentials(env);
  if (c) return { kind: 'upstash', url: c.url, token: c.token };
  const cs = (env.DATABASE_URL || env.POSTGRES_URL || '').trim();
  return cs && parseNeonUrl(cs) ? { kind: 'neon', connectionString: cs } : null;
}

/**
 * null when the game must run without voting: no credentials, or a production Upstash URL that is not https (the token would
 * travel in clear; the rule is Upstash only, a Neon connection string always travels over https). The one selection point for a
 * backend. A misconfigured winner is loud (null), never a silent switch to the other database.
 */
export function storeFromEnv(env: VoteEnv, fetchImpl?: FetchLike): VoteStore | null {
  const b = selectBackend(env);
  if (!b) return null;
  if (b.kind === 'neon') return createNeonStore(b.connectionString, fetchImpl);
  if (env.VERCEL_ENV === 'production' && !b.url.startsWith('https://')) return null;
  return createUpstashStore(b.url, b.token, fetchImpl);
}
