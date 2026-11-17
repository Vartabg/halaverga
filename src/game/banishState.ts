// The fight state and constants, with no imports, so the battle HUD (its own lazy chunk) can read it without pulling
// the combat code (banish.ts) and its dependencies into a shared chunk.
import type { Vec3 } from './combat';
import { armorFor } from './encounter';
import { createWardens } from './wardenState';

export const WA = { idle: 0, tell: 1, rush: 2, volley: 3, recover: 4, sweep: 5, fan: 6 } as const;
export const WARDEN = { range: 52, rushTell: 1.25, volleyTell: 1.35, lock: .55, rushSpeed: 52, boltSpeed: 24,
  recover: 2.4, cooldown: 3.8, parry: .28, boltGap: .32, radius: 2.8 } as const;
export const wardenName = (i: number) => i === 5 ? 'Rift lancer' : 'Cinder cantor';

export const BANISH = { resistance: 6, rebukeRange: 70, swordReach: 70, bindRange: 70, castRange: 90, stagger: 2.4,
  rebukeCool: .55, rebukeHurt: 1, swordHurt: 2, staggerBonus: 3, downDrop: 3.5, downTime: 8,
  recover: 3, castTime: 1.1, castRest: .4, aimSlack: .08 } as const;
export const MODE = { free: 0, staggered: 1, down: 2, bound: 3, cast: 4 } as const;
/** Effect kinds the renderer and HUD read from the ring. */
/** impact: a thrown demon struck the mountain or the water. shove: it struck another demon. n: the speed of the contact, m/s. */
export const FX = { rebuke: 1, sword: 2, bind: 3, cast: 4, seal: 5, quench: 6, down: 7, armor: 8, impact: 9, shove: 10 } as const;
export type Cue = '' | 'far' | 'notDown' | 'notBound' | 'noTarget' | 'guarded';
/** n: for a sword effect, which cut of the string landed (swordString.CUTS). */
export type BanishFx = { serial: number; kind: number; t: number; drone: number; from: Vec3; to: Vec3; n: number };
const RING = 12, MAX = 8;
const v3 = (): Vec3 => ({ x: 0, y: 0, z: 0 });
export function createBanish() {
  return { wardens: createWardens(), armor: Uint8Array.from({ length: MAX }, (_, i) => armorFor(i)), guardTime: new Float32Array(MAX), retaliate: new Uint8Array(MAX), mode: new Uint8Array(MAX), resist: new Int8Array(MAX).fill(BANISH.resistance), timer: new Float32Array(MAX),
    // The sword string (swordString.ts): cuts already taken by each demon, the shove each cut gave it, and the string in progress.
    wounds: new Uint8Array(MAX), string: { target: -1, until: 0, speed: 0 },
    // Thrown bodies (thrown.ts): each struck demon's velocity and tumble, when a cast-down demon first struck the ground, and the
    // demons it has already shoved on this throw (a bit each).
    vel: Array.from({ length: MAX }, v3), spin: new Float32Array(MAX), hit: new Float32Array(MAX), struck: new Uint8Array(MAX),
    combo: 0, comboUntil: 0, base: Array.from({ length: MAX }, v3), cool: 0, handled: 0, clock: 0, cue: '' as Cue, cueT: -1e9, rebukeT: -1e9, quenched: 0, last: -1, resetRequested: false,
    fx: Array.from({ length: RING }, (): BanishFx => ({ serial: 0, kind: 0, t: 0, drone: -1, from: v3(), to: v3(), n: 0 })), fxSerial: 0 };
}
export type BanishState = ReturnType<typeof createBanish>;
export const banish = createBanish();

/** Seconds the rebuke line stays on screen. */
export const REBUKE_LINE = 1.6;
