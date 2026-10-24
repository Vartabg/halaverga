import { Color } from 'three';
import { mulberry32 } from '@/game/combat';
import { type Kit } from './kit';
import { INK, INK_GROUP } from './paintInk';

/** Pre-Flood Watcher sanctuaries, ziggurat bastions, and carved colonnades on Mount Hermon (Garo, 2026-10-21).
 * The ruin kinds preserve the exact collider volumes verified by the flight & navigation test suites while rendering
 * stepped basalt sanctuaries, golden Covenant friezes, snow-dusted cornices, and visible stone colonnades in the Hades ink group. */
export type RuinKind = 'stump' | 'shell' | 'frame' | 'pile';
export const RUIN = { interior: INK.plinth, soot: INK.rock, stone: INK.shaft, ash: INK.lit };
const FLOOR = 3.7, PIT = 2.4;
type Rng = () => number;
type Burn = (y: number) => number;
const ashen = (tint: string) => '#' + new Color(tint).lerp(new Color(RUIN.ash), .55).getHexString();

/** One painted box in the Hades cel-and-ink material group. */
function stone(k: Kit, x: number, y: number, z: number, w: number, h: number, d: number, color: string, solid = false, ry = 0, rz = 0) {
  k.box(x, y, z, w, h, d, color, solid, ry, rz, 1, INK_GROUP);
}

/** Soot above one to three burned floors (fading over two storeys) and on the torn top. */
function burner(rng: Rng, y0: number, y1: number): Burn {
  const bands = Array.from({ length: 1 + Math.floor(rng() * 3) }, () => y0 + FLOOR * Math.floor(rng() * Math.max(1, (y1 - y0) / FLOOR)));
  return y => Math.min(.92, Math.max(0, ...bands.map(b => (y >= b ? Math.exp(-(y - b) / (FLOOR * 1.6)) * .85 : 0))) + Math.max(0, 1 - (y1 - y) / (FLOOR * 2)) * .5);
}

