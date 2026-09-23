// The blaster's arm cannon. Mounted by ShooterLayer inside its error Boundary and its own <Suspense fallback={null}>, so the
// model is fetched only while the blaster is on and a load error turns the blaster off while flight continues.
import { useEffect, useMemo } from 'react';
import { useFrame, useLoader, type RootState } from '@react-three/fiber';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { guarded } from '@/game/shooterFault';
import { CANNON_URL, cannonDrive, cannonLink } from './cannonContract';
import { buildArmCannon, detachArmCannon, disposeArmCannon, stepArmCannon } from './cannonRuntime';

export default function ArmCannon() {
  const gltf = useLoader(GLTFLoader, CANNON_URL);
  const cannon = useMemo(() => buildArmCannon(gltf.scene), [gltf]);
  const tick = useMemo(() => {
    let warmed = false;
    return guarded('ArmCannon', (state: RootState, _dt: number) => {
      const attached = stepArmCannon(cannon, cannonLink, cannonDrive);
      if (attached && !warmed) {
        warmed = true;
        // Passing state.scene compiles the lit, fogged, shadow-aware program variant the real render uses; compiling against the
        // cannon alone would build a different variant and the first visible draw would still stall on a second compile.
        state.gl.compileAsync(cannon.root, state.camera, state.scene).catch(() => {});
      }
    });
  }, [cannon]);
  useEffect(() => () => { detachArmCannon(cannon, cannonLink); disposeArmCannon(cannon); }, [cannon]);
  useFrame(tick, -19);
  // Nothing is rendered through React: attaching reparents the root into the forearm_r bone of Suit's rig, and a <primitive>
  // here would let React reparent it back under this component's parent on every reconciliation.
  return null;
}
