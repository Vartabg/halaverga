// Per-instance guards that cost 0 Redis commands (spec 3.2). They change only the cost of a refusal, never the outcome: Upstash
// stays the source of truth, and instances do not share these. Both are best effort.
import { DEFAULT_LIMITS, type Limits } from './limits';

export const MEMO_CAP = 5000;

/**
 * Attempts per rate key per UTC day on this instance. A key whose attempts exceed twice its limit is an abusive key: the handler
 * answers 429 from memory without calling Upstash. Entries of another day are dropped as soon as a call carries a new day, so no key
 * outlives its day (PRIV-6); over the cap the least recently seen key goes first. `limits` is the last ctl this instance read.
 */
export class MemoLimit {
  private readonly seen = new Map<string, number>();
  private day = '';
  limits: Limits = { ...DEFAULT_LIMITS };
  constructor(private readonly cap = MEMO_CAP) {}

  get size() { return this.seen.size; }

  private sweep(day: string) {
    if (day === this.day) return;
    this.seen.clear();
    this.day = day;
  }

  /** Count one attempt on `key` for `day` and return the attempts so far today. */
  attempt(key: string, day: string): number {
    this.sweep(day);
    const n = (this.seen.get(key) ?? 0) + 1;
    this.seen.delete(key); // re-insert: the Map's insertion order is least recently seen first
    this.seen.set(key, n);
    while (this.seen.size > this.cap) this.seen.delete(this.seen.keys().next().value as string);
    return n;
  }

  /** True once the attempts on `key` today exceed twice `limit`. Reads only. */
  over(key: string, day: string, limit: number): boolean {
    this.sweep(day);
    return (this.seen.get(key) ?? 0) > 2 * limit;
  }
}

export interface Latched { status: number; error: string; retryAfter: number | null }

/** How long the one probe request owns an expired latch: the handler's own deadline, so a probe that dies frees it soon after. */
export const PROBE_MS = 6000;

/**
 * The circuit breaker: after closed (503, 30 s), the day's global limit or the main ceiling (429, 60 s) or a store error (502, 5 s)
 * the instance answers from memory until the time is up. The later expiry wins, so a short 502 can never cut a longer latch short.
 * When the time is up the latch is half open (C1): exactly one request claims it, goes to the store and, once its whole decision is made (both gates for a new ballot), settles or re-latches it,
 * while every other request keeps the latched answer until then, so a burst at the expiry costs one store round trip, not one per
 * request. `retryAfter` null sends no Retry-After header (the answer will not change by itself).
 */
export class Latch {
  private until = 0;
  private hit: Latched | null = null;
  private probing_ = false;

  /** True right after claim() returned null for the request that now owns the probe (false for every other request). */
  get probing(): boolean { return this.probing_; }

  set(untilMs: number, status: 429 | 502 | 503, error: string, retryAfter: number | null): void {
    if (this.hit && !this.probing_ && untilMs < this.until) return;
    this.until = untilMs;
    this.hit = { status, error, retryAfter };
    this.probing_ = false;
  }

  /** The latched answer while `now` is before the expiry (or the probe's deadline), else null. Reads only. */
  check(now: number): Latched | null {
    return this.hit && now < this.until ? this.hit : null;
  }

  /** Called just before a store call: the latched answer, or null when this request is free to go (it is the probe if the latch had run out). */
  claim(now: number): Latched | null {
    if (!this.hit) return null;
    if (now < this.until) return this.hit;
    this.probing_ = true;
    this.until = now + PROBE_MS;
    return null;
  }

  /** The probe's whole decision is made and it latched nothing again: a half-open latch closes. A latch set meanwhile (set() ends the probe) is untouched. */
  settle(): void {
    if (!this.probing_) return;
    this.hit = null;
    this.probing_ = false;
  }
}
