// Where the sword sits in the angel's right fist. Frame: the hand_r bone's bind frame (identity rotation, three.js axes, origin at
// the wrist, the character faces -Z). The fist is baked from the library's sword grip (scripts/angel_asset/rest.py), so the
// blade leaves the thumb side of the fist, pointing forward when the arm hangs at rest.
import { Quaternion, Vector3 } from 'three';

/** The middle of the grip, inside the closed fingers. */
export const SWORD_GRIP: Readonly<{ x: number; y: number; z: number }> = { x: -.015, y: -.085, z: -.01 };
/** Blade direction, grip to tip. */
export const SWORD_BLADE: Readonly<{ x: number; y: number; z: number }> = { x: 0, y: 0, z: -1 };
/** Rotation taking a sword modelled along -Y (FlamingSword's blade) onto SWORD_BLADE. */
export function swordGripRotation(target = new Quaternion()) {
  return target.setFromUnitVectors(new Vector3(0, -1, 0), new Vector3(SWORD_BLADE.x, SWORD_BLADE.y, SWORD_BLADE.z).normalize());
}
