import { SPEED } from './motion';

export type CaptureState = 'idle' | 'requesting' | 'engaged';
export const FLOW = { stroke: 160, gain: .00125, quiet: 250, fresh: 12 } as const;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
export const flowSpeed = (u: number) => SPEED.surge * (.25 * u + .75 * u * u);
export type FlowWheel = { deltaX: number; deltaY: number; deltaMode: number; momentum?: boolean };

/** Wheel distances are browser units, not measured finger travel. Missing momentum is deliberately conservative. */
export class FlowStroke {
  private last = -Infinity;
  private used = 0;
  private direction = 0;
  private blocked = true;
  private fresh = 0;
  stop(now: number) {
    this.last = now; this.used = 0; this.direction = 0; this.blocked = true; this.fresh = 0;
  }
  apply(current: number, e: FlowWheel, now: number, height: number, reverse = false) {
    const quiet = now - this.last >= FLOW.quiet;
    if (![e.deltaX, e.deltaY].every(Number.isFinite)) return current;
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY) || e.deltaY === 0) return current;
    this.last = now;
    if (e.momentum === true) { if (this.blocked) { this.fresh = 0; this.direction = 0; } return current; }
    const delta = -e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? height : 1) * (reverse ? -1 : 1);
    const direction = Math.sign(delta);
    if (quiet || direction !== this.direction) { this.used = 0; this.fresh = 0; }
    if (current > 0) this.blocked = false;
    if (this.blocked) {
      if (direction < 0) return current;
      if (e.momentum === false) this.blocked = false;
      else {
        // A quiet interval arms a new stroke; continuation events can accumulate its evidence.
        if (quiet) this.direction = 0;
        if (direction < 0 || (!quiet && this.direction !== 1)) return current;
        this.direction = 1; this.fresh += Math.abs(delta);
        if (this.fresh < FLOW.fresh) return current;
        this.blocked = false;
      }
    }
    this.direction = direction;
    const accepted = Math.min(Math.abs(delta), FLOW.stroke - this.used);
    this.used += accepted;
    const next = clamp(current + direction * accepted * FLOW.gain, 0, 1);
    if (next === 0 && current > 0) this.stop(now);
    return next;
  }
}
