import { useEffect, useMemo } from 'react';
import { BufferAttribute, BufferGeometry, type MeshStandardMaterial } from 'three';
import Cedars from '@/world/Cedars';
import type { Cedar } from '@/world/cedarData';
import { passGroundAt } from './passGround';
import { weatherStone } from './passGeometry';
import { talusField } from './passTalus';

function limestoneFragments() {
  const positions: number[] = [];
  for (const fragment of talusField().chunks) {
    for (const triangle of fragment.faces) for (const p of triangle) positions.push(...p);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.computeVertexNormals();
  return weatherStone(geometry);
}

/** A few weathered cedars take root downvalley, away from the exposed crest and the snow hollow. */
function lowerCedars(): Cedar[] {
  return [[-45, -70, .8], [-51, -76, .51], [-63, -101, .72], [-76, -112, .46],
    [-26, -114, .6], [-29, -126, .37], [-9, -144, .77], [-1, -149, .54],
    [11, -102, .6], [18, -112, .42], [35, -119, .54], [42, -118, .36],
    [-67, -173, .62], [-73, -172, .42], [-79, -193, .49], [6, -190, .39]]
    .map(([x, z, scale], i) => ({ position: [x, passGroundAt(x, z), z], scale, yaw: i * 2.399 }));
}

export default function PassDetails({ stone }: { stone: MeshStandardMaterial }) {
  const talus = useMemo(limestoneFragments, []), trees = useMemo(lowerCedars, []);
  useEffect(() => () => talus.dispose(), [talus]);
  return <>
    <mesh name="jointed limestone debris" geometry={talus} material={stone} dispose={null} />
    <Cedars sites={trees} />
  </>;
}
