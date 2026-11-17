import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Box3, Vector3 } from 'three';
import { loadSuit } from './load-suit';
import { buildSuitRig } from '../src/world/suitRig';
import { BONE_NAMES } from '../src/world/suitSkeleton';
import { createAngelMotion } from '../src/world/angelMotion';
import { cutClip } from '../src/world/cutClips';
import { bulkSuit } from '../src/world/suitBulk';
import { createStrikeStance, stepStrikeStance, DRIVE } from '../src/world/strikeStance';
import { beginStrike, cancelStrike } from '../src/game/strike';
import { SkinnedMesh } from 'three';

let asset: Awaited<ReturnType<typeof loadSuit>>;
beforeAll(async () => { asset = await loadSuit('archangel'); });
beforeEach(() => cancelStrike());
const bone = (n: string) => BONE_NAMES.indexOf(n as never);
const input = (over = {}) => ({ dt: 1 / 60, paused: false, flying: true, ...over });
function angle(rig: ReturnType<typeof buildSuitRig>, n: string) { return rig.joints[bone(n)].rotation.x; }

describe('the fighting stance', () => {
  it('holds the legs and the free arm bent in flight during a fight, and leaves them alone outside one', () => {
    const rig = buildSuitRig(asset.scene), s = createStrikeStance(), m = createAngelMotion();
    for (let i = 0; i < 40; i++) stepStrikeStance(s, rig.joints, m, input());
    expect(s.stance).toBeLessThan(.001); expect(angle(rig, 'shin_l')).toBe(0); // no strike, no string, no cut: not a fight
    beginStrike(0, { x: 0, y: 0, z: -20 }, 20);
    for (let i = 0; i < 60; i++) stepStrikeStance(s, rig.joints, m, input());
    expect(angle(rig, 'shin_l')).toBeLessThan(-.6); expect(angle(rig, 'thigh_r')).toBeGreaterThan(.3);
    expect(angle(rig, 'forearm_l')).toBeGreaterThan(1.2); expect(s.brace).toBe(0);
    cancelStrike(); for (let i = 0; i < 20; i++) stepStrikeStance(s, rig.joints, m, input()); expect(s.stance).toBeGreaterThan(.5); // lingers
    for (let i = 0; i < 120; i++) stepStrikeStance(s, rig.joints, m, input()); expect(s.stance).toBeLessThan(.05);
    rig.dispose();
  });
  it('stays off on the ground, under reduced motion and while paused, and never braces on the ground', () => {
    for (const over of [{ flying: false }, { reduced: true }, { paused: true }]) {
      const rig = buildSuitRig(asset.scene), s = createStrikeStance(), m = createAngelMotion();
      beginStrike(0, { x: 0, y: 0, z: -20 }, 20);
      for (let i = 0; i < 60; i++) stepStrikeStance(s, rig.joints, m, input(over));
      expect(s.stance).toBeLessThan(.001); expect(angle(rig, 'shin_l')).toBe(0); cancelStrike(); rig.dispose();
    }
    const rig = buildSuitRig(asset.scene), s = createStrikeStance(), m = createAngelMotion();
    s.stance = 1; s.linger = 1; Object.assign(m, { act: 'slash', cut: 2, actT: cutClip(2).raised + .1, weight: 1 });
    stepStrikeStance(s, rig.joints, m, input({ flying: false, dt: 0 })); // landed mid-cut: the stance fades, the springs are not braced
    expect(s.brace).toBe(0); rig.dispose();
  });
  it('drives the legs differently on each cut and braces the springs while a cut plays', () => {
    const shape = (cut: number, actT: number) => {
      const rig = buildSuitRig(asset.scene), s = createStrikeStance(), m = createAngelMotion();
      s.stance = 1; Object.assign(m, { act: 'slash', cut, actT, weight: 1 });
      stepStrikeStance(s, rig.joints, m, input({ dt: 0 }));
      const r = [angle(rig, 'thigh_l'), angle(rig, 'thigh_r'), angle(rig, 'shin_l')]; rig.dispose(); return { r, brace: s.brace };
    };
    const wind = [0, 1, 2].map(c => shape(c, cutClip(c).raised)), through = [0, 1, 2].map(c => shape(c, cutClip(c).raised + .4));
    expect(DRIVE).toHaveLength(3);
    for (let c = 0; c < 3; c++) { expect(through[c].brace).toBe(1); expect(through[c].r).not.toEqual(wind[c].r); }
    expect(through[0].r[0]).toBeGreaterThan(through[0].r[1]); // cross cut: left forward, right back
    expect(through[2].r[2]).toBeGreaterThan(wind[2].r[2]); // casting blow: the knee extends on contact
  });
});

