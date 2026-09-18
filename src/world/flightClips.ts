import { compileClip, mirrorKeys, type AuthoredClip, type Keys } from './clipSampler';
/*
 * Original hand-authored flight clips (no third-party clips or motion capture). Keys are [t, x, y, z]: seconds, then the bone's local
 * rotation as three.js XYZ Euler radians.
 * - Limbs: +x swings forward (toward -Z). Elbows flex +x, knees -x. Feet and toes point with -x. +z moves a limb toward +X (the right).
 * - Torso: +x arches (top toward +Z, the camera side), +y turns left, +z bends left.
 * - Right clavicle: +z shrugs, +y protracts. Hands hang palm-forward: +x flexes, -x extends.
 * - mirrorKeys(keys, shift, duration) adds a left channel for every right-only one (x kept, y and z negated, time shifted round the loop).
 */
/** Hover loops over two bob periods of suitAnimation's .42 Hz clock, so the tread stays locked to the bob. */
export const HOVER_LOOP = 2 / .42;
const H = HOVER_LOOP;
// Alternating tread locked to the bob: the left knee peaks at bob phase .6, just after the fastest descent; shin and foot each lag .1 cycle.
const hover: AuthoredClip = { name: 'hover', duration: H, loop: true, source: 'authored-table', keys: mirrorKeys({
  spine: [[0, -.04, 0, 0]], chest: [[0, .02, 0, 0], [H / 2, .045, 0, 0]], neck: [[0, -.06, 0, 0]], head: [[0, .02, 0, 0]],
  clavicle_r: [[0, 0, .04, .05], [H / 2, 0, .04, .08]], clavicle_l: [[0, 0, -.04, -.05], [H / 2, 0, -.04, -.08]],
  upperarm_r: [[0, .2, .15, .24], [1.786, .23, .15, .3], [3.571, .18, .15, .23]],
  forearm_r: [[0, .5, 0, 0], [2.083, .58, 0, 0], [3.81, .47, 0, 0]],
  hand_r: [[0, .18, 0, .06], [2.381, .28, 0, .08], [4.048, .15, 0, .05]],
  thigh_l: [[.238, .13, 0, -.05], [1.429, .21, 0, -.06], [2.619, .13, 0, -.05], [3.81, .21, 0, -.06]],
  shin_l: [[.476, -.32, 0, 0], [1.667, -.44, 0, 0], [2.857, -.32, 0, 0], [4.048, -.44, 0, 0]],
  foot_l: [[.714, -.4, 0, 0], [1.905, -.52, 0, 0], [3.095, -.4, 0, 0], [4.286, -.52, 0, 0]], toe_l: [[0, -.1, 0, 0]],
  thigh_r: [[.238, .1, 0, .04], [1.429, .04, 0, .04], [2.619, .1, 0, .04], [3.81, .04, 0, .04]],
  shin_r: [[.476, -.22, 0, 0], [1.667, -.14, 0, 0], [2.857, -.22, 0, 0], [4.048, -.14, 0, 0]],
  foot_r: [[.714, -.42, 0, 0], [1.905, -.32, 0, 0], [3.095, -.42, 0, 0], [4.286, -.32, 0, 0]], toe_r: [[0, -.1, 0, 0]],
}, H / 2, H) };
// Arms swept back in a V; feet flick .15-.3 s after the thighs. One clip for both styles.
const cruise: AuthoredClip = { name: 'cruise', duration: 2, loop: true, source: 'authored-table', keys: mirrorKeys({
  spine: [[0, .04, 0, 0]], chest: [[0, .08, 0, 0], [1, .1, 0, 0]], clavicle_r: [[0, 0, -.06, 0]],
  upperarm_r: [[0, -.3, -.2, .2], [.5, -.3, -.2, .24], [1.5, -.3, -.2, .18]], forearm_r: [[0, .25, 0, 0]],
  hand_r: [[0, -.15, 0, .05], [.7, -.23, 0, .05], [1.7, -.1, 0, .05]],
  thigh_r: [[0, .1, 0, .03], [.5, .14, 0, .03], [1.5, .06, 0, .03]], shin_r: [[0, -.12, 0, 0], [.65, -.17, 0, 0], [1.65, -.08, 0, 0]],
  foot_r: [[0, -.7, 0, 0], [.8, -.78, 0, 0], [1.8, -.62, 0, 0]], toe_r: [[0, -.15, 0, 0]],
}, 1, 2) };
const powerKeys: Keys = {
  spine: [[0, .04, 0, 0]], chest: [[0, .08, 0, 0], [.5, .09, 0, 0]],
  clavicle_r: [[0, 0, -.05, 0]], clavicle_l: [[0, 0, .05, 0]],
  upperarm_r: [[0, -.18, -.35, .12], [.5, -.16, -.35, .13]], upperarm_l: [[0, -.18, .35, -.12], [.5, -.21, .35, -.14]],
  forearm_r: [[0, .08, 0, 0]], forearm_l: [[0, .08, 0, 0]], hand_r: [[0, -.35, 0, 0], [.5, -.4, 0, 0]], hand_l: [[0, -.35, 0, 0], [.4, -.42, 0, 0]],
  thigh_r: [[0, .03, 0, -.02]], thigh_l: [[0, .05, 0, .02]], shin_r: [[0, -.06, 0, 0], [.5, -.1, 0, 0]], shin_l: [[0, -.1, 0, 0], [.5, -.16, 0, 0]],
  foot_l: [[0, -.85, 0, 0], [.25, -.77, 0, 0], [.5, -.87, 0, 0], [.75, -.78, 0, 0]],
  foot_r: [[0, -.8, 0, 0], [.25, -.88, 0, 0], [.5, -.78, 0, 0], [.75, -.87, 0, 0]], toe_r: [[0, -.2, 0, 0], [.5, -.25, 0, 0]], toe_l: [[0, -.2, 0, 0], [.5, -.25, 0, 0]],
};
const power: AuthoredClip = { name: 'power', duration: 1, loop: true, source: 'authored-table', keys: powerKeys };
const powerHero: AuthoredClip = { ...power, name: 'powerHero', keys: { ...powerKeys,
  spine: [[0, .05, 0, 0]], chest: [[0, .1, .02, 0], [.5, .11, .02, 0]], clavicle_l: [[0, 0, .06, -.02]],
  upperarm_l: [[0, -.3, -.3, -.12], [.5, -.25, -.3, -.15]], forearm_l: [[0, .3, 0, 0], [.4, .36, 0, 0]], hand_l: [[0, -.2, 0, -.08], [.5, -.3, 0, -.08]],
  thigh_l: [[0, .1, 0, .03]], shin_l: [[0, -.35, 0, 0], [.5, -.42, 0, 0]], thigh_r: [[0, 0, 0, -.03]], shin_r: [[0, -.06, 0, 0], [.5, -.1, 0, 0]] } };
