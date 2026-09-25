// Vote storage over the Upstash Redis REST API (Vercel Marketplace), plain fetch to /multi-exec, no npm dependency.
// Only env var NAMES live here; values come from the deployment. Errors never carry the token, the URL or command args.
export type Command = (string | number)[];
export interface VoteStore { exec(cmds: Command[]): Promise<unknown[]> }
export type VoteEnv = Record<string, string | undefined>;
type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

/** One atomic MULTI/EXEC round trip. Returns each command's result; throws on a non-2xx status or any error entry. */
export function createUpstashStore(url: string, token: string, fetchImpl: FetchLike = fetch): VoteStore {
  const endpoint = `${url.replace(/\/+$/, '')}/multi-exec`;
  return {
    async exec(cmds) {
      const res = await fetchImpl(endpoint, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(cmds),
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

/** null when either the URL or the token is missing: the game still works and voting reports it is not set up. */
export function storeFromEnv(env: VoteEnv, fetchImpl?: FetchLike): VoteStore | null {
  const c = envCredentials(env);
  return c ? createUpstashStore(c.url, c.token, fetchImpl) : null;
}
