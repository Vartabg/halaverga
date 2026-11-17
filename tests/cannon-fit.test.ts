import { beforeAll, describe, expect, it } from 'vitest';
import { DoubleSide, Mesh, MeshBasicMaterial, Quaternion, Raycaster, SkinnedMesh, Vector3, type BufferGeometry } from 'three';
import { AXIS_ORIGIN, BARREL_AXIS, FIT, HAND_HEAD, NODES, RADIAL_Z, STATION, fitDir, fitPoint, rimStation } from '../src/world/cannonContract';
import { loadCannon } from './load-cannon';
import { loadSuit } from './load-suit';

// docs/plans/2026-11-16-real-fight.md B6: the arm cannon's contract frame was measured on suit.glb; FIT carries it onto
// archangel.glb's forearm. These tests re-measure both forearms' centre lines from the GLBs and check the cannon still encloses the
// realistic forearm, so a rebuilt body cannot leave FIT stale.
const v = (p: { x: number; y: number; z: number }) => new Vector3(p.x, p.y, p.z);
type Body = { head: Vector3; points: { p: Vector3; fore: number; hand: number }[] };
async function forearm(name: 'suit' | 'archangel'): Promise<Body> {
  const scene = (await loadSuit(name)).scene; scene.updateMatrixWorld(true);
  const skinned: SkinnedMesh[] = [];
  scene.traverse(o => {
    const m = o as SkinnedMesh;
    if (m.isSkinnedMesh && /anatomy|undersuit|body/.test(m.name + (m.material as { name: string }).name)) skinned.push(m);
  });
  const bones = skinned[0].skeleton.bones, fi = bones.findIndex(b => b.name === 'forearm_r'), hi = bones.findIndex(b => b.name === 'hand_r');
  const head = bones[fi].getWorldPosition(new Vector3()), points: Body['points'] = [];
  for (const m of skinned) {
    const g = m.geometry, si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
    for (let i = 0; i < si.count; i++) {
      let fore = 0, hand = 0;
      for (let c = 0; c < 4; c++) { const j = si.getComponent(i, c), w = sw.getComponent(i, c); if (j === fi) fore += w; if (j === hi) hand += w; }
      points.push({ p: new Vector3().fromBufferAttribute(g.attributes.position, i).applyMatrix4(m.matrixWorld).sub(head), fore, hand });
    }
  }
  return { head, points };
}
/** Least-squares line through the forearm's cross-section centroids at s .08-.26 (2 cm slices), re-sliced along its own fit. */
function centreLine(body: Body) {
  const pts = body.points.filter(q => q.fore >= .5).map(q => q.p);
  let dir = v(BARREL_AXIS).normalize(), origin = v(AXIS_ORIGIN);
  for (let iter = 0; iter < 4; iter++) {
    const cents: Vector3[] = [], ss: number[] = [];
    for (let s0 = .08; s0 < .26; s0 += .02) {
      const slice = pts.filter(p => { const s = p.clone().sub(origin).dot(dir); return s >= s0 && s < s0 + .02; });
      if (slice.length < 6) continue;
      cents.push(slice.reduce((a, p) => a.add(p), new Vector3()).multiplyScalar(1 / slice.length)); ss.push(s0 + .01);
    }
    const n = cents.length, ms = ss.reduce((a, b) => a + b, 0) / n, mc = cents.reduce((a, p) => a.add(p), new Vector3()).multiplyScalar(1 / n);
    const num = new Vector3(); let den = 0;
    for (let k = 0; k < n; k++) { num.addScaledVector(cents[k].clone().sub(mc), ss[k] - ms); den += (ss[k] - ms) ** 2; }
    dir = num.multiplyScalar(1 / den).normalize(); origin = mc.clone().addScaledVector(dir, -mc.dot(dir));
  }
  return { dir, origin };
}
let suit: Body, archangel: Body;
beforeAll(async () => { suit = await forearm('suit'); archangel = await forearm('archangel'); });

describe('the arm cannon on archangel.glb (cannonContract.ts FIT)', () => {
  it('carries suit.glb\'s forearm centre line onto archangel.glb\'s', () => {
    const from = centreLine(suit), to = centreLine(archangel);
    expect(v(fitDir(from.dir)).angleTo(to.dir) * 180 / Math.PI).toBeLessThan(1);
    const o = v(fitPoint(from.origin)), off = o.clone().sub(to.origin);
    expect(off.addScaledVector(to.dir, -off.dot(to.dir)).length()).toBeLessThan(.003); // on the line, within 3 mm
    expect(new Quaternion(FIT.q.x, FIT.q.y, FIT.q.z, FIT.q.w).length()).toBeCloseTo(1, 4);
  });
  it('clears every rigid forearm point and the hand head by at least 4 mm', async () => {
    const root = (await loadCannon()).scene.getObjectByName(NODES.root)!; root.updateWorldMatrix(true, true);
    const shellMesh = root.getObjectByName(NODES.shell) as Mesh;
    const shell = new Mesh(shellMesh.geometry as BufferGeometry, new MeshBasicMaterial({ side: DoubleSide }));
    shell.matrixWorld.copy(shellMesh.matrixWorld); shell.matrixAutoUpdate = false;
    const O = v(AXIS_ORIGIN), A = v(BARREL_AXIS).normalize(), Z = v(RADIAL_Z).normalize(), ray = new Raycaster();
    const s = (p: Vector3) => p.clone().sub(O).dot(A), radialOf = (p: Vector3) => p.clone().sub(O).addScaledVector(A, -s(p));
    const clearance = (p: Vector3) => { ray.set(p, radialOf(p).normalize()); return ray.intersectObject(shell, false)[0]?.distance ?? Infinity; };
    // Body points in the cannon's own (contract) frame: undo FIT.
    const inverse = new Quaternion(FIT.q.x, FIT.q.y, FIT.q.z, FIT.q.w).normalize().invert(), t = v(FIT.t);
    const toCannon = (p: Vector3) => p.clone().sub(t).applyQuaternion(inverse);
    const rigid = archangel.points.map(q => ({ ...q, c: toCannon(q.p) }))
      .filter(q => (q.fore + q.hand >= .5 && s(q.c) < STATION.collapse) || (q.hand > 0 && s(q.c) < .25)).map(q => q.c);
    const tested = rigid.filter(p => { const r = radialOf(p); return s(p) >= rimStation(r.dot(Z) / r.length()) + .01 && s(p) <= .30; });
    expect(tested.length).toBeGreaterThan(60);
    expect(Math.min(...tested.map(clearance))).toBeGreaterThanOrEqual(.004);
    expect(clearance(v(HAND_HEAD))).toBeGreaterThanOrEqual(.004);
  });
});
