// The 1-euro filter (Casiez, Roussel and Vogel, CHI 2012), spec 2.3. Time in ms (performance.now); cutoffs in Hz.
// Defaults are tuned for CSS px: minCutoff 1.0 Hz, beta 0.005, dCutoff 1.0 Hz. No allocation after construction.
import { EURO_BETA, EURO_D_CUTOFF, EURO_MIN_CUTOFF } from './tuning';

const alphaOf = (cutoff: number, dt: number) => 1 / (1 + 1 / (2 * Math.PI * cutoff * dt));

export class OneEuro {
  minCutoff: number; beta: number; dCutoff: number;
  /** Last filtered value and filtered derivative (units per second). */
  value = 0; deriv = 0;
  private lastT = 0; private primed = false;

  constructor(minCutoff = EURO_MIN_CUTOFF, beta = EURO_BETA, dCutoff = EURO_D_CUTOFF) {
    this.minCutoff = minCutoff; this.beta = beta; this.dCutoff = dCutoff;
  }

  reset(): void { this.primed = false; this.value = this.deriv = 0; }

  /** Filter sample x taken at tMs. The first sample passes through; a non-advancing timestamp returns the last value. */
  filter(x: number, tMs: number): number {
    if (!this.primed) {
      this.primed = true; this.value = x; this.deriv = 0; this.lastT = tMs;
      return x;
    }
    const dt = (tMs - this.lastT) / 1000;
    if (!(dt > 0)) return this.value;
    this.lastT = tMs;
    // As the reference implementation: the derivative is taken against the previous filtered value.
    const dx = (x - this.value) / dt;
    this.deriv += alphaOf(this.dCutoff, dt) * (dx - this.deriv);
    const cutoff = this.minCutoff + this.beta * Math.abs(this.deriv);
    this.value += alphaOf(cutoff, dt) * (x - this.value);
    return this.value;
  }
}

/** Two independent axes, for a pointer position. Read x and y after filter(). */
export class OneEuro2 {
  readonly fx: OneEuro; readonly fy: OneEuro;
  x = 0; y = 0;
  constructor(minCutoff = EURO_MIN_CUTOFF, beta = EURO_BETA, dCutoff = EURO_D_CUTOFF) {
    this.fx = new OneEuro(minCutoff, beta, dCutoff); this.fy = new OneEuro(minCutoff, beta, dCutoff);
  }
  reset(): void { this.fx.reset(); this.fy.reset(); this.x = this.y = 0; }
  filter(x: number, y: number, tMs: number): this {
    this.x = this.fx.filter(x, tMs); this.y = this.fy.filter(y, tMs);
    return this;
  }
}
