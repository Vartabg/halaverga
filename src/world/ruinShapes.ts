import { box } from './skylineDamage';
import type { Rng, Spec } from './skylineParts';

/** What is left of a tower after 2033 (Garo, 2026-10-06: ruins, not buildings that still stand). Every shape is boxes in the tower's
 * own frame, y up from the foot (the water is at local y 3.1). Every part after the first starts inside a part before it, so nothing
 * floats. Drawn from the tower's own `look` stream only, so changing a ruin never moves the skyline. Pure, Node-safe. */
export type Ruin = 'stump' | 'skeleton' | 'shell' | 'fallen' | 'mound';
export const WATER_LOCAL = 3.1;
const FLOOR = 3.7;

/** The mix of ruins: mostly stumps; bare steel skeletons and burned shells make the tall silhouettes; landmarks are always tall. */
export function pickRuin(look: Rng, landmark: boolean): Ruin {
  const r = look();
  if (landmark) return r < .55 ? 'skeleton' : 'shell';
  return r < .36 ? 'stump' : r < .58 ? 'skeleton' : r < .7 ? 'shell' : r < .82 ? 'fallen' : 'mound';
}

/** A broken-off tower: a solid trunk cut low, a jagged rim of wall stubs, a cracked floor plate, rebar and a rubble skirt. */
function stump(look: Rng, w: number, d: number, height: number, layer: number): Spec[] {
  const hs = Math.max(11, height * (.15 + look() * .3)), body = box('body', 0, hs / 2, 0, w, hs, d);
  if (look() < .6) body.shear = Math.min(hs * .5, 3 + look() * 9); // torn off on a slant
  const specs = [body, ...rim(look, w, d, hs - (body.shear ?? 0) * .5, layer)];
  if (look() < .55) specs.push(box('slab', (look() - .5) * w * .3, hs + .3, (look() - .5) * d * .3, w * .72, .6, d * .62, (look() - .5) * .45));
  return [...specs, ...skirt(look, w, d, layer === 2 ? 1 : 2 + Math.floor(look() * 3))];
}

/** The torn top of a trunk cut at hs: burned wall stubs along the edges and, on the nearest layer, rebar. */
function rim(look: Rng, w: number, d: number, hs: number, layer: number): Spec[] {
  const out: Spec[] = [];
  for (let i = 0, n = layer === 2 ? 2 : 3 + Math.floor(look() * 3); i < n; i++) {
    const sw = w * (.14 + look() * .22), sd = d * (.14 + look() * .22), sh = 1.5 + look() * (layer === 2 ? 5 : 9), alongX = look() < .5;
    const x = alongX ? (look() - .5) * (w - sw) : (look() < .5 ? -1 : 1) * (w - sw) / 2;
    const z = alongX ? (look() < .5 ? -1 : 1) * (d - sd) / 2 : (look() - .5) * (d - sd);
    out.push({ ...box('stub', x, hs - .5 + sh / 2, z, sw, sh, sd), burn: .7 });
  }
  if (layer === 0) for (let i = 0, n = 2 + Math.floor(look() * 4); i < n; i++) {
    const rh = 2 + look() * 5;
    out.push(box('rebar', (look() - .5) * w * .8, hs - .5 + rh / 2, (look() - .5) * d * .8, .3, rh, .3, (look() - .5) * .5));
  }
  return out;
}

/** Rubble slumped against a footing and into the water, sticking out past the footprint. */
function skirt(look: Rng, w: number, d: number, n: number): Spec[] {
  const out: Spec[] = [];
  for (let i = 0; i < n; i++) {
    const side = look() < .5 ? -1 : 1, onX = look() < .5, rw = (onX ? d : w) * (.35 + look() * .4), rh = 3 + look() * 5, rd = 4 + look() * 7;
    const along = (look() - .5) * (onX ? d : w) * .5, y = WATER_LOCAL + rh * .15, tilt = (look() - .5) * .7;
    out.push(onX ? box('rubble', side * w / 2, y, along, rd, rh, rw, tilt) : box('rubble', along, y, side * d / 2, rw, rh, rd, tilt));
  }
  return out;
}

/** A tower stripped to its steel: a burned base, a grid of columns snapped at different heights, girders and a few floor plates
 * still caught between them, some hanging where they pancaked. Tall, see-through, unmistakably dead. */
