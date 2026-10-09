import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { CuboidCollider, RigidBody } from '@react-three/rapier';
import { BoxGeometry, EdgesGeometry, LineBasicMaterial, type Mesh, Vector3 } from 'three';
import { WORLD } from '@/game/motion';
import { BOUNDARY_GROUPS } from '@/game/combat';
import { boundaryDistance } from '@/game/navigation';
import { runtime } from '@/game/runtime';
import { useGame } from '@/game/store';
import BoundaryFaces from './BoundaryFaces';
const axis = new Vector3(0, 0, 1);
/** The side walls run from 40 m under the water to 5 m over the ceiling (half height and centre): no gap above them at any ceiling. */
export const WALL_HALF = (WORLD.ceiling + 45) / 2, WALL_Y = (WORLD.ceiling - 35) / 2;
export default function DistrictBoundary() {
  const width = WORLD.maxX - WORLD.minX, depth = WORLD.maxZ - WORLD.minZ;
  const centre: [number, number, number] = [0, WORLD.ceiling / 2, (WORLD.minZ + WORLD.maxZ) / 2];
  const frame = useMemo(() => {
    const box = new BoxGeometry(width, WORLD.ceiling, depth), edges = new EdgesGeometry(box); box.dispose();
    return edges;
  }, [width, depth]);
  const line = useMemo(() => new LineBasicMaterial({ color: '#f1c894', transparent: true, opacity: 0, depthWrite: false }), []);
  const cue = useRef<Mesh>(null);
  useEffect(() => () => { frame.dispose(); line.dispose(); }, [frame, line]);
  useFrame(() => {
    line.opacity = useGame.getState().started ? Math.max(0, 1 - boundaryDistance(runtime.position) / 22) * .7 : 0;
    if (cue.current) {
      cue.current.visible = runtime.clearance.active && !useGame.getState().paused;
      cue.current.position.copy(runtime.clearance.point).addScaledVector(runtime.clearance.normal, .08);
      cue.current.quaternion.setFromUnitVectors(axis, runtime.clearance.normal);
    }
  });
  return <>
    {/* Shots and drone sight lines ignore the invisible walls (combat.ts groups); flight queries still collide. */}
    <RigidBody type="fixed" colliders={false} collisionGroups={BOUNDARY_GROUPS}>
      <CuboidCollider args={[1, WALL_HALF, depth / 2 + 4]} position={[WORLD.minX - 1.44, WALL_Y, centre[2]]} />
      <CuboidCollider args={[1, WALL_HALF, depth / 2 + 4]} position={[WORLD.maxX + 1.44, WALL_Y, centre[2]]} />
      <CuboidCollider args={[width / 2 + 4, WALL_HALF, 1]} position={[0, WALL_Y, WORLD.minZ - 1.44]} />
      <CuboidCollider args={[width / 2 + 4, WALL_HALF, 1]} position={[0, WALL_Y, WORLD.maxZ + 1.44]} />
      <CuboidCollider args={[width / 2 + 4, 1, depth / 2 + 4]} position={[0, WORLD.ceiling + 2.04, centre[2]]} />
      <CuboidCollider args={[width / 2 + 4, 1, depth / 2 + 4]} position={[0, -1.4, centre[2]]} />
    </RigidBody>
    <lineSegments geometry={frame} material={line} position={centre} />
    <BoundaryFaces />
    <mesh ref={cue} visible={false}><ringGeometry args={[.65, .73, 32]} /><meshBasicMaterial color="#ffe2ab" transparent opacity={.65} depthWrite={false} side={2} /></mesh>
  </>;
}
