import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { presentation as pose } from '@/game/presentation';
import { runtime } from '@/game/runtime';
import { useGame } from '@/game/store';
import { buildSuitRig } from './suitRig';
import { advanceSuitMotion, applySuitPose, orientSuit } from './suitPose';
import { advanceSuitAnimation, applySuitAnimation, createSuitAnimation } from './suitAnimation';
export const SUIT_URL = '/models/suit.glb';
export default function Suit() {
  const motion = useRef({ hero: 1, epoch: -1 }), animation = useRef(createSuitAnimation());
  const asset = useLoader(GLTFLoader, SUIT_URL);
  const rig = useMemo(() => buildSuitRig(asset.scene), [asset]);
  useEffect(() => () => rig.dispose(), [rig]);
  useFrame((_, dt) => {
    const state = useGame.getState(), m = motion.current, life = animation.current;
    if (m.epoch !== pose.epoch) Object.assign(m, { epoch: pose.epoch, hero: state.heroPoses ? 1 : 0 });
    if (!state.paused) {
      advanceSuitMotion(m, state.heroPoses, dt);
      advanceSuitAnimation(life, pose, { flying: state.flying, landing: state.landing, velocity: runtime.velocity }, dt);
    }
    rig.root.visible = state.camera === 'third';
    rig.root.position.copy(pose.position);
    orientSuit(rig.root, pose, m);
    applySuitPose(rig.joints, pose, m, state.reduced);
    // Visual only: the lift lowers or bobs the model, never the anchor the camera and physics share.
    rig.root.position.y += applySuitAnimation(rig.joints, life, pose, state.reduced);
  }, -20);
  return <primitive object={rig.root} dispose={null} />;
}
