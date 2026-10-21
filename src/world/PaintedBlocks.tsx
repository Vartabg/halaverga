import { useEffect, useMemo } from 'react';
import { paintInkMaterial } from './paintInk';
import { paintBlockGeometry } from './paintBlocks';
import type { Block } from './villageHouseData';

/** Painted blocks. Visual only: no collider. Dispose the geometry and the gradient texture. */
export default function PaintedBlocks({ parts, position = [0, 0, 0], rotation = [0, 0, 0] }: {
  parts: Block[];
  position?: [number, number, number];
  rotation?: [number, number, number];
}) {
  const geometry = useMemo(() => paintBlockGeometry(parts), [parts]);
  const material = useMemo(paintInkMaterial, []);
  useEffect(() => () => { geometry.dispose(); material.dispose(); }, [geometry, material]);
  return <mesh geometry={geometry} material={material} position={position} rotation={rotation} castShadow={false} receiveShadow={false} dispose={null} />;
}
