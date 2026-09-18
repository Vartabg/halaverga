'use client';
import { Suspense, useEffect } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { Physics } from '@react-three/rapier';
import { ACESFilmicToneMapping } from 'three';
import City from './City';
import DistrictBoundary from './DistrictBoundary';
import { Sky, Water } from './Atmosphere';
import Suit from './Suit';
import Player from '@/game/Player';
import CameraRig from '@/game/CameraRig';
import FlightPresentation from '@/game/FlightPresentation';
import { useGame } from '@/game/store';
import { clearInput } from '@/game/runtime';
function GraphicsRecovery({ onLoss }: { onLoss: () => void }) {
  const { gl, invalidate } = useThree();
  useEffect(() => {
    const canvas = gl.domElement;
    const lost = (e: Event) => { e.preventDefault(); clearInput(true); useGame.setState({ paused: true, ready: false }); onLoss(); };
    canvas.addEventListener('webglcontextlost', lost);
    invalidate(); return () => canvas.removeEventListener('webglcontextlost', lost);
  }, [gl, invalidate, onLoss]);
  return null;
}
export default function Scene({ onLoss }: { onLoss: () => void }) {
  const paused = useGame(s => s.paused), quality = useGame(s => s.quality);
  return <Canvas aria-label="Three-dimensional flooded city. Text description and keyboard controls are available in the field guide."
    role="img" frameloop="demand" dpr={quality === 'high' ? [1, 1.5] : 1} shadows={quality === 'high'}
    camera={{ position: [0, 24, 72], fov: 65, near: .1, far: 650 }}
    gl={{ antialias: true, alpha: false, powerPreference: 'high-performance', stencil: false }}
    onCreated={({ gl }) => { gl.toneMapping = ACESFilmicToneMapping; gl.toneMappingExposure = 1.18; }}>
    <GraphicsRecovery onLoss={onLoss} />
    <fog attach="fog" args={['#b5ad99', 95, 330]} />
    <hemisphereLight args={['#b5cbd1', '#6b506c', 2.3]} />
    <directionalLight position={[-90, 110, -35]} color="#ffe0aa" intensity={2.5} castShadow={quality === 'high'}
      shadow-mapSize={[1024, 1024]} shadow-camera-left={-110} shadow-camera-right={110}
      shadow-camera-top={110} shadow-camera-bottom={-110} shadow-camera-far={320} shadow-bias={-.0002} shadow-normalBias={.08} />
    <Sky /><Water />
    <Suspense fallback={null}>
      <Physics paused={paused} timeStep={1 / 60} updatePriority={-50} gravity={[0, -22, 0]}>
        <City /><DistrictBoundary /><Player /><FlightPresentation /><Suit /><CameraRig />
      </Physics>
    </Suspense>
  </Canvas>;
}
