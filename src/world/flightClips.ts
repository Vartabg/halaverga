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
// Relaxed A-shape: the arms drift out and back together; the legs tread in antiphase, locked to the bob (the left knee peaks at
// bob phase .6, just after the fastest descent; shin and foot each lag .1 cycle).
const hover: AuthoredClip = { name: 'hover', duration: H, loop: true, source: 'authored-table', keys: mirrorKeys({
  spine: [[0, -.04, 0, 0]], chest: [[0, .02, 0, 0], [H / 2, .045, 0, 0]], neck: [[0, -.06, 0, 0]], head: [[0, .02, 0, 0]],
  clavicle_r: [[0, 0, .04, .04], [H / 2, 0, .04, .07]], clavicle_l: [[0, 0, -.04, -.04], [H / 2, 0, -.04, -.07]],
  upperarm_r: [[0, .12, .15, .42], [1.786, .15, .15, .54], [3.571, .1, .15, .38]],
  forearm_r: [[0, .25, 0, 0], [2.083, .38, 0, 0], [3.81, .22, 0, 0]],
  hand_r: [[0, .15, 0, .1], [2.381, .3, 0, .12], [4.048, .1, 0, .08]],
  thigh_l: [[.238, .1, 0, -.2], [1.429, .25, 0, -.21], [2.619, .1, 0, -.2], [3.81, .25, 0, -.21]],
  shin_l: [[.476, -.34, 0, 0], [1.667, -.48, 0, 0], [2.857, -.34, 0, 0], [4.048, -.48, 0, 0]],
  foot_l: [[.714, -.38, 0, 0], [1.905, -.56, 0, 0], [3.095, -.38, 0, 0], [4.286, -.56, 0, 0]], toe_l: [[0, -.1, 0, 0]],
  thigh_r: [[.238, .25, 0, .21], [1.429, .08, 0, .2], [2.619, .25, 0, .21], [3.81, .08, 0, .2]],
  shin_r: [[.476, -.41, 0, 0], [1.667, -.22, 0, 0], [2.857, -.41, 0, 0], [4.048, -.22, 0, 0]],
  foot_r: [[.714, -.56, 0, 0], [1.905, -.38, 0, 0], [3.095, -.56, 0, 0], [4.286, -.38, 0, 0]], toe_r: [[0, -.1, 0, 0]],
}, 0, H) };
// Arms swept back and out in a V; the legs trail with the knees flexed and flutter at 1 Hz in antiphase (the left side runs .5 s
// behind), each foot flicking .15-.3 s after its thigh. One clip for both styles.
const cruise: AuthoredClip = { name: 'cruise', duration: 2, loop: true, source: 'authored-table', keys: mirrorKeys({
  spine: [[0, .04, 0, 0]], chest: [[0, .08, 0, 0], [1, .1, 0, 0]], clavicle_r: [[0, 0, -.08, 0]],
  upperarm_r: [[0, -.5, -.2, .36], [.5, -.52, -.2, .42], [1.5, -.48, -.2, .32]], forearm_r: [[0, .2, 0, 0]],
  hand_r: [[0, -.2, 0, .05], [.7, -.3, 0, .05], [1.7, -.14, 0, .05]],
  thigh_r: [[0, -.02, 0, .16], [.5, .18, 0, .16], [1, -.02, 0, .16], [1.5, .18, 0, .16]],
  shin_r: [[.15, -.16, 0, 0], [.65, -.4, 0, 0], [1.15, -.16, 0, 0], [1.65, -.4, 0, 0]],
  foot_r: [[.3, -.6, 0, 0], [.8, -.8, 0, 0], [1.3, -.6, 0, 0], [1.8, -.8, 0, 0]], toe_r: [[0, -.15, 0, 0]],
}, .5, 2) };
// Classic power: both arms swept back along the body, clear of it; legs together and pointed with a small alternating flutter.
const powerKeys: Keys = {
  spine: [[0, .04, 0, 0]], chest: [[0, .08, 0, 0], [.5, .09, 0, 0]],
  clavicle_r: [[0, 0, -.05, 0]], clavicle_l: [[0, 0, .05, 0]],
  upperarm_r: [[0, -.38, -.35, .1], [.5, -.36, -.35, .12]], upperarm_l: [[0, -.38, .35, -.1], [.5, -.4, .35, -.12]],
  forearm_r: [[0, .08, 0, 0]], forearm_l: [[0, .08, 0, 0]], hand_r: [[0, -.35, 0, 0], [.5, -.4, 0, 0]], hand_l: [[0, -.35, 0, 0], [.4, -.42, 0, 0]],
  thigh_r: [[0, .02, 0, -.05]], thigh_l: [[0, .04, 0, .05]], shin_r: [[0, -.1, 0, 0], [.5, -.2, 0, 0]], shin_l: [[0, -.2, 0, 0], [.5, -.1, 0, 0]],
  foot_l: [[0, -.85, 0, 0], [.25, -.77, 0, 0], [.5, -.87, 0, 0], [.75, -.78, 0, 0]],
  foot_r: [[0, -.8, 0, 0], [.25, -.88, 0, 0], [.5, -.78, 0, 0], [.75, -.87, 0, 0]], toe_r: [[0, -.2, 0, 0], [.5, -.25, 0, 0]], toe_l: [[0, -.2, 0, 0], [.5, -.25, 0, 0]],
};
const power: AuthoredClip = { name: 'power', duration: 1, loop: true, source: 'authored-table', keys: powerKeys };
// Hero power: the right fist leads (the fist clip), the left arm is held tight back along the body and the left knee bends.
const powerHero: AuthoredClip = { ...power, name: 'powerHero', keys: { ...powerKeys,
  spine: [[0, .05, 0, 0]], chest: [[0, .1, .02, 0], [.5, .11, .02, 0]], clavicle_l: [[0, 0, .06, -.02]],
  upperarm_l: [[0, -.56, -.3, -.18], [.5, -.52, -.3, -.2]], forearm_l: [[0, .15, 0, 0], [.4, .2, 0, 0]], hand_l: [[0, -.3, 0, -.05], [.5, -.4, 0, -.05]],
  thigh_l: [[0, .15, 0, .04]], shin_l: [[0, -.55, 0, 0], [.5, -.62, 0, 0]], thigh_r: [[0, 0, 0, -.03]], shin_r: [[0, -.08, 0, 0], [.5, -.12, 0, 0]] } };
