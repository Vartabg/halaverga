import { BufferGeometry, Euler, Float32BufferAttribute, Matrix4, Quaternion, Vector3 } from 'three';
import { mulberry32 } from '@/game/combat';
import { WORLD } from '@/game/motion';
import type { Solid, Triple } from './kit';
import { pickMood } from './skylineDamage';
import { bakeTower, FOOT_Y, type Buffers, type PartKind, type Spec, type Stand } from './skylineParts';
import { fieldSpecs, pickFieldKind, type FieldKind } from './dudaelFieldShapes';
import { anchorSpecs, type Preset } from './dudaelFieldData';

/** The drowned city around the district, flyable since 2026-10-06 (Garo: "open it up") and Dudael
 * chasm terrain since 2026-10-21 (Garo: the open world was uninteresting; the board audit retired
 * the modern-ruins grammar for the Enoch theme). Blocks on a 52 m grid with 20 m channels (the old
 * streets, now flight lanes): watch-spires, colossal stele stumps and sunk fragments crowd them,
 * the south breach flats churn with loose rafts, and six hand-placed set pieces give the flight
 * destinations (see docs/plans/2026-10-21-dudael-field.md). The district, the north canal avenue
 * (the spawn view) and a 45 m strip inside the box edges stay clear. Seeded and pure (no DOM): the
 * same field on every device, and tests build it in Node. */
export const FIELD = {
  seed: 2113, cell: 52, street: 20, inset: 45, avenue: 30,
  district: { minX: -225, maxX: 225, minZ: -208, maxZ: 128 },
  /** The drowned plaza and estuary east: one clear open-water flight room with the titans, the
   * fallen span and bronze way-stones as content, nothing else. */
  estuary: { minX: 240, maxX: 352, minZ: -130, maxZ: -5 },
  /** Seeded pieces stand clear of the set pieces: one block-free court around each of the
   * standalone anchors (the gates, the southern stump field, the west colossus). */
  courts: [
    { x: 40, z: -280, rx: 62, rz: 42 }, { x: -40, z: -280, rx: 62, rz: 42 },
    { x: 40, z: 204, rx: 86, rz: 64 }, { x: -302, z: 44, rx: 74, rz: 70 },
  ],
  /** Heights are given capped: baked tops stay under WORLD.ceiling - 24 for fly-over room. */
  heightCap: 118,
};
export type Placed = { x: number; z: number; w: number; d: number; yaw: number; landmark: boolean; height: number; quadrant: number;
  kind?: FieldKind; preset?: Preset; top?: number };
const CENTRE_Z = -40;
const LOOSE: PartKind[] = ['rubble', 'rebar'];
const STEEL: PartKind[] = ['column', 'beam', 'floor'];

/** Original silhouette heights above the water, by zone: the watch-pillar core north, low breach
 * flats south, middling chasm flats east and west. */
function zone(x: number, z: number): { lo: number; hi: number; landmark: number; empty: number } {
  if (z < -260) return { lo: 60, hi: 135, landmark: .16, empty: .1 };
  if (z > 150) return { lo: 14, hi: 42, landmark: 0, empty: .42 };
  return Math.abs(x) > 240 ? { lo: 30, hi: 80, landmark: .05, empty: .26 } : { lo: 30, hi: 75, landmark: .04, empty: .12 };
}
const inDistrict = (x: number, z: number, pad: number) => x > FIELD.district.minX - pad && x < FIELD.district.maxX + pad &&
  z > FIELD.district.minZ - pad && z < FIELD.district.maxZ + pad;
const inEstuary = (x: number, z: number, pad = 0) => x > FIELD.estuary.minX - pad && x < FIELD.estuary.maxX + pad &&
  z > FIELD.estuary.minZ - pad && z < FIELD.estuary.maxZ + pad;
const inCourt = (x: number, z: number) => FIELD.courts.some(c => Math.abs(x - c.x) < c.rx && Math.abs(z - c.z) < c.rz);

/** Where the set pieces stand (never moved by the field's seed): the gate pair flanking the north
 * canal avenue exit, the titan pair and the fallen span framing the estuary, the southern stump
 * field, the west's fallen colossus, and the way-stone rows reading the avenue. */
export function anchorEntries(): Placed[] {
  const q = (x: number, z: number) => Math.abs(x) > Math.abs(z - CENTRE_Z) ? (x > 0 ? 1 : 3) : z < CENTRE_Z ? 0 : 2;
  const p = (preset: Preset, x: number, z: number, w: number, d: number, height: number): Placed =>
    ({ x, z, w, d, yaw: 0, landmark: true, height, quadrant: q(x, z), preset });
  const stones = [-392, -366, -340, -314, -262, -236].map((z, i) =>
    [p('waystone', 31.5 - (i % 2) * .3, z, 1.5, 1.5, 5 + (i % 3) * 2), p('waystone', -31.5 - (i % 2) * .3, z, -1.5, 1.5, 5 + ((i + 1) % 3) * 2)]).flat();
  return [
    p('gate', 40, -280, 13, 8, 96), p('gate', -40, -280, -13, 8, 96),
    p('titan', 272, -46, 14, 8, 112), p('titan', 316, -34, -14, 8, 112),
    p('pier', 296, -117, 14, 12, 30), p('pier', 296, -5, 14, 12, 30), p('span', 296, -61, 6, 112, 0),
    p('stump', 40, 204, 34, 26, 40),
    p('colossus', -302, 44, 64, 20, 0),
    ...stones,
  ];
}

