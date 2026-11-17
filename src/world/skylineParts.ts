import type { Rgb } from './atmospherePalette';

/** The part vocabulary of the ruin and stone shapes (ruinShapes.ts, summitStone.ts, dudael field): a handful of boxes per ruin, a body,
 * then stubs, walls, columns, girders, floor plates, rebar, rubble and fallen sections. Types only: the distant tower baker that used
 * to live here was retired with the procedural skyline (the painted backdrop replaced it, 2026-11-16). `tilt` turns a part about its z
 * axis; `shear` lowers the +x side of its roof by that many metres (the +z side with `shearZ`); `burn` (0 to 1) blackens it. */
export type PartKind = 'body' | 'stub' | 'slab' | 'rebar' | 'rubble' | 'column' | 'floor' | 'beam' | 'wall' | 'fallen';
export type Spec = { kind: PartKind; at: Rgb; size: Rgb; tilt?: number; shear?: number; shearZ?: boolean; burn?: number };
export type Rng = () => number;
