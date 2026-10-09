import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
// '@/' mirrors tsconfig paths so UI modules (such as useInput's pause) can be unit-tested directly.
// testTimeout: the Rapier and flight-sim suites take 2-13 s alone and run side by side on every core, so vitest's 5 s default made
// flight-facing flaky once the limits suite (tests/limit-*.test.ts, about 25 s of CPU) joined the run.
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: { include: ['tests/**/*.test.ts'], environment: 'node', testTimeout: 30000, hookTimeout: 120000 },
});
