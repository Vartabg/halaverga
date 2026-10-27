import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import { useRapier } from '@react-three/rapier';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { type PerspectiveCamera } from 'three';
import { presentation as pose } from '@/game/presentation';
import { runtime } from '@/game/runtime';
import { useGame } from '@/game/store';
import { buildSuitRig } from './suitRig';
import { advanceSuitMotion, applySuitPose, orientSuit } from './suitPose';
import { advanceSuitAnimation, applySuitAnimation, createSuitAnimation } from './suitAnimation';
import { advanceFlightMix, createFlightMix } from './flightMix';
import { applyFlightClips } from './flightPose';
import { advanceSuitRoll, createSuitRoll, speedFade } from './suitRoll';
import { createBlasterFrame, releaseSuitBlaster, stepSuitBlaster } from './suitBlaster';
import { alignArchangelWings, createArchangelWings, stepArchangelWings } from './archangelWings';
import { angelRegalia } from './angelRegalia';
import { createWingClearance } from './wingClearance';
import { bindAngelClips } from './angelClips';
import { createAngelMotion, stepAngelMotion } from './angelMotion';
import { strike } from '@/game/strike';
import { cannonLink } from './cannonContract';
import { beginSuitSprings, createSuitSprings, followBody, followWings, stepClothSway } from './suitSprings';

export const SUIT_URL = '/models/angel.glb';
export const ADVERSARY_URL = '/models/abyssal.glb';
/** Reload scene: forget every model the world loads, so a failed download is fetched again instead of replaying the cached error.
 * One call per file: useLoader.clear with an array clears only the cache entry for that whole array, which nothing loads. */
export function clearWorldCache() {
  useLoader.clear(GLTFLoader, SUIT_URL);
  useLoader.clear(GLTFLoader, ADVERSARY_URL);
}
const input = { flying: false, landing: false, paused: true, reduced: false, velocity: runtime.velocity, turn: runtime.turn };
const moveInput = { dt: 0, paused: true, flying: false, ground: 1, speed: 0, sword: false };

export default function Suit() {
  const { world, rapier } = useRapier();
  const motion = useRef({ hero: 1, epoch: -1 }), animation = useRef(createSuitAnimation()), flight = useRef(createFlightMix()), turn = useRef(createSuitRoll());
  const asset = useLoader(GLTFLoader, SUIT_URL);
  const rig = useMemo(() => buildSuitRig(asset.scene), [asset]);
  const clips = useMemo(() => bindAngelClips(asset.animations), [asset]), moves = useRef(createAngelMotion());
  const wings = useMemo(() => {
    const w = createArchangelWings();
    (rig.joints[11] ?? rig.root).add(w.root);
    return w;
  }, [rig]);
  const clearance = useMemo(() => createWingClearance(wings, world, rapier), [wings, world, rapier]);
  const springs = useMemo(() => createSuitSprings(rig.root, rig.joints, wings), [rig, wings]);
  const regalia = useMemo(() => angelRegalia(rig.root, rig.joints, springs.cloth.at, springs.hair.at), [rig, springs]);
  const frame = useMemo(() => ({ dt: 0, paused: true, reduced: false, epoch: 0, ground: 1, command: 0 }), []);
  const blaster = useMemo(() => createBlasterFrame(rig, runtime.shooter), [rig]);
  useEffect(() => () => { wings.root.removeFromParent(); wings.dispose(); regalia.dispose(); releaseSuitBlaster(blaster); rig.dispose(); }, [rig, blaster, wings, regalia]);
  useFrame((three, dt) => {
    const state = useGame.getState(), m = motion.current, life = animation.current, mix = flight.current;
    if (m.epoch !== pose.epoch) Object.assign(m, { epoch: pose.epoch, hero: state.heroPoses ? 1 : 0 });
    if (!state.paused) advanceSuitMotion(m, state.heroPoses, dt);
    beginSuitSprings(springs);
    input.flying = state.flying; input.landing = state.landing; input.paused = state.paused; input.reduced = state.reduced;
    advanceSuitAnimation(life, pose, input, dt);
    advanceFlightMix(mix, pose, input, dt);
    // Visual only: the roll banks the model into the curve of the travel; the camera, physics and presentation pose never read it.
    const roll = advanceSuitRoll(turn.current, pose, input, m.hero, mix.flare, dt), v = input.velocity;
    rig.root.visible = state.camera === 'third';
    rig.root.position.copy(pose.position);
    orientSuit(rig.root, pose, m, roll, speedFade(Math.sqrt(v.x * v.x + v.z * v.z)), pose.spin);
    applySuitPose(rig.joints, pose, m, state.reduced);
    // In flight the authored clips blend over the pose targets (and write the added bones); the living layer then adds its motion.
    const authored = applyFlightClips(rig.joints, mix, pose, life, m.hero, state.reduced);
    // Visual only: the lift lowers or bobs the model, never the anchor the camera and physics share.
    rig.root.position.y += applySuitAnimation(rig.joints, life, pose, state.reduced, m.hero, authored);
    regalia.step(dt, state.paused || state.reduced || !state.flying);
    // The blaster (arm cannon, carry and aim, whole-body shot choreography, hand hide) layers over everything, in one guarded block.
    const f = blaster, cam = three.camera as PerspectiveCamera;
    f.on = state.shooter; f.third = state.camera === 'third'; f.paused = state.paused; f.reduced = state.reduced; f.epoch = pose.epoch;
    f.flight = pose.flight; f.speed = pose.speed; f.ground = life.ground; f.fov = cam.fov ?? 65; f.height = three.size.height;
    f.camera.x = cam.position.x; f.camera.y = cam.position.y; f.camera.z = cam.position.z;
    stepSuitBlaster(f, dt);
    // Library clips (idle, the sword cut, the command gestures) over everything above; the springs below follow them through.
    Object.assign(moveInput, { dt, paused: state.paused, flying: state.flying, ground: life.ground, speed: Math.hypot(v.x, v.z), sword: cannonLink.forearm !== null });
    stepAngelMotion(moves.current, clips, rig.joints, moveInput);
    // Spring follow-through, last over the body (suitSprings.ts): the pose above is the target each bone chases.
    Object.assign(frame, { dt, paused: state.paused, reduced: state.reduced, epoch: pose.epoch, ground: life.ground, command: runtime.shooter.aim.fireHold });
    followBody(springs, frame); stepClothSway(springs, rig.root, v, dt, state.paused, state.reduced);
    stepArchangelWings(wings, state.flying, state.paused, state.reduced, pose.speed, v.y, roll, dt, pose.brake, strike.phase === 1);
    alignArchangelWings(wings, rig.root, pose.lean);
    clearance.step(v, dt, state.paused, state.reduced);
    followWings(springs, wings, frame);
    pose.wingTuck.left = wings.tuck.left; pose.wingTuck.right = wings.tuck.right;
    pose.suitClip = mix.label; pose.suitRoll = roll;
  }, -20);
  return <primitive object={rig.root} dispose={null} />;
}
