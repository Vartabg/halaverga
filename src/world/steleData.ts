import type { Kit } from './kit';
import { INK, INK_GROUP } from './paintInk';
/** Colossal Watcher stele inside the flyable box (the distant Skyline mesh keeps no colliders and stays untouched). Carved
 * twelve-sided basalt shafts with bronze crowns, placed clear of the authored route tube (BUILDING_ROUTE: x 0..9, z 65..-38,
 * y 3..69) and of every scripted navigation fixture: slim convex cores, no overhangs, no parallel faces forming slots, tops below
 * the ceiling (150) with passing room. The corridor gates are held for their own task (see the comment under the gates). The outer
 * class stands in the abyssal sea between the district and the Skyline, collider-free there like the Skyline they lead into
 * (passing through far giants is accepted in the shipped world). */
export type Stele = { kind: 'gate' | 'corridor' | 'outer' | 'fallen'; x: number; z: number; ry: number;
  h: number; r: number; seed: number; solid: boolean; crown: 'intact' | 'broken' | 'none'; lift?: number };
export const STELE: Stele[] = [
  // The arrival pair: oath megaliths flanking the lower ledges below the summit court (top 2.05).
  { kind: 'gate', x: -24, z: 48, ry: .22, h: 24, r: 2.6, seed: 11, solid: true, crown: 'intact' },
  { kind: 'gate', x: 24, z: 48, ry: .79, h: 26, r: 2.6, seed: 29, solid: true, crown: 'broken' },
  // Corridor gates were cut from the slice (2026-10-21): the hands-off escape regressions (pin #151 in limit-escape) are
  // layout-sensitive, gates + corridor stele together trip one recorded pin while either alone is clean, so the corridor slalom
  // returns as its own task with a recorded-pin audit, not a placement gamble.
  //
  // The outer watch: monoliths in the open abyss beyond the district hills (which end at x +/-199).
  { kind: 'outer', x: -232, z: 36, ry: .3, h: 58, r: 6.4, seed: 131, solid: false, crown: 'intact' },
  { kind: 'outer', x: 214, z: -84, ry: .61, h: 52, r: 5.8, seed: 149, solid: false, crown: 'broken' },
  { kind: 'outer', x: -186, z: -214, ry: .95, h: 56, r: 6.1, seed: 167, solid: false, crown: 'none' },
  { kind: 'outer', x: 258, z: -262, ry: .4, h: 64, r: 6.7, seed: 191, solid: false, crown: 'intact' },
  { kind: 'outer', x: 236, z: 74, ry: .77, h: 50, r: 5.5, seed: 211, solid: false, crown: 'intact' },
  // A fallen colossus half-sunk into the gorge, a broken shaft lying beside it.
  { kind: 'fallen', x: -118, z: -158, ry: -.34, h: 48, r: 5.0, seed: 233, solid: false, crown: 'none' },
];
/** A fluted shaft: one course every 3.2 m (so the carving reads at any distance), flutes pushing in this far, and the crown collar
 * that flares just below the bronze cap. Deterministic per stele, driven by its seed. */
export const shaft = { course: 3.2, fluteDepth: .05, collar: 1.16, taper: .62 };
/** The seat: gates and corridor stele stand on the road terraces (top 2.05); the outer watch and the fallen colossus sink into the
 * sea bed, so only the upper shaft clears the waterline. */
export const seatY = (s: Stele) => (s.kind === 'gate' || s.kind === 'corridor' ? 2.05 : -2.4);
/** The plinth sunk through the surface under every stele: deeper than the seat by this height, wider than the base radius by this. */
export const plinth = { depth: 3, extra: 2.1 };
/** Adds a whole stele to the merged city kit: shaft, plinth, bronze crown (or its broken dark stub), and for the fallen colossus a
 * detached slab. Colliders only ever mark the upright convex pieces skyline-style. Returns the shaft top y for tests. */
export function placeStele(k: Kit, s: Stele) {
  const y0 = seatY(s), topY = y0 + s.h, w = s.r * 2 + plinth.extra;
  k.pillar(s.x, y0 + s.h / 2, s.z, s.h, s.r * .62, s.r * 1.18, s.seed, s.ry, s.lift ?? 1, { depth: .1, course: 4.4 });
  k.box(s.x, y0 - plinth.depth / 2, s.z, w, plinth.depth, w, INK.plinth, s.solid, s.ry, 0, 1, INK_GROUP);
  if (s.crown === 'intact') {
    if (s.solid) k.solids.push({ position: [s.x, topY + 1.15, s.z], size: [s.r * 1.25, 1.15, s.r * 1.25], rotation: [0, s.ry, 0] });
    k.pillar(s.x, topY + 1.9, s.z, 3.8, s.r * .44, s.r * .78, s.seed + 7, s.ry, 1, { depth: .08, course: 2.0 });
  } else if (s.crown === 'broken') {
    if (s.solid) k.solids.push({ position: [s.x, topY + .55, s.z], size: [s.r * 1.02, .55, s.r * 1.02], rotation: [0, s.ry, 0] });
    k.pillar(s.x, topY + 1.1, s.z, 2.2, s.r * .42, s.r * .72, s.seed + 11, s.ry, 1, { depth: .08, course: 1.8 });
  }
  if (s.kind === 'fallen') k.pillar(s.x + s.r * 3.4, y0 + 4.2, s.z - s.r * 2.6, 9.5, s.r * .65, s.r * 1.35, s.seed + 19, s.ry + 1.9, .92, { depth: .1, course: 3.2 });
  return { y0, topY };
}