/** A stepped Watcher bastion block from y0 to y1. Keeps the exact rng consumption so collider streams stay bit-identical. */
function gutted(k: Kit, cx: number, cz: number, cw: number, cd: number, y0: number, y1: number, tint: string, rng: Rng, burn: Burn) {
  void tint; void burn;
  const pit = y1 - PIT;
  stone(k, cx, (y0 + pit) / 2, cz, cw - .5, pit - y0, cd - .5, RUIN.interior);
  for (let i = 0, n = 2 + Math.floor(rng() * 3); i < n; i++)
    stone(k, cx + (rng() - .5) * cw * .6, pit + .4, cz + (rng() - .5) * cd * .6, 2 + rng() * 4, .8 + rng() * 1.2, 2 + rng() * 4, RUIN.soot, false, rng() * 3, (rng() - .5) * .4);
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
  const h = y1 - y0, y = y0 + h / 2;
  // Four basalt sanctuary walls + stepped ziggurat plinth + fluted temple pilasters + golden covenant friezes + horned altar crowns
  stone(k, cx, y, cz + cd / 2, cw, h, 1.2, RUIN.stone);
  stone(k, cx, y, cz - cd / 2, cw, h, 1.2, RUIN.stone);
  stone(k, cx + cw / 2, y, cz, 1.2, h, cd, RUIN.stone);
  stone(k, cx - cw / 2, y, cz, 1.2, h, cd, RUIN.stone);
  stone(k, cx, y0 + Math.min(1.8, h * .22), cz, cw + 1.1, Math.min(3.6, h * .38), cd + 1.1, INK.plinth);
  stone(k, cx, y0 + Math.min(3.7, h * .40), cz, cw + .55, .42, cd + .55, INK.crown);
  // Exterior fluted temple pilasters & golden capitals on all four faces
  for (const sx of [-1, 0, 1]) {
    stone(k, cx + sx * (cw * .34), y, cz + cd / 2 + .32, 1.35, h - .4, .65, sx === 0 ? INK.lit : INK.rock);
    stone(k, cx + sx * (cw * .34), y, cz - cd / 2 - .32, 1.35, h - .4, .65, sx === 0 ? INK.lit : INK.rock);
  }
  for (const sz of [-1, 1]) {
    stone(k, cx + cw / 2 + .32, y, cz + sz * (cd * .32), .65, h - .4, 1.35, INK.rock);
    stone(k, cx - cw / 2 - .32, y, cz + sz * (cd * .32), .65, h - .4, 1.35, INK.rock);
  }
  if (h > 8) {
    stone(k, cx, y0 + h * .55, cz, cw + .7, .55, cd + .7, INK.crown);
    stone(k, cx, y1 - 1.5, cz, cw + .9, .65, cd + .9, INK.crown);
    stone(k, cx, y1 - .6, cz, cw + 1.3, .55, cd + 1.3, INK.lit);
    // Stepped ziggurat upper crown & four corner horned altar finials
    stone(k, cx, y1 + 1.1, cz, cw * .72, 2.2, cd * .72, INK.rock);
    stone(k, cx, y1 + 2.35, cz, cw * .76, .45, cd * .76, INK.crown);
    for (const [hx, hz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      stone(k, cx + hx * (cw * .46), y1 + 1.0, cz + hz * (cd * .46), 1.4, 2.1, 1.4, INK.lit);
      stone(k, cx + hx * (cw * .46), y1 + 2.25, cz + hz * (cd * .46), .85, .65, .85, INK.crown);
    }
  }
}

/** The fractured upper altar / battlement of a stone bastion. Preserves exact rng calls and solid battlement blocks. */
function torn(k: Kit, cx: number, cz: number, cw: number, cd: number, y: number, rng: Rng) {
  if (rng() < .7) {
    const pw = cw * (.3 + rng() * .2), pd = cd * (.3 + rng() * .2);
    stone(k, cx + (rng() < .5 ? -1 : 1) * (cw - pw) / 2, y - .6, cz + (rng() - .5) * (cd - pd), pw, .4, pd, INK.lit, false, (rng() - .5) * .3, (rng() - .5) * .35);
  }
  for (let i = 0, n = 3 + Math.floor(rng() * 4); i < n; i++) {
    void (rng() - .5); void (rng() - .5); void rng(); void (rng() - .5);
  }
  for (let i = 0, n = 1 + Math.floor(rng() * 2); i < n; i++) {
    const sw = 2 + rng() * 4, sh = 1.5 + rng() * 3;
    stone(k, cx + (rng() - .5) * (cw - sw), y + sh / 2 - .2, cz + (rng() < .5 ? -1 : 1) * (cd / 2 - 1), sw, sh, 1, INK.shaft, true);
  }
}

/** Rubble blocks slumped against the base. */
function skirt(k: Kit, x: number, base: number, z: number, w: number, d: number, rng: Rng, tint: string) {
  for (let i = 0, n = 2 + Math.floor(rng() * 3); i < n; i++) {
    const onX = rng() < .5, side = rng() < .5 ? -1 : 1, rw = 3 + rng() * 5, rh = 1.2 + rng() * 1.6, rd = 2 + rng() * 1.5;
    const along = (rng() - .5) * (onX ? d : w) * .7;
    if (onX) stone(k, x + side * (w / 2 + rd * .25), base + rh * .3, z + along, rd, rh, rw, tint, false, (rng() - .5) * .5, (rng() - .5) * .4);
    else stone(k, x + along, base + rh * .3, z + side * (d / 2 + rd * .25), rw, rh, rd, tint, false, (rng() - .5) * .5, (rng() - .5) * .4);
  }
}

/** Watcher peristyle colonnade: draws monumental carved stone temple columns and golden-capped architraves matching the exact 'frame' colliders! */
function skeleton(k: Kit, x: number, z: number, w0: number, d0: number, y0: number, y1: number, rng: Rng) {
  const w = w0 - 5, d = d0 - 5, nx = Math.max(3, Math.round(w / 6)), nz = Math.max(2, Math.round(d / 7)), cols: { x: number; z: number; top: number }[] = [];
  const frame = (px: number, py: number, pz: number, pw: number, ph: number, pd: number, rz = 0, color: string = INK.shaft) => {
    k.solids.push({ position: [px, py, pz], size: [pw / 2, ph / 2, pd / 2], rotation: [0, 0, rz], kind: 'frame' });
    stone(k, px, py, pz, Math.max(pw, 1.35), ph, Math.max(pd, 1.35), color, false, 0, rz);
  };
  for (let ix = 0; ix < nx; ix++) for (let iz = 0; iz < nz; iz++) {
    const cx = x - w / 2 + .5 + ix * (w - 1) / (nx - 1), cz = z - d / 2 + .5 + iz * (d - 1) / (nz - 1);
    const top = rng() < .3 ? y0 + 2 + rng() * 6 : y0 + (y1 - y0) * (.45 + rng() * .55);
    cols.push({ x: cx, z: cz, top });
    frame(cx, (y0 + top) / 2, cz, .7, top - y0, .7, 0, INK.lit);
    stone(k, cx, y0 + .55, cz, 1.85, 1.1, 1.85, INK.plinth);
    stone(k, cx, top + .28, cz, 1.95, .56, 1.95, INK.crown);
  }
  for (let y = y0 + FLOOR * 2; y < y1 - 2; y += FLOOR * (1 + Math.floor(rng() * 2))) {
    const held = cols.filter(c => c.top > y + .5);
    if (held.length < 2 || rng() < .25) continue;
    const xs = held.map(c => c.x), from = Math.min(...xs), to = Math.max(...xs), hang = rng() < .35 ? (rng() - .5) * .45 : 0;
    frame((from + to) / 2, y, z, to - from + .6, .5, d - .4, hang, INK.rock);
  }
  for (const c of cols) if (c.top > y0 + 6 && rng() < .5) {
    const next = cols.find(o => o !== c && Math.abs(o.z - c.z) < .1 && o.x > c.x && o.top > y0 + 6);
    if (!next) continue;
    const y = y0 + 3 + rng() * (Math.min(c.top, next.top) - y0 - 4);
    frame((c.x + next.x) / 2, y, c.z, next.x - c.x, .45, .45, 0, INK.crown);
  }
}

/** Cyclopean stone slabs collapsed into a stepped cairn. */
function pile(k: Kit, x: number, base: number, z: number, w: number, d: number, plates: number, rng: Rng, tint: string) {
  let y = base + .4;
  k.block(x, base + plates * .55, z, w * .8, plates * 1.1, d * .8);
  for (let i = 0; i < plates; i++) {
    const tilt = (rng() - .5) * .35, ry = (rng() - .5) * .3, s = 1 - i * .06;
    stone(k, x + (rng() - .5) * 2, y, z + (rng() - .5) * 2, w * s, .6, d * s, i % 2 ? tint : INK.lit, false, ry, tilt);
    y += .9 + rng() * .5;
  }
  for (let i = 0; i < 4; i++) { void (rng() - .5); void (rng() - .5); void rng(); void rng(); void (rng() - .5); }
}

/** A core's colliders: solid up to its debris pit, then four walls to the torn top. */
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
    if (roof) stone(k, x - w * .15, base + h, z, w * .7, .28, d + .6, INK.lit); else torn(k, x - w * .15, z, w * .7, d, base + h, rng);
  } else torn(k, x, z, w, d, base + h1, rng);
  if (kind === 'frame') skeleton(k, x, z, w, d, base + h1 - PIT, base + h, rng);
}
