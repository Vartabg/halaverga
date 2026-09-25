import { useEffect } from 'react';
import { useFrame, type RootState } from '@react-three/fiber';
import { runtime } from '@/game/runtime';
import { guarded } from '@/game/shooterFault';
import { aimFrameFrom, droneTrack, labAimFrame, recordTrack, resetTrack } from '@/game/gesture/screenRay';
// Gesture Lab drone screen history (spec 3.2): priority -9, right after CameraRig (-10) publishes the aim and before the drones and
// effects (-5). Each frame it projects up to 8 drone targets through the published camera frame and the R3F canvas rect (no DOM
// reads) into droneTrack's fixed arrays, stamped with performance.now so pointer event timestamps line up. Mounted by the lab only.
const frame = guarded('GestureTrack', (state: RootState) => {
  const s = runtime.shooter;
  if (!s.aim.valid) return;
  const t = performance.now();
  aimFrameFrom(s.aim, state.size, t, labAimFrame);
  recordTrack(droneTrack, labAimFrame, s.targets, s.drones.count, t);
});
export default function GestureTrack() {
  useEffect(() => { resetTrack(); return () => resetTrack(); }, []);
  useFrame(frame, -9);
  return null;
}
