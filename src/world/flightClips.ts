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
// Upright and relaxed: the arms hang loosely down and out and drift forward and back together; the legs tread gently in antiphase,
// locked to the bob (the left knee peaks at bob phase .6, just after the fastest descent; shin and foot each lag .1 cycle).
const hover: AuthoredClip = { name: 'hover', duration: H, loop: true, source: 'authored-table', keys: mirrorKeys({
  spine: [[0, -.04, 0, 0]], chest: [[0, .02, 0, 0], [H / 2, .045, 0, 0]], neck: [[0, -.06, 0, 0]], head: [[0, .02, 0, 0]],
  clavicle_r: [[0, 0, .03, .02], [H / 2, 0, .03, .05]], clavicle_l: [[0, 0, -.03, -.02], [H / 2, 0, -.03, -.05]],
  upperarm_r: [[0, .06, .1, .38], [1.786, .14, .1, .45], [3.571, .02, .1, .36]],
  forearm_r: [[0, .18, 0, 0], [2.083, .3, 0, 0], [3.81, .15, 0, 0]],
  hand_r: [[0, .1, 0, .12], [2.381, .22, 0, .15], [4.048, .06, 0, .1]],
  thigh_l: [[.238, .08, 0, -.08], [1.429, .26, 0, -.09], [2.619, .08, 0, -.08], [3.81, .26, 0, -.09]],
  shin_l: [[.476, -.28, 0, 0], [1.667, -.52, 0, 0], [2.857, -.28, 0, 0], [4.048, -.52, 0, 0]],
  foot_l: [[.714, -.35, 0, 0], [1.905, -.6, 0, 0], [3.095, -.35, 0, 0], [4.286, -.6, 0, 0]], toe_l: [[0, -.1, 0, 0]],
  thigh_r: [[.238, .26, 0, .09], [1.429, .08, 0, .08], [2.619, .26, 0, .09], [3.81, .08, 0, .08]],
  shin_r: [[.476, -.52, 0, 0], [1.667, -.28, 0, 0], [2.857, -.52, 0, 0], [4.048, -.28, 0, 0]],
  foot_r: [[.714, -.6, 0, 0], [1.905, -.35, 0, 0], [3.095, -.6, 0, 0], [4.286, -.35, 0, 0]], toe_r: [[0, -.1, 0, 0]],
}, 0, H) };
// Arms swept back close along the sides, hands behind the hips; the legs trail nearly together, knees soft, and flutter at 1 Hz in
// antiphase (the left side runs .5 s behind), each foot flicking .15-.3 s after its thigh. One clip for both styles.
const cruise: AuthoredClip = { name: 'cruise', duration: 2, loop: true, source: 'authored-table', keys: mirrorKeys({
  spine: [[0, .04, 0, 0]], chest: [[0, .08, 0, 0], [1, .1, 0, 0]], clavicle_r: [[0, 0, -.06, -.03]],
  upperarm_r: [[0, -.24, 0, .1], [.5, -.27, 0, .13], [1.5, -.21, 0, .09]], forearm_r: [[0, .12, 0, 0]],
  hand_r: [[0, -.3, 0, .05], [.7, -.38, 0, .05], [1.7, -.25, 0, .05]],
  thigh_r: [[0, -.04, 0, .085], [.5, .14, 0, .085], [1, -.04, 0, .085], [1.5, .14, 0, .085]],
  shin_r: [[.15, -.14, 0, 0], [.65, -.36, 0, 0], [1.15, -.14, 0, 0], [1.65, -.36, 0, 0]],
  foot_r: [[.3, -.7, 0, 0], [.8, -.85, 0, 0], [1.3, -.7, 0, 0], [1.8, -.85, 0, 0]], toe_r: [[0, -.15, 0, 0]],
}, .5, 2) };
// Classic power, an arrow: both arms tight along the body, legs together and pointed with a small alternating flutter.
const powerKeys: Keys = {
  spine: [[0, .04, 0, 0]], chest: [[0, .08, 0, 0], [.5, .09, 0, 0]],
  clavicle_r: [[0, 0, -.05, 0]], clavicle_l: [[0, 0, .05, 0]],
  upperarm_r: [[0, -.1, 0, -.01], [.5, -.08, 0, 0]], upperarm_l: [[0, -.1, 0, .01], [.5, -.12, 0, 0]],
  forearm_r: [[0, .05, 0, 0]], forearm_l: [[0, .05, 0, 0]], hand_r: [[0, -.25, 0, 0], [.5, -.3, 0, 0]], hand_l: [[0, -.25, 0, 0], [.4, -.32, 0, 0]],
  thigh_r: [[0, .02, 0, -.02]], thigh_l: [[0, .04, 0, .02]], shin_r: [[0, -.1, 0, 0], [.5, -.2, 0, 0]], shin_l: [[0, -.2, 0, 0], [.5, -.1, 0, 0]],
  foot_l: [[0, -.85, 0, 0], [.25, -.77, 0, 0], [.5, -.87, 0, 0], [.75, -.78, 0, 0]],
  foot_r: [[0, -.8, 0, 0], [.25, -.88, 0, 0], [.5, -.78, 0, 0], [.75, -.87, 0, 0]], toe_r: [[0, -.2, 0, 0], [.5, -.25, 0, 0]], toe_l: [[0, -.2, 0, 0], [.5, -.25, 0, 0]],
};
const power: AuthoredClip = { name: 'power', duration: 1, loop: true, source: 'authored-table', keys: powerKeys };
// Hero power: the right fist leads (the fist clip), the left arm trails tight along the body and the left knee bends.
const powerHero: AuthoredClip = { ...power, name: 'powerHero', keys: { ...powerKeys,
  spine: [[0, .05, 0, 0]], chest: [[0, .1, .02, 0], [.5, .11, .02, 0]], clavicle_l: [[0, 0, .06, -.02]],
  upperarm_l: [[0, -.18, 0, 0], [.5, -.16, 0, -.01]], forearm_l: [[0, .02, 0, 0], [.4, .06, 0, 0]], hand_l: [[0, -.38, 0, -.05], [.5, -.45, 0, -.05]],
  thigh_l: [[0, .15, 0, .04]], shin_l: [[0, -.55, 0, 0], [.5, -.62, 0, 0]], thigh_r: [[0, 0, 0, -.03]], shin_r: [[0, -.08, 0, 0], [.5, -.12, 0, 0]] } };
