import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshStandardMaterial, SkinnedMesh, type PerspectiveCamera } from 'three';
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
import { createArchangelWings, stepArchangelWings } from './archangelWings';
import { TREE_URL } from './Reclamation';
export const SUIT_URL = '/models/suit.glb';
/** Reload scene: forget every model the world loads, so a failed download is fetched again instead of replaying the cached error.
 * One call per file: useLoader.clear with an array clears only the cache entry for that whole array, which nothing loads. */
export function clearWorldCache() {
  for (const url of [SUIT_URL, TREE_URL]) useLoader.clear(GLTFLoader, url);
}
const input = { flying: false, landing: false, paused: true, reduced: false, velocity: runtime.velocity, turn: runtime.turn };
export default function Suit() {
  const motion = useRef({ hero: 1, epoch: -1 }), animation = useRef(createSuitAnimation()), flight = useRef(createFlightMix()), turn = useRef(createSuitRoll());
  const asset = useLoader(GLTFLoader, SUIT_URL);
  const rig = useMemo(() => {
    const r = buildSuitRig(asset.scene);
    r.root.traverse(o => {
      if (!(o instanceof SkinnedMesh) || !(o.material instanceof MeshStandardMaterial)) return;
      const m = o.material;
      if (m.name === 'skin') { m.color.set('#edd6ba'); m.emissive.set('#2b180e'); m.roughness = .42; }
      else if (m.name === 'textile') { m.color.set('#261e3a'); m.emissive.set('#120c21'); m.metalness = .25; m.roughness = .58; }
      else if (m.name === 'glow') { m.color.set('#ffe28a'); m.emissive.set('#ff9b26'); m.emissiveIntensity = 1.9; }
      else { m.color.set('#f5d58e'); m.emissive.set('#4d2d0a'); m.metalness = .65; m.roughness = .26; }
      m.onBeforeCompile = shader => {
        shader.fragmentShader = shader.fragmentShader.replace('#include <dithering_fragment>', `
          float edgeInk = smoothstep(0.24, 0.56, length(fwidth(vNormal)));
          float fresnel = pow(1.0 - abs(dot(normalize(vNormal), normalize(vViewPosition))), 2.6);
          float rimStep = smoothstep(0.42, 0.68, fresnel);
          float lum = dot(gl_FragColor.rgb, vec3(0.299, 0.587, 0.114));
          float cel = mix(0.68, 1.15, floor(clamp(lum * 3.2, 0.0, 2.99)) / 2.0);
          vec3 celCol = mix(vec3(0.14, 0.10, 0.24), gl_FragColor.rgb * cel, smoothstep(0.06, 0.32, lum));
          celCol += vec3(0.99, 0.78, 0.36) * rimStep * 0.38;
          gl_FragColor.rgb = mix(celCol, vec3(0.05, 0.03, 0.09), edgeInk * 0.85);
          #include <dithering_fragment>`);
      };
      m.customProgramCacheKey = () => 'suit-hades-' + m.name;
    });
    return r;
  }, [asset]);
  const wings = useMemo(() => {
    const w = createArchangelWings();
    (rig.joints[2] ?? rig.root).add(w.root);
    return w;
  }, [rig]);
  // The blaster block's per-frame inputs (suitBlaster.ts), rewritten in place each frame.
  const blaster = useMemo(() => createBlasterFrame(rig, runtime.shooter), [rig]);
  useEffect(() => () => { wings.root.removeFromParent(); wings.dispose(); releaseSuitBlaster(blaster); rig.dispose(); }, [rig, blaster, wings]);
  useFrame((three, dt) => {
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
    orientSuit(rig.root, pose, m, roll, speedFade(Math.sqrt(v.x * v.x + v.z * v.z)), pose.spin);
    applySuitPose(rig.joints, pose, m, state.reduced);
    // In flight the authored clips blend over the pose targets (and write the added bones); the living layer then adds its motion.
    const authored = applyFlightClips(rig.joints, mix, pose, life, m.hero, state.reduced);
    // Visual only: the lift lowers or bobs the model, never the anchor the camera and physics share.
    rig.root.position.y += applySuitAnimation(rig.joints, life, pose, state.reduced, m.hero, authored);
    stepArchangelWings(wings, state.flying, state.paused, state.reduced, pose.speed, v.y, roll, dt);
    // The blaster (arm cannon, carry and aim, whole-body shot choreography, hand hide) layers over everything, in one guarded block.
    const f = blaster, cam = three.camera as PerspectiveCamera;
    f.on = state.shooter; f.third = state.camera === 'third'; f.paused = state.paused; f.reduced = state.reduced; f.epoch = pose.epoch;
    f.flight = pose.flight; f.speed = pose.speed; f.ground = life.ground; f.fov = cam.fov ?? 65; f.height = three.size.height;
    f.camera.x = cam.position.x; f.camera.y = cam.position.y; f.camera.z = cam.position.z;
    stepSuitBlaster(f, dt);
    pose.suitClip = mix.label; pose.suitRoll = roll;
  }, -20);
  return <primitive object={rig.root} dispose={null} />;
}
