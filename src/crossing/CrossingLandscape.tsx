import { useEffect, useMemo, type ReactNode } from 'react';
import Backdrop from '@/world/Backdrop';
import EdgeRing from '@/world/EdgeRing';
import TerrainLayer from '@/world/TerrainLayer';
import { FOG, HEMISPHERE, SUN_COLOR, SUN_INTENSITY, SUN_POSITION } from '@/world/atmospherePalette';
import { makeHermonArch } from '@/world/hermonArch';
import { naturalTerrainMaterial } from '@/world/naturalTerrain';
import CrossingSpindrift from './CrossingSpindrift';
import { crossingSurface, type WalkSurface } from './crossingSurface';
import type { Crossing } from './flight';
import { makePassGround, weatherStone } from './passGeometry';
import PassDetails from './PassDetails';

export default function CrossingLandscape({ flight, reduced, children }:
  { flight: Crossing; reduced: boolean; children: (surface: WalkSurface) => ReactNode }) {
  const ground = useMemo(makePassGround, []);
  const arch = useMemo(() => weatherStone(makeHermonArch().geometry), []);
  const stone = useMemo(naturalTerrainMaterial, []);
  const surface = useMemo(() => crossingSurface(arch), [arch]);
  useEffect(() => () => { ground.dispose(); arch.dispose(); stone.dispose(); }, [ground, arch, stone]);
  return <>
    <color attach="background" args={[FOG.color]} />
    <fog attach="fog" args={[FOG.color, FOG.near, FOG.far]} />
    <hemisphereLight args={[HEMISPHERE.sky, HEMISPHERE.ground, HEMISPHERE.intensity]} />
    <directionalLight position={SUN_POSITION} color={SUN_COLOR} intensity={SUN_INTENSITY} />
    <Backdrop /><TerrainLayer /><EdgeRing />
    <mesh name="Hermon pass" geometry={ground} material={stone} dispose={null} />
    <mesh name="Cloven Arch" geometry={arch} material={stone} dispose={null} />
    <PassDetails stone={stone} />
    <CrossingSpindrift flight={flight} reduced={reduced} />
    {children(surface)}
  </>;
}
