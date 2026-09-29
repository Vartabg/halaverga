import { thumbEdge, thumbThrottle } from './thumbFlight';
export type Contact = { id: number; x: number; y: number; originX: number; originY: number; role: 'single' | 'move' | 'look' };
const DEADZONE = 8, STICK_RADIUS = 88, LOOK_GAIN = 1.6;
export class AdaptiveThumbs {
  contacts = new Map<number, Contact>();
  mode: 'idle' | 'single' | 'dual' | 'blocked' = 'idle';
  active = false;
  private holdAllowed = false;
  output = { forward: 0, strafe: 0, lookX: 0, lookY: 0, edgeTurn: 0, edgePitch: 0 };
  private neutral() { Object.assign(this.output, { forward: 0, strafe: 0, lookX: 0, lookY: 0, edgeTurn: 0, edgePitch: 0 }); }
  private rebase(p: Contact) { p.originX = p.x; p.originY = p.y; }
  start(id: number, x: number, y: number) {
    if (this.contacts.has(id)) return;
    this.contacts.set(id, { id, x, y, originX: x, originY: y, role: 'single' });
    this.neutral();
    if (this.mode === 'blocked' || this.contacts.size > 2) {
      this.mode = 'blocked'; this.active = false; this.holdAllowed = false; return;
    }
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
    const dx = x - p.originX, dy = y - p.originY, distance = Math.hypot(dx, dy);
    this.output.lookX = 0; this.output.lookY = 0;
    if (this.mode === 'single' && !this.active && distance >= DEADZONE) this.active = true;
    if (!this.active) return;
    if (p.role === 'move') {
      const amount = Math.min(1, Math.max(0, (distance - DEADZONE) / (STICK_RADIUS - DEADZONE)));
      this.output.forward = amount ? -dy / distance * amount : 0;
      this.output.strafe = amount ? dx / distance * amount : 0;
    } else {
      this.output.lookX = lookX; this.output.lookY = lookY;
      this.output.edgeTurn = thumbEdge(x, width); this.output.edgePitch = -thumbEdge(y, height);
      if (p.role === 'single') this.output.forward = thumbThrottle(distance);
    }
  }
  end(id: number) {
    if (!this.contacts.delete(id)) return;
    this.neutral(); this.active = false; this.holdAllowed = false;
    if (!this.contacts.size) { this.mode = 'idle'; return; }
    if (this.mode === 'blocked') return;
    const remaining = this.contacts.values().next().value!;
    this.rebase(remaining); remaining.role = 'single'; this.mode = 'single';
    // Releasing the movement thumb must not make a stationary look thumb launch forward.
    // Sliding the remaining contact resumes single-thumb flight without lifting it.
  }
  cancel() { this.contacts.clear(); this.mode = 'idle'; this.active = false; this.holdAllowed = false; this.neutral(); }
}
