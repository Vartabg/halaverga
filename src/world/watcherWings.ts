// The Watchers' wings (docs/plans/2026-11-16-real-fight.md B7): one reduced dark feather pair, built once at load from the
// archangel's feather wing (featherGeometry.ts, coarse cards) and laid open at the Watcher's shoulder blades. It is skinned to the
// instanced membrane rig (membraneRig.ts: flank, shoulder, elbow, wrist), so all eight Watchers' wings cost two draws.
import { Float32BufferAttribute, type BufferGeometry } from 'three';
import { AVIAN_JOINTS, featherWing } from './featherGeometry';
import type { WingJoints } from './membraneRig';

const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
/**
 * scale: the archangel's WING_SCALE (.8) times the Watcher's height over the archangel's (2.00 / 1.88 m). root: the right
 * shoulder joint in watcher.glb's model frame (pelvis origin, facing -Z): on the upper back, 1 cm inside the cuirass, which
 * reaches z .078-.084 m at that height and width (measured 2026-11-17).
 */
export const WATCHER_WING = { scale: .85, root: [.12, .62, .07] } as const;
/** The rig's hinges: AVIAN_JOINTS (shoulder, elbow, wrist) at the Watcher's wing scale, from its shoulder root. */
export const WATCHER_JOINTS: WingJoints = AVIAN_JOINTS.slice(0, 3).map(j => [
  WATCHER_WING.root[0] + j[0] * WATCHER_WING.scale, WATCHER_WING.root[1] + j[1] * WATCHER_WING.scale, WATCHER_WING.root[2] + j[2] * WATCHER_WING.scale,
] as const);
/** Skin weights (flank, shoulder, elbow, wrist) by distance along the span, handing over smoothly across the elbow and wrist. */
export function wingWeights(x: number, out: number[]) {
  const u = (Math.abs(x) - WATCHER_WING.root[0]) / WATCHER_WING.scale, elbow = smooth(.40, .56, u), hand = smooth(.94, 1.10, u);
  out[0] = 0; out[1] = 1 - elbow; out[2] = elbow * (1 - hand); out[3] = elbow * hand;
  return out;
}
/** One side's wing (-1 left, 1 right): position, normal, colour and atlas uv, plus the rig's aWingWeights and aWingSide. */
export function watcherWing(side: number): BufferGeometry {
  const g = featherWing(side, true), { scale, root } = WATCHER_WING;
  for (const name of ['skinIndex', 'skinWeight', 'aThin']) g.deleteAttribute(name);
  g.scale(scale, scale, scale).translate(side * root[0], root[1], root[2]);
  const p = g.attributes.position, weights = new Float32Array(p.count * 4), sides = new Float32Array(p.count).fill(side), w = [0, 0, 0, 0];
  for (let i = 0; i < p.count; i++) weights.set(wingWeights(p.getX(i), w), i * 4);
  g.setAttribute('aWingWeights', new Float32BufferAttribute(weights, 4)); g.setAttribute('aWingSide', new Float32BufferAttribute(sides, 1));
  return g;
}
