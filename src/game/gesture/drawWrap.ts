// Draw wrap (turn-360 spec 1.8): a circle on the screen means "turn around". Ray mapping cannot wind a path all the way round
// (the rays only sweep the view cone), so once a stroke's screen winding reaches WRAP_ENTER_DEG a turtle takes over the controls:
// each pixel of ink advances WRAP_M_PER_PX along a world heading that turns with the screen winding (clockwise on screen turns
// right, as yaw), and the screen height sets the altitude (a spring drawn upward climbs as it turns). The heading the ray mapping
// fell short by at entry (the debt) is paid off over the next DEBT_PX of ink, so the whole stroke turns by its screen winding.
// Ray mapping keeps the path in the front half of the view (depth grows with the ink), so at 150 degrees of winding the debt can
// be near half a turn: it is always taken the way the finger circles (never a swing back the other way) and capped at DEBT_MAX.
// The turtle itself never curls tighter than TURTLE_R (so the ring, turn-limited to WRAP_MIN_R, can follow it without orbiting):
// it lags the heading the ink asks for, and whatever it still owes at release DrawStroke.completeWrap flies on as an arc.
// Pure and allocation-free: plain numbers and {x,y,z}.
import type { Vec } from '../motion';
import { WINDING_CUSP, wrapAngle } from './strokeBuffer';
import { WINDING_SEG } from './tuning';

export const WRAP_ENTER_DEG = 150, WRAP_M_PER_PX = 0.035, WRAP_Y_PER_PX = 0.03;
/** The tightest world radius a wrap turns at, m (the ring's turn limit while wrapping). */
export const WRAP_MIN_R = 2.5;
/** The turtle's tightest radius, m: a margin over WRAP_MIN_R for the spline through its controls. */
export const TURTLE_R = 1.05 * WRAP_MIN_R;
const DEBT_PX = 90, DEBT_MAX = 1.25 * Math.PI, ENTER_RAD = WRAP_ENTER_DEG * Math.PI / 180, TAU = 2 * Math.PI;
const smooth = (u: number) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
/** Heading of a horizontal direction in runtime yaw convention (0 looks down -z, + turns left). */
export const headingOf = (dx: number, dz: number) => Math.atan2(-dx, -dz);

export class WrapTurtle {
  /** Signed screen winding so far, rad (+ = clockwise on screen, y down), over WINDING_SEG px segments without cusps. */
  winding = 0;
  /** The turtle owns the controls (entered this stroke; it never hands back to ray mapping). */
  on = false;
  private ax = 0; private ay = 0; private dir = 0; private hasDir = false; private started = false;
  private psiEntry = 0; private psi = 0; private wEntry = 0; private debt = 0; private arc = 0; private yEntry = 0; private pyEntry = 0;
  private readonly p: Vec = { x: 0, y: 0, z: 0 };

  reset() { this.winding = 0; this.on = this.hasDir = this.started = false; this.arc = 0; }

  /** Every screen sample, in order: accumulates the winding exactly as strokeBuffer does. */
  feed(px: number, py: number) {
    if (!this.started) { this.started = true; this.ax = px; this.ay = py; return; }
    const dx = px - this.ax, dy = py - this.ay;
    if (dx * dx + dy * dy < WINDING_SEG * WINDING_SEG) return;
    const dir = Math.atan2(dy, dx), turn = wrapAngle(dir - this.dir);
    if (this.hasDir && Math.abs(turn) <= WINDING_CUSP) this.winding += turn;
    this.dir = dir; this.hasDir = true; this.ax = px; this.ay = py;
  }

  /** The winding has reached the entry threshold (and the turtle is not on yet). */
  get ready() { return !this.on && Math.abs(this.winding) >= ENTER_RAD; }

  /**
   * Takes over at control c (screen y py). psiStart: heading of the ring's first segment; psiEntry: the current tangent heading.
   * The debt is what the ray mapping left unturned, (psiStart - winding) - psiEntry, taken in the winding's direction (a clockwise
   * circle turns right, so the debt is in (-2 PI, 0]) and capped at DEBT_MAX.
   */
  enter(c: Vec, py: number, psiStart: number, psiEntry: number) {
    let d = wrapAngle(psiStart - this.winding - psiEntry);
    if (this.winding > 0 && d > 0) d -= TAU; else if (this.winding < 0 && d < 0) d += TAU;
    this.on = true; this.psiEntry = this.psi = psiEntry; this.wEntry = this.winding; this.arc = 0;
    this.debt = d > DEBT_MAX ? DEBT_MAX : d < -DEBT_MAX ? -DEBT_MAX : d;
    this.yEntry = c.y; this.pyEntry = py;
    this.p.x = c.x; this.p.y = c.y; this.p.z = c.z;
  }

  /** The heading the turtle walks now (it trails `wanted` by at most one TURTLE_R arc's worth per step). */
  get heading() { return this.psi; }
  /** Signed turn still owed (+ = left): what the ink asks for minus what the turtle has turned. */
  get owed() { return this.on ? this.wanted - this.psi : 0; }
  /** The heading the ink asks for: the entry tangent, turned by the winding since, plus the debt paid off over DEBT_PX. */
  get wanted() { return this.psiEntry - (this.winding - this.wEntry) + this.debt * smooth(this.arc / DEBT_PX); }

  /** Advances stepPx of ink (screen y py), keeps the turtle inside with clamp, and writes the new control to out. Returns the
   * world distance walked. */
  advance(stepPx: number, py: number, out: Vec, clamp: (p: Vec) => void): number {
    const p = this.p, m = stepPx * WRAP_M_PER_PX;
    this.arc += stepPx;
    const lim = m / TURTLE_R, d = this.wanted - this.psi;
    this.psi += d > lim ? lim : d < -lim ? -lim : d;
    const psi = this.psi, y = this.yEntry + (this.pyEntry - py) * WRAP_Y_PER_PX;
    const x0 = p.x, y0 = p.y, z0 = p.z;
    p.x += -Math.sin(psi) * m; p.z += -Math.cos(psi) * m; p.y = y; clamp(p);
    out.x = p.x; out.y = p.y; out.z = p.z;
    return Math.hypot(p.x - x0, p.y - y0, p.z - z0);
  }
}
