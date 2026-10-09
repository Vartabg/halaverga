// In-memory VoteStore for tests: the subset of Redis the vote uses, with Upstash REST reply shapes (numbers for counters, flat
// string arrays for HGETALL, arrays with nulls for HMGET). exec() applies a whole batch atomically (one synchronous loop, MULTI/EXEC),
// expiry is lazy on an injected clock, errors are Redis-like, and it counts exec calls and commands. Like the real store, exec()
// throws after applying when any command errored; execRaw() returns the per-command {result}|{error} entries instead.
import type { Command, VoteStore } from '@/server/vote/store';

type Entry =
  | { kind: 'str'; v: string }
  | { kind: 'hash'; v: Map<string, string | number> }
  | { kind: 'set'; v: Set<string> }
  | { kind: 'list'; v: string[] };
type Kind = Entry['kind'];
export type RawReply = { result: unknown } | { error: string };
class RedisError extends Error {}
const timeout = () => Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' });

const WRONGTYPE = 'WRONGTYPE Operation against a key holding the wrong kind of value';
const NOT_INT = 'ERR value is not an integer or out of range';
const INT = /^-?\d+$/;
// [min, max] argument count including the key; the reply to a wrong count is Redis's arity error.
const ARITY: Record<string, [number, number]> = {
  SET: [2, 6], GET: [1, 1], INCR: [1, 1], DECR: [1, 1], HINCRBY: [3, 3], HMGET: [2, 99], HLEN: [1, 1], HSETNX: [3, 3], HSET: [3, 99], HDEL: [2, 99],
  HGETALL: [1, 1], SADD: [2, 99], SREM: [2, 99], SMEMBERS: [1, 1], DEL: [1, 99], TTL: [1, 1], EXPIRE: [2, 2], LPUSH: [2, 99],
  LTRIM: [3, 3], LLEN: [1, 1], FLUSHALL: [0, 0],
};

export class FakeRedis implements VoteStore {
  execCalls = 0;
  commands = 0;
  log: Command[] = [];
  /** Throw before applying anything (a store that never received the batch). */
  failWith: Error | null = null;
  private data = new Map<string, Entry>();
  private expires = new Map<string, number>();
  private after: ((cmds: Command[]) => boolean) | null = null;
  private hung = false;
  constructor(public clock: () => number = () => 0) {}

  /** Batches matching pred are applied, then exec throws a timeout error (Upstash applied it, the reply was lost). null clears. */
  failAfterApply(pred: ((cmds: Command[]) => boolean) | null = () => true): void { this.after = pred; }
  /** While hung, exec never answers, unless opts.timeoutMs is given: then it rejects with a timeout error after that long. */
  hang(on = true): void { this.hung = on; }

  private live(key: string): Entry | undefined {
    const at = this.expires.get(key);
    if (at !== undefined && this.clock() >= at) { this.data.delete(key); this.expires.delete(key); }
    return this.data.get(key);
  }
  private get<K extends Kind>(key: string, kind: K): Extract<Entry, { kind: K }> | undefined {
    const e = this.live(key);
    if (e && e.kind !== kind) throw new RedisError(WRONGTYPE);
    return e as Extract<Entry, { kind: K }> | undefined;
  }
  private put(key: string, e: Entry, keepTtl = true): void { this.data.set(key, e); if (!keepTtl) this.expires.delete(key); }
  private drop(key: string): void { this.data.delete(key); this.expires.delete(key); }

  async exec(cmds: Command[], opts?: { timeoutMs?: number }): Promise<unknown[]> {
    this.execCalls++;
    this.commands += cmds.length;
    this.log.push(...cmds);
    if (this.hung) {
      return new Promise<never>((_, reject) => {
        if (opts?.timeoutMs !== undefined) setTimeout(() => reject(timeout()), opts.timeoutMs);
      });
    }
    if (this.failWith) throw this.failWith;
    const raw = this.execRaw(cmds, false);
    if (this.after?.(cmds)) throw timeout();
    if (raw.some((r) => 'error' in r)) throw new Error('vote store command failed');
    return raw.map((r) => (r as { result: unknown }).result);
  }

  /** Apply a batch atomically and return Upstash entries; every command runs even if an earlier one errored (Redis EXEC). */
  execRaw(cmds: Command[], count = true): RawReply[] {
    if (count) { this.execCalls++; this.commands += cmds.length; this.log.push(...cmds); }
    return cmds.map((c) => {
      try { return { result: this.run(c) }; } catch (e) {
        if (e instanceof RedisError) return { error: e.message };
        throw e;
      }
    });
  }

  /** Owner console command: applied and not counted or logged. Throws on a Redis error. */
  admin(cmd: Command): unknown { return this.run(cmd); }

