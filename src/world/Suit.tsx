import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { presentation as pose } from '@/game/presentation';
import { runtime } from '@/game/runtime';
import { useGame } from '@/game/store';
import { buildSuitRig } from './suitRig';
import { advanceSuitMotion, applySuitPose, orientSuit } from './suitPose';
import { advanceSuitAnimation, applySuitAnimation, createSuitAnimation } from './suitAnimation';
import { advanceFlightMix, createFlightMix } from './flightMix';
import { applyFlightClips } from './flightPose';
import { advanceSuitRoll, createSuitRoll, speedFade } from './suitRoll';
export const SUIT_URL = '/models/suit.glb';
const input = { flying: false, landing: false, paused: true, reduced: false, velocity: runtime.velocity, turn: runtime.turn };
export default function Suit() {
  const motion = useRef({ hero: 1, epoch: -1 }), animation = useRef(createSuitAnimation()), flight = useRef(createFlightMix()), turn = useRef(createSuitRoll());
  const asset = useLoader(GLTFLoader, SUIT_URL);
  const rig = useMemo(() => buildSuitRig(asset.scene), [asset]);
  useEffect(() => () => rig.dispose(), [rig]);
  useFrame((_, dt) => {
    const state = useGame.getState(), m = motion.current, life = animation.current, mix = flight.current;
    if (m.epoch !== pose.epoch) Object.assign(m, { epoch: pose.epoch, hero: state.heroPoses ? 1 : 0 });
    if (!state.paused) advanceSuitMotion(m, state.heroPoses, dt);
    input.flying = state.flying; input.landing = state.landing; input.paused = state.paused; input.reduced = state.reduced;
    advanceSuitAnimation(life, pose, input, dt);
    advanceFlightMix(mix, pose, input, dt);
    // Visual only: the roll banks the model into the curve of the travel; the camera, physics and presentation pose never read it.
    const roll = advanceSuitRoll(turn.current, pose, input, m.hero, mix.flare, dt), v = input.velocity;
    rig.root.visible = state.camera === 'third';
    rig.root.position.copy(pose.position);
    orientSuit(rig.root, pose, m, roll, speedFade(Math.sqrt(v.x * v.x + v.z * v.z)));
    applySuitPose(rig.joints, pose, m, state.reduced);
    // In flight the authored clips blend over the pose targets (and write the added bones); the living layer then adds its motion.
    const authored = applyFlightClips(rig.joints, mix, pose, life, m.hero, state.reduced);
    // Visual only: the lift lowers or bobs the model, never the anchor the camera and physics share.
    rig.root.position.y += applySuitAnimation(rig.joints, life, pose, state.reduced, m.hero, authored);
    pose.suitClip = mix.label; pose.suitRoll = roll;
  }, -20);
  return <primitive object={rig.root} dispose={null} />;
}
