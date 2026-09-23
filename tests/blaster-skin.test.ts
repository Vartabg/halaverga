import { beforeAll, describe, expect, it } from 'vitest';
import { Group, Material, Matrix4, SkinnedMesh, Vector3, type Bone, type BufferAttribute, type Object3D } from 'three';
import { buildSkinnedSuit } from '../src/world/skinnedSuit';
import { buildBlasterSkin, setBlasterSkin, type BlasterSkin } from '../src/world/blasterSkin';
import { SUIT_JOINTS as J, inBlasterRegion, share, station, weld } from '../src/world/blasterWeights';
import { loadSuit } from './load-suit';

type Pose = { clav?: readonly number[]; upper: readonly number[]; fore?: number; hand?: number };
const AIM_BASE: Pose = { clav: [0, .1, 0], upper: [1.571, 0, -.124], hand: 1e-3 };
const CARRY: Pose = { clav: [0, .05, 0], upper: [.5, 0, .4], fore: .9, hand: 1e-3 };
const FLIGHT: Pose = { clav: [0, .1, 0], upper: [2.8, 0, -.124], fore: 1.5, hand: 1e-3 };
const GRID: Pose[] = [1.2, 1.571, 2].flatMap(x => [-.4, 0, .4].flatMap(y => [0, .52].map(f =>
  ({ clav: [0, .1, 0], upper: [x, y, -.124], fore: f, hand: 1e-3 }))));
let suit: { root: Group; joints: Bone[] }, skin: BlasterSkin, meshes: SkinnedMesh[];
const kind = (m: SkinnedMesh) => (m.material as Material).name;
const arr = (a: BufferAttribute) => a.array as unknown as number[];
function pose(p: Pose) {
  suit.joints.forEach(j => { j.rotation.set(0, 0, 0); j.scale.setScalar(1); });
  suit.joints[14].rotation.fromArray([...(p.clav ?? [0, 0, 0])] as [number, number, number]);
  suit.joints[3].rotation.fromArray([...p.upper] as [number, number, number]);
  suit.joints[7].rotation.x = p.fore ?? 0; suit.joints[16].scale.setScalar(p.hand ?? 1);
  suit.root.updateMatrixWorld(true);
}
const posed = (m: SkinnedMesh) => {
  const out = new Float64Array(m.geometry.getAttribute('position').count * 3), v = new Vector3();
  for (let i = 0; i < out.length / 3; i++) { m.getVertexPosition(i, v); out[i * 3] = v.x; out[i * 3 + 1] = v.y; out[i * 3 + 2] = v.z; }
  return out;
};
/** Unique undersuit + anatomy edges posed longer than 3x bind and .05 m, skipping edges touching original hand_r vertices. */
function metric(p: Pose, on: boolean) {
  setBlasterSkin(skin, on); pose(p);
  let count = 0, longest = 0;
  for (const b of skin.meshes) {
    const m = b.mesh;
    if (kind(m) !== 'skin' && kind(m) !== 'textile') continue;
    const P = m.geometry.getAttribute('position').array, Q = posed(m), idx = m.geometry.index!.array, seen = new Set<number>();
    const hand = (v: number) => share(arr(b.origIndex), arr(b.origWeight), v, [J.hand]) > 0;
    const d = (A: ArrayLike<number>, a: number, c: number) => Math.hypot(A[a * 3] - A[c * 3], A[a * 3 + 1] - A[c * 3 + 1], A[a * 3 + 2] - A[c * 3 + 2]);
    for (let t = 0; t < idx.length; t += 3) for (let e = 0; e < 3; e++) {
      const a = Math.min(idx[t + e], idx[t + (e + 1) % 3]), c = Math.max(idx[t + e], idx[t + (e + 1) % 3]), k = a * 1e6 + c;
      if (seen.has(k)) continue;
      seen.add(k);
      if (hand(a) || hand(c)) continue;
      const l1 = d(Q, a, c);
      if (l1 > .05 && l1 > 3 * Math.max(d(P, a, c), 1e-5)) { count++; longest = Math.max(longest, l1); }
    }
  }
  setBlasterSkin(skin, false); pose({ upper: [0, 0, 0] });
  return { count, longest };
}
const fmt = (r: { count: number; longest: number }) => `${r.count}/${r.longest.toFixed(3)}`;

