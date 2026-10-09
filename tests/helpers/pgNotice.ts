import { hasPg } from './pgHttp';

/** CODE-10: `pnpm test:pg` reads green when the suite could not run (each file is describe.skipIf(!hasPg)), so say so, loudly, in the run. */
export const PG_SKIPPED_NOTICE = 'PG PARITY SUITE SKIPPED: initdb, pg_ctl and psql were not found on PATH or in the usual Homebrew and Linux folders. Nothing here ran, so the Neon SQL is NOT proved against a real PostgreSQL. Install PostgreSQL 15 and run `pnpm test:pg` again.';
if (!hasPg) console.error(`\n${PG_SKIPPED_NOTICE}\n`);
