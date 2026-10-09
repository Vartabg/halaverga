// Twin-stick look edge rest (turn-360 spec 1.2c). A look thumb that swipes fast toward an edge and then rests there keeps turning
// until it moves back out. Two bands, so both directions work with one thumb: the outer physical edge (turns toward that side) and
// a second band that turns the other way (fit): in landscape a thin strip on the move-stick zone's line, in portrait (where the look
// pad spans the full width above the stick zone) the opposite physical edge. Arming needs intent: the thumb must enter a band moving
// toward its edge at armSpeed or faster, then stay dwellMs. A slow aim that ends near an edge never arms, and a quick flick that
// stops mid-pad is outside every band. Pure and allocation-free after construction; x is in the touch box's own coordinates, t in
// ms (event.timeStamp / rAF time).
export const REST = { band: 56, full: 16, innerBand: 32, innerFull: 10, armSpeed: .6, dwellMs: 80, hyst: 8, tauMs: 40 } as const;
const IDLE = 0, PENDING = 1, ARMED = 2;
type Band = { on: boolean; edge: number; sign: number; toward: number; width: number; full: number; state: number; since: number };
const band = (width: number, full: number): Band => ({ on: false, edge: 0, sign: 0, toward: 0, width, full, state: IDLE, since: 0 });
const smooth = (t: number) => { const u = Math.max(0, Math.min(1, t)); return u * u * (3 - 2 * u); };
export class EdgeRest {
  private readonly outer = band(REST.band, REST.full);
  private readonly inner = band(REST.innerBand, REST.innerFull);
  private x = NaN; private t = 0; private v = 0;
  /**
   * outerX/innerX: the edge lines. A sign is the yaw direction that band turns (+1 left, -1 right); the edge lies on the side the
   * sign turns toward, so the thumb moves toward it along -sign. innerX null (no stick zone, tap controls) leaves the inner band off.
   * Geometry only: the arming state is kept, and the next move re-checks it against the new lines.
   */
  configure(outerX: number, outerSign: 1 | -1, innerX: number | null, innerSign: 1 | -1): void {
    this.set(this.outer, outerX, outerSign);
    if (innerX === null || !Number.isFinite(innerX)) { this.inner.on = false; this.inner.state = IDLE; }
    else this.set(this.inner, innerX, innerSign);
  }
  /**
   * The twin-stick geometry for a touch box w px wide. zone: the stick zone's x span (null with tap controls: outer band only).
   * Landscape: the second band is a REST.innerBand strip on the zone's inner line (the thumb past it, over the stick zone, counts
   * fully). Portrait: the look pad lies above the stick zone across the full width, so the zone line would put most of the pad in
   * the band (review 2026-09-25: an ordinary left flick spun the view); the second band is the opposite physical edge instead.
   */
  fit(w: number, landscape: boolean, zone: { l: number; r: number } | null, flip: boolean): void {
    const inner = !zone ? null : landscape ? (flip ? zone.l : zone.r) : (flip ? w : 0);
    this.inner.width = landscape ? REST.innerBand : REST.band; this.inner.full = landscape ? REST.innerFull : REST.full;
    this.configure(flip ? 0 : w, flip ? 1 : -1, inner, flip ? -1 : 1);
  }
  down(x: number, t: number): void { this.reset(); this.x = x; this.t = t; }
  /** A look move; returns the signed rest factor (yaw direction x depth), or 0 while not armed. */
  move(x: number, t: number): number {
    const dt = t - this.t;
    if (Number.isFinite(this.x) && dt > 0) this.v += ((x - this.x) / dt - this.v) * (1 - Math.exp(-dt / REST.tauMs));
    if (dt > 0 || !Number.isFinite(this.x)) this.t = t;
    this.x = x;
    return this.value(t);
  }
  /** Called every frame: a resting thumb sends no pointermove, so the dwell and the held turn are timed here. */
  tick(t: number): number { return Number.isFinite(this.x) ? this.value(t) : 0; }
  reset(): void {
    this.x = NaN; this.v = 0; this.t = 0;
    this.outer.state = IDLE; this.inner.state = IDLE;
  }
  get armed(): boolean { return this.outer.state === ARMED || this.inner.state === ARMED; }
  private set(b: Band, edge: number, sign: 1 | -1) { b.on = Number.isFinite(edge); b.edge = edge; b.sign = sign; b.toward = -sign; }
  private value(t: number): number {
    const o = this.step(this.outer, t), i = this.step(this.inner, t);
    return o !== 0 ? o : i;
  }
  private step(b: Band, t: number): number {
    if (!b.on) return 0;
    const dist = (b.edge - this.x) * b.toward, inside = dist < b.width;
    if (b.state === IDLE) {
      if (inside && this.v * b.toward >= REST.armSpeed) { b.state = PENDING; b.since = t; }
    } else if (dist > b.width + REST.hyst) b.state = IDLE;
    else if (b.state === PENDING && inside && t - b.since >= REST.dwellMs) b.state = ARMED;
    return b.state === ARMED ? b.sign * smooth((b.width - dist) / (b.width - b.full)) : 0;
  }
}
