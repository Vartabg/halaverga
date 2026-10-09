import { BoxGeometry, Color, Euler, Matrix4, Quaternion, Vector3 } from 'three';
import { mulberry32 } from '@/game/combat';
import { colors, type Kit } from './kit';

/** The district's buildings as ruins (Garo, 2026-10-06: nothing may look habitable). Each keeps a gutted, burned-out core cut off at
 * `keep` floors (no glass: piers and floor bands around a black interior, soot climbing from burned floors), then:
 * stump  a torn top, cracked plate and rebar;
 * shell  a narrower burned block standing on to `floors` (the original stepped cap, so the marked roof survives);
 * frame  a bare steel skeleton rising to `floors`, columns snapped at different heights, girders, a few hanging plates;
 * pile   the floors pancaked into a heap.
 * Exterior-only traversal as before: each solid core is one collider block; frame steel collides on its own (kind 'frame').
 * Seeded per building, so the district is the same on every device. */
export type RuinKind = 'stump' | 'shell' | 'frame' | 'pile';
export const RUIN = { interior: '#1f1d1a', soot: '#1a1816', steel: '#4d3a2c', ash: '#7a756a' };
const FLOOR = 3.7, METAL = 2, PIT = 2.4;
type Rng = () => number;
type Burn = (y: number) => number;
const ashen = (tint: string) => '#' + new Color(tint).lerp(new Color(RUIN.ash), .55).getHexString();

/** A box coloured per vertex by a burn function of height (one segment per floor, so soot can climb). */
function burnt(k: Kit, x: number, y: number, z: number, w: number, h: number, d: number, color: string, burn: Burn, ry = 0, rz = 0) {
  const g = new BoxGeometry(w, h, d, 1, Math.max(1, Math.round(h / FLOOR)), 1);
  g.applyMatrix4(new Matrix4().compose(new Vector3(x, y, z), new Quaternion().setFromEuler(new Euler(0, ry, rz)), new Vector3(1, 1, 1)));
  const base = new Color(color), soot = new Color(RUIN.soot), out = new Color();
  k.add(g, color, 1, p => out.copy(base).lerp(soot, burn(p.y)));
}

/** Soot above one to three burned floors (fading over two storeys) and on the torn top. */
function burner(rng: Rng, y0: number, y1: number): Burn {
  const bands = Array.from({ length: 1 + Math.floor(rng() * 3) }, () => y0 + FLOOR * Math.floor(rng() * Math.max(1, (y1 - y0) / FLOOR)));
  return y => Math.min(.92, Math.max(0, ...bands.map(b => (y >= b ? Math.exp(-(y - b) / (FLOOR * 1.6)) * .85 : 0))) + Math.max(0, 1 - (y1 - y) / (FLOOR * 2)) * .5);
}

