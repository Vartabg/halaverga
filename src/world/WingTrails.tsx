'use client';
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { AdditiveBlending, BufferAttribute, BufferGeometry, DoubleSide, DynamicDrawUsage, Euler, Mesh, MeshBasicMaterial, Quaternion, Vector3 } from 'three';
import { presentation as pose } from '@/game/presentation';
import { useGame } from '@/game/store';
import { createTrail, pushTrail, resetTrail, writeTrail, type TrailBuffer } from './HeroTrail';
import { windState } from './windData';

const MIN_TRAIL_SPEED = 6.5;
const BASE_RGB = [1.0, 0.906, 0.71] as const;
const BOOST_RGB = [1.0, 0.96, 0.82] as const;
const qBody = new Quaternion(), euler = new Euler(0, 0, 0, 'YXZ'), tipL = new Vector3(), tipR = new Vector3();

function makeRibbonMesh(buffer: TrailBuffer) {
  const geometry = new BufferGeometry();
  const pos = new BufferAttribute(buffer.pos, 3), col = new BufferAttribute(buffer.col, 4);
  pos.setUsage(DynamicDrawUsage); col.setUsage(DynamicDrawUsage);
  geometry.setAttribute('position', pos); geometry.setAttribute('color', col);
  geometry.setIndex(new BufferAttribute(buffer.index, 1)); geometry.setDrawRange(0, 0);
  const material = new MeshBasicMaterial({
    vertexColors: true, transparent: true, depthWrite: false, side: DoubleSide,
    blending: AdditiveBlending, toneMapped: false,
  });
  material.forceSinglePass = true;
  const mesh = new Mesh(geometry, material);
  mesh.frustumCulled = false; mesh.visible = false; mesh.renderOrder = 3;
  return { mesh, geometry, material };
}

function tintTrail(b: TrailBuffer, speed: number, roll: number, boosted: boolean) {
  const rgb = boosted ? BOOST_RGB : BASE_RGB;
  const speedGain = Math.min(1, Math.max(0, (speed - MIN_TRAIL_SPEED) / 16));
  const bankGain = 1 + 0.3 * Math.min(1, Math.abs(roll));
  const gain = Math.min(0.36, speedGain * bankGain * (boosted ? 0.52 : 0.28));
  for (let s = 0; s < b.count; s++) {
    const p0 = s * 6, p1 = p0 + 3;
    const mx = 0.5 * (b.pos[p0] + b.pos[p1]), my = 0.5 * (b.pos[p0 + 1] + b.pos[p1 + 1]), mz = 0.5 * (b.pos[p0 + 2] + b.pos[p1 + 2]);
    const w = 0.34;
    b.pos[p0] = mx + (b.pos[p0] - mx) * w; b.pos[p0 + 1] = my + (b.pos[p0 + 1] - my) * w; b.pos[p0 + 2] = mz + (b.pos[p0 + 2] - mz) * w;
    b.pos[p1] = mx + (b.pos[p1] - mx) * w; b.pos[p1 + 1] = my + (b.pos[p1 + 1] - my) * w; b.pos[p1 + 2] = mz + (b.pos[p1 + 2] - mz) * w;
    for (const v of [s * 2, s * 2 + 1]) {
      const q = v * 4;
      b.col[q] = rgb[0]; b.col[q + 1] = rgb[1]; b.col[q + 2] = rgb[2];
      b.col[q + 3] = Math.min(0.38, b.col[q + 3] * gain);
    }
  }
}

/** Dual wingtip condensation and dawn-light ribbons for pure exploratory flight. */
export default function WingTrails() {
  const lastEpoch = useRef(-1), wasFlying = useRef(false);
  const { left, right } = useMemo(() => {
    const bL = createTrail(), bR = createTrail();
    return { left: { buffer: bL, ...makeRibbonMesh(bL) }, right: { buffer: bR, ...makeRibbonMesh(bR) } };
  }, []);
  useEffect(() => () => {
    left.geometry.dispose(); left.material.dispose();
    right.geometry.dispose(); right.material.dispose();
  }, [left, right]);

  useFrame(st => {
    const state = useGame.getState(), t = st.clock.elapsedTime;
    const reset = state.reduced || state.camera !== 'third' || pose.epoch !== lastEpoch.current || (!state.flying && wasFlying.current);
    lastEpoch.current = pose.epoch;
    wasFlying.current = state.flying;
    if (reset) {
      resetTrail(left.buffer); resetTrail(right.buffer);
      left.mesh.visible = right.mesh.visible = false;
      return;
    }
    if (!state.paused && state.flying && pose.speed > MIN_TRAIL_SPEED) {
      euler.set(pose.pitch * 0.35, pose.yaw, pose.suitRoll, 'YXZ');
      qBody.setFromEuler(euler);
      const span = 1.32, yOff = 0.22, zOff = 0.14;
      tipL.set(-span, yOff, zOff).applyQuaternion(qBody).add(pose.position);
      tipR.set(span, yOff, zOff).applyQuaternion(qBody).add(pose.position);
      pushTrail(left.buffer, tipL.x, tipL.y, tipL.z, t);
      pushTrail(right.buffer, tipR.x, tipR.y, tipR.z, t);
    }
    const boosted = windState.boostTimer > 0;
    for (const side of [left, right]) {
      const draw = writeTrail(side.buffer, t, st.camera.position, state.reduced);
      side.mesh.visible = draw > 0;
      if (!draw) continue;
      tintTrail(side.buffer, pose.speed, pose.suitRoll, boosted);
      side.geometry.setDrawRange(0, draw);
      side.geometry.attributes.position.needsUpdate = true;
      side.geometry.attributes.color.needsUpdate = true;
    }
  }, -8);

  return <>
    <primitive object={left.mesh} />
    <primitive object={right.mesh} />
  </>;
}
