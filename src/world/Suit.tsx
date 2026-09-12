import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { presentation as pose } from '@/game/presentation';
import { useGame } from '@/game/store';
import { buildSuitRig } from './suitRig';
import { advanceSuitMotion, applySuitPose } from './suitPose';
import { runtime } from '@/game/runtime';
export default function Suit() {
  const motion = useRef({ climb: 0, hero: 1, epoch: -1 });
  const asset = useLoader(GLTFLoader, '/models/suit.glb');
  const rig = useMemo(() => buildSuitRig(asset.scene), [asset]);
  useEffect(() => () => rig.dispose(), [rig]);
  useFrame((_, dt) => {
    const state = useGame.getState(), m = motion.current;
    if (m.epoch !== pose.epoch) Object.assign(m, { epoch: pose.epoch, climb: 0, hero: state.heroPoses ? 1 : 0 });
    if (!state.paused) advanceSuitMotion(m, runtime.speed > 2 ? Math.atan2(runtime.velocity.y, Math.hypot(runtime.velocity.x, runtime.velocity.z)) : 0, state.heroPoses, dt);
    rig.root.visible = state.camera === 'third';
    rig.root.position.copy(pose.position);
    const climb = m.climb * Math.min(1, pose.speed / 13) * m.hero * (state.reduced ? .25 : .65);
    rig.root.rotation.set(pose.lean + climb, pose.yaw, pose.bank * (1 + m.hero * .7), 'YXZ');
    applySuitPose(rig.joints, pose, m, state.reduced);
  }, -20);
  return <primitive object={rig.root} dispose={null} />;
}
