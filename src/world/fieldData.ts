import { BufferGeometry, Euler, Float32BufferAttribute, Matrix4, Quaternion, Vector3 } from 'three';
import { mulberry32 } from '@/game/combat';
import { WORLD } from '@/game/motion';
import type { Solid, Triple } from './kit';
import { pickMood } from './skylineDamage';
import { bakeTower, FOOT_Y, type Buffers, type PartKind, type Spec, type Stand } from './skylineParts';
import { pickRuin, ruinSpecs, type Ruin } from './ruinShapes';

/** The drowned city around the district, flyable since 2026-10-06 (Garo: "open it up"). City blocks on a 52 m grid with 20 m
 * canals between them (the old streets, now flight lanes), one or two ruins per block, some blocks empty water. The district and a
 * margin around it stay clear, as do the north canal avenue (the spawn view down the boulevard) and a strip inside the box edges
 * (where the edge cues work). Districts by place: the tall core to the north, the flats east and west, the breach to the south where
 * the water flattened almost everything. Seeded and pure (no DOM): the same city on every device, and tests build it in Node. */
export const FIELD = {
  seed: 2113, cell: 52, street: 20, inset: 45, avenue: 30,
  district: { minX: -225, maxX: 225, minZ: -208, maxZ: 128 },
};
/** One ruin's place. `quadrant` (0 north, 1 east, 2 south, 3 west of the district centre) picks its mesh; `ruin` and `top` are filled
 * in by makeField from the ruin's own stream. */
export type Placed = { x: number; z: number; w: number; d: number; yaw: number; landmark: boolean; height: number; quadrant: number; ruin?: Ruin; top?: number };
const CENTRE_Z = -40;
/** Parts without a collider: rubble and rebar are decoration (solid rubble snagged low passes, 2026-10-06 pins). The flyable ruins
 * (RuinField.tsx) are built from this module. */
const LOOSE: PartKind[] = ['rubble', 'rebar'];
/** Thin steel and plates the chase camera looks through (combat.FRAME_GROUPS). */
const STEEL: PartKind[] = ['column', 'beam', 'floor'];

/** Original roof heights above the water, by district. */
function zone(x: number, z: number): { lo: number; hi: number; landmark: number } {
  if (z < -260) return { lo: 60, hi: 135, landmark: .2 };
  if (z > 150) return { lo: 18, hi: 45, landmark: 0 };
  return Math.abs(x) > 300 ? { lo: 35, hi: 90, landmark: .06 } : { lo: 30, hi: 75, landmark: .04 };
}
const inDistrict = (x: number, z: number, pad: number) => x > FIELD.district.minX - pad && x < FIELD.district.maxX + pad &&
  z > FIELD.district.minZ - pad && z < FIELD.district.maxZ + pad;

/** Where the ruins stand: a deterministic walk over the grid. */
export function layoutField(seed = FIELD.seed): Placed[] {
  const rng = mulberry32(seed), out: Placed[] = [], half = (FIELD.cell - FIELD.street) / 2;
  for (let cx = WORLD.minX + FIELD.inset + half; cx <= WORLD.maxX - FIELD.inset - half; cx += FIELD.cell)
    for (let cz = WORLD.minZ + FIELD.inset + half; cz <= WORLD.maxZ - FIELD.inset - half; cz += FIELD.cell) {
      const r = rng();
      if (inDistrict(cx, cz, half) || (Math.abs(cx) < FIELD.avenue + half && cz < FIELD.district.minZ) || r < .12) continue;
      const count = r > .8 ? 2 : 1, { lo, hi, landmark } = zone(cx, cz);
      for (let i = 0; i < count; i++) {
        const w = count === 2 ? 10 + rng() * 4 : 12 + rng() * 14, d = 11 + rng() * (count === 2 ? 8 : 15);
        const slot = count === 2 ? (i ? 1 : -1) * (half - w / 2 - 1) : (rng() - .5) * Math.max(0, 2 * half - w - 4);
        const x = cx + slot, z = cz + (rng() - .5) * Math.max(0, 2 * half - d - 4), yaw = (rng() - .5) * .12;
        const tall = rng() < landmark, height = tall ? hi + rng() * 15 : lo + (hi - lo) * rng() ** 1.3, dz = z - CENTRE_Z;
        out.push({ x, z, w, d, yaw, landmark: tall, height, quadrant: Math.abs(x) > Math.abs(dz) ? (x > 0 ? 1 : 3) : dz < 0 ? 0 : 2 });
      }
    }
  return out;
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

/** Builds the flyable ruins: four quadrant meshes (north, east, south, west, so the frustum can drop the ones behind you), the
 * collider list (exact boxes; steel tagged 'frame'), the placements and the triangle count. */
export function makeField(seed = FIELD.seed) {
  const placed = layoutField(seed), solids: Solid[] = [];
  const buffers: Buffers[] = [0, 1, 2, 3].map(() => ({ position: [], color: [], index: [], seed: [], wall: [], normal: [], uv: [] }));
  placed.forEach((p, i) => {
    const look = mulberry32(seed * 13 + i * 104729 + 7), mood = pickMood(look), tag = look() * .999;
    const ruin = pickRuin(look, p.landmark), height = (ruin === 'fallen' ? Math.min(p.height, 60) : p.height) - FOOT_Y;
    const lean = ruin !== 'mound' && look() < .15 ? .02 + look() * .05 : 0, leanAxis = look() * Math.PI * 2;
    // Lit and textured like the district (the texture darkens what it multiplies), so the baked tints are lifted to the district's concrete.
    const stand: Stand = { x: p.x, z: p.z, yaw: p.yaw, lean, leanAxis, layer: 0, bright: 1.55 + (look() - .5) * .14, mood, seed: tag, flat: true };
    const specs = ruinSpecs(look, ruin, p.w, p.d, height, 0, true);
    const baked = bakeTower(buffers[p.quadrant], stand, specs);
    p.ruin = ruin; p.top = Math.max(...baked.parts.map(q => q.max[1]));
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
