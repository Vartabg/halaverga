// A stronger build, at load time (docs/plans/2026-11-16-fight-calm-body.md D7): every skinned vertex moves out along its smoothed
// normal by the bulk of the bones that move it, so the chest, shoulders and arms and thighs read broader while the waist stays
// narrow (a V). Head, hands and feet are 0. Visual only: colliders and the rig do not change.
import { SkinnedMesh, type BufferGeometry, type Object3D } from 'three';
import { BONE_NAMES } from './suitSkeleton';

/** Metres of push per bone group at full weight. Spine is 0 so the waist stays narrow. */
export const BULK: Readonly<Record<string, number>> = { chest: .02, clavicle: .02, upperarm: .016, forearm: .01, neck: .01, thigh: .016, shin: .01, pelvis: .005 };
/** The cannon arm's forearm and hand stay exactly as authored: cannonContract.ts and the blaster skin depend on them. */
const AMOUNT = Float32Array.from(BONE_NAMES.map(n => n === 'forearm_r' || n === 'hand_r' ? 0 : BULK[n.replace(/_[lr]$/, '')] ?? 0));

/** Averages normals over vertices that share a position, so a seam split into two vertices moves as one and never cracks. */
function smoothedNormals(geometry: BufferGeometry) {
  const p = geometry.getAttribute('position'), n = geometry.getAttribute('normal'), sum = new Map<string, number[]>(), keys: string[] = [];
  for (let i = 0; i < p.count; i++) {
    const key = `${Math.round(p.getX(i) * 1e4)},${Math.round(p.getY(i) * 1e4)},${Math.round(p.getZ(i) * 1e4)}`;
    keys.push(key);
    const a = sum.get(key) ?? (sum.set(key, [0, 0, 0]), sum.get(key)!);
    a[0] += n.getX(i); a[1] += n.getY(i); a[2] += n.getZ(i);
  }
  return keys.map(k => sum.get(k)!);
}
/** Geometries already pushed. Not a userData flag: BufferGeometry.copy shares userData with the cached asset, so a flag there
 * would leave every later rig built from that asset thin (independent review, 2026-11-16). */
const bulked = new WeakSet<BufferGeometry>();
/** Pushes one geometry out, once: a second pass on the same geometry does nothing. Returns whether it changed. */
export function bulkGeometry(geometry: BufferGeometry) {
  const p = geometry.getAttribute('position'), idx = geometry.getAttribute('skinIndex'), wt = geometry.getAttribute('skinWeight');
  if (bulked.has(geometry) || !geometry.getAttribute('normal') || !idx || !wt) return false;
  const normals = smoothedNormals(geometry);
  for (let i = 0; i < p.count; i++) {
    let push = 0;
    for (let c = 0; c < 4; c++) push += wt.getComponent(i, c) * (AMOUNT[idx.getComponent(i, c)] ?? 0);
    const a = normals[i], len = Math.hypot(a[0], a[1], a[2]) || 1;
    p.setXYZ(i, p.getX(i) + a[0] / len * push, p.getY(i) + a[1] / len * push, p.getZ(i) + a[2] / len * push);
  }
  p.needsUpdate = true; bulked.add(geometry); geometry.computeBoundingSphere();
  return true;
}
/** Builds the angel's V shape on a freshly built rig (the rig clones its geometry, so the loaded asset stays untouched). */
export function bulkSuit<T extends { root: Object3D }>(rig: T) {
  rig.root.traverse(o => { if (o instanceof SkinnedMesh) bulkGeometry(o.geometry); });
  return rig;
}
