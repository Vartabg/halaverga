import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { BufferGeometry, Float32BufferAttribute, InstancedMesh, Matrix4, MeshBasicMaterial, Quaternion, Vector3 } from 'three';
import { useGame } from '@/game/store';

const BIRD_COUNT = 16;

export default function Flock() {
  const meshRef = useRef<InstancedMesh>(null);
  const data = useMemo(() => {
    // Simple 4-vertex delta-wing bird geometry
    const geom = new BufferGeometry();
    const vertices = new Float32Array([
      0, 0, .45,    // beak
      -.75, .08, -.2, // left wingtip
      0, 0, -.25,    // tail
      0, 0, .45,    // beak
      0, 0, -.25,    // tail
      .75, .08, -.2,  // right wingtip
    ]);
    geom.setAttribute('position', new Float32BufferAttribute(vertices, 3));
    geom.computeVertexNormals();

    const mat = new MeshBasicMaterial({ color: '#eef5f2', depthWrite: false });
    const speeds = Float32Array.from({ length: BIRD_COUNT }, (_, i) => .22 + (i % 4) * .05);
    const radiiX = Float32Array.from({ length: BIRD_COUNT }, (_, i) => 38 + (i % 5) * 8);
    const radiiZ = Float32Array.from({ length: BIRD_COUNT }, (_, i) => 32 + (i % 3) * 10);
    const baseHeights = Float32Array.from({ length: BIRD_COUNT }, (_, i) => 72 + (i % 4) * 7);
    const offsets = Float32Array.from({ length: BIRD_COUNT }, (_, i) => (i / BIRD_COUNT) * Math.PI * 2);

    return { geom, mat, speeds, radiiX, radiiZ, baseHeights, offsets };
  }, []);

  useEffect(() => () => {
    data.geom.dispose();
    data.mat.dispose();
  }, [data]);

  const mat4 = useMemo(() => new Matrix4(), []);
  const pos = useMemo(() => new Vector3(), []);
  const q = useMemo(() => new Quaternion(), []);
  const up = useMemo(() => new Vector3(0, 1, 0), []);
  const forward = useMemo(() => new Vector3(), []);
  const timeRef = useRef(0);

  useFrame((_, dt) => {
    if (!meshRef.current || useGame.getState().paused) return;
    timeRef.current += Math.min(dt, .04);
    const t = timeRef.current;

    for (let i = 0; i < BIRD_COUNT; i++) {
      const angle = t * data.speeds[i] + data.offsets[i];
      const x = Math.sin(angle) * data.radiiX[i] - 10;
      const z = Math.cos(angle) * data.radiiZ[i] - 180;
      const y = data.baseHeights[i] + Math.sin(angle * 2 + i) * 3;
      pos.set(x, y, z);

      // Tangent direction
      forward.set(
        Math.cos(angle) * data.radiiX[i],
        Math.cos(angle * 2 + i) * 2,
        -Math.sin(angle) * data.radiiZ[i]
      ).normalize();

      q.setFromUnitVectors(new Vector3(0, 0, 1), forward);
      mat4.compose(pos, q, new Vector3(1.4, 1.4, 1.4));
      meshRef.current.setMatrixAt(i, mat4);
    }
    meshRef.current.instanceMatrix.needsUpdate = true;
  });

  return <instancedMesh ref={meshRef} args={[data.geom, data.mat, BIRD_COUNT]} />;
}
