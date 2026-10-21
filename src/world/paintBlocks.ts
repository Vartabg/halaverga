import { BoxGeometry, Color, Float32BufferAttribute, type BufferGeometry } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Block } from './villageHouseData';

/** One flat-color mesh. The toon gradient is the hard shadow. No photo map. */
export function paintBlockGeometry(parts: Block[]): BufferGeometry {
  if (parts.length === 0) throw new Error('paint blocks were empty');
  const boxes = parts.map(p => {
    const g = new BoxGeometry(p.w, p.h, p.d);
    const c = new Color(p.color);
    const colors = new Float32Array(g.attributes.position.count * 3);
    for (let i = 0; i < g.attributes.position.count; i++) {
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new Float32BufferAttribute(colors, 3));
    g.translate(p.x, p.y, p.z);
    return g;
  });
  const merged = mergeGeometries(boxes, false);
  boxes.forEach(g => g.dispose());
  if (!merged) throw new Error('paint block mesh was empty');
  return merged;
}
