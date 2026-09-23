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
import Shooter from '@/game/Shooter';
import { shooterFault } from '@/game/shooterFault';
import Boundary from '@/ui/Boundary';
import Drones from './Drones';
import ShotFx from './ShotFx';
import ImpactFx from './ImpactFx';
import ArmCannon from './ArmCannon';
import { useGame } from '@/game/store';
import { clearInput } from '@/game/runtime';
import EnvironmentLight from './EnvironmentLight';
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
/** The suit blaster, its arm cannon and the rogue drones, mounted only while the setting is on (so arm-cannon.glb is fetched only
 * then). A render or load error turns the blaster off; flight continues. */
function ShooterLayer() {
  const shooter = useGame(s => s.shooter);
  return shooter ? <Boundary fallback={null} onError={() => shooterFault('render', null)}><Shooter /><Drones /><ShotFx /><ImpactFx />
    <Suspense fallback={null}><ArmCannon /></Suspense></Boundary> : null;
}
export default function Scene({ onLoss }: { onLoss: () => void }) {
  const paused = useGame(s => s.paused), quality = useGame(s => s.quality);
  return <Canvas aria-label="Three-dimensional flooded city. Text description and keyboard controls are available in the field guide."
    role="img" frameloop="demand" dpr={quality === 'high' ? [1, 1.5] : 1} shadows={quality === 'high' ? 'percentage' : false}
    camera={{ position: [0, 24, 72], fov: 65, near: .1, far: 650 }}
    gl={{ antialias: true, alpha: false, powerPreference: 'high-performance', stencil: false }}
    onCreated={({ gl }) => { gl.toneMapping = ACESFilmicToneMapping; gl.toneMappingExposure = 1.2; }}>
    <GraphicsRecovery onLoss={onLoss} />
    <fog attach="fog" args={['#a9c0b8', 95, 330]} />
    <hemisphereLight args={['#c0dbed', '#737657', 1.7]} />
    <directionalLight position={[-65, 100, 80]} color="#ffe6b2" intensity={3.5} castShadow={quality === 'high'}
      shadow-mapSize={[2048, 2048]} shadow-camera-left={-110} shadow-camera-right={110}
      shadow-camera-top={110} shadow-camera-bottom={-110} shadow-camera-far={380} shadow-bias={-.0002} shadow-normalBias={.09} />
    <EnvironmentLight /><Sky /><Water />
    <Suspense fallback={null}>
      <Physics paused={paused} timeStep={1 / 60} updatePriority={-50} gravity={[0, -22, 0]}>
        <City /><DistrictBoundary /><Player /><FlightPresentation /><Suit /><CameraRig />
        <ShooterLayer />
      </Physics>
    </Suspense>
  </Canvas>;
}
