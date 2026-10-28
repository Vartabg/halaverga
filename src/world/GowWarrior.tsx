'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import {
  AnimationAction,
  AnimationMixer,
  Group,
  LoopOnce,
  LoopRepeat,
} from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import {
  ATTACK_SPECS,
  GOW_URL,
  gowRuntime,
  type GowClipName,
} from '@/game/gowTypes';
import { presentation as pose } from '@/game/presentation';
import { runtime } from '@/game/runtime';
import { useGame } from '@/game/store';
import {
  alignArchangelWings,
  createArchangelWings,
  stepArchangelWings,
} from './archangelWings';
import { decorateArchangelHero } from './gowMaterials';
import { advanceSuitMotion, orientSuit } from './suitPose';
import { speedFade } from './suitRoll';

const LOOP_CLIPS = new Set<GowClipName>([
  'Idle_Loop',
  'Walk_Loop',
  'Jog_Fwd_Loop',
  'Sprint_Loop',
  'Jump_Loop',
  'Sword_Idle',
  'Spell_Simple_Idle_Loop',
]);

export default function GowWarrior() {
  const asset = useLoader(GLTFLoader, GOW_URL);
  const motion = useRef({ hero: 1, epoch: -1 });
  const activeClip = useRef<GowClipName | ''>('');

  const bundle = useMemo(() => {
    const wrapper = new Group();
    const cloned = cloneSkeleton(asset.scene);
    cloned.position.set(0, -1.04, 0);
    cloned.rotation.y = Math.PI;
    wrapper.add(cloned);

    const handle = decorateArchangelHero(cloned);
    const wings = createArchangelWings();
    wings.root.position.set(0, 0, 0);
    handle.backAnchor.add(wings.root);

    const mixer = new AnimationMixer(cloned);
    const actions = new Map<GowClipName, AnimationAction>();
    for (const clip of asset.animations) {
      const name = clip.name as GowClipName;
      const action = mixer.clipAction(clip);
      if (LOOP_CLIPS.has(name)) {
        action.setLoop(LoopRepeat, Infinity);
      } else {
        action.setLoop(LoopOnce, 1);
        action.clampWhenFinished = true;
      }
      actions.set(name, action);
    }

    return { wrapper, cloned, handle, wings, mixer, actions };
  }, [asset]);

  useEffect(() => {
    gowRuntime.heroReady = true;
    const idle = bundle.actions.get('Sword_Idle') ?? bundle.actions.get('Idle_Loop');
    if (idle) {
      idle.reset().play();
      activeClip.current = 'Sword_Idle';
    }
    return () => {
      gowRuntime.heroReady = false;
      bundle.mixer.stopAllAction();
      bundle.wings.root.removeFromParent();
      bundle.wings.dispose();
      bundle.handle.dispose();
    };
  }, [bundle]);

  useFrame((_three, rawDt) => {
    const state = useGame.getState();
    const m = motion.current;
    if (m.epoch !== pose.epoch) {
      Object.assign(m, { epoch: pose.epoch, hero: state.heroPoses ? 1 : 0 });
    }
    const dt = Math.min(0.1, Math.max(0, rawDt));
    if (!state.paused) advanceSuitMotion(m, state.heroPoses, dt);

    const v = runtime.velocity;
    bundle.wrapper.visible = state.camera === 'third' && state.shooter;
    bundle.wrapper.position.copy(pose.position);
    orientSuit(
      bundle.wrapper,
      pose,
      m,
      pose.suitRoll,
      speedFade(Math.hypot(v.x, v.z)),
      pose.spin,
    );

    let nextClip: GowClipName = 'Idle_Loop';
    let timeScale = 1.0;
    const act = gowRuntime.action;

    if (state.flying) {
      nextClip = 'Jump_Loop';
      timeScale = 0.95;
    } else if (act !== 'idle') {
      if (act in ATTACK_SPECS) {
        const spec = ATTACK_SPECS[act as keyof typeof ATTACK_SPECS];
        nextClip = spec.clip;
        timeScale = spec.timeScale;
      } else if (act === 'parry') {
        nextClip = 'Sword_Idle';
        timeScale = 1.65;
      } else if (act === 'dodge') {
        nextClip = 'Roll';
        timeScale = 1.48;
      } else if (act === 'hurt') {
        nextClip = 'Hit_Chest';
        timeScale = 1.3;
      }
    } else if (pose.speed > 5.2) {
      nextClip = 'Sprint_Loop';
      timeScale = 1.15;
    } else if (pose.speed > 2.1) {
      nextClip = 'Jog_Fwd_Loop';
      timeScale = 1.05;
    } else if (pose.speed > 0.32) {
      nextClip = 'Walk_Loop';
      timeScale = 1.0;
    } else {
      nextClip = 'Sword_Idle';
      timeScale = 1.0;
    }

    if (activeClip.current !== nextClip) {
      const prev = activeClip.current ? bundle.actions.get(activeClip.current) : undefined;
      const next = bundle.actions.get(nextClip);
      if (next) {
        next.reset();
        next.setEffectiveTimeScale(timeScale);
        next.setEffectiveWeight(1);
        next.play();
        if (prev && prev !== next) {
          prev.crossFadeTo(next, state.reduced ? 0.04 : 0.11, false);
        }
        activeClip.current = nextClip;
      }
    } else {
      const curr = bundle.actions.get(nextClip);
      if (curr) curr.setEffectiveTimeScale(timeScale);
    }

    const mixerDt = state.paused || gowRuntime.hitstopTimer > 0 ? 0 : dt;
    bundle.mixer.update(mixerDt);

    const unfurlWings =
      state.flying ||
      gowRuntime.rageActive > 0 ||
      act === 'rage_slam' ||
      act === 'execute';
    const striking = act === 'light3' || act === 'heavy' || act === 'rage_slam';

    stepArchangelWings(
      bundle.wings,
      unfurlWings,
      state.paused,
      state.reduced,
      pose.speed,
      v.y,
      pose.suitRoll,
      dt,
      pose.brake,
      striking,
    );
    alignArchangelWings(bundle.wings, bundle.wrapper, pose.lean);

    const rageBoost = gowRuntime.rageActive > 0 ? 1.35 : act !== 'idle' ? 0.85 : 0.45;
    for (const mat of bundle.handle.flashMaterials) {
      mat.emissiveIntensity = rageBoost;
    }
  }, -19);

  return <primitive object={bundle.wrapper} dispose={null} />;
}