let suitScene: Object3D;
beforeAll(async () => {
  suitScene = (await loadSuit()).scene;
  suit = buildSkinnedSuit(suitScene) as unknown as typeof suit;
  skin = buildBlasterSkin(suit.root)!;
  meshes = skin.meshes.map(b => b.mesh);
});

describe('blaster skin weights', () => {
  it('guards the metric: the original weights flap in AIM_BASE', () => {
    const r = metric({ ...AIM_BASE, hand: 1 }, false);
    console.info('baseline AIM_BASE hand 1', fmt(r), 'changed', skin.changed, 'build ms', skin.buildMs.toFixed(1), 'SOR', skin.iterations);
    expect(r.count).toBeGreaterThanOrEqual(143); expect(r.count).toBeLessThanOrEqual(175);
    expect(r.longest).toBeGreaterThanOrEqual(.145); expect(r.longest).toBeLessThanOrEqual(.155);
  });
  it('closes the flap in AIM_BASE, the carry pose and the aim grid', () => {
    const base = metric(AIM_BASE, true);
    console.info('AIM_BASE', fmt(metric(AIM_BASE, false)), '->', fmt(base));
    expect(base.count).toBeLessThanOrEqual(15); expect(base.longest).toBeLessThanOrEqual(.07);
    const carry = metric(CARRY, true);
    console.info('CARRY', fmt(metric(CARRY, false)), '->', fmt(carry));
    expect(carry.count).toBeLessThanOrEqual(25); expect(carry.longest).toBeLessThanOrEqual(.08);
    for (const p of GRID) {
      const r = metric(p, true);
      console.info('grid', p.upper.join(','), p.fore, fmt(metric(p, false)), '->', fmt(r));
      expect(r.count, `grid ${p.upper} ${p.fore}`).toBeLessThanOrEqual(25); expect(r.longest).toBeLessThanOrEqual(.08);
    }
  });
  it('cuts the flight-extreme flap by at least 80%', () => {
    const before = metric(FLIGHT, false), after = metric(FLIGHT, true);
    console.info('FLIGHT', fmt(before), '->', fmt(after));
    expect(after.count).toBeLessThanOrEqual(60); expect(after.longest).toBeLessThanOrEqual(.09);
    expect(after.count).toBeLessThanOrEqual(.2 * before.count);
  });
  it('collapses the hand inside the cannon and keeps the cuff rigid on the forearm', () => {
    setBlasterSkin(skin, true); pose(AIM_BASE);
    const head = suit.joints[16].getWorldPosition(new Vector3()), fore = new Matrix4(), bind = new Matrix4().copy(suit.joints[7].matrixWorld);
    let collapsed = 0, rigid = 0, worst = 0, worstRigid = 0;
    for (const b of skin.meshes) {
      const m = b.mesh, P = m.geometry.getAttribute('position'), Q = posed(m), si = arr(b.index), sw = arr(b.weight);
      const bindHead = new Vector3().setFromMatrixPosition(new Matrix4().copy(m.skeleton.boneInverses[7]).invert());
      fore.multiplyMatrices(bind, m.skeleton.boneInverses[7]);
      for (let v = 0; v < P.count; v++) {
        const handW = share(arr(b.origIndex), arr(b.origWeight), v, [J.hand]);
        if (handW > 0) expect(share(si, sw, v, J.legs)).toBe(0);
        const q = new Vector3(Q[v * 3], Q[v * 3 + 1], Q[v * 3 + 2]);
        if (handW > 0 && kind(m) === 'skin' && station(P.getX(v), P.getY(v), P.getZ(v), bindHead) >= .25) {
          collapsed++; worst = Math.max(worst, q.distanceTo(head));
        }
        if (share(si, sw, v, [J.forearm]) === 1) {
          rigid++; worstRigid = Math.max(worstRigid, q.distanceTo(new Vector3().fromBufferAttribute(P, v).applyMatrix4(fore)));
        }
      }
    }
    setBlasterSkin(skin, false); pose({ upper: [0, 0, 0] });
    expect(collapsed).toBeGreaterThan(100); expect(worst).toBeLessThan(.001);
    expect(rigid).toBeGreaterThan(100); expect(worstRigid).toBeLessThan(1e-5);
  });
  it('leaves no ridge on top of the raised upper arm (the seam ring): shoulder-top protrusions no larger than the original weights', () => {
    /** Largest outward offset (m) of a welded vertex from its neighbours' mean, within .2 m above the posed upperarm_r head. */
    const ridge = (on: boolean) => {
      setBlasterSkin(skin, on); pose(AIM_BASE);
      const head = suit.joints[3].getWorldPosition(new Vector3()); let worst = 0;
      for (const m of meshes) {
        if (kind(m) !== 'skin' && kind(m) !== 'textile') continue;
        const P = m.geometry.getAttribute('position').array, rep = weld(P), idx = m.geometry.index!.array, Q = posed(m), nb = new Map<number, Set<number>>();
        for (let t = 0; t < idx.length; t += 3) for (let e = 0; e < 3; e++) {
          const a = rep[idx[t + e]], c = rep[idx[t + (e + 1) % 3]];
          if (a === c) continue;
          (nb.get(a) ?? nb.set(a, new Set()).get(a)!).add(c); (nb.get(c) ?? nb.set(c, new Set()).get(c)!).add(a);
        }
        nb.forEach((set, v) => {
          const q = new Vector3(Q[v * 3], Q[v * 3 + 1], Q[v * 3 + 2]).applyMatrix4(m.matrixWorld);
          if (set.size < 3 || q.distanceTo(head) > .2 || q.y < head.y - .02) return;
          const avg = new Vector3(); set.forEach(j => avg.add(new Vector3(Q[j * 3], Q[j * 3 + 1], Q[j * 3 + 2]).applyMatrix4(m.matrixWorld)));
          worst = Math.max(worst, q.clone().sub(avg.multiplyScalar(1 / set.size)).dot(q.clone().sub(head).normalize()));
        });
      }
      setBlasterSkin(skin, false); pose({ upper: [0, 0, 0] });
      return worst;
    };
    const before = ridge(false), after = ridge(true);
    // Measured 2026-09-23: 16.2 mm both ways (a neck vertex); without the seam ring the front armpit fold stood 17.3 mm (vertex 14810).
    console.info(`shoulder-top ridge: original ${(before * 1000).toFixed(1)} mm, blaster ${(after * 1000).toFixed(1)} mm`);
    expect(after).toBeLessThanOrEqual(before + 1e-4);
  });
  it('changes only hand, R2 and region vertices, within four normalised influences of the original set', () => {
    for (const b of skin.meshes) {
      const m = b.mesh, P = m.geometry.getAttribute('position'), oi = arr(b.origIndex), ow = arr(b.origWeight), si = arr(b.index), sw = arr(b.weight);
      expect(b.index.array.constructor).toBe(b.origIndex.array.constructor); expect(b.weight.array.constructor).toBe(b.origWeight.array.constructor);
      expect(b.index.itemSize).toBe(4); expect(b.weight.itemSize).toBe(4);
      const upper = new Vector3().setFromMatrixPosition(new Matrix4().copy(m.skeleton.boneInverses[3]).invert());
      const k = kind(m) === 'skin' ? 'anatomy' : kind(m) === 'textile' ? 'undersuit' : 'other', rep = weld(P.array);
      const map = (I: number[], W: number[], v: number) => { const o = new Map<number, number>(); for (let c = 0; c < 4; c++) if (W[v * 4 + c] > 0) o.set(I[v * 4 + c], (o.get(I[v * 4 + c]) ?? 0) + W[v * 4 + c]); return o; };
      for (let v = 0; v < P.count; v++) {
        const after = map(si, sw, v), before = map(oi, ow, v);
        let sum = 0; after.forEach(w => { sum += w; });
        expect(Math.abs(sum - 1)).toBeLessThan(1e-6);
        const same = after.size === before.size && [...after].every(([j, w]) => before.get(j) === w);
        const hand = share(oi, ow, v, [J.hand]) > 0;
        // The seam ring: a pure-arm vertex on the right side next to the region may gain exactly one trunk joint.
        const ring = !hand && P.getX(v) > 0 && share(oi, ow, v, J.arm) > 0 && share(oi, ow, v, J.trunk) === 0
          && [...after.keys()].filter(j => !before.has(j)).length === 1 && [...after.keys()].every(j => before.has(j) || J.trunk.includes(j));
        if (!hand && !ring) after.forEach((_, j) => expect(before.has(j)).toBe(true));
        const r = rep[v];
        if (r !== v) map(si, sw, r).forEach((w, j) => expect(Math.abs((after.get(j) ?? 0) - w)).toBeLessThan(1e-6));
        if (same) continue;
        const r2 = share(oi, ow, v, J.rightArm) > 0 && share(oi, ow, v, J.legs) > 0;
        const region = inBlasterRegion(k, P.getX(v), upper.distanceTo(new Vector3().fromBufferAttribute(P, v)),
          share(oi, ow, v, J.arm), share(oi, ow, v, J.trunk), share(oi, ow, v, [J.hand]));
        expect(hand || r2 || region || ring, `mesh ${k} vertex ${v}`).toBe(true);
      }
    }
  });
  it('is deterministic, rest-invariant and toggles the original attribute objects back', () => {
    const again = buildBlasterSkin(suit.root)!;
    again.meshes.forEach((b, i) => {
      expect(Array.from(b.index.array)).toEqual(Array.from(skin.meshes[i].index.array));
      expect(Array.from(b.weight.array)).toEqual(Array.from(skin.meshes[i].weight.array));
    });
    pose({ upper: [0, 0, 0] });
    const rest = meshes.map(posed);
    setBlasterSkin(skin, true);
    meshes.forEach((m, i) => posed(m).forEach((x, k) => expect(Math.abs(x - rest[i][k])).toBeLessThan(1e-6)));
    setBlasterSkin(skin, false);
    const seen = new Set<unknown>();
    for (let n = 0; n < 100; n++) {
      setBlasterSkin(skin, n % 2 === 0); setBlasterSkin(skin, n % 2 === 0);
      meshes.forEach(m => { seen.add(m.geometry.getAttribute('skinIndex')); seen.add(m.geometry.getAttribute('skinWeight')); });
    }
    setBlasterSkin(skin, false);
    expect(seen.size).toBe(4 * meshes.length);
    skin.meshes.forEach(b => {
      expect(b.mesh.geometry.getAttribute('skinIndex')).toBe(b.origIndex); expect(b.mesh.geometry.getAttribute('skinWeight')).toBe(b.origWeight);
    });
  });
  // The first build pays JIT warm-up and, in the full suite, competes with every other test worker (measured 30-39 ms alone, up to
  // 92 ms under the parallel suite). The budget is judged on the best warm build; the cold one only gets a loose bound.
  it('builds within 60 ms (best warm build) and returns null on a rigid rig', () => {
    expect(skin.buildMs).toBeLessThanOrEqual(250);
    const warm = Math.min(...[0, 1, 2].map(() => buildBlasterSkin(buildSkinnedSuit(suitScene).root)!.buildMs));
    expect(warm).toBeLessThanOrEqual(60);
    expect(buildBlasterSkin(new Group())).toBeNull();
  });
});
