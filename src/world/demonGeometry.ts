import { BufferGeometry, Float32BufferAttribute, Mesh, MeshStandardMaterial, PlaneGeometry, type Object3D } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { membraneWeights } from './membraneRig';
import { EYE_FORWARD, EYE_UP } from '@/game/combat';

/** Baked anatomy and curved wing fingers from the original Blender asset. Four pooled batches, no per-creature material clones. */
export function makeDemonGeometry(source: Object3D) {
  source.updateMatrixWorld(true);
  const part = (name: string) => {
    const object = source.getObjectByName(name), pieces: BufferGeometry[] = [];
    if (!object) throw new Error(`Adversary is missing ${name}.`);
    object.traverse(o => {
      if (!(o instanceof Mesh)) return;
      const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
      g.applyMatrix4(o.matrixWorld);
      for (const key of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(key)) g.deleteAttribute(key);
      if (!g.attributes.color) g.setAttribute('color', new Float32BufferAttribute(new Float32Array(g.attributes.position.count * 3).fill(1), 3));
      // Bake the authored flesh/keratin/membrane colours into one pooled batch, retaining their visible separation.
      if (o.material instanceof MeshStandardMaterial) {
        const c = o.material.color, attr = g.attributes.color;
        for (let i = 0; i < attr.count; i++) attr.setXYZ(i, attr.getX(i) * c.r, attr.getY(i) * c.g, attr.getZ(i) * c.b);
      }
      if (name === 'eye') g.translate(0, -EYE_UP, EYE_FORWARD);
      pieces.push(g);
    });
    const out = mergeGeometries(pieces); pieces.forEach(g => g.dispose());
    if (!out) throw new Error(`Adversary ${name} has no surface.`);
    return out;
  };
  const parts = { body: part('body'), plate: part('plate'), wingL: part('wingL'), wingR: part('wingR'), eye: part('eye'), halo: new PlaneGeometry(1, 1) };
  const weights: number[] = [0, 0, 0, 0];
  for (const [name, g] of Object.entries(parts)) {
    if (!['body', 'plate', 'wingL', 'wingR'].includes(name)) continue;
    const p = g.attributes.position, a = new Float32Array(p.count * 4), side = new Float32Array(p.count);
    if (name.startsWith('wing')) for (let i = 0; i < p.count; i++) {
      membraneWeights(p.getX(i), p.getY(i), weights); a.set(weights, i * 4); side[i] = name === 'wingL' ? -1 : 1;
    }
    g.setAttribute('aWingWeights', new Float32BufferAttribute(a, 4)); g.setAttribute('aWingSide', new Float32BufferAttribute(side, 1));
  }
  return parts;
}
