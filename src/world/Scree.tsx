import { useEffect, useMemo } from 'react';
import { Color, Euler, IcosahedronGeometry, InstancedMesh, Matrix4, MeshStandardMaterial, Quaternion, Vector3 } from 'three';
import { mulberry32 } from '@/game/combat';
import { heightAt, slopeAt } from './massifData';

/** Low limestone fragments and alpine cushion plants on the exposed benches. */
export default function Scree() {
  const mesh = useMemo(() => {
    const count = 460, rng = mulberry32(24606);
    const geometry = new IcosahedronGeometry(1, 0), material = new MeshStandardMaterial({ roughness: 1, flatShading: true });
    const result = new InstancedMesh(geometry, material, count);
    const matrix = new Matrix4(), position = new Vector3(), scale = new Vector3(), q = new Quaternion(), e = new Euler();
    const pale = new Color('#b0aa96'), stone = new Color('#726c5e'), vegetation = new Color('#6c7350'), c = new Color();
    let placed = 0;
    for (let tries = 0; placed < count && tries < 2500; tries++) {
      const side = rng() < .5 ? -1 : 1, x = side * (15 + rng() ** 2 * 220), z = 88 - rng() * 343;
      const y = heightAt(x, z), slope = slopeAt(x, z);
      if (y < 2.8 || slope < .12 || slope > .82 || Math.hypot(x - 30, z + 38) < 17) continue;
      const plant = y < 34 && rng() < .26;
      const radius = .25 + rng() ** 2 * 1.26, rise = radius * (.17 + .21 * rng());
      position.set(x, y - (plant ? .02 : .1), z);
      scale.set(radius, rise, radius * (.55 + .72 * rng()));
      q.setFromEuler(e.set(.06 + rng() * .17, rng() * Math.PI * 2, -.2 + rng() * .4));
      matrix.compose(position, q, scale);
      c.copy(stone).lerp(pale, rng());
      if (plant) c.lerp(vegetation, .82);
      result.setMatrixAt(placed, matrix);
      result.setColorAt(placed++, c);
    }
    result.count = placed;
    result.instanceMatrix.needsUpdate = true;
    return result;
  }, []);
  useEffect(() => () => { mesh.geometry.dispose(); mesh.material.dispose(); mesh.dispose(); }, [mesh]);
  return <primitive object={mesh} />;
}
