import { BufferAttribute, Material, Matrix4, SkinnedMesh, Vector3, type Object3D } from 'three';
import { REGION_RADIUS, blasterWeights, inBlasterRegion, relaxArmShare, share, type Joints, type Kind } from './blasterWeights';
/**
 * Blaster-on skin weights for the cloned suit (replaces the fist morph): built once when the blaster setting turns on, swapped in
 * with geometry.setAttribute, and swapped back to the ORIGINAL attribute objects when it turns off, so the blaster-off character
 * and public/models/suit.glb stay bit-identical to main. Rules in blasterWeights.ts.
 *
 * Measured on public/models/suit.glb (tests/blaster-skin.test.ts, 2026-09-23). Metric: unique undersuit + anatomy edges posed
 * longer than 3x bind and .05 m, excluding edges touching original hand_r vertices (hidden inside the cannon).
 * Changed vertices: R1 1186 (all 1033 anatomy hand vertices sit at s >= .25 and collapse to hand_r; 153 undersuit cuff vertices
 * go to forearm_r), R2 0 beyond R1, R3 892 region vertices (radius .40-.50 all give 866-892 and the same metric; SOR converges
 * in about 50 sweeps), plus the seam ring (blasterWeights.ts RING_DEPTH). Edges before -> after: AIM_BASE 153/.150 -> 1/.050 m;
 * carry 0 -> 0; aim grid worst 240/.172 -> 10/.060; flight extreme 319/.188 -> 18/.068. Without the ring the front armpit fold
 * (pure upperarm_r vertices beside relaxed ones) stood as a 17 mm ridge on the raised arm; with it the shoulder top matches the original.
 * Build: about 30-40 ms cold, 13 ms warm, in node on the dev machine.
 */
export type BlasterMesh = { mesh: SkinnedMesh; origIndex: BufferAttribute; origWeight: BufferAttribute;
  index: BufferAttribute; weight: BufferAttribute };
export type BlasterSkin = { meshes: BlasterMesh[]; on: boolean; buildMs: number;
  changed: { hand: number; legs: number; region: number }; iterations: number };
const inverse = new Matrix4();
function kindOf(mesh: SkinnedMesh): Kind {
  const m = mesh.material as Material | Material[], name = Array.isArray(m) ? m[0]?.name : m.name;
  return name === 'skin' ? 'anatomy' : name === 'textile' ? 'undersuit' : 'other';
}
/** Bind head of skeleton bone `i`: the translation of inverse(boneInverse), never the current (posed) joint. */
function bindHead(mesh: SkinnedMesh, i: number) {
  return new Vector3().setFromMatrixPosition(inverse.copy(mesh.skeleton.boneInverses[i]).invert());
}
function jointsOf(mesh: SkinnedMesh): Joints | null {
  const names = mesh.skeleton.bones.map(b => b.name), at = (n: string) => names.indexOf(n);
  const pick = (list: readonly string[]) => list.map(at).filter(i => i >= 0);
  const hand = at('hand_r'), forearm = at('forearm_r'), upper = at('upperarm_r');
  if (hand < 0 || forearm < 0 || upper < 0) return null;
  return { hand, forearm, arm: [upper, forearm], trunk: pick(['pelvis', 'spine', 'chest', 'clavicle_r']),
    rightArm: pick(['clavicle_r', 'upperarm_r', 'forearm_r', 'hand_r']), legs: names.flatMap((n, i) => /thigh|shin|foot|toe/.test(n) ? [i] : []) };
}
function copyOf(a: BufferAttribute) {
  const Ctor = a.array.constructor as new (src: ArrayLike<number>) => typeof a.array;
  return new BufferAttribute(new Ctor(a.array), a.itemSize, a.normalized);
}
/** Builds the blaster weights for every SkinnedMesh under `root` (null on a rig without one). Nothing is swapped in. Build it
 * with the blaster skin off (it reads the geometry's current attributes as the originals). */
export function buildBlasterSkin(root: Object3D, radius = REGION_RADIUS): BlasterSkin | null {
  const t0 = performance.now(), meshes: SkinnedMesh[] = [];
  root.traverse(o => { if (o instanceof SkinnedMesh) meshes.push(o); });
  if (!meshes.length) return null;
  const out: BlasterSkin = { meshes: [], on: false, buildMs: 0, changed: { hand: 0, legs: 0, region: 0 }, iterations: 0 };
  for (const mesh of meshes) {
    const g = mesh.geometry, oi = g.getAttribute('skinIndex'), ow = g.getAttribute('skinWeight'), pos = g.getAttribute('position');
    const j = jointsOf(mesh);
    if (!(oi instanceof BufferAttribute) || !(ow instanceof BufferAttribute) || !pos || !j || oi.itemSize !== 4) continue;
    const index = copyOf(oi), weight = copyOf(ow), kind = kindOf(mesh), P = pos.array as ArrayLike<number>;
    const forearm = bindHead(mesh, j.forearm), upper = bindHead(mesh, j.arm[0]);
    const si = index.array as unknown as number[], sw = weight.array as unknown as number[], hand = [j.hand];
    // The region is judged on the original weights.
    const free = new Uint8Array(pos.count), osi = oi.array as unknown as number[], osw = ow.array as unknown as number[];
    for (let v = 0; v < pos.count; v++) {
      const dx = P[v * 3] - upper.x, dy = P[v * 3 + 1] - upper.y, dz = P[v * 3 + 2] - upper.z;
      free[v] = inBlasterRegion(kind, P[v * 3], Math.sqrt(dx * dx + dy * dy + dz * dz), share(osi, osw, v, j.arm),
        share(osi, osw, v, j.trunk), share(osi, osw, v, hand), radius) ? 1 : 0;
      out.changed.region += free[v];
    }
    const counts = blasterWeights(kind, P, si, sw, forearm, j);
    out.changed.hand += counts.hand; out.changed.legs += counts.legs;
    if (kind !== 'other') out.iterations = Math.max(out.iterations,
      relaxArmShare(P, g.index ? g.index.array as ArrayLike<number> : null, si, sw, free, j).iterations);
    out.meshes.push({ mesh, origIndex: oi, origWeight: ow, index, weight });
  }
  out.buildMs = performance.now() - t0;
  return out;
}
/** Swaps the blaster weights in (on) or the original attribute objects back (off). Idempotent; allocates nothing. */
export function setBlasterSkin(s: BlasterSkin, on: boolean) {
  if (s.on === on) return;
  s.on = on;
  for (const m of s.meshes) {
    m.mesh.geometry.setAttribute('skinIndex', on ? m.index : m.origIndex);
    m.mesh.geometry.setAttribute('skinWeight', on ? m.weight : m.origWeight);
  }
}
