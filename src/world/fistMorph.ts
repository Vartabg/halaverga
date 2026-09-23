import { Float32BufferAttribute, Matrix4, Quaternion, SkinnedMesh, Vector3, type Object3D } from 'three';
/**
 * The blaster fist: a relative morph target that curls the right hand's open, relaxed fingers into a fist and folds the thumb
 * over them, driven by the aim weight. Built from the GLB hand at run time (no asset change) and attached only while the blaster
 * is on, so with it off the suit renders exactly as main.
 *
 * Hand frame, measured on public/models/suit.glb at bind (metres from the hand_r head; tests/fist-morph.test.ts fails on drift):
 * the palm lies in the YZ plane facing -X (the thigh), the fingers hang down and fan forward, the thumb reaches forward-down.
 */
const HAND = 16;
/** Across the knuckles, pinky to index (the curl axis); down the fingers; toward the palm. */
const K = new Vector3(0, .135, -.991).normalize(), F = new Vector3(0, -.991, -.135).normalize(), N = new Vector3(-1, 0, 0);
/** The knuckle line on the fingers' centre plane. */
export const KNUCKLE = new Vector3(.004, -.148, -.11);
/** Finger joints (distance down the finger from the knuckle line, m) and their fist flexion (rad): MCP, PIP, DIP. */
const JOINTS: readonly (readonly [number, number])[] = [[0, 1.45], [.032, 1.75], [.056, 1.05]];
/** Half-width (m) of the band over which each joint's turn ramps in, so the skin bends instead of creasing. */
const BAND = .009;
/** Thumb: carpometacarpal pivot and direction at bind, its fold toward the palm (rad), and the interphalangeal fold. */
const THUMB_BASE = new Vector3(-.03, -.052, -.125), THUMB_DIR = new Vector3(0, -.58, -.81).normalize();
const THUMB_FOLD = .05, THUMB_SWING = .8, THUMB_IP = -.25, THUMB_IP_AT = .05;
const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
/** How much a hand-frame bind point belongs to the thumb (0..1): ahead of the palm, above the index finger. */
export function thumbWeight(p: Vector3) {
  r.copy(p).sub(THUMB_BASE); r.x = 0;
  const along = r.dot(THUMB_DIR), off = r.addScaledVector(THUMB_DIR, -along).length();
  return smooth(-.012, .01, along) * smooth(.026, .017, off);
}
const inverse = new Matrix4(), r = new Vector3(), q = new Quaternion(), axis = new Vector3(), pivot = new Vector3(), d = new Vector3();
/** Turns `p` (and `n`) by `angle` about the line through `at` along unit `a`. */
function turn(p: Vector3, n: Vector3, at: Vector3, a: Vector3, angle: number) {
  if (!angle) return;
  q.setFromAxisAngle(a, angle); p.sub(at).applyQuaternion(q).add(at); n.applyQuaternion(q);
}
/** The fist shape of one hand-frame bind point and normal, in place. `w` is its weight to hand_r (fingers blend out at the wrist). */
export function curl(p: Vector3, n: Vector3, w = 1) {
  const t = thumbWeight(p);
  if (t > 0) {
    // Interphalangeal first (distal), then the base: the thumb folds across the palm and swings down over the curled fingers.
    const along = p.clone().sub(THUMB_BASE).dot(THUMB_DIR);
    axis.crossVectors(THUMB_DIR, N).normalize();
    pivot.copy(THUMB_BASE).addScaledVector(THUMB_DIR, THUMB_IP_AT);
    turn(p, n, pivot, axis, THUMB_IP * smooth(THUMB_IP_AT - BAND, THUMB_IP_AT + BAND, along) * t * w);
    turn(p, n, THUMB_BASE, axis, THUMB_FOLD * t * w);
    turn(p, n, THUMB_BASE, N, THUMB_SWING * t * w);
    return;
  }
  // Fingers: a planar chain in the finger/palm plane, distal joints first so each proximal turn carries everything past it.
  d.copy(p).sub(KNUCKLE);
  const s = d.dot(F);
  if (s < -BAND) return;
  axis.copy(K);
  for (let j = JOINTS.length - 1; j >= 0; j--) {
    const [at, angle] = JOINTS[j], k = smooth(at - BAND, at + BAND, s) * w;
    if (!k) continue;
    pivot.copy(KNUCKLE).addScaledVector(F, at);
    turn(p, n, pivot, axis, angle * k);
  }
}
export type FistMorph = { mesh: SkinnedMesh; position: Float32BufferAttribute; normal: Float32BufferAttribute };
/** Builds the fist morph for the suit mesh whose vertices hand_r carries (null on a rig without that hand). Nothing is attached. */
export function buildFistMorph(root: Object3D): FistMorph | null {
  let best: FistMorph | null = null, most = 0;
  root.traverse(o => {
    if (!(o instanceof SkinnedMesh) || o.skeleton.bones.length <= HAND) return;
    // The hand head at bind, whatever the rig's current pose (skinnedSuit binds at the origin, so mesh space is bind space).
    const head = new Vector3().setFromMatrixPosition(inverse.copy(o.skeleton.boneInverses[HAND]).invert());
    const g = o.geometry, pos = g.getAttribute('position'), nor = g.getAttribute('normal');
    const si = g.getAttribute('skinIndex'), sw = g.getAttribute('skinWeight');
    if (!pos || !nor || !si || !sw) return;
    const dp = new Float32Array(pos.count * 3), dn = new Float32Array(pos.count * 3), p = new Vector3(), n = new Vector3();
    let moved = 0;
    for (let v = 0; v < pos.count; v++) {
      let w = 0; for (let c = 0; c < 4; c++) if (si.getComponent(v, c) === HAND) w += sw.getComponent(v, c);
      if (w < .02) continue;
      p.fromBufferAttribute(pos, v).sub(head); n.fromBufferAttribute(nor, v);
      const x = p.x, y = p.y, z = p.z, nx = n.x, ny = n.y, nz = n.z;
      curl(p, n, smooth(.02, .6, w));
      dp[v * 3] = p.x - x; dp[v * 3 + 1] = p.y - y; dp[v * 3 + 2] = p.z - z;
      dn[v * 3] = n.x - nx; dn[v * 3 + 1] = n.y - ny; dn[v * 3 + 2] = n.z - nz;
      if (p.x !== x || p.y !== y || p.z !== z) moved++;
    }
    if (moved > most) { most = moved; best = { mesh: o, position: new Float32BufferAttribute(dp, 3), normal: new Float32BufferAttribute(dn, 3) }; }
  });
  return best;
}
/** Attaches (once) and sets the fist amount. The morph is relative, so at 0 the mesh draws its bind shape. */
export function setFist(f: FistMorph, amount: number) {
  const m = f.mesh, g = m.geometry;
  if (g.morphAttributes.position?.[0] !== f.position) {
    g.morphAttributes.position = [f.position]; g.morphAttributes.normal = [f.normal]; g.morphTargetsRelative = true;
    m.updateMorphTargets();
  }
  m.morphTargetInfluences![0] = amount;
}
/** Detaches the morph so the mesh is main's again (the blaster turned off). */
export function clearFist(f: FistMorph) {
  const m = f.mesh, g = m.geometry;
  if (g.morphAttributes.position?.[0] !== f.position) return;
  delete g.morphAttributes.position; delete g.morphAttributes.normal; g.morphTargetsRelative = false;
  m.morphTargetInfluences = undefined; m.morphTargetDictionary = undefined;
}
