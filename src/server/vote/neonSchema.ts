// Neon Postgres storage constants (spec-neon 3). Three generic tables, one per Redis type the vote uses; the Redis key (already
// namespaced hv:<env>:) is the `k` column. Each entry is ONE statement with no parameters, because the SQL-over-HTTP endpoint runs
// every entry through the extended protocol. A future change is a new table name, never an ALTER.
export const DDL: readonly string[] = [
  "SELECT pg_advisory_xact_lock(hashtext('halaverga_vote_ddl'))",
  'CREATE TABLE IF NOT EXISTS public.hv_kv (\n  k   text PRIMARY KEY,\n  v   text NOT NULL,\n  exp timestamptz\n)',
  'CREATE INDEX IF NOT EXISTS hv_kv_exp_idx ON public.hv_kv (exp) WHERE exp IS NOT NULL',
  'CREATE TABLE IF NOT EXISTS public.hv_hash (\n  k     text NOT NULL,\n  field text NOT NULL,\n  value text NOT NULL,\n  PRIMARY KEY (k, field)\n)',
  'CREATE TABLE IF NOT EXISTS public.hv_set (\n  k      text NOT NULL,\n  member text NOT NULL,\n  PRIMARY KEY (k, member)\n)',
];

/** Space only: an expired row is already treated as absent by SET NX and INCR. SKIP LOCKED never waits, LIMIT bounds the work. */
export const CLEAN =
  'DELETE FROM public.hv_kv WHERE k IN (SELECT k FROM public.hv_kv WHERE exp IS NOT NULL AND exp <= now() ORDER BY exp LIMIT 200 FOR UPDATE SKIP LOCKED)';
export const CLEAN_EVERY_MS = 600_000;

/** A cold Neon compute wakes on the first request, so one call may take longer than Upstash's 2 s. */
export const NEON_TIMEOUT_MS = 3000;
/** Concurrent CREATE ... IF NOT EXISTS failures (unique_violation, duplicate_table, duplicate_object): resend the batch once. */
export const RACE_CODES: readonly string[] = ['23505', '42P07', '42710'];
/** undefined_table: the tables were dropped, so the next batch carries the DDL again. */
export const MISSING_TABLE = '42P01';
