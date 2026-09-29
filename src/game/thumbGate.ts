import { AdaptiveThumbs } from './adaptiveThumbs';
import { TAP_MS, TAP_SLOP_TOUCH } from './gesture/tuning';
// The classic one-thumb pointer gate: who is a flying thumb and who is a tap. Pure (timers only), so node tests drive the same paths
// useClassicThumbs does. Any second contact, on a drone or not, is pending until it lifts (a quick tap: nothing, or a blast when it
// landed on a drone), slides TAP_SLOP_TOUCH or holds TAP_MS; only then does it join as a thumb (main's move/look handoff). A tap
// that misses therefore never touches the held thumb's flight state (dynamics review S1: it used to zero forward and edgeTurn).
const HOLD_MS = 180, STICK_DEADZONE = 8;
type Tap = { x: number; y: number; t: number; drone: number };
type Pending = Tap & { id: number; timer: ReturnType<typeof setTimeout> };
/** What a lift was: not ours, a second-finger tap that never joined, or a thumb (blast is set when a quick tap landed on a drone). */
export type Lift = { kind: 'ignored' | 'tap' | 'thumb'; blast: { x: number; y: number; drone: number } | null };
const NONE: Lift = { kind: 'ignored', blast: null };
export type GateHooks = { expired: () => boolean; paused: () => boolean; changed: () => void };
export class ThumbGate {
  readonly thumbs = new AdaptiveThumbs();
  private hold: ReturnType<typeof setTimeout> | null = null;
  private pending: Pending | null = null;
  private taps = new Map<number, Tap>();
  /** The contact that was flying (single and active) when a second thumb joined; it resumes if that second thumb lifts alone. */
  private flier: number | null = null;
  /** The contact that joined as the second thumb, and whether it slid past the stick deadzone: real two-thumb use keeps main's hover
   *  when a thumb lifts. The held thumb's own steering does not count (a flier that keeps turning is not two-thumb use). */
  private joined = -1;
  private used = false;
  /** The first thumb's hold timer fired while a second finger was still pending: it activates when that finger resolves as a tap. */
  private holdDue = false;
  constructor(private hooks: GateHooks) {}
  get busy() { return this.thumbs.contacts.size > 0 || this.pending !== null; }
  get pendingId() { return this.pending?.id ?? -1; }
  private clearHold() { if (this.hold) clearTimeout(this.hold); this.hold = null; this.holdDue = false; }
  private clearPending() { if (this.pending) clearTimeout(this.pending.timer); this.pending = null; }
  /** The pending second finger becomes a thumb where it is (AdaptiveThumbs.start: dual, or blocked with a third), with no blast. */
  join() {
    const p = this.pending; if (!p) return;
    this.clearPending(); this.clearHold();
    const c = this.thumbs;
    this.flier = c.mode === 'single' && c.active && c.contacts.size === 1 ? c.contacts.keys().next().value! : null; this.joined = p.id; this.used = false;
    c.start(p.id, p.x, p.y); this.hooks.changed();
  }
  /** A contact went down; `drone` is the drone under it (-1 for none). A non-first contact settles a pending one first. */
  down(id: number, x: number, y: number, t: number, drone: number) {
    this.join();
    if (this.thumbs.contacts.size === 1) {
      this.pending = { id, x, y, t, drone, timer: setTimeout(() => { if (!this.hooks.expired()) this.join(); }, TAP_MS) };
      return;
    }
    this.clearHold();
    this.thumbs.start(id, x, y); this.hooks.changed();
    this.taps.set(id, { x, y, t, drone });
    if (this.thumbs.mode === 'single') this.hold = setTimeout(() => {
      this.hold = null;
      if (this.hooks.paused() || this.hooks.expired()) return;
      // Two thumbs landing together: the lift waits for the second finger to resolve, so a deliberate pair never sees a 70 ms launch blip.
      if (this.pending) { this.holdDue = true; return; }
      this.thumbs.activate(); this.hooks.changed();
    }, drone >= 0 ? TAP_MS : HOLD_MS);
  }
  /** The pending second finger ended as a tap (or was cancelled): a first thumb whose lift was waiting on it lifts now. */
  private settle() {
    const due = this.holdDue; this.holdDue = false;
    if (due && !this.hooks.paused() && !this.hooks.expired()) { this.thumbs.activate(); this.hooks.changed(); }
  }
  /** True when the contact is a thumb now and its output changed (the caller then applies look and syncs). */
  move(id: number, x: number, y: number, width: number, height: number) {
    const p = this.pending;
    if (p && p.id === id) {
      if (Math.hypot(x - p.x, y - p.y) <= TAP_SLOP_TOUCH) return false;
      // Slid past the tap slop: a thumb from here on. A finger on a drone joins where the slide crossed the slop (the drone tap
      // path); any other joins where it landed, so the whole slide still looks or moves, as it did before the gate.
      if (p.drone >= 0) { p.x = x; p.y = y; }
      this.join();
    }
    const c = this.thumbs; if (!c.contacts.has(id)) return false;
    c.move(id, x, y, width, height);
    if (c.active) this.clearHold();
    const second = c.mode === 'dual' && !this.used && id === this.joined ? c.contacts.get(id) : undefined;
    if (second && Math.hypot(second.x - second.originX, second.y - second.originY) > STICK_DEADZONE) this.used = true;
    return true;
  }
  up(id: number, x: number, y: number, t: number, width: number, height: number): Lift {
    // Held past TAP_MS but the timer has not run yet (a hitch: input can be dispatched before timers): that was a hold, not a tap.
    if (this.pending?.id === id && t - this.pending.t > TAP_MS) this.join();
    const p = this.pending;
    if (p && p.id === id) {
      // Still pending at the lift (within TAP_MS and TAP_SLOP_TOUCH): a quick second-finger tap. The thumbs never saw it.
      this.clearPending(); this.settle();
      return { kind: 'tap', blast: p.drone >= 0 ? { x, y, drone: p.drone } : null };
    }
    const c = this.thumbs; if (!c.contacts.has(id)) return NONE;
    const tap = this.taps.get(id); this.taps.delete(id);
    // A quick tap on a drone (never lifted, still, within TAP_MS) blasts it; a quick tap anywhere else does nothing, as on main.
    const quick = !!tap && c.mode === 'single' && !c.active && tap.drone >= 0
      && Math.hypot(x - tap.x, y - tap.y) <= TAP_SLOP_TOUCH && t - tap.t <= TAP_MS;
    // The flight thumb lifts under a pending second finger: that finger joins first, then stays as main's re-based, inactive single.
    this.join();
    this.clearHold(); c.end(id);
    // The joined second thumb lifts unused (rested or was slid less than the deadzone) and the held thumb is still down: it flies on
    // where it is (main left it dead until an 8 px slide). After real two-thumb use, main's hover stays.
    if (id === this.flier) this.flier = null;
    else if (!this.used && this.flier !== null && c.mode === 'single' && c.contacts.has(this.flier)) c.resume(this.flier, width, height);
    if (!c.contacts.size) this.flier = null;
    this.hooks.changed();
    return { kind: 'thumb', blast: quick ? { x, y, drone: tap!.drone } : null };
  }
  /**
   * A finger that was still down when held input was released (pause, resume, reset, rotation): a fresh one-thumb grip where it is,
   * flying at once, with no 180 ms hold. It used to stay dead until every finger lifted (limits plan S8). The caller resets the gate first.
   */
  rearm(id: number, x: number, y: number, t: number) {
    this.down(id, x, y, t, -1);
    if (this.thumbs.mode !== 'single') return;
    this.clearHold(); this.thumbs.activate(); this.hooks.changed();
  }
  /** A cancelled contact: a pending one just drops; a thumb ends everything (returns whether it was ours). */
  cancel(id: number) {
    if (this.pending?.id === id) { this.clearPending(); this.settle(); return true; }
    if (!this.thumbs.contacts.has(id)) return false;
    this.reset(); return true;
  }
  /** Drops everything (held input released, rotation, unmount); the caller marks still-down contacts stale first. */
  reset() {
    this.clearHold(); this.clearPending(); this.thumbs.cancel(); this.taps.clear(); this.flier = null; this.joined = -1; this.used = false; this.hooks.changed();
  }
  dispose() { this.clearHold(); this.clearPending(); }
}
