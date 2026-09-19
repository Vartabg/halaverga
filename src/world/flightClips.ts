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
// Upright and relaxed: the arms hang loosely down and out with the elbows soft and the wrists loose, drifting out and in with the
// left arm .35 of a loop behind the right; the legs stand at hip width and tread gently in antiphase, locked to the bob (the left knee
// peaks at bob phase .6, just after the fastest descent; shin and foot each lag .1 cycle).
const hover: AuthoredClip = { name: 'hover', duration: H, loop: true, source: 'authored-table', keys: mirrorKeys({
  spine: [[0, -.04, 0, 0]], chest: [[0, .02, 0, 0], [H / 2, .045, 0, 0]], neck: [[0, -.06, 0, 0]], head: [[0, .02, 0, 0]],
  clavicle_r: [[0, 0, .03, .02], [H / 2, 0, .03, .05]],
  upperarm_r: [[0, .08, .05, .37], [1.786, .1, .05, .47], [3.571, .07, .05, .4]],
  forearm_r: [[0, .42, 0, 0], [2.083, .55, 0, 0], [3.81, .45, 0, 0]],
  hand_r: [[0, .2, 0, .12], [2.381, .32, 0, .16], [4.048, .18, 0, .1]],
  thigh_l: [[.238, .08, 0, -.02], [1.429, .26, 0, -.03], [2.619, .08, 0, -.02], [3.81, .26, 0, -.03]],
  shin_l: [[.476, -.28, 0, 0], [1.667, -.52, 0, 0], [2.857, -.28, 0, 0], [4.048, -.52, 0, 0]],
  foot_l: [[.714, -.35, 0, 0], [1.905, -.6, 0, 0], [3.095, -.35, 0, 0], [4.286, -.6, 0, 0]], toe_l: [[0, -.1, 0, 0]],
  thigh_r: [[.238, .26, 0, .03], [1.429, .08, 0, .02], [2.619, .26, 0, .03], [3.81, .08, 0, .02]],
  shin_r: [[.476, -.52, 0, 0], [1.667, -.28, 0, 0], [2.857, -.52, 0, 0], [4.048, -.28, 0, 0]],
  foot_r: [[.714, -.6, 0, 0], [1.905, -.35, 0, 0], [3.095, -.6, 0, 0], [4.286, -.35, 0, 0]], toe_r: [[0, -.1, 0, 0]],
}, .35 * H, H) };
// The chest arches, the shoulders draw back and the arms sweep back behind the hips, hands in toward the midline; the legs trail
// together with the knees bent, fluttering at 1 Hz in antiphase (the left side runs .5 s behind), each foot flicking .15-.3 s after
// its thigh. One clip for both styles.
const cruise: AuthoredClip = { name: 'cruise', duration: 2, loop: true, source: 'authored-table', keys: mirrorKeys({
  spine: [[0, .06, 0, 0]], chest: [[0, .1, 0, 0], [1, .12, 0, 0]], clavicle_r: [[0, 0, -.2, -.04]],
  upperarm_r: [[0, -.43, 0, -.16], [.5, -.45, 0, -.18], [1.5, -.41, 0, -.14]], forearm_r: [[0, .1, 0, 0]],
  hand_r: [[0, -.3, 0, -.05], [.7, -.38, 0, -.05], [1.7, -.25, 0, -.05]],
  thigh_r: [[0, -.08, 0, -.035], [.5, .1, 0, -.035], [1, -.08, 0, -.035], [1.5, .1, 0, -.035]],
  shin_r: [[.15, -.5, 0, 0], [.65, -.85, 0, 0], [1.15, -.5, 0, 0], [1.65, -.85, 0, 0]],
  foot_r: [[.3, -.6, 0, 0], [.8, -.8, 0, 0], [1.3, -.6, 0, 0], [1.8, -.8, 0, 0]], toe_r: [[0, -.15, 0, 0]],
}, .5, 2) };
// Classic power, an arrow: both arms tight along the body, legs together and pointed with a small alternating flutter.
const powerKeys: Keys = {
  spine: [[0, .04, 0, 0]], chest: [[0, .08, 0, 0], [.5, .09, 0, 0]],
  clavicle_r: [[0, 0, -.08, -.03]], clavicle_l: [[0, 0, .08, .03]],
  upperarm_r: [[0, -.1, 0, -.08], [.5, -.08, 0, -.07]], upperarm_l: [[0, -.1, 0, .08], [.5, -.12, 0, .07]],
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
  clavicle_r: [[0, 0, .1, .22]], upperarm_r: [[0, 2.8, .1, .175], [.5, 2.82, .1, .185]], forearm_r: [[0, .1, 0, 0]], hand_r: [[0, -.05, 0, .12], [.5, -.03, 0, .13]] } };
