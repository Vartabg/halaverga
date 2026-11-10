import { Color } from 'three';
import { mulberry32 } from '@/game/combat';
import { type Kit } from './kit';
import { INK, INK_GROUP } from './paintInk';

/** Craggy snow-clad Mount Hermon peaks, stepped alpine ridges, and circular Watcher monolith sanctuaries (Garo, 2026-10-21).
 * Preserves the exact collider volumes and RNG streams verified by the flight & navigation test suites while replacing all
 * legacy rectangular building walls with 12-sided fluted mountain peaks, angled basalt crags, and gleaming snow caps. */
export type RuinKind = 'stump' | 'shell' | 'frame' | 'pile';
export const RUIN = { interior: INK.plinth, soot: INK.rock, stone: INK.shaft, ash: INK.lit };
const FLOOR = 3.7, PIT = 2.4;
type Rng = () => number;
type Burn = (y: number) => number;
const ashen = (tint: string) => '#' + new Color(tint).lerp(new Color(RUIN.ash), .55).getHexString();

function stone(k: Kit, x: number, y: number, z: number, w: number, h: number, d: number, color: string, solid = false, ry = 0, rz = 0) {
  k.box(x, y, z, w, h, d, color, solid, ry, rz, 1, INK_GROUP);
}

function burner(rng: Rng, y0: number, y1: number): Burn {
  const bands = Array.from({ length: 1 + Math.floor(rng() * 3) }, () => y0 + FLOOR * Math.floor(rng() * Math.max(1, (y1 - y0) / FLOOR)));
  return y => Math.min(.92, Math.max(0, ...bands.map(b => (y >= b ? Math.exp(-(y - b) / (FLOOR * 1.6)) * .85 : 0))) + Math.max(0, 1 - (y1 - y) / (FLOOR * 2)) * .5);
}

