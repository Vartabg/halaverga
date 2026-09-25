// In-memory VoteStore for handler tests: the subset of Redis the vote uses, with Upstash REST reply shapes (numbers for
// counters, a flat string array for HGETALL), expiry on an injected clock, and counts of exec calls and commands.
import type { Command, VoteStore } from '@/server/vote/store';

type Entry = { kind: 'str'; v: string } | { kind: 'hash'; v: Map<string, number> } | { kind: 'list'; v: string[] };

export class FakeRedis implements VoteStore {
  execCalls = 0;
  commands = 0;
  log: Command[] = [];
  failWith: Error | null = null;
  private data = new Map<string, Entry>();
  private expires = new Map<string, number>();
  constructor(public clock: () => number = () => 0) {}

  private live(key: string): Entry | undefined {
    const at = this.expires.get(key);
    if (at !== undefined && this.clock() >= at) { this.data.delete(key); this.expires.delete(key); }
    return this.data.get(key);
  }

  async exec(cmds: Command[]): Promise<unknown[]> {
    this.execCalls++;
    this.commands += cmds.length;
    this.log.push(...cmds);
    if (this.failWith) throw this.failWith;
    return cmds.map((c) => this.run(c));
  }

  private run([name, key, ...args]: Command): unknown {
    const k = String(key);
    const e = this.live(k);
    switch (String(name).toUpperCase()) {
      case 'SET': {
        const nx = args.some((a) => String(a).toUpperCase() === 'NX');
        if (nx && e) return null;
        this.data.set(k, { kind: 'str', v: String(args[0]) });
        this.expires.delete(k);
        const ex = args.findIndex((a) => String(a).toUpperCase() === 'EX');
        if (ex >= 0) this.expires.set(k, this.clock() + Number(args[ex + 1]) * 1000);
        return 'OK';
      }
      case 'INCR': {
        const n = (e?.kind === 'str' ? Number(e.v) : 0) + 1;
        this.data.set(k, { kind: 'str', v: String(n) });
        return n;
      }
      case 'HINCRBY': {
        const h = e?.kind === 'hash' ? e.v : new Map<string, number>();
        const n = (h.get(String(args[0])) ?? 0) + Number(args[1]);
        h.set(String(args[0]), n);
        this.data.set(k, { kind: 'hash', v: h });
        return n;
      }
      case 'HGETALL':
        return e?.kind === 'hash' ? [...e.v].flatMap(([f, n]) => [f, String(n)]) : [];
      case 'LPUSH': {
        const l = e?.kind === 'list' ? e.v : [];
        for (const a of args) l.unshift(String(a));
        this.data.set(k, { kind: 'list', v: l });
        return l.length;
      }
      case 'LTRIM': {
        if (e?.kind === 'list') e.v.splice(Number(args[1]) + 1);
        return 'OK';
      }
      case 'LLEN':
        return e?.kind === 'list' ? e.v.length : 0;
      case 'EXPIRE':
        if (!e) return 0;
        this.expires.set(k, this.clock() + Number(args[0]) * 1000);
        return 1;
      case 'TTL': {
        if (!e) return -2;
        const at = this.expires.get(k);
        return at === undefined ? -1 : Math.ceil((at - this.clock()) / 1000);
      }
      default:
        throw new Error(`fake-redis: unsupported ${String(name)}`);
    }
  }

  /** Test helpers (not part of VoteStore). */
  hash(key: string): Record<string, number> {
    const e = this.live(key);
    return e?.kind === 'hash' ? Object.fromEntries(e.v) : {};
  }
  list(key: string): string[] {
    const e = this.live(key);
    return e?.kind === 'list' ? [...e.v] : [];
  }
  counter(key: string): number {
    const e = this.live(key);
    return e?.kind === 'str' ? Number(e.v) : 0;
  }
  keys(): string[] {
    return [...this.data.keys()].filter((k) => this.live(k));
  }
}