  private run(cmd: Command): unknown {
    const name = String(cmd[0] ?? '').toUpperCase();
    const a = cmd.slice(1).map(String);
    const ar = ARITY[name];
    if (!ar) throw new RedisError(`ERR unknown command '${name.toLowerCase()}'`);
    if (a.length < ar[0] || a.length > ar[1]) throw new RedisError(`ERR wrong number of arguments for '${name.toLowerCase()}' command`);
    const [k, ...r] = a;
    switch (name) {
      case 'SET': return this.set(k, r);
      case 'GET': return this.get(k, 'str')?.v ?? null;
      case 'INCR': case 'DECR': {
        const e = this.get(k, 'str');
        if (e && !INT.test(e.v)) throw new RedisError(NOT_INT);
        const n = (e ? Number(e.v) : 0) + (name === 'INCR' ? 1 : -1);
        this.put(k, { kind: 'str', v: String(n) });
        return n;
      }
      case 'HINCRBY': {
        if (!INT.test(r[1])) throw new RedisError(NOT_INT);
        const h = this.get(k, 'hash')?.v ?? new Map<string, string | number>();
        const cur = h.get(r[0]);
        if (cur !== undefined && !INT.test(String(cur))) throw new RedisError('ERR hash value is not an integer');
        const n = Number(cur ?? 0) + Number(r[1]);
        h.set(r[0], n);
        this.put(k, { kind: 'hash', v: h });
        return n;
      }
      case 'HMGET': { const h = this.get(k, 'hash')?.v; return r.map((f) => (h?.has(f) ? String(h.get(f)) : null)); }
      case 'HLEN': return this.get(k, 'hash')?.v.size ?? 0;
      case 'HSETNX': {
        const h = this.get(k, 'hash')?.v ?? new Map<string, string | number>();
        if (h.has(r[0])) return 0;
        h.set(r[0], r[1]);
        this.put(k, { kind: 'hash', v: h });
        return 1;
      }
      case 'HSET': {
        if (r.length % 2) throw new RedisError("ERR wrong number of arguments for 'hset' command");
        const h = this.get(k, 'hash')?.v ?? new Map<string, string | number>();
        let added = 0;
        for (let i = 0; i < r.length; i += 2) { if (!h.has(r[i])) added++; h.set(r[i], r[i + 1]); }
        this.put(k, { kind: 'hash', v: h });
        return added;
      }
      case 'HDEL': return this.remove(k, this.get(k, 'hash')?.v, r);
      case 'HGETALL': return [...(this.get(k, 'hash')?.v ?? [])].flatMap(([f, v]) => [f, String(v)]);
      case 'SADD': {
        const s = this.get(k, 'set')?.v ?? new Set<string>();
        const n = r.filter((m) => !s.has(m) && s.add(m)).length;
        this.put(k, { kind: 'set', v: s });
        return n;
      }
      case 'SREM': return this.remove(k, this.get(k, 'set')?.v, r);
      case 'SMEMBERS': return [...(this.get(k, 'set')?.v ?? [])];
      case 'DEL': return a.filter((x) => { const had = !!this.live(x); this.drop(x); return had; }).length;
      case 'TTL': {
        if (!this.live(k)) return -2;
        const at = this.expires.get(k);
        return at === undefined ? -1 : Math.ceil((at - this.clock()) / 1000);
      }
      case 'EXPIRE': {
        if (!INT.test(r[0])) throw new RedisError(NOT_INT);
        if (!this.live(k)) return 0;
        this.expires.set(k, this.clock() + Number(r[0]) * 1000);
        return 1;
      }
      case 'LPUSH': {
        const l = this.get(k, 'list')?.v ?? [];
        for (const x of r) l.unshift(x);
        this.put(k, { kind: 'list', v: l });
        return l.length;
      }
      case 'LTRIM': {
        const e = this.get(k, 'list');
        if (e) e.v.splice(Number(r[1]) + 1);
        return 'OK';
      }
      case 'LLEN': return this.get(k, 'list')?.v.length ?? 0;
      default: this.data.clear(); this.expires.clear(); return 'OK'; // FLUSHALL
    }
  }

  private remove(k: string, c: { delete(x: string): boolean; size: number } | undefined, xs: string[]): number {
    const n = c ? xs.filter((x) => c.delete(x)).length : 0;
    if (c && !c.size) this.drop(k);
    return n;
  }

  private set(k: string, r: string[]): unknown {
    let nx = false;
    let ex: number | null = null;
    for (let i = 1; i < r.length; i++) {
      const o = r[i].toUpperCase();
      if (o === 'NX') nx = true;
      else if (o === 'EX' && i + 1 < r.length) {
        if (!INT.test(r[i + 1]) || Number(r[i + 1]) <= 0) throw new RedisError("ERR invalid expire time in 'set' command");
        ex = Number(r[++i]);
      } else throw new RedisError('ERR syntax error');
    }
    if (nx && this.live(k)) return null;
    this.put(k, { kind: 'str', v: r[0] }, false);
    if (ex !== null) this.expires.set(k, this.clock() + ex * 1000);
    return 'OK';
  }

  /** Test helpers (not part of VoteStore). */
  hash(key: string): Record<string, string | number> { const e = this.live(key); return e?.kind === 'hash' ? Object.fromEntries(e.v) : {}; }
  members(key: string): string[] { const e = this.live(key); return e?.kind === 'set' ? [...e.v] : []; }
  list(key: string): string[] { const e = this.live(key); return e?.kind === 'list' ? [...e.v] : []; }
  counter(key: string): number { const e = this.live(key); return e?.kind === 'str' ? Number(e.v) : 0; }
  keys(): string[] { return [...this.data.keys()].filter((k) => this.live(k)); }
}
