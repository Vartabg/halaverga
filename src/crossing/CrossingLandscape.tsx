import { useEffect, useMemo, type ReactNode } from 'react';
import { useFrame } from '@react-three/fiber';
import { UniformsLib, UniformsUtils, Vector2, Vector3 } from 'three';
import Backdrop from '@/world/Backdrop';
import TerrainLayer from '@/world/TerrainLayer';
import { FOG, HEMISPHERE, SUN_COLOR, SUN_DIRECTION, SUN_INTENSITY, SUN_POSITION } from '@/world/atmospherePalette';
import { makeHermonArch } from '@/world/hermonArch';
import { makeMassifChunk } from '@/world/massifGeometry';
import { paintInkMaterial } from '@/world/paintInk';
import { sharedTerrain } from '@/world/terrainArt';
import { waterFragment, waterVertex } from '@/world/waterShader';
import { crossingSurface, type WalkSurface } from './crossingSurface';
import type { Crossing } from './flight';

function mountain() {
  const chunk = (id: string, minX: number, maxX: number, minZ: number, maxZ: number, step: number) =>
    makeMassifChunk(id, { minX, maxX, minZ, maxZ }, step).geometry;
  return [
    chunk('gorge', -100, 100, -120, 200, 5),
    chunk('west', -440, -100, -120, 200, 10), chunk('east', 100, 440, -120, 200, 10),
    chunk('north', -440, 440, -470, -120, 10), chunk('south', -440, 440, 200, 330, 10),
    makeHermonArch().geometry,
  ];
}

export default function CrossingLandscape({ flight, reduced, children }:
  { flight: Crossing; reduced: boolean; children: (surface: WalkSurface) => ReactNode }) {
  const stone = useMemo(() => paintInkMaterial(sharedTerrain, true), []);
  const rocks = useMemo(mountain, []);
  const surface = useMemo(() => crossingSurface([rocks[0], rocks[rocks.length - 1]]), [rocks]);
  const water = useMemo(() => UniformsUtils.merge([UniformsLib.fog, {
    time: { value: 0 }, uSun: { value: new Vector3(...SUN_DIRECTION) },
    wake: { value: new Vector2() }, wakeStrength: { value: 0 },
  }]), []);
  useEffect(() => () => { rocks.forEach(g => g.dispose()); stone.dispose(); }, [rocks, stone]);
  useFrame(() => {
    water.time.value = reduced ? 0 : flight.elapsed + flight.after;
    water.wake.value.set(flight.player.x, flight.player.z);
    water.wakeStrength.value = Math.exp(-Math.max(0, flight.player.y - 2) * .5);
  });
  return <>
    <color attach="background" args={[FOG.color]} />
    <fog attach="fog" args={[FOG.color, FOG.near, FOG.far]} />
    <hemisphereLight args={[HEMISPHERE.sky, HEMISPHERE.ground, HEMISPHERE.intensity]} />
    <directionalLight position={SUN_POSITION} color={SUN_COLOR} intensity={SUN_INTENSITY} />
    <Backdrop /><TerrainLayer />
    {rocks.map(g => <mesh key={g.uuid} geometry={g} material={stone} dispose={null} />)}
    <mesh rotation-x={-Math.PI / 2} position-y={.1}>
      <planeGeometry args={[1200, 1200]} />
      <shaderMaterial uniforms={water} vertexShader={waterVertex} fragmentShader={waterFragment} fog />
    </mesh>
    {children(surface)}
  </>;
}
