import { expect, vi } from 'vitest';
import type { Command, FetchLike } from '@/server/vote/store';
import type { FakeNeon } from './fakeNeon';

// Shared by the Neon store tests: a connection string with markers in every secret part, a canned fetch, and the error surface scan.
export const PW = 'PW-SECRET-7f3', USER = 'neonuser', HOST = 'ep-test.us-east-2.aws.neon.tech', PARAM = 'PARAM-MARK-91';
export const CS = `postgresql://${USER}:${PW}@${HOST}/neondb?sslmode=require&channel_binding=require`;
export const INCR: Command[] = [['INCR', 'k']];
export const queriesOf = (n: FakeNeon, i: number) => n.calls[i].queries.map((q) => q.query);
export const spies = () => (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}));

/** A fetch that answers with `status` and `body` (a function of the request's entry count for a 200 envelope). */
export const canned = (status: number, body: unknown | ((n: number) => unknown), headers: Record<string, string> = { 'content-type': 'application/json' }): FetchLike & { n: number } => {
  const f = Object.assign(async (_: string, init: RequestInit) => {
    f.n++;
    const n = (JSON.parse(String(init.body)) as { queries: unknown[] }).queries.length;
    const b = typeof body === 'function' ? (body as (n: number) => unknown)(n) : body;
    return new Response(typeof b === 'string' ? b : JSON.stringify(b), { status, headers });
  }, { n: 0 });
  return f;
};
/** A 200 envelope of n results, all empty except index i (a store's first exec carries 5 DDL entries, so its one command is index 5). */
export const rowsAt = (i: number, rows: unknown) => (n: number) => ({ results: Array.from({ length: n }, (_, j) => ({ rows: j === i ? rows : [] })) });
/** Every thrown property, stringified: what a log or a client could ever see. */
export const surface = (e: unknown) => JSON.stringify(Object.getOwnPropertyNames(e as object).map((k) => String((e as Record<string, unknown>)[k]))) + JSON.stringify((e as { cause?: unknown }).cause ?? null);
export const MARKERS = [PW, USER, HOST, CS, 'SECRET-BODY', PARAM];
