// Per-instance pre-limit (spec 3.1, B1/M6): once this server instance has seen more than the limit from one rate-limit key
// in the current hour, further requests from it are refused without calling Upstash at all. Best effort only: instances do
// not share it, and Upstash stays the source of truth. The map is capped so a flood of keys cannot grow memory.
export const MEMO_CAP = 1000;

export class MemoLimit {
  private readonly seen = new Map<string, { n: number; hour: number }>();
  constructor(private readonly cap = MEMO_CAP) {}

  get size() { return this.seen.size; }

  /** Count this request; true once the key has been seen more than `limit` times within `hour`. */
  over(key: string, hour: number, limit: number): boolean {
    const prev = this.seen.get(key);
    const n = prev && prev.hour === hour ? prev.n + 1 : 1;
    // Re-insert so the Map's insertion order is least-recently-seen first.
    if (prev) this.seen.delete(key);
    this.seen.set(key, { n, hour });
    while (this.seen.size > this.cap) {
      const oldest = this.seen.keys().next().value;
      if (oldest === undefined) break;
      this.seen.delete(oldest);
    }
    return n > limit;
  }
}
