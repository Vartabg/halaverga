import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
// pnpm test:pg: the Neon adapter against a real local PostgreSQL (tests/pg, helper tests/helpers/pgHttp.ts). Not part of `pnpm test` or
// `pnpm verify`: every request is a psql process. Skipped, not failed, when initdb, pg_ctl and psql are missing.
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: { include: ['tests/pg/**/*.pg.ts'], environment: 'node', testTimeout: 120000, hookTimeout: 120000, fileParallelism: false },
});
