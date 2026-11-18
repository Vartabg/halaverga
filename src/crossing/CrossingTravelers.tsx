import { useLayoutEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { CylinderGeometry, Group, Mesh, MeshStandardMaterial, Vector3 } from 'three';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { buildSuitRig } from '@/world/suitRig';
import { SWORD_GRIP } from '@/world/swordGrip';
import type { WalkSurface } from './crossingSurface';
import { clamp01, ease, travelerAt } from './crossingWalk';
import type { Crossing } from './flight';

function traveler(source: GLTF, second: boolean) {
  const rig = buildSuitRig(source.scene);
  rig.root.traverse(part => {
    if (part instanceof Mesh && part.material instanceof MeshStandardMaterial && part.material.name === 'archangel chiton') {
      part.material.color.set(second ? '#a6c7b3' : '#c77c45');
    }
  });
  const wool = new MeshStandardMaterial({ color: second ? '#427169' : '#894a38', roughness: .98 });
  const fabric = new CylinderGeometry(.14, .32, second ? .34 : .46, 14, 4);
  const vertices = fabric.getAttribute('position');
  for (let i = 0; i < vertices.count; i++) {
    const x = vertices.getX(i), y = vertices.getY(i), z = vertices.getZ(i);
    vertices.setXYZ(i, x, y + x * (second ? -.24 : .38) + (.12 - y) * Math.sin(x * 20) * .06, z * .69);
  }
  fabric.computeVertexNormals();
  const mantle = new Mesh(fabric, wool);
  mantle.position.set(0, .012, .02); rig.joints[11].add(mantle);
  const wood = new MeshStandardMaterial({ color: '#654a33', roughness: 1 });
  const staff = new Mesh(new CylinderGeometry(.019, .024, 1.59, 6), wood);
  return { rig, staff, sole: new Vector3(), dispose() {
    rig.root.removeFromParent(); staff.removeFromParent(); rig.dispose();
    for (const piece of [mantle, staff]) piece.geometry.dispose();
    wool.dispose(); wood.dispose();
  } };
}

type Props = { asset: GLTF; flight: Crossing; reduced: boolean; surface: WalkSurface };

function Traveler({ asset, flight, index, reduced, surface }: Props & { index: number }) {
  const mount = useRef<Group>(null), who = useRef<ReturnType<typeof traveler> | null>(null);
  const feet = useRef(new Vector3());
  useLayoutEffect(() => {
    const person = traveler(asset, index === 1);
    who.current = person; mount.current!.add(person.rig.root, person.staff);
    return () => { who.current = null; person.dispose(); };
  }, [asset, index]);
  useFrame(() => {
    if (!who.current) return;
    const { rig, staff, sole } = who.current, scale = index ? .93 : 1.02;
    const distance = travelerAt(flight, index, feet.current), safe = flight.phase === 'safe', late = flight.phase === 'late';
    const turn = safe || late ? ease((flight.after - index * .18) / .7) : 0;
    const start = index ? 2.95 : 2.54, yaw = start + ((late ? Math.PI * 1.5 - .5 : Math.PI / 2) - start) * turn;
    const end = safe ? 54.52 + index * .98 : 19.48 - index * .73;
    const moving = clamp01(distance * 3) * clamp01((end - distance) * 1.5);
    const gait = Math.sin(distance * 3.9 + index * 1.4) * moving;
    const stride = reduced ? gait * .45 : gait;
    rig.root.scale.setScalar(scale);
    rig.root.position.copy(feet.current); rig.root.position.y += scale * (.985 + Math.abs(stride) * .045);
    rig.root.rotation.set(0, yaw, 0);
    const b = rig.joints;
    b[4].rotation.x = .08 + stride * .48; b[5].rotation.x = .08 - stride * .48;
    b[8].rotation.x = -.09 - Math.max(0, -stride) * .62; b[9].rotation.x = -.09 - Math.max(0, stride) * .62;
    b[2].rotation.set(.05 - stride * .34, .12, -.12);
    b[6].rotation.x = .27 + Math.max(0, -stride) * .32;
    b[3].rotation.set(.36 + stride * .16, -.14, .20); b[7].rotation.x = .86 - stride * .12;
    b[1].rotation.y = (index ? -.42 : .3) * (1 - turn);
    let raise = -Infinity;
    for (const joint of [17, 18, 19, 20]) {
      sole.set(0, joint < 19 ? -.08 : -.025, joint < 19 ? .035 : -.022);
      b[joint].localToWorld(sole);
      raise = Math.max(raise, surface(sole.x, sole.z, feet.current.y) - sole.y);
    }
    rig.root.position.y += raise;
    b[16].localToWorld(staff.position.copy(SWORD_GRIP));
    staff.scale.setScalar(scale); staff.position.y -= .23 * scale;
    staff.rotation.set(-.06 + stride * .17, yaw, 0, 'YXZ');
  });
  return <group ref={mount} />;
}

export default function CrossingTravelers(props: Props) {
  return <><Traveler {...props} index={0} /><Traveler {...props} index={1} /></>;
}
