import { Suspense, useEffect, useMemo, useRef } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { type PerspectiveCamera } from 'three';
import { GOW_URL, gowRuntime } from '@/game/gowTypes';
import { presentation as pose } from '@/game/presentation';
import { runtime } from '@/game/runtime';
import { useGame } from '@/game/store';
import Boundary from '@/ui/Boundary';
import GowWarrior from './GowWarrior';
import { buildSuitRig } from './suitRig';
import { advanceSuitMotion, applySuitPose, orientSuit } from './suitPose';
import { advanceSuitAnimation, applySuitAnimation, createSuitAnimation } from './suitAnimation';
import { advanceFlightMix, createFlightMix } from './flightMix';
import { applyFlightClips } from './flightPose';
import { advanceSuitRoll, createSuitRoll, speedFade } from './suitRoll';
import { createBlasterFrame, releaseSuitBlaster, stepSuitBlaster } from './suitBlaster';
import { alignArchangelWings, createArchangelWings, stepArchangelWings } from './archangelWings';
import { angelRegalia } from './angelRegalia';
export const SUIT_URL = '/models/angel.glb';
/** Reload scene: forget every model the world loads, so a failed download is fetched again instead of replaying the cached error.
 * One call per file: useLoader.clear with an array clears only the cache entry for that whole array, which nothing loads. */
export function clearWorldCache() {
  useLoader.clear(GLTFLoader, SUIT_URL);
  useLoader.clear(GLTFLoader, GOW_URL);
}
const input = { flying: false, landing: false, paused: true, reduced: false, velocity: runtime.velocity, turn: runtime.turn };
export default function Suit() {
  const motion = useRef({ hero: 1, epoch: -1 }), animation = useRef(createSuitAnimation()), flight = useRef(createFlightMix()), turn = useRef(createSuitRoll());
  const asset = useLoader(GLTFLoader, SUIT_URL);
  const rig = useMemo(() => buildSuitRig(asset.scene), [asset]);
  const wings = useMemo(() => {
    const w = createArchangelWings();
    (rig.joints[11] ?? rig.root).add(w.root);
    return w;
  }, [rig]);
  const regalia = useMemo(() => angelRegalia(rig.root, rig.joints), [rig]);
  // The blaster block's per-frame inputs (suitBlaster.ts), rewritten in place each frame.
  const blaster = useMemo(() => createBlasterFrame(rig, runtime.shooter), [rig]);
  useEffect(() => () => { wings.root.removeFromParent(); wings.dispose(); regalia.dispose(); releaseSuitBlaster(blaster); rig.dispose(); }, [rig, blaster, wings, regalia]);
  useFrame((three, dt) => {
    const state = useGame.getState(), m = motion.current, life = animation.current, mix = flight.current;
    if (m.epoch !== pose.epoch) Object.assign(m, { epoch: pose.epoch, hero: state.heroPoses ? 1 : 0 });
    if (!state.paused) advanceSuitMotion(m, state.heroPoses, dt);
    input.flying = state.flying; input.landing = state.landing; input.paused = state.paused; input.reduced = state.reduced;
    advanceSuitAnimation(life, pose, input, dt);
    advanceFlightMix(mix, pose, input, dt);
    // Visual only: the roll banks the model into the curve of the travel; the camera, physics and presentation pose never read it.
    const roll = advanceSuitRoll(turn.current, pose, input, m.hero, mix.flare, dt), v = input.velocity;
    rig.root.visible = state.camera === 'third' && (!state.shooter || !gowRuntime.heroReady);
    rig.root.position.copy(pose.position);
    orientSuit(rig.root, pose, m, roll, speedFade(Math.sqrt(v.x * v.x + v.z * v.z)), pose.spin);
    applySuitPose(rig.joints, pose, m, state.reduced);
    // In flight the authored clips blend over the pose targets (and write the added bones); the living layer then adds its motion.
    const authored = applyFlightClips(rig.joints, mix, pose, life, m.hero, state.reduced);
    // Visual only: the lift lowers or bobs the model, never the anchor the camera and physics share.
    rig.root.position.y += applySuitAnimation(rig.joints, life, pose, state.reduced, m.hero, authored);
    regalia.step(dt, state.paused || state.reduced, v.x, v.y, v.z);
    stepArchangelWings(wings, state.flying, state.paused, state.reduced, pose.speed, v.y, roll, dt, pose.brake);
    alignArchangelWings(wings, rig.root, pose.lean);
    // The blaster (arm cannon, carry and aim, whole-body shot choreography, hand hide) layers over everything, in one guarded block.
    const f = blaster, cam = three.camera as PerspectiveCamera;
    f.on = false; f.third = state.camera === 'third'; f.paused = state.paused; f.reduced = state.reduced; f.epoch = pose.epoch;
    f.flight = pose.flight; f.speed = pose.speed; f.ground = life.ground; f.fov = cam.fov ?? 65; f.height = three.size.height;
    f.camera.x = cam.position.x; f.camera.y = cam.position.y; f.camera.z = cam.position.z;
    stepSuitBlaster(f, dt);
    pose.suitClip = mix.label; pose.suitRoll = roll;
  }, -20);
  return <>
    <primitive object={rig.root} dispose={null} />
    <Boundary fallback={null} onError={() => {}}><Suspense fallback={null}><GowWarrior /></Suspense></Boundary>
  </>;
}
