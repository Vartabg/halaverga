import { SQL } from '@/server/vote/neonSql';
import type { FetchLike } from '@/server/vote/store';

// An in-process stand-in for Neon's SQL-over-HTTP endpoint, as a FetchLike (no TCP port). It speaks the documented contract of
// spec-neon 1: POST /sql, the five headers, {queries: [{query, params}]}, one transaction per request, {results: [{rows, ...}]} in
// raw text and array mode, 400 with {message, code} on a SQL error. Anything off contract is recorded in `violations` and answered
// 400. It applies the eight statement constants to in-memory tables with the semantics of spec-neon 4 (expiry by the database clock,
// upserts, ON CONFLICT DO NOTHING). Real Postgres proves those semantics (tests/pg); this proves the wiring around them.
export interface Call { url: string; headers: Record<string, string>; queries: { query: string; params: string[] }[]; at: number }
type Kv = Map<string, { v: string; exp: number | null }>;
interface State { kv: Kv; hash: Map<string, Map<string, string>>; set: Map<string, Set<string>>; tables: boolean }
const HEADERS = ['content-type', 'neon-array-mode', 'neon-batch-isolation-level', 'neon-connection-string', 'neon-raw-text-output'];
const sqlError = (code: string): never => { throw Object.assign(new Error('sql'), { code }); };
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

export class FakeNeon {
  calls: Call[] = [];
  violations: string[] = [];
  st: State = { kv: new Map(), hash: new Map(), set: new Map(), tables: false };
  /** Consumed one per request, before the batch runs; return a Response to answer with it, or undefined to go on. */
  hooks: ((c: Call, signal: AbortSignal | null | undefined) => Response | Promise<Response> | undefined)[] = [];
  private race: string | null = null;
  constructor(public clock: () => number = () => 0, private expectConnection?: string, private host = 'ep-test.us-east-2.aws.neon.tech') {}

  fetch: FetchLike = async (url, init) => {
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries((init.headers ?? {}) as Record<string, string>)) headers[k.toLowerCase()] = v;
    let queries: Call['queries'] = [];
    try { queries = (JSON.parse(String(init.body)) as { queries: Call['queries'] }).queries; } catch { /* reported below */ }
    const call: Call = { url, headers, queries, at: this.clock() };
    this.calls.push(call);
    const v = this.check(url, init, call);
    if (v) { this.violations.push(v); return json(400, { message: 'contract' }); }
    const hook = this.hooks.shift();
    const forced = hook?.(call, init.signal);
    if (forced) return forced;
    const snap = structuredClone(this.st);
    try {
      const results = queries.map((q) => this.run(q.query, q.params));
      return json(200, { results: results.map((rows) => ({ fields: [], rows, command: 'SELECT', rowCount: rows.length, rowAsArray: true })) });
    } catch (e) {
      this.st = snap; // one transaction: nothing of a failed batch survives
      return json(400, { message: 'error', code: (e as { code?: string }).code ?? 'XX000' });
    }
  };

  private check(url: string, init: RequestInit, c: Call): string | null {
    if (url !== `https://${this.host}/sql`) return `url ${url}`;
    if (init.method !== 'POST') return 'method';
    if (Object.keys(c.headers).sort().join() !== HEADERS.join()) return `headers ${Object.keys(c.headers)}`;
    const h = c.headers;
    if (h['neon-raw-text-output'] !== 'true' || h['neon-array-mode'] !== 'true' || h['neon-batch-isolation-level'] !== 'ReadCommitted') return 'header values';
    if (this.expectConnection !== undefined && h['neon-connection-string'] !== this.expectConnection) return 'connection string';
    if (!Array.isArray(c.queries) || !c.queries.length || Object.keys(JSON.parse(String(init.body))).join() !== 'queries') return 'body';
    for (const q of c.queries) {
      if (Object.keys(q).sort().join() !== 'params,query' || !q.params.every((p) => typeof p === 'string')) return 'entry';
      if (/;\s*\S/.test(q.query)) return 'two statements in one entry';
    }
    return init.signal ? null : 'no signal';
  }

  /** The owner's console: what the runbook SQL does (an upsert, a delete, an insert), as a direct edit. */
  setHash(k: string, field: string, value: string) { (this.st.hash.get(k) ?? this.st.hash.set(k, new Map()).get(k)!).set(field, value); }
  delHash(k: string, field: string) { this.st.hash.get(k)?.delete(field); }
  addMember(k: string, m: string) { (this.st.set.get(k) ?? this.st.set.set(k, new Set()).get(k)!).add(m); }
  hash = (k: string) => Object.fromEntries(this.st.hash.get(k) ?? []);
  members = (k: string) => [...(this.st.set.get(k) ?? [])].sort();
  kv = (k: string) => this.st.kv.get(k);
  drop() { this.st = { kv: new Map(), hash: new Map(), set: new Map(), tables: false }; }
  /** The next batch that carries the DDL fails with `code` as if another instance created the tables a moment earlier. */
  raceOnce(code: string) { this.race = code; }

  private live(k: string) { const r = this.st.kv.get(k); return r && (r.exp === null || r.exp > this.clock()) ? r : undefined; }
  private run(query: string, p: string[]): (string | null)[][] {
    if (query.startsWith('SELECT pg_advisory_xact_lock')) return [['']];
    if (query.startsWith('CREATE TABLE IF NOT EXISTS public.hv_kv')) {
      if (this.race) { const code = this.race; this.race = null; this.st.tables = true; sqlError(code); }
      this.st.tables = true; return [];
    }
    if (query.startsWith('CREATE ')) return [];
    if (!this.st.tables) return sqlError('42P01');
    const { kv, hash, set } = this.st;
    switch (query) {
      case SQL.setnx: {
        if (this.live(p[0])) return [];
        kv.set(p[0], { v: p[1], exp: this.clock() + Number(p[2]) * 1000 }); return [['1']];
      }
      case SQL.incr: {
        const r = this.live(p[0]);
        if (!r) { kv.set(p[0], { v: '1', exp: null }); return [['1']]; } // missing or expired: restarts at 1 with no expiry
        if (!/^-?[0-9]+$/.test(r.v)) sqlError('22P02');
        r.v = String(Number(r.v) + 1); return [[r.v]];
      }
      case SQL.decr: {
        const r = this.live(p[0]);
        if (!r) { kv.set(p[0], { v: '-1', exp: null }); return [['-1']]; }
        if (!/^-?[0-9]+$/.test(r.v)) sqlError('22P02');
        r.v = String(Number(r.v) - 1); return [[r.v]];
      }
      case SQL.hmget: return (JSON.parse(p[1]) as string[]).map((f) => [hash.get(p[0])?.get(f) ?? null]);
      case SQL.hlen: return [[String(hash.get(p[0])?.size ?? 0)]];
      case SQL.hsetnx: {
        const m = hash.get(p[0]) ?? hash.set(p[0], new Map()).get(p[0])!;
        if (m.has(p[1])) return [];
        m.set(p[1], p[2]); return [['1']];
      }
      case SQL.hgetall: return [...(hash.get(p[0]) ?? [])].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([f, v]) => [f, v]);
      case SQL.smembers: return [...(set.get(p[0]) ?? [])].sort().map((m) => [m]);
      default: if (query.startsWith('DELETE FROM public.hv_kv')) { for (const [k, r] of kv) if (r.exp !== null && r.exp <= this.clock()) kv.delete(k); return []; }
        return sqlError('42601');
    }
  }
}
