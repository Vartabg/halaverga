import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { BufferGeometry, DoubleSide, Mesh, MeshBasicMaterial, MeshStandardMaterial, Object3D, Raycaster, SkinnedMesh, Vector3 } from 'three';
import {
  AXIS_ORIGIN, BARREL_AXIS, BUDGET, HAND_HEAD, MUZZLE, NODES, RADIAL_Z, STATION, VIEWS, cannonDrive, rimStation, restCannonDrive,
} from '../src/world/cannonContract';
import { cannonBytes, cannonImage, cannonJson, loadCannon } from './load-cannon';
import { loadSuit } from './load-suit';

const v = (p: { x: number; y: number; z: number }) => new Vector3(p.x, p.y, p.z);
const O = v(AXIS_ORIGIN), A = v(BARREL_AXIS).normalize(), Z = v(RADIAL_Z).normalize();
const U = new Vector3(1, 0, 0).addScaledVector(A, -A.x).normalize();
const s = (p: Vector3) => p.clone().sub(O).dot(A);
const radialOf = (p: Vector3) => p.clone().sub(O).addScaledVector(A, -s(p));
type Tri = { a: Vector3; b: Vector3; c: Vector3; mask: number[] };
let root: Object3D, meshes: Mesh[], tris: Tri[], occluders: Mesh[];

function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

beforeAll(async () => {
  root = (await loadCannon()).scene.getObjectByName(NODES.root)!;
  root.updateWorldMatrix(true, true);
  meshes = [];
  root.traverse(o => { if ((o as Mesh).isMesh) meshes.push(o as Mesh); });
  const emit = cannonImage('cannon_emit');
  tris = meshes.flatMap(m => {
    const g = m.geometry as BufferGeometry, idx = g.index!, pos = g.attributes.position, uv = g.attributes.uv, out: Tri[] = [];
    const at = (i: number) => new Vector3().fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
    for (let k = 0; k < idx.count; k += 3) {
      const i = idx.getX(k), texel = emit[Math.floor(uv.getY(i) * 8)][Math.floor(uv.getX(i) * 8)];
      out.push({ a: at(i), b: at(idx.getX(k + 1)), c: at(idx.getX(k + 2)), mask: texel });
    }
    return out;
  });
  occluders = meshes.map(m => { const o = new Mesh(m.geometry, new MeshBasicMaterial({ side: DoubleSide })); o.matrixWorld.copy(m.matrixWorld); o.matrixAutoUpdate = false; return o; });
});

describe('arm cannon asset structure', () => {
  it('has the contract nodes, three meshes on one textured material, and no skins or animations', () => {
    expect(root.name).toBe('arm_cannon');
    expect(meshes.map(m => m.name).sort()).toEqual([NODES.shell, NODES.slide, NODES.vent]);
    const mat = meshes[0].material as MeshStandardMaterial;
    meshes.forEach(m => expect(m.material).toBe(mat));
    expect(mat.map).toBeTruthy(); expect(mat.emissiveMap).toBeTruthy(); expect(mat.normalMap).toBeNull();
    expect(mat.metalnessMap).toBeTruthy(); expect(mat.metalnessMap).toBe(mat.roughnessMap);
    for (const n of [NODES.muzzle, NODES.core, NODES.ventMouth]) expect(root.getObjectByName(n)).toBeTruthy();
    const json = cannonJson();
    expect(json.skins ?? []).toHaveLength(0); expect(json.animations ?? []).toHaveLength(0);
  });

  it('stays inside the triangle and byte budget', () => {
    expect(tris.length).toBeLessThanOrEqual(BUDGET.triangles);
    expect(cannonBytes().length).toBeLessThanOrEqual(BUDGET.bytes);
    expect(meshes).toHaveLength(BUDGET.meshes);
  });
});

