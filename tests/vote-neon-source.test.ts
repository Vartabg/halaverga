import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Static guards over the Neon modules (spec-neon 4.5, 5.4, 7): what a reviewer would grep for, kept true.
const FILES = ['neonSchema', 'neonConn', 'neonReply', 'neonSql', 'neonStore', 'neonRunbook'].map((f) => `src/server/vote/${f}.ts`);
const src = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

describe('the Neon modules, read as text', () => {
  it('never call console.* and never read the environment: nothing can log a value', () => {
    for (const f of FILES) { expect(src(f), f).not.toMatch(/console\s*\./); expect(src(f), f).not.toMatch(/process\.env/); }
  });
  it('stay under 200 lines', () => { for (const f of [...FILES, 'src/server/vote/store.ts', 'src/server/vote/handlers.ts']) expect(src(f).split('\n').length, f).toBeLessThan(200); });
  it('build no SQL from a value: neonSql.ts has no template literal placeholder, and no SQL text is concatenated', () => {
    const t = src('src/server/vote/neonSql.ts');
    expect(t).not.toMatch(/\$\{/);
    expect(t.replace(/\/\/.*$/gm, '')).not.toMatch(/(query|SQL\.\w+)\s*\+|\+\s*(query|SQL\.\w+)|\.replace\(/);
    expect(src('src/server/vote/neonStore.ts')).not.toMatch(/\$\{[^}]*(cmd|arg|param|key)/i);
  });
  it('import from store.ts only types, so the two files have no runtime cycle', () => {
    for (const f of FILES) for (const line of src(f).split('\n').filter((l) => /from '\.\/store'/.test(l))) expect(line, f).toMatch(/^import type /);
  });
  it('keep the connection string out of the URL and every thrown message', () => {
    const t = src('src/server/vote/neonStore.ts');
    expect(t).toMatch(/fetchImpl\(endpoint,/);
    expect([...t.matchAll(/new Error\(([^)]*)\)/g)].map((m) => m[1])).toEqual(['`vote store ${m}`']); // errors are made only by fail(), from fixed words
    for (const m of t.matchAll(/fail\(([^)]*)\)/g)) expect(m[1], m[0]).toMatch(/^('[a-z ]+'|`http \$\{res\.status\}`)$/);
  });
});