/** The hero fist chain only, authored for the full power lean (-1.35) on level travel; flightPose re-aims it along the travel axis. */
const fist: AuthoredClip = { name: 'fist', duration: 1, loop: true, source: 'authored-table', keys: {
  clavicle_r: [[0, 0, .1, .22]], upperarm_r: [[0, 2.8, .1, .05], [.5, 2.82, .1, .06]], forearm_r: [[0, .1, 0, 0]], hand_r: [[0, -.05, 0, .12], [.5, -.03, 0, .13]] } };
// Arms flung forward and wide, both knees driven up. A hunch, not an arch, so the back stays toward an overhead camera.
const brakeKeys: Keys = mirrorKeys({
  spine: [[0, -.06, 0, 0]], chest: [[0, -.04, 0, 0], [1, -.06, 0, 0]], clavicle_r: [[0, 0, -.08, .12]],
  upperarm_r: [[0, .6, -.2, .7], [.6, .63, -.2, .76], [1.4, .57, -.2, .66]], forearm_r: [[0, .45, 0, 0], [.8, .5, 0, 0]],
  hand_r: [[0, -.45, 0, .1], [.8, -.55, 0, .1]], thigh_r: [[0, .85, 0, .08]], shin_r: [[0, -.85, 0, 0], [1, -.92, 0, 0]],
  foot_r: [[0, .1, 0, 0]], toe_r: [[0, .15, 0, 0]],
}, 1, 2);
const brake: AuthoredClip = { name: 'brake', duration: 2, loop: true, source: 'authored-table', keys: brakeKeys };
const brakeHero: AuthoredClip = { ...brake, name: 'brakeHero', keys: { ...brakeKeys,
  upperarm_r: [[0, .8, -.25, .8], [.6, .83, -.25, .85], [1.4, .77, -.25, .77]], upperarm_l: [[0, .8, .25, -.8], [.4, .77, .25, -.77], [1.6, .83, .25, -.85]],
  forearm_r: [[0, .55, 0, 0], [.8, .6, 0, 0]], forearm_l: [[0, .55, 0, 0], [1.8, .6, 0, 0]],
  thigh_l: [[0, 1.1, 0, -.1], [1, 1.14, 0, -.1]], shin_l: [[0, -1.15, 0, 0], [1, -1.2, 0, 0]], thigh_r: [[0, 1, 0, .1]], shin_r: [[0, -1, 0, 0], [1, -1.05, 0, 0]] } };
export const FLIGHT = {
  hover: compileClip(hover), cruise: compileClip(cruise), power: [compileClip(power), compileClip(powerHero)], fist: compileClip(fist),
  brake: [compileClip(brake), compileClip(brakeHero)],
} as const;
