import type { PartKind, Spec } from './skylineParts';

/** One box of a ruin or stone shape. Pure data, Node-safe. */
export const box = (kind: PartKind, x: number, y: number, z: number, w: number, h: number, d: number, tilt = 0): Spec => ({ kind, at: [x, y, z], size: [w, h, d], tilt });
