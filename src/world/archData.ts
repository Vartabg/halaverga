// The cloven arch across the gorge, as numbers: one source for the mesh (hermonArch.ts) and for what a thrown body strikes
// (game/obstacles.ts), so the rock that is drawn is the rock that is hit. Plain data, no three.

/** A swept rock tube from x0 to x1: its core climbs `rise` above `base` at mid-span and sways `sway` either side of z; its
 *  section is an ellipse `ry` by `rz` at the feet, thinner by `ryThin` / `rzThin` at the crown. */
export const ARCH = { x0: -31, x1: 31, base: 3.2, rise: 8.4, z: -1, sway: .8, ry: 3.8, ryThin: 1.25, rz: 4.8, rzThin: .8 } as const;
/** The section at one point of the span: the core, the ellipse's half-height and half-depth, and how steeply the core climbs (dy/dx). */
export type ArchSection = { cy: number; cz: number; ry: number; rz: number; slope: number };

/** The section at t (0 at x0, 1 at x1), written into `out`. */
export function archSection(t: number, out: ArchSection = { cy: 0, cz: 0, ry: 0, rz: 0, slope: 0 }) {
  const lift = Math.sin(t * Math.PI);
  out.cy = ARCH.base + lift * ARCH.rise; out.cz = ARCH.z + Math.sin(t * Math.PI * 2) * ARCH.sway;
  out.ry = ARCH.ry - lift * ARCH.ryThin; out.rz = ARCH.rz - lift * ARCH.rzThin;
  out.slope = ARCH.rise * Math.PI * Math.cos(t * Math.PI) / (ARCH.x1 - ARCH.x0);
  return out;
}
