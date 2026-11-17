// Where the sword sits in the angel's right fist. Frame: the hand_r bone's bind frame (identity rotation, three.js axes, origin at
// the wrist, the character faces -Z). archangel.glb's fist is baked from the library's Sword_Idle grip (scripts/real_bodies,
// docs/art/real-bodies/PROVENANCE.md), so the blade leaves the thumb side of the fist, pointing forward when the arm hangs at rest.
import { Quaternion, Vector3 } from 'three';

/** The middle of the grip, inside the closed fingers of both archangel.glb's and watcher.glb's right fist (their hand_r skin
 * closes within 4 mm all round it), measured 2026-11-17 and pinned by tests/sword-grip.test.ts. */
export const SWORD_GRIP: Readonly<{ x: number; y: number; z: number }> = { x: -.0175, y: -.0925, z: -.003 };
/** Blade direction, grip to tip. */
export const SWORD_BLADE: Readonly<{ x: number; y: number; z: number }> = { x: 0, y: 0, z: -1 };
/** Rotation taking a sword modelled along -Y (FlamingSword's blade) onto SWORD_BLADE. */
export function swordGripRotation(target = new Quaternion()) {
  return target.setFromUnitVectors(new Vector3(0, -1, 0), new Vector3(SWORD_BLADE.x, SWORD_BLADE.y, SWORD_BLADE.z).normalize());
}
