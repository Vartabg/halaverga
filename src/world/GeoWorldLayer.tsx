'use client';
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { AdditiveBlending, BoxGeometry, Color, ConeGeometry, CylinderGeometry, DoubleSide, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, RingGeometry, TorusGeometry } from 'three';
import { GEO_REGIONS, geoRuntime, stepGeoWorld } from '@/game/geoWorld';
import { gowRuntime } from '@/game/gowTypes';
import { presentation } from '@/game/presentation';
import { runtime } from '@/game/runtime';
import { useGame } from '@/game/store';

interface GateMeshSet {
  group: Group;
  torus: Mesh;
  torusMat: MeshBasicMaterial;
  halo: Mesh;
  haloMat: MeshBasicMaterial;
  pillar: Mesh;
  pillarMat: MeshBasicMaterial;
}

interface LandmarkGroupSet {
  group: Group;
  base: Mesh;
  crown: Mesh;
  spire: Mesh;
  mat: MeshStandardMaterial;
  crownMat: MeshStandardMaterial;
}

export default function GeoWorldLayer() {
  const rootRef = useRef<Group>(null);

  const built = useMemo(() => {
    const root = new Group();
    root.name = 'geo-world-layer';

    const torusGeo = new TorusGeometry(5.0, 0.24, 12, 48);
    const haloGeo = new RingGeometry(4.1, 4.75, 36);
    const pillarGeo = new CylinderGeometry(0.65, 1.45, 28, 12, 1, true);
    const boxGeo = new BoxGeometry(1, 1, 1);
    const spireGeo = new ConeGeometry(0.55, 1, 4);

    const gates: GateMeshSet[] = [];
    for (let i = 0; i < 6; i++) {
      const group = new Group();
      const torusMat = new MeshBasicMaterial({ color: '#ffd166', transparent: true, opacity: 0.92 });
      const haloMat = new MeshBasicMaterial({ color: '#ffd166', side: DoubleSide, transparent: true, opacity: 0.28, blending: AdditiveBlending, depthWrite: false });
      const pillarMat = new MeshBasicMaterial({ color: '#ffd166', side: DoubleSide, transparent: true, opacity: 0.035, blending: AdditiveBlending, depthWrite: false });
      const torus = new Mesh(torusGeo, torusMat);
      const halo = new Mesh(haloGeo, haloMat);
      const pillar = new Mesh(pillarGeo, pillarMat);
      pillar.position.y = -14;
      group.add(torus, halo, pillar);
      root.add(group);
      gates.push({ group, torus, torusMat, halo, haloMat, pillar, pillarMat });
    }

    const landmarks: LandmarkGroupSet[] = [];
    for (let i = 0; i < 6; i++) {
      const group = new Group();
      const mat = new MeshStandardMaterial({ color: '#6d675e', roughness: 0.68, metalness: 0.22 });
      const crownMat = new MeshStandardMaterial({ color: '#868076', roughness: 0.52, metalness: 0.34 });
      const base = new Mesh(boxGeo, mat);
      const crown = new Mesh(boxGeo, crownMat);
      const spire = new Mesh(spireGeo, crownMat);
      base.castShadow = true; base.receiveShadow = true;
      crown.castShadow = true; spire.castShadow = true;
      group.add(base, crown, spire);
      root.add(group);
      landmarks.push({ group, base, crown, spire, mat, crownMat });
    }

    const skimGeo = new RingGeometry(1.1, 1.85, 32);
    const skimMat = new MeshBasicMaterial({ color: '#5ee6d0', side: DoubleSide, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false });
    const skimRing = new Mesh(skimGeo, skimMat);
    skimRing.rotation.x = -Math.PI / 2;
    root.add(skimRing);

    return {
      root, gates, landmarks, skimRing, skimMat,
      dispose() {
        torusGeo.dispose(); haloGeo.dispose(); pillarGeo.dispose(); boxGeo.dispose(); spireGeo.dispose(); skimGeo.dispose(); skimMat.dispose();
        for (const g of gates) { g.torusMat.dispose(); g.haloMat.dispose(); g.pillarMat.dispose(); }
        for (const l of landmarks) { l.mat.dispose(); l.crownMat.dispose(); }
      },
    };
  }, []);

  useEffect(() => () => built.dispose(), [built]);

  useFrame((_, dt) => {
    const state = useGame.getState();
    const active = !gowRuntime.duelEngaged;
    built.root.visible = active;
    if (!active || state.paused) return;

    stepGeoWorld(runtime.position, runtime.velocity, state.flying, Math.min(dt, 0.05));
    const spec = GEO_REGIONS[geoRuntime.regionId];
    const isCity = geoRuntime.regionId === 'manhattan';
    const t = performance.now() * 0.001;

    for (let i = 0; i < built.gates.length; i++) {
      const gm = built.gates[i], gd = geoRuntime.gates[i];
      if (!gd) { gm.group.visible = false; continue; }
      gm.group.visible = true;
      gm.group.position.set(gd.x, gd.y, gd.z);
      const scale = gd.radius / 5.0;
      gm.torus.scale.setScalar(scale * (gd.passed ? 1.08 : 1 + Math.sin(t * 2.6 + i) * 0.03));
      gm.halo.rotation.z = t * (gd.passed ? 1.8 : 0.7) + i;
      const col = gd.passed ? '#5ee6d0' : spec.accent;
      gm.torusMat.color.set(col); gm.haloMat.color.set(col); gm.pillarMat.color.set(col);
      gm.haloMat.opacity = gd.passed ? 0.36 : 0.22 + Math.sin(t * 3 + i) * 0.05;
      gm.pillarMat.opacity = gd.passed ? 0.07 : 0.03;
    }

    for (let i = 0; i < built.landmarks.length; i++) {
      const lm = built.landmarks[i], ld = spec.landmarks[i];
      if (!ld) { lm.group.visible = false; continue; }
      lm.group.visible = true;
      lm.group.position.set(ld.x, 0, ld.z);
      lm.base.position.set(0, ld.y * 0.72, 0);
      lm.base.scale.set(ld.sx, ld.y * 1.44, ld.sz);
      lm.crown.position.set(0, ld.y * 1.55, 0);
      lm.crown.scale.set(ld.sx * 0.68, ld.y * 0.48, ld.sz * 0.68);
      lm.spire.position.set(0, ld.y * 1.95, 0);
      lm.spire.scale.set(isCity ? ld.sx * 0.22 : ld.sx * 0.58, ld.y * 0.38, isCity ? ld.sz * 0.22 : ld.sz * 0.58);
      lm.mat.color.set(ld.color);
      lm.crownMat.color.set(ld.color).offsetHSL(0, 0, isCity ? 0.08 : 0.12);
    }

    const showSkim = geoRuntime.skimActive || geoRuntime.thermalTimer > 0;
    built.skimRing.visible = showSkim;
    if (showSkim) {
      built.skimRing.position.set(presentation.position.x, presentation.position.y - 0.6, presentation.position.z);
      built.skimMat.color.copy(new Color(geoRuntime.thermalTimer > 0 ? '#5ee6d0' : spec.accent));
      built.skimMat.opacity = geoRuntime.thermalTimer > 0 ? 0.55 : 0.38;
      built.skimRing.scale.setScalar(1 + Math.sin(t * 10) * 0.12);
    }
  });

  return <primitive ref={rootRef} object={built.root} dispose={null} />;
}
