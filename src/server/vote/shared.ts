// One value per server process, whichever route bundle asks (WEB-L1, C2). Next builds each route (/api/vote, /api/results, /results)
// as its own bundle, so a module-level const is one copy per route; a Symbol.for key on globalThis is the same object in all of them.
// Used for the results snapshot, the abusive-key memo, the latch and the store, so every route shares one cache, one budget and one
// failure hold per instance. Holds only in-memory state: nothing here reads a request, a key or a credential.
export function once<T>(name: string, make: () => T): T {
  const g = globalThis as Record<symbol, unknown>, key = Symbol.for(`halaverga.vote.${name}`);
  return (g[key] ??= make()) as T;
}