/** The hero fist chain only, authored for the full power lean (-1.35) on level travel; flightPose re-aims it along the travel axis. */
const fist: AuthoredClip = { name: 'fist', duration: 1, loop: true, source: 'authored-table', keys: {
  clavicle_r: [[0, 0, .1, .22]], upperarm_r: [[0, 2.8, .1, .09], [.5, 2.82, .1, .1]], forearm_r: [[0, .1, 0, 0]], hand_r: [[0, -.05, 0, .12], [.5, -.03, 0, .13]] } };
// An asymmetric flare: the right arm reaches further forward, the left wider and lower, both elbows bent; the right knee drives up
// higher than the left, the thighs kept under the hips. A hunch, not an arch, so the back stays toward an overhead camera.
const brakeKeys: Keys = {
  spine: [[0, -.06, 0, 0]], chest: [[0, -.04, 0, 0], [1, -.06, 0, 0]], clavicle_r: [[0, 0, -.08, .1]], clavicle_l: [[0, 0, .06, -.12]],
  upperarm_r: [[0, .8, -.1, .4], [.6, .83, -.1, .44], [1.4, .77, -.1, .38]], forearm_r: [[0, .6, 0, 0], [.8, .66, 0, 0]],
  upperarm_l: [[0, .5, .1, -.46], [.4, .47, .1, -.43], [1.6, .53, .1, -.48]], forearm_l: [[0, .8, 0, 0], [1.8, .86, 0, 0]],
  hand_r: [[0, -.4, 0, .1], [.8, -.5, 0, .1]], hand_l: [[0, -.35, 0, -.1], [1.8, -.45, 0, -.1]],
  thigh_r: [[0, .7, 0, .02]], shin_r: [[0, -.95, 0, 0], [1, -1, 0, 0]], thigh_l: [[0, .4, 0, -.02]], shin_l: [[0, -.6, 0, 0], [1, -.65, 0, 0]],
  foot_r: [[0, .1, 0, 0]], foot_l: [[0, .1, 0, 0]], toe_r: [[0, .15, 0, 0]], toe_l: [[0, .15, 0, 0]],
};
const brake: AuthoredClip = { name: 'brake', duration: 2, loop: true, source: 'authored-table', keys: brakeKeys };
const brakeHero: AuthoredClip = { ...brake, name: 'brakeHero', keys: { ...brakeKeys,
  upperarm_r: [[0, 1.2, -.15, .32], [.6, 1.23, -.15, .35], [1.4, 1.17, -.15, .3]], upperarm_l: [[0, .45, .1, -.38], [.4, .42, .1, -.35], [1.6, .48, .1, -.4]],
  forearm_r: [[0, .6, 0, 0], [.8, .65, 0, 0]], forearm_l: [[0, 1, 0, 0], [1.8, 1.05, 0, 0]],
  thigh_r: [[0, .8, 0, .02], [1, .84, 0, .02]], shin_r: [[0, -1.2, 0, 0], [1, -1.25, 0, 0]], thigh_l: [[0, .45, 0, -.03]], shin_l: [[0, -.7, 0, 0], [1, -.75, 0, 0]] } };
export const FLIGHT = {
  hover: compileClip(hover), cruise: compileClip(cruise), power: [compileClip(power), compileClip(powerHero)], fist: compileClip(fist),
  brake: [compileClip(brake), compileClip(brakeHero)],
} as const;
