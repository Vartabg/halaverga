import { compileClip, mirrorClip, mirrorKeys, type AuthoredClip } from './clipSampler';
/** Original authored accents, same conventions as flightClips.ts. Additive clips are offsets from rest; a single key is a held shape. */
const still = (name: string, keys: AuthoredClip['keys']): AuthoredClip => ({ name, duration: 1, loop: false, additive: true, source: 'authored-table', keys });
// Left turn is positive weight: the torso side-bends into the turn with the head a little counter-rolled; the outside leg kicks
// out and back and the inside leg follows. The arms stay close (the whole-body roll carries the turn): the outside arm draws in
// against the side-bend so it stays along the body, the inside arm bends at the elbow and stays back, clear of the thigh.
const bankLeft = still('bankLeft', {
  spine: [[0, 0, .02, .09]], chest: [[0, 0, .035, .11]], neck: [[0, 0, .08, -.06]], head: [[0, 0, .12, -.04]],
  clavicle_r: [[0, 0, 0, .06]], clavicle_l: [[0, 0, -.12, 0]], upperarm_l: [[0, -.1, -.3, -.2]], upperarm_r: [[0, -.05, 0, -.15]],
  forearm_l: [[0, .3, 0, 0]], hand_r: [[0, 0, 0, .1]], hand_l: [[0, .15, 0, 0]],
  thigh_l: [[0, .1, 0, .1]], thigh_r: [[0, -.16, 0, .35]], shin_l: [[0, -.25, 0, 0]], foot_r: [[0, -.08, 0, 0]], foot_l: [[0, .05, 0, 0]],
});
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
// (the grounded stance, so touchdown does not scissor them in) and the arms reach low and forward with the elbows bent for balance.
const flare: AuthoredClip = { name: 'flare', duration: 1, loop: false, source: 'authored-table', keys: mirrorKeys({
  upperarm_r: [[0, .55, .1, .03]], forearm_r: [[0, .7, 0, 0]],
  hand_r: [[0, .1, 0, .1]], thigh_r: [[0, .3, 0, 0]], shin_r: [[0, -.35, 0, 0]], foot_r: [[0, 0, 0, 0]], toe_r: [[0, 0, 0, 0]],
}) };
export const ACCENTS = {
  bankLeft: compileClip(bankLeft), bankRight: compileClip(mirrorClip(bankLeft, 'bankRight')),
  sink: compileClip(sink), launch: compileClip(launch), reach: compileClip(reach), flare: compileClip(flare),
} as const;