describe('arm cannon contract geometry', () => {
  it('puts the muzzle socket, vent hinge and slide on the contract', () => {
    expect(root.getObjectByName(NODES.muzzle)!.getWorldPosition(new Vector3()).distanceTo(v(MUZZLE))).toBeLessThan(5e-4);
    const vent = root.getObjectByName(NODES.vent)!;
    expect(Math.abs(new Vector3(1, 0, 0).applyQuaternion(vent.getWorldQuaternion(vent.quaternion.clone())).dot(A))).toBeLessThan(.02);
    const slide = meshes.find(m => m.name === NODES.slide)!, pos = slide.geometry.attributes.position, c = new Vector3();
    for (let i = 0; i < pos.count; i++) c.add(new Vector3().fromBufferAttribute(pos, i).applyMatrix4(slide.matrixWorld));
    expect(radialOf(c.divideScalar(pos.count)).length()).toBeLessThan(.002);
  });

  it('is .36 m long; side-on (top to underside) at most .16 m, a 2.2-3.2 length ratio; at most .18 m across seen from behind', () => {
    const pts = tris.flatMap(t => [t.a, t.b, t.c]), ss = pts.map(s);
    const length = Math.max(...ss) - Math.min(...ss), across = (dir: Vector3) => { const p = pts.map(q => radialOf(q).dot(dir)); return Math.max(...p) - Math.min(...p); };
    let extent = 0;
    for (let d = 0; d < 180; d++) extent = Math.max(extent, across(U.clone().multiplyScalar(Math.cos(d * Math.PI / 180)).addScaledVector(Z, Math.sin(d * Math.PI / 180))));
    // Side-on (the flight clips, the vent pose) the top-to-underside depth sets the gun read; from behind the chase camera sees the
    // outer fin stack widen the outline (review r3: the rear view read as a round cuff about 11 px wide at chase portrait).
    const side = across(Z);
    expect(Math.abs(length - .36)).toBeLessThanOrEqual(.01);
    expect(side).toBeLessThanOrEqual(.16); expect(extent).toBeLessThanOrEqual(.18); expect(across(U)).toBeGreaterThanOrEqual(.16);
    expect(length / side).toBeGreaterThanOrEqual(2.2); expect(length / side).toBeLessThanOrEqual(3.2);
  });

  it('places the core and the vent mouth on the top face (bind -Z)', () => {
    for (const name of [NODES.core, NODES.ventMouth]) {
      const r = radialOf(root.getObjectByName(name)!.getWorldPosition(new Vector3())).normalize();
      expect(r.dot(Z)).toBeLessThan(-.3);
      if (name === NODES.core) expect(r.dot(U)).toBeGreaterThanOrEqual(-.2);
    }
  });
});

describe('arm cannon seen from behind', () => {
  const ray = new Raycaster();
  function visibility(pick: (t: Tri) => boolean, view: Vector3, n = 400) {
    const faces = tris.filter(pick), areas = faces.map(t => t.b.clone().sub(t.a).cross(t.c.clone().sub(t.a)).length() / 2);
    const total = areas.reduce((x, y) => x + y, 0), rand = mulberry32(7);
    let seen = 0, projected = 0;
    for (let k = 0; k < n; k++) {
      let pick_ = rand() * total, i = 0;
      while (pick_ > areas[i] && i < areas.length - 1) pick_ -= areas[i++];
      const t = faces[i], [u, w] = [rand(), rand()], [a, b] = u + w > 1 ? [1 - u, 1 - w] : [u, w];
      const p = t.a.clone().addScaledVector(t.b.clone().sub(t.a), a).addScaledVector(t.c.clone().sub(t.a), b);
      const facing = t.b.clone().sub(t.a).cross(t.c.clone().sub(t.a)).normalize().dot(view);
      ray.set(p.clone().addScaledVector(view, .001), view);
      if (facing > 0 && ray.intersectObjects(occluders, false).length === 0) { seen++; projected += facing * total / n; }
    }
    return { fraction: seen / n, projected };
  }
  it.each(VIEWS.map((view, i) => [['chase', 'ADS portrait', 'ADS landscape'][i], view] as const))('shows the core lens and heat strips from the %s view', (_, view) => {
    const dir = v(view).normalize();
    // Heat surfaces: the strips (mask G 255) and the copper fins (G 128, lit only when hot).
    // 2000 samples for the heat set: it includes the cavity floor under the shut hatch, so fewer samples land on visible faces.
    const lens = visibility(t => t.mask[0] > 128, dir), heat = visibility(t => t.mask[1] >= 64, dir, 2000);
    expect(lens.fraction).toBeGreaterThanOrEqual(.6);
    expect(lens.projected).toBeGreaterThanOrEqual(5e-4);
    expect(heat.projected).toBeGreaterThanOrEqual(8e-4);
  });
});

