import { SPEED } from './motion';
import { thumbEdge, thumbThrottle } from './thumbFlight';
export type Contact = { id: number; x: number; y: number; originX: number; originY: number; role: 'single' | 'move' | 'look'; muted?: boolean };
const DEADZONE = 8, STICK_RADIUS = 88, LOOK_GAIN = 1.6, SPARE_MS = 250;
/** Distance from the origin where thumbThrottle gives f (at least its minimum): the smoothstep inverted in closed form. */
function throttleDistance(f: number) {
  const u = Math.min(1, Math.max(0, (Math.max(f, 8 / SPEED.surge) * SPEED.surge - 8) / (SPEED.surge - 8)));
  return 24 + 96 * (0.5 - Math.sin(Math.asin(1 - 2 * u) / 3));
}
export class AdaptiveThumbs {
  contacts = new Map<number, Contact>();
  mode: 'idle' | 'single' | 'dual' | 'blocked' = 'idle';
  active = false;
  /** Fire (outside this surface) owns the view: every surface contact is a move stick and counts as the second thumb. */
  external = false;
  private holdAllowed = false;
  private spare: { id: number; originX: number; originY: number; at: number } | null = null;
  output = { forward: 0, strafe: 0, lookX: 0, lookY: 0, edgeTurn: 0, edgePitch: 0 };
  private neutral() { Object.assign(this.output, { forward: 0, strafe: 0, lookX: 0, lookY: 0, edgeTurn: 0, edgePitch: 0 }); }
  private rebase(p: Contact) { p.originX = p.x; p.originY = p.y; }
  private stick(p: Contact) {
    const dx = p.x - p.originX, dy = p.y - p.originY, distance = Math.hypot(dx, dy);
    const amount = Math.min(1, Math.max(0, (distance - DEADZONE) / (STICK_RADIUS - DEADZONE)));
    this.output.forward = amount ? -dy / distance * amount : 0;
    this.output.strafe = amount ? dx / distance * amount : 0;
  }
  private moveStick(p: Contact) { p.role = 'move'; this.mode = 'dual'; this.active = true; this.holdAllowed = false; }
  private block() { this.mode = 'blocked'; this.active = false; this.holdAllowed = false; }
  start(id: number, x: number, y: number) {
    if (this.contacts.has(id)) return;
    const p: Contact = { id, x, y, originX: x, originY: y, role: 'single' };
    this.contacts.set(id, p);
    this.neutral();
    if (this.mode === 'blocked' || this.contacts.size > 2 || (this.external && this.contacts.size > 1)) { this.block(); return; }
    if (this.external) { this.moveStick(p); return; }
    if (this.contacts.size === 1) {
      this.mode = 'single'; this.active = false; this.holdAllowed = true;
    } else {
      const [left, right] = [...this.contacts.values()].sort((a, b) => a.x - b.x);
      this.rebase(left); this.rebase(right); left.role = 'move'; right.role = 'look';
      this.mode = 'dual'; this.active = true; this.holdAllowed = false;
    }
  }
  activate() {
    if (this.mode !== 'single' || !this.holdAllowed) return;
    this.active = true; this.output.forward = thumbThrottle(0);
  }
  move(id: number, x: number, y: number, width: number, height: number) {
    const p = this.contacts.get(id); if (!p || this.mode === 'blocked') return;
    const lookX = (x - p.x) * LOOK_GAIN, lookY = (y - p.y) * LOOK_GAIN;
    p.x = x; p.y = y;
    // A look thumb muted while Fire owns the view keeps tracking its position so release does not jump the view.
    if (p.muted) return;
    const distance = Math.hypot(x - p.originX, y - p.originY);
    this.output.lookX = 0; this.output.lookY = 0;
    if (this.mode === 'single' && !this.active && distance >= DEADZONE) this.active = true;
    if (!this.active) return;
    if (p.role === 'move') this.stick(p);
    else {
      this.output.lookX = lookX; this.output.lookY = lookY;
      this.output.edgeTurn = thumbEdge(x, width); this.output.edgePitch = -thumbEdge(y, height);
      if (p.role === 'single') this.output.forward = thumbThrottle(distance);
    }
  }
  /** Fire pressed (true) or released (false). There is one yaw writer at a time: while Fire is held, its drag. */
  setExternal(on: boolean, now = performance.now()) {
    if (on === this.external) return;
    this.external = on;
    const n = this.contacts.size, p = n === 1 ? this.contacts.values().next().value! : null, spare = this.spare;
    this.spare = null;
    if (on) {
      const all = [...this.contacts.values()], mover = all.find(c => c.role === 'move'), look = all.find(c => c.role === 'look');
      if (n === 2 && this.mode === 'dual' && mover && look) {
        // Claw grip: Fire replaces the look thumb (muted); the move stick keeps its origin and throttle.
        look.muted = true; this.neutral(); this.stick(mover); return;
      }
      if (n >= 2) { this.neutral(); this.block(); return; }
      if (!p) return;
      if (spare && spare.id === p.id && now - spare.at <= SPARE_MS) { p.originX = spare.originX; p.originY = spare.originY; }
      else if (this.mode === 'single' && this.active) {
        // Carry the cruise throttle: an origin directly below the thumb reproduces forward = f, strafe 0 on the move stick.
        const f = Math.min(1, Math.max(0, this.output.forward));
        p.originX = p.x; p.originY = p.y + DEADZONE + f * (STICK_RADIUS - DEADZONE);
      } else this.rebase(p);
      this.moveStick(p); this.neutral(); this.stick(p);
      return;
    }
    // A thumb driving the move stick hands its cruise back to one-thumb flight (Fire release never brakes).
    const f = p && p.role === 'move' && this.mode === 'dual' ? Math.min(1, Math.max(0, this.output.forward)) : 0;
    this.neutral();
    if (n === 2 && this.mode === 'dual') {
      // Claw grip released: the muted thumb looks again from where it is now; the move stick keeps going.
      for (const c of this.contacts.values()) if (c.muted) { c.muted = false; c.role = 'look'; this.rebase(c); }
      for (const c of this.contacts.values()) if (c.role === 'move') this.stick(c);
      return;
    }
    this.active = false; this.holdAllowed = false;
    if (!n) { this.mode = 'idle'; return; }
    if (this.mode === 'blocked' || !p) return;
    // A thumb that was not moving on the stick is still: as in end(), it never launches until it slides.
    this.rebase(p); p.role = 'single'; this.mode = 'single';
    if (f > 0) { const d = throttleDistance(f); p.originY = p.y + d; this.active = true; this.output.forward = thumbThrottle(d); }
  }
  end(id: number, now = performance.now()) {
    const was = this.mode;
    if (!this.contacts.delete(id)) return;
    this.neutral(); this.active = false; this.holdAllowed = false;
    if (!this.contacts.size) { this.mode = 'idle'; return; }
    if (this.mode === 'blocked') return;
    const remaining = this.contacts.values().next().value!;
    if (this.external) {
      // Fire still owns the view: the remaining contact is the move stick (a muted look thumb starts from rest), never a yaw writer.
      if (remaining.muted) { remaining.muted = false; this.rebase(remaining); }
      this.moveStick(remaining); this.stick(remaining); return;
    }
    // Remembered for 250 ms: lifting the look thumb to reach Fire keeps the move thumb's origin (a look thumb's origin is not a stick).
    if (!this.external && was === 'dual' && remaining.role === 'move') this.spare = { id: remaining.id, originX: remaining.originX, originY: remaining.originY, at: now };
    this.rebase(remaining); remaining.role = 'single'; this.mode = 'single';
    // Releasing the movement thumb must not make a stationary look thumb launch forward.
    // Sliding the remaining contact resumes single-thumb flight without lifting it.
  }
  cancel() { this.contacts.clear(); this.mode = 'idle'; this.active = false; this.holdAllowed = false; this.spare = null; this.neutral(); }
}
