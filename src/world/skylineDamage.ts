import { hexToLinear, type Rgb } from './atmospherePalette';
import type { PartKind, Rng, Spec } from './skylineParts';

/** What eighty years of ash and poisoned water did to the ruins, decided per ruin from its own seeded stream (so the layout of the
 * skyline never moves). Pure data and maths, Node-safe. */
export const box = (kind: PartKind, x: number, y: number, z: number, w: number, h: number, d: number, tilt = 0): Spec => ({ kind, at: [x, y, z], size: [w, h, d], tilt });

/** A ruin's weathering: a colour to lean toward (and how far, and how much more near the water), and a value factor. */
export type Mood = { tone: Rgb; amount: number; low: number; value: number };
const PLAIN: Mood = { tone: [1, 1, 1], amount: 0, low: 0, value: 1 };
const MOODS: { until: number; mood: Mood }[] = [
  { until: .3, mood: PLAIN },
  { until: .5, mood: { tone: hexToLinear('#221714'), amount: .48, low: 0, value: .76 } },   // abyssal obsidian
  { until: .65, mood: { tone: hexToLinear('#9e7c5b'), amount: .28, low: 0, value: 1.02 } }, // burnished bronze-stone
  { until: .8, mood: { tone: hexToLinear('#854e28'), amount: .36, low: 0, value: .92 } },   // molten-veined brass
  { until: .92, mood: { tone: hexToLinear('#3d261a'), amount: .34, low: 1, value: .88 } },  // brimstone-stained near the abyss
  { until: 1, mood: { ...PLAIN, value: .72 } },                                             // dark volcanic basalt
];
export const pickMood = (look: Rng) => { const r = look(); return (MOODS.find(m => r < m.until) ?? MOODS[0]).mood; };
