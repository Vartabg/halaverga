// VoteStore over Neon Postgres SQL-over-HTTP (spec-neon 1 to 5), plain fetch, no driver. One exec is one POST with {queries: [...]}:
// one Postgres transaction at READ COMMITTED, all or nothing, replies positional. The tables are created lazily inside the first
// batch of each server instance (idempotent DDL behind an advisory lock). The connection string lives only in the closure and in one
// request header. Errors are fixed strings: no response body, parameter, key, host or fetch cause ever reaches a message or a log.
import { parseNeonUrl } from './neonConn';
import { CLEAN, CLEAN_EVERY_MS, DDL, MISSING_TABLE, NEON_TIMEOUT_MS, RACE_CODES } from './neonSchema';
import { SQL, translate, type NeonStmt } from './neonSql';
import type { FetchLike, VoteStore } from './store';

const RETRY_MIN_MS = 250;
type StoreError = Error & { sqlstate?: string };
const fail = (m: string) => new Error(`vote store ${m}`);

async function drop(res: Response) { try { await res.body?.cancel(); } catch { /* nothing to release */ } }

/** The five-character SQLSTATE of a 400 body and nothing else of it, or undefined. */
async function sqlstate(res: Response): Promise<string | undefined> {
  try {
    const code = ((await res.json()) as { code?: unknown } | null)?.code;
    return typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code) ? code : undefined;
  } catch { return undefined; }
}

export function createNeonStore(
  connectionString: string, fetchImpl: FetchLike = fetch, timeoutMs: number = NEON_TIMEOUT_MS, now: () => number = Date.now,
): VoteStore & { callBudgetMs: number } {
  const conn = parseNeonUrl(connectionString);
  if (!conn) throw fail('bad connection string');
  const { endpoint } = conn;
  let ready = false, lastClean = -Infinity;

  /** One POST; resolves to the `results` array (length checked) or throws a fixed-string error. */
  async function post(stmts: NeonStmt[], ms: number): Promise<{ rows?: unknown }[]> {
    const signal = AbortSignal.timeout(Math.max(1, Math.floor(ms)));
    const timedOut = (e: unknown) => signal.aborted || (typeof e === 'object' && e !== null && (e as { name?: unknown }).name === 'TimeoutError');
    const network = (e: unknown) => { const err = fail('network'); if (timedOut(e)) err.name = 'TimeoutError'; return err; };
    let res: Response;
    try {
      res = await fetchImpl(endpoint, {
        method: 'POST',
        headers: {
          'Neon-Connection-String': connectionString, 'Neon-Raw-Text-Output': 'true', 'Neon-Array-Mode': 'true',
          'Neon-Batch-Isolation-Level': 'ReadCommitted', 'Content-Type': 'application/json',
        },
        body: JSON.stringify({ queries: stmts }),
        redirect: 'error', // a redirect would forward the connection-string header to another host
        signal,
      });
    } catch (e) { throw network(e); }
    if (!res.ok) {
      const err: StoreError = fail(`http ${res.status}`);
      if (res.status === 400) err.sqlstate = await sqlstate(res); else await drop(res);
      throw err;
    }
    let data: unknown;
    try { data = await res.json(); } catch (e) { throw timedOut(e) ? network(e) : fail('bad reply'); }
    const results = (data as { results?: unknown } | null)?.results;
    if (!Array.isArray(results) || results.length !== stmts.length) throw fail('bad reply');
    return results;
  }

  return {
    callBudgetMs: timeoutMs,
    async exec(cmds, opts) {
      const { stmts, maps } = translate(cmds);
      const start = now(), budget = Math.max(1, opts?.timeoutMs ?? timeoutMs), deadline = start + budget;
      // Space cleanup rides at most once per 10 minutes on a batch that writes a counter; recorded when added, not when it succeeds.
      const clean = stmts.some((s) => s.query === SQL.setnx || s.query === SQL.incr) && start - lastClean >= CLEAN_EVERY_MS;
      if (clean) lastClean = start;
      const pre: NeonStmt[] = ready ? [] : DDL.map((query) => ({ query, params: [] }));
      const all = [...pre, ...stmts, ...(clean ? [{ query: CLEAN, params: [] }] : [])];
      let results;
      try {
        try { results = await post(all, budget); } catch (e) {
          const left = deadline - now();
          if (!pre.length || !RACE_CODES.includes((e as StoreError).sqlstate ?? '') || left < RETRY_MIN_MS) throw e;
          results = await post(all, left); // the concurrent-DDL race, once, inside the same deadline
        }
      } catch (e) {
        if (!pre.length && (e as StoreError).sqlstate === MISSING_TABLE) ready = false; // dropped tables: the next batch recreates them
        throw e;
      }
      if (pre.length) ready = true;
      try { return maps.map((map, i) => map(results[pre.length + i]?.rows as never)); } catch { throw fail('bad reply'); }
    },
  };
}
