import { type Rng, type Spec } from './skylineParts';
import { box } from './skylineDamage';

/** The set pieces of the Dudael field pass (Garo, 2026-10-21: the open world needs destinations).
 * Deterministic compositions the regular field never moves: exact boxes, their colliders match,
 * and everything keeps the district, the north canal avenue margin and the box-edge strip clear.
 * `fieldData.ts` says which builder runs for each entry; heights arrive pre-capped so every top
 * stays under the flight bounds. */
export type Preset = 'gate' | 'titan' | 'pier' | 'span' | 'stump' | 'colossus' | 'waystone';

const WATER = 3.1;

function skirt(look: Rng, w: number, d: number, n: number): Spec[] {
  const out: Spec[] = [];
  for (let i = 0; i < n; i++) {
    const side = look() < .5 ? -1 : 1, onX = look() < .5, rh = 2 + look() * 4, rw = (onX ? d : w) * (.3 + look() * .3);
    const along = (look() - .5) * (onX ? d : w) * .4;
    out.push(onX ? box('rubble', side * w / 2, WATER + rh * .2, along, rw, rh, rw * 1.3) : box('rubble', along, WATER + rh * .2, side * d / 2, rw, rh, rw * 1.3));
  }
  return out;
}

/** The gate of the north canal avenue: a colossal stele fragment beside the lane, its split face
 * fallen along the canal into the water (never across the avenue or its neighbouring blocks).
 * Seen down the boulevard from the spawn view — the first destination. `w` carries a mirror sign:
 * the two gates fall away from the avenue. */
function gate(look: Rng, w: number, d: number, height: number): Spec[] {
  const side = Math.sign(w), width = Math.abs(w), h = height;
  return [
    box('body', 0, WATER + h / 2 - 1.5, 0, width, h, d),
    box('slab', 0, WATER + h - 1.5, 0, width * 1.24, Math.max(3, h * .13), d * 1.24, side * .02),
    box('wall', side * (width * .55 - 2), WATER + h * .36, h * .18, width * .62, h * .58, h * .4, side * .07),
    box('rubble', side * width * .5, WATER + 2, (look() - .5) * d, width * .7, 4, 6, (look() - .5) * .5),
  ];
}

/** A titan at the estuary plaza: a stele stump leaned apart from its twin as a broken gate you fly
 * between, a broad face fallen along the estuary at its side. `w` carries the mirror sign. */
function titan(look: Rng, w: number, d: number, height: number): Spec[] {
  const side = Math.sign(w), width = Math.abs(w), h = height;
  return [
    box('body', 0, WATER + h / 2 - 1, 0, width, h, d, side * .09),
    box('slab', 0, WATER + h - 1, 0, width * 1.2, Math.max(2.4, h * .12), d * 1.2, side * .09),
    box('wall', side * width * .5, WATER + h * .3, side * d * 1.05, width * .5, h * .5, h * .34, side * .12),
    ...skirt(look, width, d, 3),
  ];
}

/** A bridge pier: a basalt post standing in the estuary, its shoulders carrying the fallen span. */
function pier(look: Rng, w: number, d: number, height: number): Spec[] {
  const h = height;
  return [
    box('body', 0, WATER + h / 2 - 1, 0, w, h, d),
    box('stub', 0, WATER + h - .2, 0, w * .8, 2.6, d * .8),
    box('wall', 0, WATER + h * .5, d * .55, w * .7, h * .5, .9, 0),
    ...skirt(look, w, d, 2),
  ];
}

/** The fallen span across the estuary: a vast slab lying along z on the piers' shoulders, its hem
 * ~33 m over the water — the fly-under (raised 2026-10-21 so the y≈25 estuary cruise and every
 * fly-under line passes clear of the deck: the old hem at 25 m scraped the cruise ceiling and
 * wedged the escape test's floor peel). `d` is the span, and every part shares one raise. */
function span(look: Rng, w: number, d: number): Spec[] {
  const out = [box('slab', 0, WATER + 34.5, 0, w, 3, d, (look() - .5) * .01)];
  for (const sz of [-1, 1]) out.push(box('column', 0, WATER + 21.5, sz * (d / 2 - 5), w * .6, 24, w * .6));
  if (look() < .6) out.push(box('wall', 0, WATER + 38.5, (look() - .5) * d * .2, w * .5, 2.2, d * .4, 0));
  return out;
}

/** A southern stump field: three broken watch pillars sinking toward the breach, their ribs
 * snapped at different heights. */
function stumpCluster(look: Rng, w: number, d: number, height: number): Spec[] {
  const out: Spec[] = [];
  for (let i = 0; i < 3; i++) {
    const ox = (look() - .5) * w * .6, oz = (look() - .5) * d * .6, sw = w * (.28 + look() * .22);
    const h = Math.max(10, height * (.5 - i * .12));
    out.push(box('body', ox, WATER + h / 2, oz, sw, h, sw * (.6 + look() * .3)));
    out.push(box('column', ox + (look() - .5) * sw * .5, WATER + h + 2, oz + (look() - .5) * sw * .3, .9, 2 + look() * 4, .9));
  }
  return [...out, ...skirt(look, w, d, 3)];
}

/** The fallen colossus in the west flats: a Watcher-giant on its side in two halves, its plates
 * across, leaving a chambered gap you can fly straight through (about 15 m wide). */
function colossus(look: Rng, w: number, d: number, _height: number): Spec[] {
  const gap = 15, seg = (w - gap) / 2, cx = gap / 2 + seg / 2, y = WATER + d * .42;
  const out = [
    box('body', -cx, y, 0, seg, d * .84, d), box('body', cx, y, 0, seg, d * .8, d),
    box('slab', 0, y + d * .42, 0, w * .6, 1.6, d * .5), box('slab', 0, y + d * .82, 0, w * .68, 2, d * 1.05),
  ];
  for (let i = 0; i < 4; i++) out.push(box('column', (look() - .5) * w * .75, y + 1.5, (look() - .5) * d * .3, .7, 2.5, .7));
  return [...out, ...skirt(look, w, d, 3)];
}

/** A bronze way-stone: a small carved obelisk on the avenue's sight line, the navigation rhythm. */
function waystone(look: Rng, w: number, d: number, height: number): Spec[] {
  return [box('body', 0, WATER + height / 2, 0, w, height, d), box('stub', 0, WATER + height + .8, 0, w * .55, 1.6, d * .55)];
}

const BUILD: Record<Preset, (look: Rng, w: number, d: number, height: number) => Spec[]> =
  { gate, titan, pier, span, stump: stumpCluster, colossus, waystone };

/** A preset's geometry; `span` builds from `d` alone. */
export const anchorSpecs = (look: Rng, preset: Preset, w: number, d: number, height: number) =>
  BUILD[preset](look, w, d, height);
