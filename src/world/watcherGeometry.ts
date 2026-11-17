// The pieces drawn for all eight Watchers at once (docs/plans/2026-11-16-real-fight.md B7): the dark feather wings, the bronze
// blade each one holds, the eye marker (the telegraph) and the halo quad. The bodies are the skinned watcher.glb rigs
// (demonActors.ts). All built here from original geometry; nothing is read from the GLB.
import { IcosahedronGeometry, PlaneGeometry } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { swordGeometry } from './swordBlade';
import { watcherWing } from './watcherWings';

/**
 * The eye marker: two small glowing orbs over watcher.glb's eyes. centre: the eyes' centre in the bind pose (the centre of the face
 * mesh, model frame, measured 2026-11-17), where demonActors.ts binds the marker to the head; the eyeballs sit .032 m either side
 * of it (their outline in the face mesh) and the orbs stand a little proud of them so the colour reads from the front.
 */
export const EYE_MARKER = { centre: [0, .7705, -.144], apart: .032, radius: .016, forward: .008 } as const;
export function eyeMarker() {
  const eyes = [-1, 1].map(s => new IcosahedronGeometry(EYE_MARKER.radius, 1).translate(s * EYE_MARKER.apart, 0, -EYE_MARKER.forward));
  const g = mergeGeometries(eyes)!; eyes.forEach(e => e.dispose());
  return g;
}
/** wingL/wingR: the pooled feather pair; blade: the sword modelled along -Y from the grip (swordBlade.ts), without its flame. */
export function makeWatcherGeometry() {
  return { wingL: watcherWing(-1), wingR: watcherWing(1), blade: swordGeometry(), eye: eyeMarker(), halo: new PlaneGeometry(1, 1) };
}
export type WatcherGeometry = ReturnType<typeof makeWatcherGeometry>;