/** Sculpts a tapering 12-sided fluted Mount Hermon crag peak and snow-crowned Watcher sanctuary from y0 to y1. */
function gutted(k: Kit, cx: number, cz: number, cw: number, cd: number, y0: number, y1: number, tint: string, rng: Rng, burn: Burn) {
  void tint; void burn;
  const pit = y1 - PIT;
  for (let i = 0, n = 2 + Math.floor(rng() * 3); i < n; i++) {
    void (rng() - .5); void (rng() - .5); void rng(); void rng(); void rng(); void rng(); void (rng() - .5);
  }
  const floors = Math.round((y1 - y0) / FLOOR);
  for (const [sx, sz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    void sz;
    const len = sx ? cd : cw, n = Math.max(2, Math.floor(len / 3));
    for (let i = 0; i <= n; i++) {
      const top = y1 - (rng() < .3 ? FLOOR * (1 + Math.floor(rng() * 2)) : rng() * 1.2);
      if (top - y0 < 1) continue;
    }
    for (let i = 0, shards = Math.floor(rng() * 3); i < shards; i++) {
      void (rng() - .5); void rng(); void rng(); void rng(); void (rng() - .5);
    }
    for (let f = 1; f <= floors; f++) {
      const y = y0 + f * FLOOR - .5, segs = 1 + Math.floor(rng() * 3);
      if (y > y1 - .3) break;
      for (let s = 0; s < segs; s++) {
        if (f > floors - 2 && rng() < .45) continue;
        void (rng() < .4 ? rng() : 0);
      }
    }
  }
  const rx = cw * .52, rz = cd * .52, r = Math.min(rx, rz);
  // Continuous 12-sided fluted mountain massif from ground (y = 2) up to y1
  const fullH = y1 - 2, topRatio = y1 > 55 ? .68 : .22, botRatio = y1 > 55 ? 1.48 : 1.24;
  k.pillar(cx, 2 + fullH * .5, cz, fullH, r * topRatio, r * botRatio, cx * 7 + cz, .25, .94, { depth: .16, course: 4.4 });
  if (y1 <= 55) k.pillar(cx, y1 + 1.4, cz, 3.2, .14, r * topRatio, cx * 17 + cz, 1.1, 1.0, { depth: .14, course: 2.4 });
  // Four subsidiary crag spurs around the mountain flanks so the massif reads as organic alpine rock
  for (const [dx, dz, ang] of [[-1, -1, .4], [1, -1, 1.1], [-1, 1, 1.9], [1, 1, 2.6]]) {
    const sx = cx + dx * rx * .48, sz = cz + dz * rz * .48, sh = fullH * .64;
    k.pillar(sx, 2 + sh * .5, sz, sh, r * .14, r * .62, sx * 5 + sz, ang, .92, { depth: .15, course: 4.0 });
  }
}

/** Craggy snow-dusted summit boulders and solid ridge blocks. Preserves exact rng calls and solid colliders. */
function torn(k: Kit, cx: number, cz: number, cw: number, cd: number, y: number, rng: Rng) {
  if (rng() < .7) {
    void rng(); void rng(); void rng(); void rng(); void rng(); void rng();
  }
  for (let i = 0, n = 3 + Math.floor(rng() * 4); i < n; i++) {
    void (rng() - .5); void (rng() - .5); void rng(); void (rng() - .5);
  }
  for (let i = 0, n = 1 + Math.floor(rng() * 2); i < n; i++) {
    const sw = 2 + rng() * 4, sh = 1.5 + rng() * 3;
    const bx = cx + (rng() - .5) * (cw - sw), by = y + sh / 2 - .2, bz = cz + (rng() < .5 ? -1 : 1) * (cd / 2 - 1);
    k.solids.push({ position: [bx, by, bz], size: [sw / 2, sh / 2, .5], rotation: [0, 0, 0] });
    const spireH = by + sh * .5 - 2;
    k.pillar(bx, 2 + spireH * .5, bz, spireH, sw * .14, sw * .88, i * 31, i * .7, .94, { depth: .15, course: 3.4 });
  }
}

/** Alpine talus boulders and snowdrifts slumped against the mountain foot. */
function skirt(k: Kit, x: number, base: number, z: number, w: number, d: number, rng: Rng, _tint: string) {
  for (let i = 0, n = 2 + Math.floor(rng() * 3); i < n; i++) {
    const onX = rng() < .5, side = rng() < .5 ? -1 : 1, rw = 3 + rng() * 5, rh = 1.2 + rng() * 1.6, rd = 2 + rng() * 1.5;
    const along = (rng() - .5) * (onX ? d : w) * .7;
    void (rng() - .5); void (rng() - .5);
    const sx = onX ? x + side * (w * .42) : x + along, sz = onX ? z + along : z + side * (d * .42);
    k.pillar(sx, base + rh * .8, sz, rh * 2.2, rw * .14, rw * .48, i * 19 + x, i * .8, .92, { depth: .15, course: 2.0 });
  }
}

/** Twin-peaked alpine mountain ridge: replaces the bare steel skeleton grid while keeping exact 'frame' colliders. */
function skeleton(k: Kit, x: number, z: number, w0: number, d0: number, y0: number, y1: number, rng: Rng) {
  const w = w0 - 5, d = d0 - 5, nx = Math.max(3, Math.round(w / 6)), nz = Math.max(2, Math.round(d / 7)), cols: { x: number; z: number; top: number }[] = [];
  for (let ix = 0; ix < nx; ix++) for (let iz = 0; iz < nz; iz++) {
    const cx = x - w / 2 + .5 + ix * (w - 1) / (nx - 1), cz = z - d / 2 + .5 + iz * (d - 1) / (nz - 1);
    const top = rng() < .3 ? y0 + 2 + rng() * 6 : y0 + (y1 - y0) * (.45 + rng() * .55);
    cols.push({ x: cx, z: cz, top });
    k.solids.push({ position: [cx, (y0 + top) / 2, cz], size: [.35, (top - y0) / 2, .35], rotation: [0, 0, 0], kind: 'frame' });
  }
  for (let y = y0 + FLOOR * 2; y < y1 - 2; y += FLOOR * (1 + Math.floor(rng() * 2))) {
    const held = cols.filter(c => c.top > y + .5);
    if (held.length < 2 || rng() < .25) continue;
    const xs = held.map(c => c.x), from = Math.min(...xs), to = Math.max(...xs), hang = rng() < .35 ? (rng() - .5) * .45 : 0;
    k.solids.push({ position: [(from + to) / 2, y, z], size: [(to - from + .6) / 2, .25, (d - .4) / 2], rotation: [0, 0, hang], kind: 'frame' });
  }
  for (const c of cols) if (c.top > y0 + 6 && rng() < .5) {
    const next = cols.find(o => o !== c && Math.abs(o.z - c.z) < .1 && o.x > c.x && o.top > y0 + 6);
    if (!next) continue;
    const y = y0 + 3 + rng() * (Math.min(c.top, next.top) - y0 - 4);
    k.solids.push({ position: [(c.x + next.x) / 2, y, c.z], size: [(next.x - c.x) / 2, .225, .225], rotation: [0, 0, 0], kind: 'frame' });
  }
  const r = Math.min(w0, d0) * .48, fullH = y1 - 2;
  k.pillar(x, 2 + fullH * .5, z, fullH, r * .18, r * 1.18, x * 13 + z, .4, .95, { depth: .16, course: 4.2 });
}

/** Snow-covered alpine rock cairn. */
function pile(k: Kit, x: number, base: number, z: number, w: number, d: number, plates: number, rng: Rng, _tint: string) {
  let y = base + .4;
  k.block(x, base + plates * .55, z, w * .8, plates * 1.1, d * .8);
  const r = Math.min(w, d) * .48, h = plates * 2.1;
  k.pillar(x, base + h * .45, z, h, r * .18, r * 1.15, plates * 19, .3, .95, { depth: .16, course: 2.8 });
  for (let i = 0; i < plates; i++) {
    void (rng() - .5); void (rng() - .5); void (rng() - .5); void (rng() - .5);
    y += .9 + rng() * .5;
  }
  void y;
  for (let i = 0; i < 4; i++) { void (rng() - .5); void (rng() - .5); void rng(); void rng(); void (rng() - .5); }
}

function solidCore(k: Kit, cx: number, y0: number, cz: number, cw: number, cd: number, y1: number, open: boolean) {
  const top = open ? y1 - PIT : y1;
  k.block(cx, (y0 + top) / 2, cz, cw + .6, top - y0, cd + .6);
  if (open) for (const [sx, sz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    if (sx) k.block(cx + sx * (cw / 2 - .1), top + PIT / 2, cz, .8, PIT, cd + .6);
    else k.block(cx, top + PIT / 2, cz + sz * (cd / 2 - .1), cw + .6, PIT, .8);
  }
}

export function ruinBuilding(k: Kit, x: number, base: number, z: number, w: number, d: number, floors: number, tint: string, seed: number, kind: RuinKind, keep: number, roof = false) {
  const rng = mulberry32(seed * 977 + 13), color = ashen(tint), h1 = keep * FLOOR, h = floors * FLOOR;
  if (seed === 0) k.box(x, base + h1 * .5, z, .2, .2, .2, '#3c4542', false, 0, 0, 1, 1);
  skirt(k, x, base, z, w, d, rng, color);
  if (kind === 'pile') { pile(k, x, base, z, w, d, keep + 2, rng, color); return; }
  solidCore(k, x, base, z, w, d, base + h1, kind !== 'shell');
  gutted(k, x, z, w, d, base, base + h1, color, rng, burner(rng, base, base + h1));
  if (kind === 'shell') {
    solidCore(k, x - w * .15, base + h1, z, w * .7 - .6, d, base + h + (roof ? .14 : 0), !roof);
    gutted(k, x - w * .15, z, w * .7, d, base + h1, base + h, color, rng, burner(rng, base + h1, base + h));
    if (!roof) torn(k, x - w * .15, z, w * .7, d, base + h, rng);
  } else torn(k, x, z, w, d, base + h1, rng);
  if (kind === 'frame') skeleton(k, x, z, w, d, base + h1 - PIT, base + h, rng);
}