describe('arm cannon encloses the rigid forearm of the real suit', () => {
  it('clears every R1 rigid point, HAND_HEAD and the collapse cone by at least 4 mm', async () => {
    const suit = (await loadSuit()).scene;
    suit.updateMatrixWorld(true);
    const skinned: SkinnedMesh[] = [];
    suit.traverse(o => { if ((o as SkinnedMesh).isSkinnedMesh && /undersuit|anatomy/i.test(o.name)) skinned.push(o as SkinnedMesh); });
    const bones = skinned[0].skeleton.bones, fi = bones.findIndex(b => b.name === 'forearm_r'), hi = bones.findIndex(b => b.name === 'hand_r');
    const head = bones[fi].getWorldPosition(new Vector3()), rigid: Vector3[] = [];
    for (const m of skinned) {
      const g = m.geometry, si = g.attributes.skinIndex, sw = g.attributes.skinWeight, under = /undersuit/i.test(m.name);
      for (let i = 0; i < si.count; i++) {
        let fw = 0, hw = 0;
        for (let c = 0; c < 4; c++) { const j = si.getComponent(i, c), w = sw.getComponent(i, c); if (j === fi) fw += w; if (j === hi) hw += w; }
        const p = new Vector3().fromBufferAttribute(g.attributes.position, i).applyMatrix4(m.matrixWorld).sub(head);
        if ((fw + hw >= .5 && s(p) < STATION.collapse) || (hw > 0 && (under || s(p) < .25))) rigid.push(p);
      }
    }
    const shell = occluders[meshes.findIndex(m => m.name === NODES.shell)], ray = new Raycaster();
    const clearance = (p: Vector3) => { ray.set(p, radialOf(p).normalize()); return ray.intersectObject(shell, false)[0]?.distance ?? Infinity; };
    const tested = rigid.filter(p => { const r = radialOf(p); return s(p) >= rimStation(r.dot(Z) / r.length()) + .01 && s(p) <= .30; });
    expect(tested.length).toBeGreaterThan(300);
    const worst = Math.min(...tested.map(clearance));
    expect(worst).toBeGreaterThanOrEqual(.004);
    expect(clearance(v(HAND_HEAD))).toBeGreaterThanOrEqual(.004);
    const ring = rigid.filter(p => Math.abs(s(p) - .24) < .005), best = new Map<number, Vector3>();
    for (const p of ring) {
      const r = radialOf(p), k = ((Math.round(Math.atan2(r.dot(Z), r.dot(U)) / (Math.PI / 10)) % 20) + 20) % 20;
      if (!best.has(k) || radialOf(best.get(k)!).length() < r.length()) best.set(k, p);
    }
    const hull = [...best.entries()].sort((x, y) => x[0] - y[0]).map(e => e[1]);
    expect(hull.length).toBeGreaterThanOrEqual(12);
    const cone = Array.from({ length: 20 }, (_, k) => hull[k % hull.length].clone().lerp(v(HAND_HEAD), [.25, .5, .75][k % 3]));
    for (const p of cone) expect(clearance(p)).toBeGreaterThanOrEqual(.004);
  });
});

describe('cannon contract file', () => {
  it('is self-consistent', () => {
    expect(v(AXIS_ORIGIN).addScaledVector(v(BARREL_AXIS), .46).distanceTo(v(MUZZLE))).toBeLessThan(1e-4);
    expect(Math.abs(v(BARREL_AXIS).length() - 1)).toBeLessThan(1e-3); expect(Math.abs(v(RADIAL_Z).length() - 1)).toBeLessThan(1e-3);
    expect(Math.abs(v(BARREL_AXIS).dot(v(RADIAL_Z)))).toBeLessThan(1e-3);
    expect(rimStation(1)).toBeCloseTo(.10, 12); expect(rimStation(-1)).toBeCloseTo(STATION.cuffFlexor, 12);
    expect(STATION.cuffFlexor).toBeGreaterThanOrEqual(.15); expect(STATION.cuffFlexor).toBeLessThanOrEqual(.17);
    const rested = structuredClone(cannonDrive);
    restCannonDrive(rested);
    expect(cannonDrive).toEqual(rested);
  });
  it('imports three for types only (landing-safe)', () => {
    const src = readFileSync(new URL('../src/world/cannonContract.ts', import.meta.url), 'utf8');
    for (const line of src.split('\n').filter(l => /from ['"]three/.test(l))) expect(line).toMatch(/^import type /);
  });
});
