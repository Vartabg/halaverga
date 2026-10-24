import { type Rng, type Spec } from './skylineParts';
import { box } from './skylineDamage';

/** What the flyable outskirts are since the Dudael pass (Garo 2026-10-21: the field is Dudael chasm
 * terrain, not apartment ruins). Every shape is exact boxes in its own frame, y up from the foot
 * (the water sits at local y 3.1), with no sheared tops, so its colliders match it exactly. Drawn
 * from the piece's own `look` stream only, so nothing else in the world moves. Pure, Node-safe. */
export type FieldKind = 'spire' | 'stele' | 'fragment' | 'pillar' | 'raft';
const WATER = 3.1;

/** The mix: watch-spires make the east west sky, colossal stele stumps and their fallen fragments
 * crowd the north, broken pillars sink near the breach, and raft fields churn the flats. */
export function pickFieldKind(look: Rng, landmark: boolean): FieldKind {
  const r = look();
  if (landmark) return r < .5 ? 'stele' : 'spire';
  return r < .3 ? 'spire' : r < .55 ? 'stele' : r < .75 ? 'fragment' : r < .9 ? 'pillar' : 'raft';
}

const skirt = (look: Rng, w: number, d: number, n: number): Spec[] => {
  const out: Spec[] = [];
  for (let i = 0; i < n; i++) {
    const side = look() < .5 ? -1 : 1, onX = look() < .5, rw = (onX ? d : w) * (.3 + look() * .4), rh = 2 + look() * 4;
    const along = (look() - .5) * (onX ? d : w) * .45, tilt = (look() - .5) * .7, y = WATER + rh * .18;
    out.push(onX ? box('rubble', side * w / 2, y, along, rw, rh, rw * (1 + look())) : box('rubble', along, y, side * d / 2, rw, rh, rw * (1 + look())));
  }
  return out;
};

/** A watch-spire: a tapering hammer of carved basalt, courses shrinking toward a snapped cap, a
 * couple of tilted shed slabs mid-course and a rubble skirt. */
function spire(look: Rng, w: number, d: number, height: number): Spec[] {
  const courses = 4 + Math.floor(look() * 4), out: Spec[] = [];
  let y = WATER;
  for (let i = 0; i < courses; i++) {
    const h = (height - (y - WATER)) * (.16 + look() * .12), cw = w * (1 - .09 * i), cd = d * (1 - .09 * i);
    out.push(box('body', 0, y + h / 2, 0, cw, h, cd));
    if (i > 0 && look() < .4) out.push(box('slab', (look() < .5 ? -1 : 1) * (cw / 2), y + h + .8, 0, cw * .38, .55, cd * .9, (look() - .5) * .34));
    y += h;
  }
  out.push(box('stub', 0, y + 1.2, 0, w * (1 - .09 * courses), 2.4, d * (1 - .09 * courses)));
  if (look() < .5) { const tw = w * .5; out.push(box('fallen', (look() < .5 ? -1 : 1) * w * .34, WATER + 4, (look() - .5) * d * .4, tw, tw * .62, height * .16, (look() - .5) * .3)); }
  return [...out, ...skirt(look, w, d, look() < .6 ? 3 : 2)];
}

/** A colossal stele: one slab of a way-stone, its carved crown wider than the body, often split so a
 * broad face leans against the stump — the things the Watchers raised and the flood buried. */
function stele(look: Rng, w: number, d: number, height: number): Spec[] {
  const h = height * (.4 + look() * .5), out = [
    box('body', 0, WATER + h / 2 - 1, 0, w, h, d),
    box('slab', 0, WATER + h - 1, 0, w * 1.22, Math.max(2.4, h * .16), d * 1.2),
  ];
  if (look() < .55) out.push(box('wall', (look() < .5 ? -1 : 1) * (w * .8 + 2), WATER + h * .34, (look() - .5) * 2, w * .62, h * .6, d * .78, (look() < .5 ? -1 : 1) * (.06 + look() * .1)));
  return [...out, ...skirt(look, w, d, 2)];
}

/** A stele fragment: the buried stump and one broad face lying half sunk beside it, its far end in
 * the water. */
function fragment(look: Rng, w: number, d: number, height: number): Spec[] {
  const h = Math.max(8, height * (.14 + look() * .12)), side = look() < .5 ? -1 : 1;
  const len = Math.min(height * .55, 34 + look() * 16);
  return [
    box('body', 0, WATER + h / 2 - 1, 0, w, h, d),
    box('wall', side * (w * .62 + len * .18), WATER + 2.4, (look() - .5) * d * .3, len, h * .58, d * .7, -side * .12),
    box('slab', side * (w * .62 + len * .3), WATER + 1.2, (look() - .5) * d * .1, len * .34, 1.4, d * .6, -side * .55),
    ...rim(look, w, d, h + WATER - 1),
    ...skirt(look, w, d, 2),
  ];
}

const rim = (look: Rng, w: number, d: number, top: number): Spec[] => {
  const out: Spec[] = [];
  for (let i = 0, n = 1 + Math.floor(look() * 4); i < n; i++) {
    const ch = 2 + look() * 5, cw = .3 + look() * .5;
    out.push(box('column', (look() - .5) * w * .72, top + ch / 2 - .6, (look() - .5) * d * .72, cw, ch, cw, (look() - .5) * .16));
  }
  return out;
};

/** A watch pillar: a podium lump with its hollow ribs snapped at different heights, a few plates
 * still caught between them, unmistakably dead and hollow (the camera looks through the ribs). */
function pillar(look: Rng, w: number, d: number, height: number): Spec[] {
  const hb = 5 + look() * 3, top = Math.max(hb + 9, height * (.34 + look() * .3));
  const specs: Spec[] = [box('body', 0, WATER - 1 + hb / 2, 0, w, hb, d)];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const ch = Math.max(hb + 2 + look() * 4, top * (.4 + look() * .5));
    specs.push(box('column', sx * (w / 2 - 1.4), WATER + hb * .2 + (ch - hb) / 2, sz * (d / 2 - 1.4), 2.4, ch, 2.4, look() < .2 ? (look() - .5) * .1 : 0));
  }
  const mids = 1 + Math.floor(look() * 3) - 1;
  if (mids > 0) specs.push(box('floor', 0, hb + 4 + look() * 4, 0, w * .56, .7, d * .56));
  return [...specs, ...skirt(look, w, d, 2)];
}

/** A churned obsidian raft field: slabs of the crusted surface heaved up and overturned. All loose:
 * no colliders, decoration over the flats. */
function raft(look: Rng, w: number, d: number): Spec[] {
  const out: Spec[] = [];
  for (let i = 0, n = 5 + Math.floor(look() * 5); i < n; i++) {
    const rw = w * (.2 + look() * .34), rh = 1.4 + look() * 3.4, rd = d * (.2 + look() * .34);
    out.push(box('rubble', (look() - .5) * w * .8, WATER + rh * .22, (look() - .5) * d * .8, rw, rh, rd, (look() - .5) * .8));
  }
  return out;
}

const BUILD: Record<FieldKind, (look: Rng, w: number, d: number, height: number) => Spec[]> = { spire, stele, fragment, pillar, raft };

/** The Dudael shape of a field piece of width w, depth d and zone height `height` (local, from the
 * foot, already capped by the caller so tops stay under the flight ceiling). Every part is an exact
 * box and its collider matches it. */
export const fieldSpecs = (look: Rng, kind: FieldKind, w: number, d: number, height: number) => BUILD[kind](look, w, d, height);