describe('the load-time build', () => {
  it('widens the chest and thighs by a few centimetres, once, and leaves the head and feet where they were', () => {
    const size = (rig: ReturnType<typeof buildSuitRig>, part: string) => { const b = new Box3(); rig.root.traverse(o => { if (o instanceof SkinnedMesh) { o.geometry.computeBoundingBox(); b.union(o.geometry.boundingBox!); } }); return part === 'w' ? b.max.x - b.min.x : b.max.y - b.min.y; };
    const plain = buildSuitRig(asset.scene), built = bulkSuit(buildSuitRig(asset.scene));
    const widen = size(built, 'w') - size(plain, 'w');
    // archangel.glb's rig widens by about 1.5 cm across its widest rest points (measured 2026-11-17).
    expect(widen).toBeGreaterThan(.01); expect(widen).toBeLessThan(.08);
    expect(Math.abs(size(built, 'h') - size(plain, 'h'))).toBeLessThan(.01);
    const before = built.root.children.filter(c => c instanceof SkinnedMesh).map(c => (c as SkinnedMesh).geometry.getAttribute('position').array.slice(0, 300));
    bulkSuit(built); // a second pass on the same geometry changes nothing
    built.root.children.filter(c => c instanceof SkinnedMesh).forEach((c, i) => expect((c as SkinnedMesh).geometry.getAttribute('position').array.slice(0, 300)).toEqual(before[i]));
    plain.dispose(); built.dispose();
  });
  it('builds every rig from one cached asset just as broad: the first build does not mark the asset as done', () => {
    const width = (rig: ReturnType<typeof buildSuitRig>) => { const b = new Box3(); rig.root.traverse(o => { if (o instanceof SkinnedMesh) { o.geometry.computeBoundingBox(); b.union(o.geometry.boundingBox!); } }); return b.max.x - b.min.x; };
    const plain = buildSuitRig(asset.scene), first = bulkSuit(buildSuitRig(asset.scene)), second = bulkSuit(buildSuitRig(asset.scene));
    expect(width(first) - width(plain)).toBeGreaterThan(.01); expect(Math.abs(width(second) - width(first))).toBeLessThan(1e-6);
    plain.dispose(); first.dispose(); second.dispose();
  });
  it('moves no vertex weighted only to the head, hands or feet', () => {
    const plain = buildSuitRig(asset.scene), built = bulkSuit(buildSuitRig(asset.scene)), still = ['head', 'hand_l', 'hand_r', 'foot_l', 'foot_r', 'toe_l', 'toe_r', 'spine'].map(bone);
    const meshes = (r: typeof plain) => r.root.children.filter(c => c instanceof SkinnedMesh) as SkinnedMesh[];
    const a = meshes(plain), b = meshes(built); let checked = 0;
    a.forEach((mesh, k) => {
      const pa = mesh.geometry.getAttribute('position'), pb = b[k].geometry.getAttribute('position'), idx = mesh.geometry.getAttribute('skinIndex'), wt = mesh.geometry.getAttribute('skinWeight');
      for (let i = 0; i < pa.count; i++) {
        let free = 0; for (let c = 0; c < 4; c++) if (wt.getComponent(i, c) > .01 && !still.includes(idx.getComponent(i, c))) free++;
        // weights under .01 on a pushed bone still move it, at most .01 x 2 cm = .2 mm
        if (!free) { checked++; expect(new Vector3(pa.getX(i), pa.getY(i), pa.getZ(i)).distanceTo(new Vector3(pb.getX(i), pb.getY(i), pb.getZ(i)))).toBeLessThan(2e-4); }
      }
    });
    expect(checked).toBeGreaterThan(100); plain.dispose(); built.dispose();
  });
});