/** The hero fist chain only, authored for the full power lean (-1.35) on level travel; flightPose re-aims it along the travel axis. */
const fist: AuthoredClip = { name: 'fist', duration: 1, loop: true, source: 'authored-table', keys: {
  clavicle_r: [[0, 0, .1, .22]], upperarm_r: [[0, 2.8, .1, .05], [.5, 2.82, .1, .06]], forearm_r: [[0, .1, 0, 0]], hand_r: [[0, -.05, 0, .12], [.5, -.03, 0, .13]] } };
// A hunch, not an arch, so the back stays toward an overhead camera.
const brakeKeys: Keys = mirrorKeys({
  spine: [[0, -.06, 0, 0]], chest: [[0, -.04, 0, 0], [1, -.06, 0, 0]], clavicle_r: [[0, 0, -.08, .12]],
  upperarm_r: [[0, .4, -.2, .45], [.6, .42, -.2, .5], [1.4, .38, -.2, .43]], forearm_r: [[0, .45, 0, 0], [.8, .5, 0, 0]],
  hand_r: [[0, -.45, 0, .1], [.8, -.55, 0, .1]], thigh_r: [[0, .35, 0, .06]], shin_r: [[0, -.5, 0, 0], [1, -.54, 0, 0]],
  foot_r: [[0, .1, 0, 0]], toe_r: [[0, .15, 0, 0]],
}, 1, 2);
const brake: AuthoredClip = { name: 'brake', duration: 2, loop: true, source: 'authored-table', keys: brakeKeys };
const brakeHero: AuthoredClip = { ...brake, name: 'brakeHero', keys: { ...brakeKeys,
  upperarm_r: [[0, .65, -.25, .6], [.6, .68, -.25, .65], [1.4, .62, -.25, .57]], upperarm_l: [[0, .65, .25, -.6], [.4, .62, .25, -.57], [1.6, .68, .25, -.65]],
  forearm_r: [[0, .7, 0, 0], [.8, .74, 0, 0]], forearm_l: [[0, .7, 0, 0], [1.8, .74, 0, 0]],
  thigh_l: [[0, .85, 0, -.1], [1, .89, 0, -.1]], shin_l: [[0, -1.15, 0, 0], [1, -1.2, 0, 0]], thigh_r: [[0, .3, 0, .08]], shin_r: [[0, -.4, 0, 0], [1, -.44, 0, 0]] } };
export const FLIGHT = {
  hover: compileClip(hover), cruise: compileClip(cruise), power: [compileClip(power), compileClip(powerHero)], fist: compileClip(fist),
  brake: [compileClip(brake), compileClip(brakeHero)],
} as const;
