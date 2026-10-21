import { useEffect, useMemo } from 'react';
import { BoxGeometry, Color, Float32BufferAttribute } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { paintInkMaterial } from './paintInk';
import { courtParts } from './villageCourt';

/** The opening court: painted earth and stone on the terrace. One mesh, no collider, no photo. */
export default function Village() {
  const geometry = useMemo(() => {
    const boxes = courtParts().map(p => {
      const g = new BoxGeometry(p.w, p.h, p.d);
      const c = new Color(p.color), colors = new Float32Array(g.attributes.position.count * 3);
      for (let i = 0; i < g.attributes.position.count; i++) colors.set([c.r, c.g, c.b], i * 3);
      g.setAttribute('color', new Float32BufferAttribute(colors, 3));
      g.translate(p.x, p.y, p.z);
      return g;
    });
    const merged = mergeGeometries(boxes, false);
    boxes.forEach(g => g.dispose());
    if (!merged) throw new Error('village court mesh was empty');
    return merged;
  }, []);
  const material = useMemo(paintInkMaterial, []);
  useEffect(() => () => { geometry.dispose(); material.dispose(); }, [geometry, material]);
  return <mesh geometry={geometry} material={material} castShadow={false} receiveShadow dispose={null} />;
}
