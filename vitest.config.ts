import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
// '@/' mirrors tsconfig paths so UI modules (such as useInput's pause) can be unit-tested directly.
export default defineConfig({ resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } }, test: { include: ['tests/**/*.test.ts'], environment: 'node' } });
