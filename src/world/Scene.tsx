'use client';
import { Suspense, lazy, useEffect, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Physics } from '@react-three/rapier';
import { ACESFilmicToneMapping, type DirectionalLight } from 'three';
import City from './HermonCity';
import RuinField from './RuinField';
import DistrictBoundary from './DistrictBoundary';
import { Sky, Water } from './Atmosphere';
import Skyline from './Skyline';
import Drift from './Drift';
import Suit from './Suit';
import Player from '@/game/Player';
import CameraRig from '@/game/CameraRig';
import FlightPresentation from '@/game/FlightPresentation';
import Boundary from '@/ui/Boundary';
import BossEncounter from './BossEncounter';
import { useGame } from '@/game/store';
import { clearInput, runtime } from '@/game/runtime';
import EnvironmentLight from './EnvironmentLight';
import { EXPOSURE, FOG, HEMISPHERE, SUN_COLOR, SUN_INTENSITY, SUN_POSITION } from './atmospherePalette';
import { labFault } from '@/ui/labSwitch';
import { useTouchCapable } from '@/ui/useTouchCapable';
// The Gesture Lab's scene parts load only when a lab scheme is on (spec 10): the drone screen history (-9), Draw's world probe
// (-45) and ribbon, and the hero trail. The standard controls fetch only the drone screen history, and only for the classic one
// thumb with the blaster on (tap a drone to blast, 2026-09-26).
const GestureTrack = lazy(() => import('./GestureTrack'));
const DrawProbe = lazy(() => import('./DrawProbe'));
const GestureRibbon = lazy(() => import('./GestureRibbon'));
const HeroTrail = lazy(() => import('./HeroTrail'));
function GraphicsRecovery({ onLoss, sun }: { onLoss: () => void; sun: React.RefObject<DirectionalLight | null> }) {
  const { gl, invalidate } = useThree();
  useEffect(() => {
    const canvas = gl.domElement;
    const lost = (e: Event) => { e.preventDefault(); clearInput(true); useGame.setState({ paused: true, ready: false }); onLoss(); };
    canvas.addEventListener('webglcontextlost', lost);
    invalidate(); return () => canvas.removeEventListener('webglcontextlost', lost);
  }, [gl, invalidate, onLoss]);
  useFrame(() => {
    const l = sun.current; if (!l) return;
    const gx = Math.round(runtime.position.x / 8) * 8, gz = Math.round(runtime.position.z / 8) * 8;
    if (l.target.position.x === gx && l.target.position.z === gz) return;
    l.position.set(gx + SUN_POSITION[0], SUN_POSITION[1], gz + SUN_POSITION[2]);
    l.target.position.set(gx, 0, gz); l.target.updateMatrixWorld();
  });
  return null;
}

export default function Scene({ onLoss }: { onLoss: () => void }) {
  const paused = useGame(s => s.paused), quality = useGame(s => s.quality), sun = useRef<DirectionalLight>(null);
  return <Canvas aria-label="Three-dimensional Mount Hermon at dawn. Text description and keyboard controls are available in the field guide."
    role="img" frameloop="demand" dpr={quality === 'high' ? [1, 1.5] : 1} shadows={quality === 'high' ? 'percentage' : false}
    camera={{ position: [0, 24, 72], fov: 65, near: .1, far: 650 }}
    gl={{ antialias: true, alpha: false, powerPreference: 'high-performance', stencil: false }}
    onCreated={({ gl }) => { gl.toneMapping = ACESFilmicToneMapping; gl.toneMappingExposure = EXPOSURE; }}>
    <GraphicsRecovery onLoss={onLoss} sun={sun} />
    <fog attach="fog" args={[FOG.color, FOG.near, FOG.far]} />
    <hemisphereLight args={[HEMISPHERE.sky, HEMISPHERE.ground, HEMISPHERE.intensity]} />
    <directionalLight ref={sun} position={SUN_POSITION} color={SUN_COLOR} intensity={SUN_INTENSITY} castShadow={quality === 'high'}
      shadow-mapSize={[2048, 2048]} shadow-camera-left={-110} shadow-camera-right={110}
      shadow-camera-top={110} shadow-camera-bottom={-110} shadow-camera-far={380} shadow-bias={-.0002} shadow-normalBias={.09} />
    <EnvironmentLight /><Sky /><Water /><Skyline /><Drift />
    <Suspense fallback={null}>
      <Physics paused={paused} timeStep={1 / 60} updatePriority={-50} gravity={[0, -22, 0]}>
        <City /><RuinField /><DistrictBoundary /><Player /><FlightPresentation /><Suit /><CameraRig />
        <BossEncounter />
      </Physics>
    </Suspense>
  </Canvas>;
}
