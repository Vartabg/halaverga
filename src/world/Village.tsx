import { useEffect, useMemo } from 'react';
import { paintInkMaterial } from './paintInk';
import { courtGeometry } from './villageCourt';

/** The opening oath court: painted Cyclopean stone on the continuous arrival promontory. */
export default function Village() {
  const geometry = useMemo(courtGeometry, []);
  const material = useMemo(paintInkMaterial, []);
  useEffect(() => () => { geometry.dispose(); material.dispose(); }, [geometry, material]);
  return <mesh geometry={geometry} material={material} castShadow={false} receiveShadow dispose={null} />;
}
