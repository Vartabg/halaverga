import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Group, InstancedMesh, Matrix4, MeshBasicMaterial, Quaternion, SphereGeometry, Vector3 } from 'three';
import { useGame } from '@/game/store';

/** A friendly, untargetable wheel witness inspired by Ezekiel 1:15–21. Holy wheels never enter the enemy combat pool. */
export default function ThroneWitness() {
  const root = useRef<Group>(null);
  const eyes = useMemo(() => {
    const m = new InstancedMesh(new SphereGeometry(.23, 8, 5), new MeshBasicMaterial({ color: '#fff0c4', toneMapped: false }), 32);
    const at = new Vector3(), q = new Quaternion(), scale = new Vector3(1, .5, .65), matrix = new Matrix4();
    for (let i = 0; i < 32; i++) {
      const a = i / 32 * Math.PI * 2;
      at.set(Math.cos(a) * 6.6, Math.sin(a) * 6.6, 0);
      m.setMatrixAt(i, matrix.compose(at, q, scale));
    }
    return m;
  }, []);
  useEffect(() => () => { eyes.geometry.dispose(); (eyes.material as MeshBasicMaterial).dispose(); eyes.dispose(); }, [eyes]);
  useFrame((_, dt) => {
    const { paused, reduced } = useGame.getState();
    if (root.current && !paused && !reduced) root.current.rotation.y += Math.min(dt, .04) * .055;
  });
  return <group position={[-19, 65, -111]} ref={root}>
    <primitive object={eyes} dispose={null} />
    {[0, 1, 2].map(i => <mesh key={i} rotation={[i * .68, i * 1.05, 0]}>
      <torusGeometry args={[6.6, .17, 6, 80]} /><meshStandardMaterial color="#d4b66c" metalness={.8} roughness={.26} emissive="#6d4710" emissiveIntensity={.4} />
    </mesh>)}
    <mesh><sphereGeometry args={[1.05, 16, 10]} /><meshBasicMaterial color="#ffe8ac" toneMapped={false} /></mesh>
  </group>;
}