function skeleton(look: Rng, w: number, d: number, height: number, layer: number): Spec[] {
  const hb = 4 + (1 + Math.floor(look() * 4)) * FLOOR, specs: Spec[] = [{ ...box('body', 0, hb / 2, 0, w, hb, d), burn: .5 }];
  const nx = w > 20 ? 4 : 3, nz = d > 18 ? 3 : 2, cw = [1.1, 1.4, 1.8][layer], top = Math.max(hb + 12, height * (.5 + look() * .4));
  const cols: { x: number; z: number; top: number }[] = [];
  for (let ix = 0; ix < nx; ix++) for (let iz = 0; iz < nz; iz++) {
    const x = -w / 2 + cw / 2 + ix * (w - cw) / (nx - 1), z = -d / 2 + cw / 2 + iz * (d - cw) / (nz - 1), r = look();
    const ch = Math.max(hb + 1.5, r < .3 ? hb + 2 + look() * 8 : top * (.5 + look() * .5));
    cols.push({ x, z, top: ch });
    specs.push(box('column', x, (hb - .5 + ch) / 2, z, cw, ch - hb + .5, cw, look() < .15 ? (look() - .5) * .2 : 0));
  }
  const reach = (from: number, to: number, y: number, z?: number) => cols.some(c => c.x >= from && c.x <= to && c.top > y + .6 && (z === undefined || Math.abs(c.z - z) < .01));
  for (let y = hb + FLOOR * 2; y < top - 2; y += FLOOR * (1 + Math.floor(look() * 3))) {
    if (look() < .3) continue;
    const sw = w * (.45 + look() * .55), sx = (look() - .5) * (w - sw);
    if (!reach(sx - sw / 2, sx + sw / 2, y)) continue;
    specs.push({ ...box('floor', sx, y, 0, sw, .55, d, look() < .3 ? (look() - .5) * .5 : 0), burn: .35 });
  }
  for (let i = 0, n = layer === 2 ? 1 : 1 + Math.floor(look() * 3); i < n; i++) {
    const y = hb + 2 + look() * (top - hb) * .6, z = (look() < .5 ? -1 : 1) * (d - cw) / 2;
    if (reach(-w, w, y, z)) specs.push(box('beam', 0, y, z, w - cw, .6, .6));
  }
  return [...specs, ...skirt(look, w, d, layer === 2 ? 1 : 2)];
}

/** A burned-out shell: four walls of empty windows standing to ragged heights around nothing, one side mostly fallen, a couple of
 * floor plates left inside. */
function shell(look: Rng, w: number, d: number, height: number, layer: number): Spec[] {
  const hs = Math.max(20, height * (.4 + look() * .4)), t = layer === 2 ? 1.6 : 1.2, base = 5.5, gone = Math.floor(look() * 4);
  const specs: Spec[] = [{ ...box('body', 0, base / 2, 0, w, base, d), burn: .6 }];
  let low = hs;
  [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([sx, sz], side) => {
    const len = sx ? d : w, n = 2 + Math.floor(look() * 2), seg = len / n;
    for (let i = 0; i < n; i++) {
      const sh = hs * (side === gone ? .12 + look() * .25 : look() < .25 ? .35 + look() * .3 : .7 + look() * .3), at = -len / 2 + seg * (i + .5);
      if (i > 0 && look() < .22) continue; // a whole bay blown out: you see through the shell
      if (sx) low = Math.min(low, sh);
      const part = sx ? box('wall', sx * (w - t) / 2, base - .5 + sh / 2, at, t, sh, seg + .02) : box('wall', at, base - .5 + sh / 2, sz * (d - t) / 2, seg + .02, sh, t);
      if (look() < .7) { part.shear = Math.min(sh * .45, 2 + look() * 10); if (sx) part.shearZ = true; }
      specs.push({ ...part, burn: look() < .4 ? .55 : .15 });
    }
  });
  for (let i = 0, n = 1 + Math.floor(look() * 2); i < n; i++)
    specs.push({ ...box('floor', 0, base + 3 + (low - 4) * look(), (look() - .5) * d * .2, w - t, .55, d * (.4 + look() * .5), look() < .4 ? (look() - .5) * .3 : 0), burn: .4 });
  return [...specs, ...skirt(look, w, d, 1 + Math.floor(look() * 2))];
}

/** A stump whose upper storeys broke off and fell along the shore, their far end sunk in the water. */
function fallen(look: Rng, w: number, d: number, height: number, layer: number): Spec[] {
  const hs = Math.max(10, height * (.14 + look() * .16)), side = look() < .5 ? -1 : 1, phi = .26 + look() * .4;
  const len = Math.min(height * .7, (hs + 3) / Math.sin(phi) + 4), tw = w * .78, td = d * .78;
  const cx = side * (w / 2 - 1) + side * Math.cos(phi) * len / 2, cy = hs - 1.5 - Math.sin(phi) * len / 2;
  return [{ ...box('body', 0, hs / 2, 0, w, hs, d), burn: .4 }, { ...box('fallen', cx, cy, (look() - .5) * d * .2, len, tw, td, -side * phi), burn: .3 },
    ...rim(look, w, d, hs, layer)];
}

/** What a tower is when nothing stands: a heap of slabs and wall pieces with a column or two sticking out. */
function mound(look: Rng, w: number, d: number, _height: number, layer: number): Spec[] {
  const hm = WATER_LOCAL + 2 + look() * 4, specs = [box('body', 0, hm / 2, 0, w * .8, hm, d * .8)];
  for (let i = 0, n = 3 + Math.floor(look() * 3); i < n; i++) {
    const rw = w * (.3 + look() * .4), rd = d * (.3 + look() * .4), rh = 2 + look() * 4;
    specs.push(box('rubble', (look() - .5) * w * .6, hm - 1 + rh * .3, (look() - .5) * d * .6, rw, rh, rd, (look() - .5) * .8));
  }
  if (layer < 2) for (let i = 0, n = 1 + Math.floor(look() * 2); i < n; i++) {
    const ch = 6 + look() * 12;
    specs.push(box('column', (look() - .5) * w * .5, hm - 1 + ch / 2, (look() - .5) * d * .5, 1, ch, 1, (look() - .5) * .6));
  }
  return specs;
}

const BUILD = { stump, skeleton, shell, fallen, mound };
/** The ruin of a tower of width w, depth d and original roof height `height` (local, from the foot). */
export const ruinSpecs = (look: Rng, ruin: Ruin, w: number, d: number, height: number, layer: number) => BUILD[ruin](look, w, d, height, layer);