// An asymmetric flare: the right arm reaches forward and high with the elbow well bent, the left lower and wider with the elbow
// softer; the right knee drives up higher and a little out, the left stays under the hip. A hunch, not an arch, so the back stays
// toward an overhead camera.
const brakeKeys: Keys = {
  spine: [[0, -.06, 0, 0]], chest: [[0, -.04, 0, 0], [1, -.06, 0, 0]], clavicle_r: [[0, 0, -.08, .12]], clavicle_l: [[0, 0, .06, -.1]],
  upperarm_r: [[0, 1.1, -.1, .35], [.6, 1.14, -.1, .38], [1.4, 1.06, -.1, .33]], forearm_r: [[0, 1.1, 0, 0], [.8, 1.18, 0, 0]],
  upperarm_l: [[0, .4, .1, -.5], [.4, .37, .1, -.47], [1.6, .43, .1, -.52]], forearm_l: [[0, .5, 0, 0], [1.8, .56, 0, 0]],
  hand_r: [[0, -.4, 0, .1], [.8, -.5, 0, .1]], hand_l: [[0, -.35, 0, -.1], [1.8, -.45, 0, -.1]],
  thigh_r: [[0, .7, 0, .15]], shin_r: [[0, -1.55, 0, 0], [1, -1.6, 0, 0]], thigh_l: [[0, .4, 0, .04]], shin_l: [[0, -.95, 0, 0], [1, -1, 0, 0]],
  foot_r: [[0, .1, 0, 0]], foot_l: [[0, .1, 0, 0]], toe_r: [[0, .15, 0, 0]], toe_l: [[0, .15, 0, 0]],
};
const brake: AuthoredClip = { name: 'brake', duration: 2, loop: true, source: 'authored-table', keys: brakeKeys };
const brakeHero: AuthoredClip = { ...brake, name: 'brakeHero', keys: { ...brakeKeys,
  upperarm_r: [[0, 1.3, -.15, .3], [.6, 1.33, -.15, .33], [1.4, 1.27, -.15, .28]], upperarm_l: [[0, .35, .1, -.52], [.4, .32, .1, -.5], [1.6, .38, .1, -.54]],
  forearm_r: [[0, 1.2, 0, 0], [.8, 1.26, 0, 0]], forearm_l: [[0, .55, 0, 0], [1.8, .6, 0, 0]],
  thigh_r: [[0, .8, 0, .16], [1, .83, 0, .16]], shin_r: [[0, -1.7, 0, 0], [1, -1.75, 0, 0]], thigh_l: [[0, .4, 0, .02]], shin_l: [[0, -1.05, 0, 0], [1, -1.1, 0, 0]] } };
// Climb, limbs only (no torso pitch: it plays at hover, possibly under an overhead camera): legs together, straight and pointed,
// arms low, back and pinned in, a small flutter.
const climb: AuthoredClip = { name: 'climb', duration: 2, loop: true, source: 'authored-table', keys: mirrorKeys({
  clavicle_r: [[0, 0, -.08, -.05]], upperarm_r: [[0, -.3, 0, -.03], [1, -.33, 0, -.04]], forearm_r: [[0, .08, 0, 0]], hand_r: [[0, -.3, 0, 0]],
  thigh_r: [[0, -.04, 0, -.035], [.5, .03, 0, -.035], [1, -.04, 0, -.035], [1.5, .03, 0, -.035]], shin_r: [[.15, -.05, 0, 0], [.65, -.18, 0, 0], [1.15, -.05, 0, 0], [1.65, -.18, 0, 0]],
  foot_r: [[0, -.85, 0, 0]], toe_r: [[0, -.2, 0, 0]],
}, .5, 2) };
// Dive, a tuck (flexion only, safe with the camera above): the back rounds, the knees draw up, the elbows fold and bring the hands
// in toward the shoulders.
const dive: AuthoredClip = { name: 'dive', duration: 2, loop: true, source: 'authored-table', keys: mirrorKeys({
  spine: [[0, -.02, 0, 0]], chest: [[0, -.04, 0, 0], [1, -.05, 0, 0]], clavicle_r: [[0, 0, .08, -.04]],
  upperarm_r: [[0, .25, 0, .18], [1, .28, 0, .2]], forearm_r: [[0, 1.5, 0, 0], [1, 1.45, 0, 0]], hand_r: [[0, .2, 0, 0]],
  thigh_r: [[0, 1.0, 0, .04], [1, 1.05, 0, .04]], shin_r: [[0, -1.5, 0, 0], [1, -1.55, 0, 0]], foot_r: [[0, -.8, 0, 0]], toe_r: [[0, -.1, 0, 0]],
}, 1, 2) };
export const FLIGHT = {
  hover: compileClip(hover), cruise: compileClip(cruise), power: [compileClip(power), compileClip(powerHero)], fist: compileClip(fist),
  brake: [compileClip(brake), compileClip(brakeHero)], climb: compileClip(climb), dive: compileClip(dive),
} as const;
