'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import { AnimationAction, AnimationMixer, Group, LoopOnce, LoopRepeat } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import { ATTACK_SPECS, GOW_URL, gowRuntime, type GowClipName } from '@/game/gowTypes';
import { combatMotion } from '@/game/motion';
import { presentation as pose } from '@/game/presentation';
import { runtime } from '@/game/runtime';
import { useGame } from '@/game/store';
import { alignArchangelWings, createArchangelWings, stepArchangelWings } from './archangelWings';
import { decorateArchangelHero } from './gowMaterials';
import { advanceSuitMotion, orientSuit } from './suitPose';
import { speedFade } from './suitRoll';

const LOOP_CLIPS = new Set<GowClipName>([
  'Idle_Loop', 'Walk_Loop', 'Jog_Fwd_Loop', 'Sprint_Loop', 'Jump_Loop', 'Sword_Idle', 'Spell_Simple_Idle_Loop',
]);

export default function GowWarrior() {
  const asset = useLoader(GLTFLoader, GOW_URL);
  const motion = useRef({ hero: 1, epoch: -1 });
  const activeClip = useRef<GowClipName | ''>('');
  const lastActionSeq = useRef(-1);

  const bundle = useMemo(() => {
    const wrapper = new Group();
    const cloned = cloneSkeleton(asset.scene);
    cloned.position.set(0, -1.04, 0);
    cloned.rotation.set(0, Math.PI, 0);
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
      lastActionSeq.current = gowRuntime.actionSeq;
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
    const state = useGame.getState(), m = motion.current;
    if (m.epoch !== pose.epoch) Object.assign(m, { epoch: pose.epoch, hero: state.heroPoses ? 1 : 0 });
    const dt = Math.min(0.1, Math.max(0, rawDt));
    if (!state.paused) advanceSuitMotion(m, state.heroPoses, dt);

    const v = runtime.velocity;
    bundle.wrapper.visible = state.camera === 'third' && state.shooter;
    bundle.wrapper.position.copy(pose.position);
    orientSuit(bundle.wrapper, pose, m, pose.suitRoll, speedFade(Math.hypot(v.x, v.z)), pose.spin);

    let nextClip: GowClipName = 'Idle_Loop';
    let timeScale = 1.0;
    const act = gowRuntime.action;

    if (state.flying) {
      nextClip = 'Jump_Loop'; timeScale = 0.95;
    } else if (act !== 'idle') {
      if (act in ATTACK_SPECS) {
        const spec = ATTACK_SPECS[act as keyof typeof ATTACK_SPECS];
        nextClip = spec.clip; timeScale = spec.timeScale;
      } else if (act === 'parry') {
        nextClip = 'Sword_Idle'; timeScale = 1.65;
      } else if (act === 'dodge') {
        nextClip = 'Roll'; timeScale = 1.5;
      } else if (act === 'hurt') {
        nextClip = 'Hit_Chest'; timeScale = 1.3;
      }
    } else if (pose.speed > 5.2) {
      nextClip = 'Sprint_Loop'; timeScale = 1.15;
    } else if (pose.speed > 2.1) {
      nextClip = 'Jog_Fwd_Loop'; timeScale = 1.05;
    } else if (pose.speed > 0.32) {
      nextClip = 'Walk_Loop'; timeScale = 1.0;
    } else {
      nextClip = 'Sword_Idle'; timeScale = 1.0;
    }

    const seqChanged = act !== 'idle' && gowRuntime.actionSeq !== lastActionSeq.current;
    if (activeClip.current !== nextClip || seqChanged) {
      const prev = activeClip.current ? bundle.actions.get(activeClip.current) : undefined;
      const next = bundle.actions.get(nextClip);
      if (next) {
        next.reset();
        next.setEffectiveTimeScale(timeScale);
        next.setEffectiveWeight(1);
        next.play();
        if (prev && prev !== next) prev.crossFadeTo(next, state.reduced ? 0.04 : 0.10, false);
        activeClip.current = nextClip;
        lastActionSeq.current = gowRuntime.actionSeq;
      }
    } else {
      const curr = bundle.actions.get(nextClip);
      if (curr) curr.setEffectiveTimeScale(timeScale);
    }

    const mixerDt = state.paused || gowRuntime.hitstopTimer > 0 ? 0 : dt;
    bundle.mixer.update(mixerDt);

    // MB-1: Unconditionally reset procedural offsets before applying current action choreography
    bundle.cloned.position.set(0, -1.04, 0);
    bundle.cloned.rotation.set(0, Math.PI, 0);
    if (!state.reduced && !state.flying && act !== 'idle' && gowRuntime.actionDuration > 0) {
      const prog = Math.min(1, gowRuntime.actionTimer / gowRuntime.actionDuration);
      const arc = Math.sin(prog * Math.PI);
      if (act === 'light3') {
        bundle.cloned.rotation.y = Math.PI + prog * Math.PI * 2;
      } else if (act === 'light4' || act === 'rage_slam') {
        bundle.cloned.position.y = -1.04 + arc * 0.72;
        bundle.cloned.rotation.x = arc * 0.26;
      } else if (act === 'light1' || act === 'light2' || act === 'heavy' || act === 'counter') {
        bundle.cloned.rotation.z = (act === 'light2' || act === 'counter' ? -1 : 1) * arc * 0.16;
        bundle.cloned.rotation.x = arc * 0.18;
      }
    }

    const longVault = combatMotion.timer > 0 && Math.hypot(combatMotion.vx, combatMotion.vz) > 10.5;
    const unfurlWings = state.flying || gowRuntime.rageActive > 0 || longVault || act === 'light4' || act === 'rage_slam' || act === 'execute';
    const striking = act === 'light3' || act === 'light4' || act === 'heavy' || act === 'rage_slam' || act === 'counter';

    stepArchangelWings(bundle.wings, unfurlWings, state.paused, state.reduced, pose.speed, v.y, pose.suitRoll, dt, pose.brake, striking);
    alignArchangelWings(bundle.wings, bundle.wrapper, pose.lean);

    const rageBoost = gowRuntime.rageActive > 0 ? 1.45 : act !== 'idle' ? 0.95 : 0.45;
    for (const mat of bundle.handle.flashMaterials) mat.emissiveIntensity = rageBoost;
  }, -19);

  return <primitive object={bundle.wrapper} dispose={null} />;
}
