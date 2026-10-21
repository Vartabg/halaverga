import { BREACH } from '@/game/breachRoutes';
/** Entrance and exit lights leave the central sightline free. Their stonework is in Sanctuary's shared collision mesh. */
export default function BreachRoutes() {
  return <group>
    {[BREACH.low.entry, BREACH.low.exit].map(z => <group key={z} position={[BREACH.low.x, 15, z]}>
      {[-8, 8].map(x => <mesh key={x} position={[x, 0, 0]}>
        <boxGeometry args={[.16, 11, .2]} /><meshBasicMaterial color="#94c7d0" toneMapped={false} />
      </mesh>)}
      <mesh position={[0, -7, 0]}><boxGeometry args={[16, .16, .2]} /><meshBasicMaterial color="#94c7d0" toneMapped={false} /></mesh>
    </group>)}
    {[-4, -63].map(z => <mesh key={z} position={[54, 65, z]}>
      <boxGeometry args={[.12, 6, .12]} /><meshBasicMaterial color="#e8ca86" toneMapped={false} />
    </mesh>)}
  </group>;
}
