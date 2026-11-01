'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  CircleGeometry,
  DoubleSide,
  Group,
  LinearFilter,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  RepeatWrapping,
  RingGeometry,
  SRGBColorSpace,
  Texture,
  TextureLoader,
} from 'three';
import { gowRuntime } from '@/game/gowTypes';
import { presentation as pose } from '@/game/presentation';
import { runtime } from '@/game/runtime';
import { useGame } from '@/game/store';

function configureAtlas(tex: Texture) {
  tex.colorSpace = SRGBColorSpace;
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  tex.minFilter = LinearFilter;
  tex.magFilter = LinearFilter;
  tex.repeat.set(0.5, 1);
  tex.needsUpdate = true;
  return tex;
}

export default function GowWarrior() {
  const walkPhase = useRef(0);

  const bundle = useMemo(() => {
    const wrapper = new Group();
    const quadGeo = new PlaneGeometry(4.3, 4.3);
    const shadowGeo = new CircleGeometry(0.95, 24);
    const hoverRingGeo = new RingGeometry(0.85, 1.12, 28);

    const groundTex = configureAtlas(new Texture());
    const aerialTex = configureAtlas(new Texture());
    if (typeof window !== 'undefined') {
      const loader = new TextureLoader();
      loader.load('/sprites/uriel-ground.png', (t) => {
        groundTex.image = t.image;
        configureAtlas(groundTex);
      });
      loader.load('/sprites/uriel-aerial.png', (t) => {
        aerialTex.image = t.image;
        configureAtlas(aerialTex);
      });
    }

    const spriteMat = new MeshBasicMaterial({
      map: groundTex,
      transparent: true,
      alphaTest: 0.08,
      side: DoubleSide,
      color: '#ffffff',
    });
    const sprite = new Mesh(quadGeo, spriteMat);
    sprite.position.set(0, 0.92, 0);
    sprite.rotation.set(-0.52, 0, 0);
    wrapper.add(sprite);

    const shadowMat = new MeshBasicMaterial({
      color: '#09070d',
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
    });
    const shadow = new Mesh(shadowGeo, shadowMat);
    shadow.rotation.x = -Math.PI * 0.5;
    shadow.position.set(0, -1.01, 0);
    wrapper.add(shadow);

    const hoverRingMat = new MeshBasicMaterial({
      color: '#ffd166',
      transparent: true,
      opacity: 0,
      side: DoubleSide,
      depthWrite: false,
    });
    const hoverRing = new Mesh(hoverRingGeo, hoverRingMat);
    hoverRing.rotation.x = -Math.PI * 0.5;
    hoverRing.position.set(0, -1.0, 0);
    wrapper.add(hoverRing);

    return {
      wrapper,
      sprite,
      spriteMat,
      groundTex,
      aerialTex,
      shadow,
      shadowMat,
      hoverRing,
      hoverRingMat,
      dispose() {
        quadGeo.dispose();
        shadowGeo.dispose();
        hoverRingGeo.dispose();
        spriteMat.dispose();
        shadowMat.dispose();
        hoverRingMat.dispose();
        groundTex.dispose();
        aerialTex.dispose();
      },
    };
  }, []);

  useEffect(() => {
    gowRuntime.heroReady = true;
    return () => {
      gowRuntime.heroReady = false;
      bundle.dispose();
    };
  }, [bundle]);

  useFrame((_three, rawDt) => {
    const state = useGame.getState();
    const dt = state.paused || gowRuntime.hitstopTimer > 0 ? 0 : Math.min(0.1, Math.max(0, rawDt));
    const v = runtime.velocity;
    const horizSpeed = Math.hypot(v.x, v.z);

    bundle.wrapper.visible = state.camera === 'third' && state.shooter;
    bundle.wrapper.position.copy(pose.position);
    bundle.wrapper.rotation.set(0, 0, 0);

    const act = gowRuntime.action;
    const isAerial = state.flying || act === 'swoop' || act === 'sky_beam';
    const activeTex = isAerial ? bundle.aerialTex : bundle.groundTex;
    if (bundle.spriteMat.map !== activeTex) {
      bundle.spriteMat.map = activeTex;
      bundle.spriteMat.needsUpdate = true;
    }

    const isStrike =
      act !== 'idle' && act !== 'parry' && act !== 'hurt' &&
      (act === 'swoop' || act === 'sky_beam' || act === 'dodge' || gowRuntime.actionTimer < gowRuntime.actionDuration * 0.85);
    const frame = isStrike ? 1 : 0;
    const flip = gowRuntime.facingLeft;
    activeTex.repeat.set(flip ? -0.5 : 0.5, 1);
    activeTex.offset.set(frame * 0.5 + (flip ? 0.5 : 0), 0);

    walkPhase.current += dt * (horizSpeed > 0.3 ? horizSpeed * 1.9 : 2.2);
    const bob = state.reduced
      ? 0
      : isAerial
        ? Math.sin(walkPhase.current * 1.5) * 0.14
        : horizSpeed > 0.3
          ? Math.abs(Math.sin(walkPhase.current)) * 0.12
          : Math.sin(walkPhase.current * 0.8) * 0.03;

    const tiltZ = state.reduced
      ? 0
      : isStrike
        ? (flip ? 0.14 : -0.14)
        : Math.max(-0.12, Math.min(0.12, -v.x * 0.012));
    bundle.sprite.position.set(0, 0.95 + bob, 0);
    bundle.sprite.rotation.set(-0.52, 0, tiltZ);

    const scalePulse = isStrike && !state.reduced ? 1.08 : 1.0;
    bundle.sprite.scale.setScalar(scalePulse);

    if (act === 'hurt') bundle.spriteMat.color.set('#ff9b85');
    else if (gowRuntime.rageActive > 0) bundle.spriteMat.color.set('#fff2bd');
    else bundle.spriteMat.color.set('#ffffff');

    const groundLocalY = 20.05 - pose.position.y;
    bundle.shadow.position.set(0, groundLocalY, 0);
    bundle.shadowMat.opacity = isAerial ? 0.28 : 0.44;
    bundle.shadow.scale.setScalar(isAerial ? 1.25 : 1.0);

    bundle.hoverRing.position.set(0, groundLocalY + 0.01, 0);
    bundle.hoverRing.visible = isAerial;
    if (isAerial) {
      bundle.hoverRingMat.opacity = 0.78;
      bundle.hoverRing.rotation.z += dt * 2.2;
    }
  }, -19);

  return <primitive object={bundle.wrapper} dispose={null} />;
}
