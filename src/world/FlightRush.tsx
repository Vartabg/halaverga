// The rush of flight: air streaking past at speed, and vapour pulled off the wingtips in a fast bank or a dive. Visual only: it
// reads the flight's velocity and the wingtips the suit publishes, and writes nothing back. Three draw calls at speed, none when
// slow, paused or under reduced motion.
import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { AdditiveBlending, BoxGeometry, Color, DynamicDrawUsage, InstancedMesh, Matrix4, MeshBasicMaterial, Quaternion, Vector3 } from 'three';
import { mulberry32 } from '@/game/combat';
import { runtime } from '@/game/runtime';
import { useGame } from '@/game/store';
import { RUSH, streakLength, streakStrength, vapourStrength, wingTips } from './rushData';
import { createRibbon } from './ribbon';

const AIR = new Color('#fff1d2'), Z = new Vector3(0, 0, 1), UP = new Vector3(0, 1, 0);
const dir = new Vector3(), right = new Vector3(), up = new Vector3(), at = new Vector3(), scale = new Vector3(), q = new Quaternion(), m4 = new Matrix4(), c = new Color();
export default function FlightRush() {
  const parts = useMemo(() => {
    const streaks = new InstancedMesh(new BoxGeometry(.026, .026, 1), new MeshBasicMaterial({ transparent: true, blending: AdditiveBlending, depthWrite: false, toneMapped: false }), RUSH.streaks);
    streaks.frustumCulled = false; streaks.visible = false; streaks.instanceMatrix.setUsage(DynamicDrawUsage);
    const rng = mulberry32(1906), seeds = Array.from({ length: RUSH.streaks }, () => ({ angle: rng() * Math.PI * 2, radius: RUSH.inner + (RUSH.outer - RUSH.inner) * Math.sqrt(rng()), along: rng(), gain: .45 + rng() * .55 }));
    for (let i = 0; i < RUSH.streaks; i++) streaks.setColorAt(i, c.setRGB(0, 0, 0));
    streaks.instanceColor!.setUsage(DynamicDrawUsage);
    return { streaks, seeds, trails: [createRibbon(26, '#dfeaff'), createRibbon(26, '#dfeaff')], yaw: runtime.yaw, pitch: runtime.pitch, turn: 0 };
  }, []);
  useEffect(() => () => { parts.streaks.geometry.dispose(); (parts.streaks.material as MeshBasicMaterial).dispose(); parts.streaks.dispose(); parts.trails.forEach(t => t.dispose()); }, [parts]);
  useFrame(({ camera }, delta) => {
    const state = useGame.getState(), dt = Math.min(.05, delta), v = runtime.velocity, speed = Math.hypot(v.x, v.y, v.z);
    const flying = state.flying && state.started && !state.paused;
    // How hard the angel is turning or pulling: the change of heading and pitch, smoothed.
    const dy = Math.atan2(Math.sin(runtime.yaw - parts.yaw), Math.cos(runtime.yaw - parts.yaw)), dp = runtime.pitch - parts.pitch;
    parts.yaw = runtime.yaw; parts.pitch = runtime.pitch;
    if (dt > 0) parts.turn += (Math.hypot(dy, dp) / dt - parts.turn) * Math.min(1, dt * 6);
    const strength = flying ? streakStrength(speed, state.reduced) : 0;
    parts.streaks.visible = strength > .01;
    if (parts.streaks.visible) {
      dir.set(v.x, v.y, v.z).divideScalar(speed); right.crossVectors(dir, UP);
      if (right.lengthSq() < 1e-4) right.set(1, 0, 0); right.normalize(); up.crossVectors(right, dir);
      q.setFromUnitVectors(Z, dir); const length = streakLength(speed);
      for (let i = 0; i < RUSH.streaks; i++) {
        const s = parts.seeds[i];
        // The air stands still and the angel passes through it: each streak slides back along the line of flight and wraps.
        s.along -= speed * dt / RUSH.tube; if (s.along < 0) s.along += 1;
        const along = (s.along - .5) * RUSH.tube, x = Math.cos(s.angle) * s.radius, y = Math.sin(s.angle) * s.radius;
        at.copy(camera.position).addScaledVector(dir, along).addScaledVector(right, x).addScaledVector(up, y);
        parts.streaks.setMatrixAt(i, m4.compose(at, q, scale.set(1, 1, length)));
        // Faint where a streak enters and leaves the tube, so none of them pops in.
        parts.streaks.setColorAt(i, c.copy(AIR).multiplyScalar(strength * s.gain * .42 * Math.sin(Math.PI * s.along)));
      }
      parts.streaks.instanceMatrix.needsUpdate = true; parts.streaks.instanceColor!.needsUpdate = true;
    }
    const vapour = flying && wingTips.live ? vapourStrength(speed, parts.turn, state.reduced) : 0;
    for (let n = 0; n < 2; n++) {
      const trail = parts.trails[n], tip = n ? wingTips.right : wingTips.left;
      if (vapour > .02) trail.push(tip.x, tip.y + .05, tip.z, tip.x, tip.y - .05, tip.z, vapour * .4);
      if (state.paused) continue;
      if (!flying) trail.clear(); else trail.update(dt, RUSH.life);
    }
  }, -17);
  return <><primitive object={parts.streaks} dispose={null} />{parts.trails.map((t, i) => <primitive key={i} object={t.mesh} dispose={null} />)}</>;
}
