import { compileClip, mirrorClip, mirrorKeys, type AuthoredClip } from './clipSampler';
/** Original authored accents, same conventions as flightClips.ts. Additive clips are offsets from rest; a single key is a held shape. */
const still = (name: string, keys: AuthoredClip['keys']): AuthoredClip => ({ name, duration: 1, loop: false, additive: true, source: 'authored-table', keys });
// Left turn is positive weight: the torso side-bends into the turn with the head counter-rolled and the legs swing wide to the
// outside with the inside knee drawn up. The arms stay close (the whole-body roll carries the turn): the inside arm tucks toward
// the chest with the elbow bent, the outside arm eases slightly out.
const bankLeft = still('bankLeft', {
  spine: [[0, 0, .02, .09]], chest: [[0, 0, .035, .11]], neck: [[0, 0, .08, -.12]], head: [[0, 0, .12, -.1]],
  clavicle_r: [[0, 0, 0, .06]], clavicle_l: [[0, 0, -.12, 0]], upperarm_l: [[0, .3, -.3, .1]], upperarm_r: [[0, -.05, 0, .22]],
  forearm_l: [[0, .3, 0, 0]], hand_r: [[0, 0, 0, .1]], hand_l: [[0, .15, 0, 0]],
  thigh_l: [[0, .15, 0, .25]], thigh_r: [[0, 0, 0, .25]], shin_l: [[0, -.25, 0, 0]], foot_r: [[0, -.08, 0, 0]], foot_l: [[0, .05, 0, 0]],
});
// Limbs only, no torso pitch: plays at hover, possibly under an overhead camera. Legs together, in line and pointed, arms low and
// pinned in.
const climb = still('climb', mirrorKeys({
  clavicle_r: [[0, 0, 0, -.04]], upperarm_r: [[0, -.18, 0, -.06]], hand_r: [[0, -.25, 0, 0]], thigh_r: [[0, 0, 0, -.05]], foot_r: [[0, -.12, 0, 0]], toe_r: [[0, -.1, 0, 0]],
}));
// A stoop, flexion only (safe with the camera above): the arms fold back and in behind the hips, the trailing legs come into line
// with the body and the feet point.
const dive = still('dive', mirrorKeys({
  spine: [[0, -.02, 0, 0]], chest: [[0, -.04, 0, 0]], clavicle_r: [[0, 0, -.15, -.08]], upperarm_r: [[0, -.24, .15, .06]],
  forearm_r: [[0, 0, 0, 0]], hand_r: [[0, -.25, 0, 0]], thigh_r: [[0, .12, 0, -.04]], foot_r: [[0, -.12, 0, 0]], toe_r: [[0, -.15, 0, 0]],
}));
// Feet-first hover descent; no torso, and no knee fold on top of the tread (touching down from it would tip the toes under the sole).
const sink = still('sink', mirrorKeys({
  clavicle_r: [[0, 0, 0, .06]], upperarm_r: [[0, .1, 0, .12]], forearm_r: [[0, .15, 0, 0]],
  hand_r: [[0, .1, 0, 0]], thigh_r: [[0, .1, 0, 0]], foot_r: [[0, .2, 0, 0]], toe_r: [[0, .1, 0, 0]],
}));
// Takeoff snap on the added bones only, starting and ending at rest. The foot channel is not added: its x is the weight (0 to -1)
// with which the feet point toward the absolute `reach`, so the tread plus the snap never passes the foot limit.
const launch: AuthoredClip = { name: 'launch', duration: 1, loop: false, additive: true, source: 'authored-table', keys: mirrorKeys({
  clavicle_r: [[0, 0, 0, 0], [.25, 0, 0, .18], [.6, 0, 0, .08], [1, 0, 0, 0]], hand_r: [[0, 0, 0, 0], [.25, 0, 0, .12], [1, 0, 0, 0]],
  foot_r: [[0, 0, 0, 0], [.25, -1, 0, 0], [.6, -.6, 0, 0], [1, 0, 0, 0]], toe_r: [[0, 0, 0, 0], [.25, -.25, 0, 0], [1, 0, 0, 0]],
}) };
const reach: AuthoredClip = { name: 'reach', duration: 1, loop: false, source: 'authored-table', keys: mirrorKeys({ foot_r: [[0, -1.08, 0, 0]] }) };
// Landing flare, absolute: unkeyed bones go to rest and the feet are exactly flat. The legs come forward under the body at hip width
// (the grounded stance, so touchdown does not scissor them in) and the arms reach forward and out with the elbows bent for balance.
const flare: AuthoredClip = { name: 'flare', duration: 1, loop: false, source: 'authored-table', keys: mirrorKeys({
  upperarm_r: [[0, .6, .1, .38]], forearm_r: [[0, .75, 0, 0]],
  hand_r: [[0, .1, 0, .1]], thigh_r: [[0, .3, 0, 0]], shin_r: [[0, -.35, 0, 0]], foot_r: [[0, 0, 0, 0]], toe_r: [[0, 0, 0, 0]],
}) };
export const ACCENTS = {
  bankLeft: compileClip(bankLeft), bankRight: compileClip(mirrorClip(bankLeft, 'bankRight')), climb: compileClip(climb),
  dive: compileClip(dive), sink: compileClip(sink), launch: compileClip(launch), reach: compileClip(reach), flare: compileClip(flare),
} as const;
