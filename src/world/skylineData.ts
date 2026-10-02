import { BufferGeometry, Float32BufferAttribute } from 'three';
import { mulberry32 } from '@/game/combat';
import { WORLD } from '@/game/motion';
import { SKYLINE } from './atmospherePalette';
import { pickMood, weather } from './skylineDamage';
import { bakeTower, towerSpecs, type Buffers, type Part } from './skylineParts';

/** The distant skyline: broken modern towers standing in the sea in three hazy layers, outside the flyable box, world-fixed (no
 * anchoring, no per-frame code, no colliders). Seeded, so every run and every device builds the same city. Pure and Node-safe. */
export type Tower = { layer: number; x: number; z: number; w: number; d: number; yaw: number; lean: number; top: number; foot: [number, number]; parts: Part[] };
/** Height range of a layer's roofs above the water, and its landmarks' cap. */
const HEIGHTS: [number, number][] = [[45, 95], [55, 115], [65, 135]];
const LANDMARK = 140, CORNER = 90, CENTER_Z = (WORLD.minZ + WORLD.maxZ) / 2;
/** Canal vista: layers 1 and 2 keep this half width clear on the canal axis (x 0) north of the district, so the default view ends in
 * open sea dissolving into haze. A tall cluster flanks it on the left and a smaller one on the right. */
export const VISTA = 30;
const CLUSTERS = { left: { from: -130, to: -60, height: [105, 135] }, right: { from: 60, to: 110, height: [85, 110] } };

type Point = { x: number; z: number; nx: number; nz: number };
/** The flyable box pushed out by a gap on each side, corners rounded, as a closed outline sampled by arc length. */
function outline([north, side, south]: [number, number, number]) {
  const x0 = WORLD.minX - side, x1 = WORLD.maxX + side, z0 = WORLD.minZ - north, z1 = WORLD.maxZ + south, pts: [number, number][] = [];
  for (const [cx, cz, from] of [[x1 - CORNER, z0 + CORNER, -90], [x1 - CORNER, z1 - CORNER, 0], [x0 + CORNER, z1 - CORNER, 90], [x0 + CORNER, z0 + CORNER, 180]])
    for (let i = 0; i <= 12; i++) { const a = (from + i * 7.5) * Math.PI / 180; pts.push([cx + CORNER * Math.cos(a), cz + CORNER * Math.sin(a)]); }
  const lengths = pts.map((p, i) => Math.hypot(pts[(i + 1) % pts.length][0] - p[0], pts[(i + 1) % pts.length][1] - p[1]));
  const total = lengths.reduce((a, b) => a + b, 0);
  const at = (s: number): Point => {
    let i = 0; while (s > lengths[i]) s -= lengths[i++];
    const [ax, az] = pts[i], [bx, bz] = pts[(i + 1) % pts.length], t = s / lengths[i], dx = (bx - ax) / lengths[i], dz = (bz - az) / lengths[i];
    return { x: ax + (bx - ax) * t, z: az + (bz - az) * t, nx: dz, nz: -dx };
  };
  return { total, at };
}

/** Builds the skyline: its merged geometry (positions, baked per-vertex colour and a per-tower seed, one draw call), the tower records the tests read,
 * and the triangle count. */
export function makeSkyline(seed = SKYLINE.seed) {
  const rng = mulberry32(seed), out: Buffers = { position: [], color: [], index: [], seed: [] }, towers: Tower[] = [];
  SKYLINE.gaps.forEach((gaps, layer) => {
    const path = outline(gaps), [lo, hi] = HEIGHTS[layer];
    for (let s = rng() * 30; s < path.total;) {
      const w = 12 + rng() * 14, d = 12 + rng() * 10, p = path.at(s), tilt = (rng() - .5) * .16;
      s += Math.max(24, w + 5) + rng() * 14;
      const north = Math.abs(Math.atan2(p.x, CENTER_Z - p.z)) < 75 * Math.PI / 180;
      if (rng() > (north ? .92 : .55)) continue;
      const yaw = Math.atan2(p.nx, p.nz) + tilt, reach = d / 2 * Math.cos(tilt) + w / 2 * Math.abs(Math.sin(tilt));
      const x = p.x + p.nx * reach, z = p.z + p.nz * reach, due = p.z < WORLD.minZ && p.nz < -.7;
      if (layer < 2 && due && Math.abs(x) < VISTA) continue;
      const cluster = layer < 2 && due ? (x > CLUSTERS.left.from && x < CLUSTERS.left.to ? CLUSTERS.left : x > CLUSTERS.right.from && x < CLUSTERS.right.to ? CLUSTERS.right : null) : null;
      const landmark = rng() < .1, tall = cluster ? cluster.height : landmark ? [hi, LANDMARK] : [lo, hi];
      const h = tall[0] + (tall[1] - tall[0]) * rng() ** (cluster || landmark ? 1 : 1.3);
      const lean = rng() < .1 ? .03 + rng() * .04 : 0, leanAxis = rng() * Math.PI * 2, bright = 1 + (rng() - .5) * .12;
      // What time did to this tower comes from its own stream, so adding damage never moves a tower (the layout draws from `rng` only).
      const look = mulberry32(seed * 7 + towers.length * 7919 + 17), mood = pickMood(look), tag = look() * .999;
      const baked = bakeTower(out, { x, z, yaw, lean, leanAxis, layer, bright, mood, seed: tag }, weather(towerSpecs(rng, w, d, h, layer), look, w, d, layer));
      towers.push({ layer, x, z, w, d, yaw, lean, top: Math.max(...baked.parts.map(q => q.max[1])), foot: baked.foot, parts: baked.parts });
    }
  });
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(out.position, 3));
  geometry.setAttribute('color', new Float32BufferAttribute(out.color, 3));
  geometry.setAttribute('aSeed', new Float32BufferAttribute(out.seed, 1));
  geometry.setIndex(out.index);
  geometry.computeBoundingSphere();
  return { geometry, towers, triangles: out.index.length / 3 };
}
