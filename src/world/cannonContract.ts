// Arm cannon contract, shared by scripts/arm_cannon (Blender), the runtime cannon, the aim solve, the shot choreography and the
// effects. Type-only three import, so it is landing-safe. Frame: the forearm_r bone's bind frame (identity rotation, origin at the
// forearm_r head, three.js axes: x right, y up, the character faces -Z; metres). Measured on public/models/suit.glb (sha256
// c1fc253b...): least-squares line through the forearm cross-section centroids at s = .08-.26 m.
// Faces: top = bind -Z (flexor side; world-up in the aim and carry poses), outer = bind +X, underside = bind +Z (elbow point).
import type { Object3D } from 'three';
export type V3 = { x: number; y: number; z: number };
export type RGB = { r: number; g: number; b: number };
export const CANNON_URL = '/models/arm-cannon.glb';
export const FOREARM = 7, HAND = 16;
/** Point on the barrel axis nearest the forearm_r head. */
export const AXIS_ORIGIN: Readonly<V3> = { x: -.0246, y: -.0057, z: .0103 };
/** Unit barrel axis, elbow to muzzle; 12.3 deg off the bone line because the bone heads sit on the back of the elbow and wrist. */
export const BARREL_AXIS: Readonly<V3> = { x: .12090, y: -.96213, z: -.24431 };
/** Unit radial direction toward the underside: bind +Z with its BARREL_AXIS part removed. */
export const RADIAL_Z: Readonly<V3> = { x: 0, y: -.246, z: .969 };
/** Stations along BARREL_AXIS from AXIS_ORIGIN (m). cuffFlexor may move up to .17 after the Blender flexion check. */
export const STATION = { cuffDorsal: .10, cuffFlexor: .15, collapse: .25, wrist: .263, housing: .27, muzzle: .46 } as const;
/** Cuff rim station for a radial unit direction whose RADIAL_Z component is dz: .10 on the underside (dz 1), cuffFlexor on top (dz -1). */
export function rimStation(dz: number) {
  const c = Math.max(-1, Math.min(1, dz));
  return STATION.cuffDorsal + (STATION.cuffFlexor - STATION.cuffDorsal) * (1 - c) / 2;
}
/** The muzzle socket, AXIS_ORIGIN + .46 * BARREL_AXIS. */
export const MUZZLE: Readonly<V3> = { x: .0310, y: -.4483, z: -.1021 };
/** The hand_r head in this frame: every collapsed hand vertex lands here (s .263, radial .0456 m toward the underside). */
export const HAND_HEAD: Readonly<V3> = { x: .0181, y: -.2681, z: -.0107 };
export const HAND_SCALE = 1e-3;
export const SLIDE_MAX = .025;
/** The hatch (hinged on its muzzle-side edge) swings past upright to 105 deg, so the chase camera sees the glowing cavity and fins
 * in the vent pose (at 40 deg, hinged at the elbow side, the lid hid them: visual review r2). */
export const VENT_MAX = 105 * Math.PI / 180;
/** Unit steam direction in the contract frame (.8 outer + .35 top - .7 BARREL_AXIS): sideways past the outer face, the top and
 * elbow parts cancelling on screen for the chase camera in the muzzle-up vent pose, so the puffs leave the hatch sideways instead of
 * trailing up the barrel past the muzzle (review r2). */
export const VENT_DIR: Readonly<V3> = { x: .634, y: .763, z: -.129 };
export const NODES = { root: 'arm_cannon', shell: 'cannon_shell', slide: 'cannon_slide', vent: 'cannon_vent', muzzle: 'cannon_muzzle', core: 'cannon_core', ventMouth: 'cannon_vent_mouth' } as const;
export const BUDGET = { triangles: 4000, target: 3000, meshes: 3, bytes: 150000, drawCalls: 3 } as const;
/** Forearm-frame unit directions from the cannon (s .28) toward the camera in the solved aim pose, measured 2026-09-23:
 * chase (both orientations), ADS portrait, ADS landscape. Aiming, the barrel is 12-17 deg off the view line: seen from behind. */
export const VIEWS: readonly Readonly<V3>[] = [{ x: -.002, y: .998, z: .067 }, { x: -.070, y: .996, z: .047 }, { x: .077, y: .996, z: .035 }];
/**
 * Linear-light colours (sRGB in comments). The core is a saturated cyan: under ACES at exposure 1.2, #58e1ff at level 1 rendered as a
 * pale (172, 224, 231) and the flare to #f2feff went white; #00c8ff at .25-.55 renders (0, 123, 161) to (40, 180, 208).
 */
export const COLORS = {
  fringe: { r: 0, g: .578, b: 1 } /* #00c8ff */,
  cool: { r: 0, g: .479, b: 1 } /* #00b8ff */, amber: { r: 1, g: .451, b: .0629 } /* #ffb347 */, hot: { r: 1, g: .0423, b: .0052 } /* #ff3a10 */,
} as const;
/** Written by the shot choreography (Suit, priority -20), read by the runtime cannon (-19). Intensities multiply the colours. */
export type CannonDrive = { slide: number; vent: number; core: number; coreColor: RGB; strip: number; stripColor: RGB; fins: number; ring: number };
export const cannonDrive: CannonDrive = { slide: 0, vent: 0, core: .25, coreColor: { ...COLORS.fringe }, strip: .2, stripColor: { ...COLORS.cool }, fins: 0, ring: .2 };
export function restCannonDrive(d: CannonDrive = cannonDrive) {
  d.slide = 0; d.vent = 0; d.core = .25; d.strip = .2; d.fins = 0; d.ring = .2;
  d.coreColor.r = COLORS.fringe.r; d.coreColor.g = COLORS.fringe.g; d.coreColor.b = COLORS.fringe.b;
  d.stripColor.r = COLORS.cool.r; d.stripColor.g = COLORS.cool.g; d.stripColor.b = COLORS.cool.b;
}
/** Handshake. Suit publishes forearm and sets handHidden. ArmCannon sets ready (only once parented), shows only when handHidden,
 * and at -19 publishes the kicked effects muzzle and the vent mouth in world space. */
export type Socket = V3 & { valid: boolean };
export type CannonLink = { forearm: Object3D | null; ready: boolean; handHidden: boolean; ventMouth: Socket; ventDir: V3; fxMuzzle: Socket };
export const cannonLink: CannonLink = { forearm: null, ready: false, handHidden: false,
  ventMouth: { x: 0, y: 0, z: 0, valid: false }, ventDir: { x: 0, y: 1, z: 0 }, fxMuzzle: { x: 0, y: 0, z: 0, valid: false } };
