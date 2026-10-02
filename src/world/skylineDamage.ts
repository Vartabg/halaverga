import { hexToLinear, type Rgb } from './atmospherePalette';
import type { PartKind, Rng, Spec } from './skylineParts';

/** What time did to the distant towers, decided per tower from its own seeded stream (so the layout of the skyline never moves).
 * Pure data and maths, Node-safe. */
export const box = (kind: PartKind, x: number, y: number, z: number, w: number, h: number, d: number, tilt = 0): Spec => ({ kind, at: [x, y, z], size: [w, h, d], tilt });

/** A tower's weathering: a colour to lean toward (and how far, and how much more near the water), and a value factor. */
export type Mood = { tone: Rgb; amount: number; low: number; value: number };
const PLAIN: Mood = { tone: [1, 1, 1], amount: 0, low: 0, value: 1 };
const MOODS: { until: number; mood: Mood }[] = [
  { until: .4, mood: PLAIN },
  { until: .55, mood: { tone: hexToLinear('#e6dcc2'), amount: .3, low: 0, value: 1.05 } }, // sun-bleached concrete
  { until: .72, mood: { tone: hexToLinear('#76896f'), amount: .26, low: 1, value: .95 } }, // moss-stained, greener toward the water
  { until: .84, mood: { tone: hexToLinear('#9a8672'), amount: .26, low: 0, value: .94 } }, // rust and weather
  { until: .93, mood: { tone: hexToLinear('#74a0b4'), amount: .22, low: 0, value: 1 } },    // a glass curtain wall
  { until: 1, mood: { ...PLAIN, value: .84 } },                                            // dark and old
];
export const pickMood = (look: Rng) => { const r = look(); return (MOODS.find(m => r < m.until) ?? MOODS[0]).mood; };

const roofs: PartKind[] = ['body', 'upper', 'setback'];
/** Breaks a freshly built tower. Near layers (0 and 1) can lose a floor or two (a shallow recessed core between two blocks, the upper
 * one a little narrower than the neck, so it reads as a lost storey and not a stack), lean a fallen facade panel against a side, lose
 * their top floors (a few columns of different heights stand on a lowered roof), and on layer 0 grow a cluster of small green tufts.
 * Any layer can have its roof sheared on a slant, the tallest towers deeply, so the skyline says broken at a glance. Every added part
 * starts inside a part before it, so nothing floats. Widths w and d are the body's. */
export function weather(specs: Spec[], look: Rng, w: number, d: number, layer: number): Spec[] {
  const near = layer < 2, body = specs[0];
  if (near && body.size[1] > 36 && look() < (layer === 0 ? .32 : .2)) {
    const slot = 3.7 * (look() < .4 ? 2 : 1), top = body.size[1], y0 = top * (.28 + look() * .3), upper = top - y0 - slot;
    if (upper > 8) specs.splice(0, 1, box('body', 0, y0 / 2, 0, w, y0, d), box('core', 0, y0 + slot / 2, 0, w * .9, slot + 2, d * .9), box('upper', 0, y0 + slot + upper / 2, 0, w * .88, upper, d * .88));
  }
  const has = (k: PartKind) => specs.some(s => s.kind === k), bare = !['notch', 'slab', 'spire', 'crown'].some(k => has(k as PartKind));
  const roof = specs.filter(s => roofs.includes(s.kind)).pop()!, tall = body.size[1] > 70;
  if (bare && look() < (tall ? .4 : .55)) roof.shear = Math.min(tall ? 11 + look() * 9 : 5 + look() * 8, roof.size[1] * .6);
  else if (near && bare && look() < .3) {
    const cut = 5 + look() * 7, n = 2 + (look() < .5 ? 1 : 0);
    roof.size = [roof.size[0], roof.size[1] - cut, roof.size[2]]; roof.at = [roof.at[0], roof.at[1] - cut / 2, roof.at[2]];
    const base = roof.at[1] + roof.size[1] / 2 - 1;
    for (let i = 0; i < n; i++) {
      const sw = roof.size[0] * (.12 + look() * .1), sd = roof.size[2] * (.12 + look() * .1), sh = cut * (.5 + look() * 1.1) + 1;
      const x = roof.at[0] + ((i + .2 + look() * .6) / n - .5) * (roof.size[0] - sw), z = roof.at[2] + (look() - .5) * (roof.size[2] - sd);
      specs.push(box('stub', x, base + sh / 2, z, sw, sh, sd));
    }
  }
  if (near && look() < .14) {
    const side = look() < .5 ? -1 : 1, panel = body.size[1] * (.28 + look() * .2), lean = .14 + look() * .16;
    specs.push(box('slab', side * (w / 2 + .4), panel / 2 - 1, (look() - .5) * d * .4, 1.1, panel, d * (.4 + look() * .25), side * lean));
  }
  if (layer === 0) {
    const host = specs.filter(s => s.kind === 'notch' || roofs.includes(s.kind)).pop()!, crown = specs.find(s => s.kind === 'crown');
    if (crown) { crown.size = [crown.size[0] * .6, crown.size[1] * .8, crown.size[2] * .6]; crown.at = [crown.at[0] + (look() - .5) * w * .2, crown.at[1] - crown.size[1] * .1, crown.at[2]]; }
    const base = crown ? crown.at[1] - crown.size[1] / 2 : host.at[1] + host.size[1] / 2 - .5, extra = crown ? (look() < .7 ? 2 : 0) : look() < .2 ? 3 : 0;
    for (let i = 0; i < extra; i++) {
      const cw = w * (.14 + look() * .12), cd = d * (.14 + look() * .12), ch = 1.5 + look() * 3, at = crown ?? host;
      const x = Math.max(host.at[0] - host.size[0] / 2 + cw / 2, Math.min(host.at[0] + host.size[0] / 2 - cw / 2, at.at[0] + (look() - .5) * w * .5));
      const z = Math.max(host.at[2] - host.size[2] / 2 + cd / 2, Math.min(host.at[2] + host.size[2] / 2 - cd / 2, at.at[2] + (look() - .5) * d * .5));
      specs.push(box('crown', x, base + ch / 2, z, cw, ch, cd));
    }
  }
  return specs;
}
