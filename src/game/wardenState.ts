import type { Vec3 } from './combat';
// Enemy-specific game fiction. No React, renderer or alternate player/camera clock.
const v = (): Vec3 => ({ x: 0, y: 0, z: 0 });
export const NAV = { none: 0, chase: 1, retreat: 2, flank: 3, blocked: 4 } as const;
export function createWardens() {
  return { phase: new Uint8Array(8), gate: new Uint8Array(8), engage: new Float32Array(8), time: new Float32Array(8), cool: new Float32Array(8).fill(2.5),
    move: new Uint8Array(8), turns: new Uint16Array(8), streak: new Uint8Array(8), defense: new Uint8Array(8), fierce: new Uint8Array(8),
    tell: new Float32Array(8), seed: Uint32Array.from({ length: 8 }, (_, i) => 7919 + i * 104729),
    navMode: new Uint8Array(8), navSet: new Uint8Array(8), navTime: new Float32Array(8), navLost: new Float32Array(8),
    relocate: new Float32Array(8), navDistance: new Float32Array(8), navHome: Array.from({ length: 8 }, v),
    navGoal: Array.from({ length: 8 }, v), navVelocity: Array.from({ length: 8 }, v),
    open: new Float32Array(8), opened: new Float32Array(8), hit: new Uint8Array(8), shots: new Uint8Array(8), duration: new Float32Array(8),
    aim: Array.from({ length: 8 }, v), start: Array.from({ length: 8 }, v), dir: Array.from({ length: 8 }, v),
    bolts: Array.from({ length: 6 }, () => ({ live: false, src: -1, age: 0, p: v(), v: v() })),
    active: -1, duel: -1, pending: -1, shield: false, shieldAge: 1e9, battleClock: 0, previous: v(), ready: false,
    counters: 0, dodges: 0, parries: 0, serial: 0, last: -1, result: '' as '' | 'dodge' | 'parry' | 'counter' | 'hit' };
}
export type Wardens = ReturnType<typeof createWardens>;
export const resetWardens = (w: Wardens) => Object.assign(w, createWardens());