/** A part's world pose: the ruin's frame (foot, yaw, lean) times the part's own (centre, tilt about z). */
function pose(stand: Stand, spec: Spec) {
  const frame = new Matrix4().compose(new Vector3(stand.x, FOOT_Y, stand.z),
    new Quaternion().setFromEuler(new Euler(Math.cos(stand.leanAxis) * stand.lean, stand.yaw, Math.sin(stand.leanAxis) * stand.lean, 'YXZ')), new Vector3(1, 1, 1));
  const m = frame.multiply(new Matrix4().compose(new Vector3(...spec.at), new Quaternion().setFromEuler(new Euler(0, 0, spec.tilt ?? 0)), new Vector3(1, 1, 1)));
  const p = new Vector3(), q = new Quaternion(); m.decompose(p, q, new Vector3());
  const e = new Euler().setFromQuaternion(q, 'XYZ');
  return { position: [p.x, p.y, p.z] as Triple, rotation: [e.x, e.y, e.z] as Triple };
}

/** Builds the flyable field: four quadrant meshes (north, east, south, west, so the frustum can
 * drop the ones behind you), the collider list (exact boxes; steel tagged 'frame'), the placements
 * and the triangle count. Anchors included, boxes exact. */
export function makeField(seed = FIELD.seed) {
  const placed = [...layoutField(seed), ...anchorEntries()], solids: Solid[] = [];
  const buffers: Buffers[] = [0, 1, 2, 3].map(() => ({ position: [], color: [], index: [], seed: [], wall: [], normal: [], uv: [] }));
  placed.forEach((p, i) => {
    const look = mulberry32(seed * 13 + i * 104729 + 7), mood = pickMood(look), tag = look() * .999;
    const height = Math.min(p.height, FIELD.heightCap);
    // Lit and textured like the district (the texture darkens what it multiplies), so the baked tints are lifted to the chasm basalt.
    const stand: Stand = { x: p.x, z: p.z, yaw: p.yaw, lean: 0, leanAxis: 0, layer: 0, bright: 1.55 + (look() - .5) * .14, mood, seed: tag, flat: true };
    const specs = p.preset ? anchorSpecs(look, p.preset, p.w, p.d, height) : fieldSpecs(look, p.kind!, p.w, p.d, height);
    const baked = bakeTower(buffers[p.quadrant], stand, specs);
    p.top = Math.max(...baked.parts.map(q => q.max[1]));
    for (const spec of specs) {
      if (LOOSE.includes(spec.kind)) continue;
      solids.push({ ...pose(stand, spec), size: [spec.size[0] / 2, spec.size[1] / 2, spec.size[2] / 2], ...(STEEL.includes(spec.kind) ? { kind: 'frame' as const } : {}) });
    }
  });
  const geometries = buffers.map(out => {
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(out.position, 3));
    g.setAttribute('normal', new Float32BufferAttribute(out.normal!, 3));
    g.setAttribute('uv', new Float32BufferAttribute(out.uv!, 2));
    g.setAttribute('color', new Float32BufferAttribute(out.color, 3));
    g.setAttribute('aSeed', new Float32BufferAttribute(out.seed, 1));
    g.setAttribute('aWall', new Float32BufferAttribute(out.wall, 1));
    g.setIndex(out.index); g.computeBoundingSphere();
    return g;
  });
  return { geometries, solids, placed, triangles: buffers.reduce((n, b) => n + b.index.length / 3, 0) };
}

/** Where the field's pieces stand: a deterministic walk over the grid, with rhythm zones — emptier
 * flats and the breach — and the north avenue kept wide and way-stoned. */
export function layoutField(seed = FIELD.seed): Placed[] {
  const rng = mulberry32(seed), out: Placed[] = [], half = (FIELD.cell - FIELD.street) / 2;
  for (let cx = WORLD.minX + FIELD.inset + half; cx <= WORLD.maxX - FIELD.inset - half; cx += FIELD.cell)
    for (let cz = WORLD.minZ + FIELD.inset + half; cz <= WORLD.maxZ - FIELD.inset - half; cz += FIELD.cell) {
      const { empty } = zone(cx, cz);
      if (rng() < empty || inDistrict(cx, cz, 30) || inEstuary(cx, cz, 10) || inCourt(cx, cz)) continue;
      if (Math.abs(cx) < FIELD.avenue + half && cz < FIELD.district.minZ) continue;
      const { lo, hi, landmark } = zone(cx, cz), isLandmark = landmark > 0 && rng() < landmark;
      const r = rng(), count = r > .92 ? 2 : 1, w = count === 2 ? 10.5 + rng() * 3.2 : 13 + rng() * 12, d = 11 + rng() * (count === 2 ? 8 : 14);
      for (let i = 0; i < count; i++) {
        const slot = count === 2 ? (i ? 1 : -1) * (half - w / 2 - 1) : (rng() - .5) * Math.max(0, 2 * half - w - 4);
        const x = cx + slot, z = cz + (rng() - .5) * Math.max(0, 2 * half - d - 4);
        if (cz < FIELD.district.minZ && Math.abs(x) - w / 2 < FIELD.avenue + 1) continue; // the spawn lane stays wide
        if (inEstuary(x, z, -6)) continue; // pieces never crowd the estuary room
        const kind = pickFieldKind(rng, isLandmark), tall = kind === 'spire' || kind === 'stele';
        const height = isLandmark && tall ? lo + (hi - lo) * (1 - rng() ** 1.4) : lo + (hi - lo) * rng() ** 1.3;
        out.push({ x, z, w, d, yaw: (rng() - .5) * .14, landmark: isLandmark, height, quadrant: quadrant(x, z), kind });
      }
    }
  return out;
}
function quadrant(x: number, z: number) { return Math.abs(x) > Math.abs(z - CENTRE_Z) ? (x > 0 ? 1 : 3) : z - CENTRE_Z < 0 ? 0 : 2; }