/** A gutted core from y0 to y1: the black inside, concrete piers (some broken short of the top) and floor bands with gaps. */
function gutted(k: Kit, cx: number, cz: number, cw: number, cd: number, y0: number, y1: number, tint: string, rng: Rng, burn: Burn) {
  // The burned-out inside, seen through the empty windows; its top sits a storey down, so from above a ruin is a dark pit of debris.
  const pit = y1 - PIT;
  k.box(cx, (y0 + pit) / 2, cz, cw - .5, pit - y0, cd - .5, RUIN.interior);
  for (let i = 0, n = 2 + Math.floor(rng() * 3); i < n; i++)
    k.box(cx + (rng() - .5) * cw * .6, pit + .4, cz + (rng() - .5) * cd * .6, 2 + rng() * 4, .8 + rng() * 1.2, 2 + rng() * 4, RUIN.soot, false, rng() * 3, (rng() - .5) * .4);
  const floors = Math.round((y1 - y0) / FLOOR);
  for (const [sx, sz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const len = sx ? cd : cw, px = cx + sx * cw / 2, pz = cz + sz * cd / 2, n = Math.max(2, Math.floor(len / 3));
    for (let i = 0; i <= n; i++) {
      const at = -len / 2 + i * len / n, top = y1 - (rng() < .3 ? FLOOR * (1 + Math.floor(rng() * 2)) : rng() * 1.2), h = top - y0;
      if (h < 1) continue;
      if (sx) burnt(k, px, y0 + h / 2, cz + at, .5, h, .55, tint, burn); else burnt(k, cx + at, y0 + h / 2, pz, .55, h, .5, tint, burn);
    }
    for (let i = 0, shards = Math.floor(rng() * 3); i < shards; i++) { // a few panes of dirty glass still hang in the empty frames
      const at = (rng() - .5) * (len - 3), y = y0 + FLOOR * (Math.floor(rng() * floors) + .55), sw = .6 + rng() * 1.2, sh = .5 + rng() * 1.3;
      if (sx) k.box(px + sx * .08, y, cz + at, .06, sh, sw, colors.glass, false, 0, (rng() - .5) * .3); else k.box(cx + at, y, pz + sz * .08, sw, sh, .06, colors.glass, false, 0, (rng() - .5) * .3);
    }
    for (let f = 1; f <= floors; f++) {
      const y = y0 + f * FLOOR - .5, segs = 1 + Math.floor(rng() * 3);
      if (y > y1 - .3) break;
      for (let s = 0; s < segs; s++) {
        if (f > floors - 2 && rng() < .45) continue;
        const a = -len / 2 + s * len / segs, l = len / segs - (rng() < .4 ? rng() * len / segs * .6 : 0), mid = a + l / 2;
        if (sx) burnt(k, px + sx * .05, y, cz + mid, .45, .9, l, tint, burn); else burnt(k, cx + mid, y, pz + sz * .05, l, .9, .45, tint, burn);
      }
    }
  }
}

/** The torn top of a core at y: a cracked remnant of the floor plate, rebar and a burned stub or two. */
function torn(k: Kit, cx: number, cz: number, cw: number, cd: number, y: number, rng: Rng) {
  if (rng() < .7) { // what is left of the top floor plate: a sooty piece sagging into the pit
    const pw = cw * (.3 + rng() * .2), pd = cd * (.3 + rng() * .2);
    k.box(cx + (rng() < .5 ? -1 : 1) * (cw - pw) / 2, y - .6, cz + (rng() - .5) * (cd - pd), pw, .4, pd, '#4a4640', false, (rng() - .5) * .3, (rng() - .5) * .35);
  }
  for (let i = 0, n = 3 + Math.floor(rng() * 4); i < n; i++)
    k.box(cx + (rng() - .5) * cw * .85, y + 1.2, cz + (rng() - .5) * cd * .85, .1, 2.6 + rng() * 2.4, .1, RUIN.steel, false, 0, (rng() - .5) * .5, 1, METAL);
  for (let i = 0, n = 1 + Math.floor(rng() * 2); i < n; i++) {
    const sw = 2 + rng() * 4, sh = 1.5 + rng() * 3;
    k.box(cx + (rng() - .5) * (cw - sw), y + sh / 2 - .2, cz + (rng() < .5 ? -1 : 1) * (cd / 2 - 1), sw, sh, 1, RUIN.soot, true);
  }
}

/** Rubble slumped against the base. Decoration only, kept low and within about 2.5 m of the face: the core's own collider and the
 * clearance band already hold the suit off that strip, and solid rubble there snagged low passes along the banks (the recorded pins,
 * 2026-10-06). */
function skirt(k: Kit, x: number, base: number, z: number, w: number, d: number, rng: Rng, tint: string) {
  for (let i = 0, n = 2 + Math.floor(rng() * 3); i < n; i++) {
    const onX = rng() < .5, side = rng() < .5 ? -1 : 1, rw = 3 + rng() * 5, rh = 1.2 + rng() * 1.6, rd = 2 + rng() * 1.5;
    const along = (rng() - .5) * (onX ? d : w) * .7;
    if (onX) k.box(x + side * (w / 2 + rd * .25), base + rh * .3, z + along, rd, rh, rw, tint, false, (rng() - .5) * .5, (rng() - .5) * .4);
    else k.box(x + along, base + rh * .3, z + side * (d / 2 + rd * .25), rw, rh, rd, tint, false, (rng() - .5) * .5, (rng() - .5) * .4);
  }
}

/** Bare steel above a core: a column grid snapped at different heights, girders and a few hanging plates, each solid on its own
 * (FRAME_GROUPS: the camera boom looks through it). */
function skeleton(k: Kit, x: number, z: number, w0: number, d0: number, y0: number, y1: number, rng: Rng) {
  // The outer bay fell away: the steel stands 2.5 m in from the facade, so a suit sliding up a face clears the rim before any column.
  const w = w0 - 5, d = d0 - 5, nx = Math.max(3, Math.round(w / 6)), nz = Math.max(2, Math.round(d / 7)), cols: { x: number; z: number; top: number }[] = [];
  for (let ix = 0; ix < nx; ix++) for (let iz = 0; iz < nz; iz++) {
    const cx = x - w / 2 + .5 + ix * (w - 1) / (nx - 1), cz = z - d / 2 + .5 + iz * (d - 1) / (nz - 1);
    const top = rng() < .3 ? y0 + 2 + rng() * 6 : y0 + (y1 - y0) * (.45 + rng() * .55);
    cols.push({ x: cx, z: cz, top });
    k.box(cx, (y0 + top) / 2, cz, .7, top - y0, .7, RUIN.steel, true, 0, 0, 1, METAL);
    k.solids[k.solids.length - 1].kind = 'frame';
  }
  for (let y = y0 + FLOOR * 2; y < y1 - 2; y += FLOOR * (1 + Math.floor(rng() * 2))) {
    const held = cols.filter(c => c.top > y + .5);
    if (held.length < 2 || rng() < .25) continue;
    const xs = held.map(c => c.x), from = Math.min(...xs), to = Math.max(...xs), hang = rng() < .35 ? (rng() - .5) * .45 : 0;
    k.box((from + to) / 2, y, z, to - from + .6, .5, d - .4, colors.concrete, true, 0, hang);
    k.solids[k.solids.length - 1].kind = 'frame';
  }
  for (const c of cols) if (c.top > y0 + 6 && rng() < .5) {
    const next = cols.find(o => o !== c && Math.abs(o.z - c.z) < .1 && o.x > c.x && o.top > y0 + 6);
    if (!next) continue;
    const y = y0 + 3 + rng() * (Math.min(c.top, next.top) - y0 - 4);
    k.box((c.x + next.x) / 2, y, c.z, next.x - c.x, .45, .45, RUIN.steel, true, 0, 0, 1, METAL);
    k.solids[k.solids.length - 1].kind = 'frame';
  }
}

/** The floors pancaked into a tilted heap of plates. */
function pile(k: Kit, x: number, base: number, z: number, w: number, d: number, plates: number, rng: Rng, tint: string) {
  let y = base + .4;
  k.block(x, base + plates * .55, z, w * .8, plates * 1.1, d * .8);
  for (let i = 0; i < plates; i++) {
    const tilt = (rng() - .5) * .35, ry = (rng() - .5) * .3, s = 1 - i * .06;
    k.box(x + (rng() - .5) * 2, y, z + (rng() - .5) * 2, w * s, .6, d * s, i % 2 ? tint : colors.concrete, false, ry, tilt);
    y += .9 + rng() * .5;
  }
  for (let i = 0; i < 4; i++) k.box(x + (rng() - .5) * w * .7, y - 1 + i * .2, z + (rng() - .5) * d * .7, .12, 3 + rng() * 3, .12, RUIN.steel, false, rng(), (rng() - .5) * .9, 1, METAL);
}

/** A core's colliders: solid up to its debris pit, then four walls to the torn top, so you can land in a ruin and not on a lid
 * above it. A core with its roof plate (`open` false) is solid to the top. */
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
  skirt(k, x, base, z, w, d, rng, color);
  if (kind === 'pile') { pile(k, x, base, z, w, d, keep + 2, rng, color); return; }
  solidCore(k, x, base, z, w, d, base + h1, kind !== 'shell');
  gutted(k, x, z, w, d, base, base + h1, color, rng, burner(rng, base, base + h1));
  if (kind === 'shell') {
    solidCore(k, x - w * .15, base + h1, z, w * .7 - .6, d, base + h + (roof ? .14 : 0), !roof);
    gutted(k, x - w * .15, z, w * .7, d, base + h1, base + h, color, rng, burner(rng, base + h1, base + h));
    // Only the marked tower roof on the route kept its top plate (a landing); every other shell is open to the sky.
    if (roof) k.box(x - w * .15, base + h, z, w * .7, .28, d + .6, colors.concrete); else torn(k, x - w * .15, z, w * .7, d, base + h, rng);
  } else torn(k, x, z, w, d, base + h1, rng);
  if (kind === 'frame') skeleton(k, x, z, w, d, base + h1 - PIT, base + h, rng);
}
