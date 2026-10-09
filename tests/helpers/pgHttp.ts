import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import type { FetchLike } from '@/server/vote/store';

// A real throwaway PostgreSQL behind a Neon-shaped /sql endpoint, for tests/pg (pnpm test:pg). It uses the psql, initdb and pg_ctl
// binaries already on the machine, a unix socket only (no TCP listener, no port), and deletes everything on stop. No package, no
// credential, no network. It proves the SQL and the row mappers; the HTTP wire format is covered by fixtures and the live check.
const CANDIDATES = ['/opt/homebrew/opt/postgresql@15/bin', '/opt/homebrew/bin', '/usr/local/bin', '/usr/lib/postgresql/15/bin'];
export function pgBin(): string | null {
  for (const d of [...(process.env.PATH ?? '').split(delimiter), ...CANDIDATES]) if (d && ['initdb', 'pg_ctl', 'psql'].every((b) => existsSync(join(d, b)))) return d;
  return null;
}
export const hasPg = pgBin() !== null;

const HEADERS = ['content-type', 'neon-array-mode', 'neon-batch-isolation-level', 'neon-connection-string', 'neon-raw-text-output'];
const lit = (s: string) => `'${s.replace(/'/g, "''")}'`;
const AGG = "coalesce(replace(json_agg(to_json(q))::text, E'\\n', ''), '[]')";

export async function startPg() {
  const bin = pgBin()!;
  // A unix socket path is limited to 103 bytes: keep the directory short.
  const base = join(tmpdir(), 'hvpg.XXXXXX', '.s.PGSQL.5432').length > 90 ? '/tmp' : tmpdir();
  const root = mkdtempSync(join(base, 'hvpg.')), data = join(root, 'data');
  const env = { ...process.env, LC_ALL: 'en_US.UTF-8', PATH: `${bin}${delimiter}${process.env.PATH ?? ''}` };
  const stopSync = () => { spawnSync(join(bin, 'pg_ctl'), ['-D', data, 'stop', '-m', 'immediate'], { env, stdio: 'ignore' }); rmSync(root, { recursive: true, force: true }); };
  try {
    const init = spawnSync(join(bin, 'initdb'), ['-D', data, '-A', 'trust', '-U', 'tester', '-E', 'UTF8', '--no-sync'], { env, stdio: 'ignore' });
    const opts = `-c listen_addresses='' -c unix_socket_directories=${root} -c fsync=off -c max_connections=200`;
    const start = spawnSync(join(bin, 'pg_ctl'), ['-D', data, '-o', opts, '-w', '-t', '30', '-l', join(root, 'log'), 'start'], { env, stdio: 'ignore' });
    if (init.status !== 0 || start.status !== 0) throw new Error('local postgres did not start');
  } catch (e) { stopSync(); throw e; }
  process.on('exit', stopSync);

  /** One psql session: the input on stdin, ON_ERROR_STOP so the first error ends it before COMMIT (the transaction rolls back). */
  const psql = (input: string) => new Promise<{ code: number; out: string; err: string }>((resolve) => {
    const p = spawn(join(bin, 'psql'), ['-X', '-q', '-A', '-t', '-v', 'VERBOSITY=verbose', '-v', 'ON_ERROR_STOP=1', '-h', root, '-U', 'tester', '-d', 'postgres'], { env });
    let out = '', err = '';
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { err += d; });
    p.on('close', (code) => resolve({ code: code ?? 1, out, err }));
    p.stdin.end(input);
  });
  const sql = async (text: string) => { const r = await psql(text); if (r.code !== 0) throw new Error(`psql: ${r.err.slice(0, 300)}`); return r.out.trim(); };

  const violations: string[] = [];
  let requests = 0;
  /** Emulates POST /sql: one transaction at READ COMMITTED, every entry PREPAREd without declared types (parameters are inferred the way
   * the proxy's untyped text parameters are) and EXECUTEd with string literals; rows come back as raw text like Neon-Raw-Text-Output. */
  const fetch: FetchLike = async (url, init) => {
    requests++;
    const h = Object.fromEntries(Object.entries((init.headers ?? {}) as Record<string, string>).map(([k, v]) => [k.toLowerCase(), v]));
    const body = JSON.parse(String(init.body)) as { queries: { query: string; params: string[] }[] };
    if (new URL(url).pathname !== '/sql' || init.method !== 'POST') violations.push('route');
    if (Object.keys(h).sort().join() !== HEADERS.join() || h['neon-raw-text-output'] !== 'true' || h['neon-array-mode'] !== 'true' || h['neon-batch-isolation-level'] !== 'ReadCommitted') violations.push('headers');
    if (Object.keys(body).join() !== 'queries' || !init.signal) violations.push('body');
    const lines = ['\\set ON_ERROR_STOP on', 'BEGIN ISOLATION LEVEL READ COMMITTED;'];
    body.queries.forEach(({ query, params }, i) => {
      if (Object.keys({ query, params }).length !== 2 || !params.every((p) => typeof p === 'string' && !p.includes('\u0000')) || /;\s*\S/.test(query)) violations.push(`entry ${i}`);
      if (!params.length) lines.push(`${query};`); // the DDL and the cleanup take no parameters and run as they are
      else {
        const wrapped = query.startsWith('SELECT') ? `SELECT ${AGG} FROM (${query}) q` : `WITH q AS (${query}) SELECT ${AGG} FROM q`;
        lines.push(`PREPARE s${i} AS ${wrapped};`, `EXECUTE s${i}(${params.map(lit).join(', ')});`);
      }
      lines.push(`\\echo @@${i}`);
    });
    lines.push('COMMIT;');
    const r = await psql(lines.join('\n') + '\n');
    if (r.code !== 0) return Response.json({ message: 'error', code: /ERROR:\s+([0-9A-Z]{5}):/.exec(r.err)?.[1] ?? 'XX000' }, { status: 400 });
    const results: unknown[] = [];
    let buf: string[] = [];
    for (const line of r.out.split('\n')) {
      if (!line.startsWith('@@')) { if (line) buf.push(line); continue; }
      const rows = body.queries[results.length].params.length && buf.length ? (JSON.parse(buf[0]) as Record<string, unknown>[]).map((o) => Object.values(o).map((v) => (v === null ? null : String(v)))) : [];
      results.push({ fields: [], rows, command: 'SELECT', rowCount: rows.length, rowAsArray: true });
      buf = [];
    }
    return Response.json({ results });
  };

  return {
    sql, fetch, violations, requests: () => requests,
    /** Move the database clock forward for expiry: every expiry moves back by `ms`. */
    advance: (ms: number) => sql(`UPDATE public.hv_kv SET exp = exp - (${Number(ms)} * interval '1 millisecond') WHERE exp IS NOT NULL;`),
    stop: async () => { process.off('exit', stopSync); stopSync(); },
  };
}
export type Pg = Awaited<ReturnType<typeof startPg>>;
