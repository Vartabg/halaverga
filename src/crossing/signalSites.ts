import { ARCH, archSection } from '@/world/archData';
import type { Vector3 } from 'three';
import { passGroundAt } from './passGround';
import { VALLEY_REPLY } from './warning';

const section = archSection((14 - ARCH.x0) / (ARCH.x1 - ARCH.x0));
export const SPAN_FIRE = { x: 14, z: section.cz + 1.65 };
export const CAMP_FIRE = { x: -30, z: -39.5 };

/** Cut to the listening camp a beat before its reply. The flight camera remains the sole writer. */
export function frameCampReply(eye: Vector3, aim: Vector3, after: number, portrait: number) {
  if (after < VALLEY_REPLY - .65 || after >= VALLEY_REPLY + 4.6) return;
  const { x, z } = CAMP_FIRE, y = passGroundAt(x, z);
  eye.set(x + 8.2 + portrait * 2, y + 6.4 + portrait * 2, z + 14.2 + portrait * 3);
  aim.set(x - 2.3, y + .9, z - 2);
}
