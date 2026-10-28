'use client';
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { AdditiveBlending, Color, Group, MeshBasicMaterial, TorusGeometry } from 'three';
import { advanceCamFx, punchFov } from '@/game/cameraFx';
import { runtime } from '@/game/runtime';
import { useGame } from '@/game/store';
import { THERMAL_RINGS, resetWindState, stepThermalRings } from './windData';

/** Dawn Thermal Rings guiding exploratory flight through the Cloven Gorge to the High Sanctuary. */
export default function WindCurrents() {
  const cooldowns = useMemo(() => new Float64Array(THERMAL_RINGS.length).fill(-Infinity), []);
  const pulses = useMemo(() => new Float32Array(THERMAL_RINGS.length), []);
  const ringGroups = useRef<(Group | null)[]>([]);

  const { outerGeo, innerGeo, outerMat, innerMat } = useMemo(() => {
    const outerGeo = new TorusGeometry(1, 0.018, 10, 56);
    const innerGeo = new TorusGeometry(0.78, 0.01, 8, 48);
    const outerMat = new MeshBasicMaterial({
      color: new Color('#ffd98a'), transparent: true, opacity: 0.24,
      blending: AdditiveBlending, depthWrite: false, toneMapped: false,
    });
    const innerMat = new MeshBasicMaterial({
      color: new Color('#fff2d0'), transparent: true, opacity: 0.14,
      blending: AdditiveBlending, depthWrite: false, toneMapped: false,
    });
    return { outerGeo, innerGeo, outerMat, innerMat };
  }, []);

  useEffect(() => {
    resetWindState(cooldowns);
    return () => {
      outerGeo.dispose(); innerGeo.dispose(); outerMat.dispose(); innerMat.dispose();
    };
  }, [cooldowns, outerGeo, innerGeo, outerMat, innerMat]);

  useFrame((st, dt) => {
    const state = useGame.getState(), t = st.clock.elapsedTime;
    if (!state.paused) {
      const hit = stepThermalRings(runtime.position, runtime.velocity, state.flying, state.landing || !!runtime.landGoal, state.paused, t, dt, cooldowns);
      if (hit >= 0) {
        pulses[hit] = 1.0;
        if (!state.reduced) punchFov(runtime.shooter.camFx, 'shot', 0.9);
      }
      if (!state.shooter) advanceCamFx(runtime.shooter.camFx, dt, state.reduced, t);
    }
    const step = state.paused || state.reduced ? 0 : Math.min(dt, 0.05);
    for (let i = 0; i < THERMAL_RINGS.length; i++) {
      const g = ringGroups.current[i];
      if (!g) continue;
      pulses[i] = Math.max(0, pulses[i] - step * 1.6);
      const baseR = THERMAL_RINGS[i].radius;
      const breath = state.reduced ? 1 : 1 + 0.04 * Math.sin(t * 1.8 + i * 1.1) + pulses[i] * 0.24;
      g.scale.setScalar(baseR * breath);
      if (step > 0) {
        g.children[0].rotation.z += step * 0.45;
        g.children[1].rotation.z -= step * 0.65;
      }
    }
  });

  return <group name="dawn-wind-currents">
    {THERMAL_RINGS.map((ring, i) => (
      <group key={ring.id} ref={el => { ringGroups.current[i] = el; }} position={ring.position} rotation={ring.tilt} scale={ring.radius}>
        <mesh geometry={outerGeo} material={outerMat} renderOrder={2} />
        <mesh geometry={innerGeo} material={innerMat} renderOrder={2} />
      </group>
    ))}
  </group>;
}
