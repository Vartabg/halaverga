import { BoxGeometry, BufferGeometry, ConeGeometry, CylinderGeometry, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, TorusGeometry, Vector3, type Object3D } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { AXIS_ORIGIN, BARREL_AXIS } from './cannonContract';

/** Original holy-fire bracer. Keeps the proven muzzle/IK sockets while replacing every visible industrial cannon surface. */
export function luminousBracer(source: Object3D) {
  source.traverse(o => { if (o instanceof Mesh) o.visible = false; });
  const root = new Group(), parts: BufferGeometry[] = [];
  root.position.set(AXIS_ORIGIN.x, AXIS_ORIGIN.y, AXIS_ORIGIN.z);
  root.quaternion.setFromUnitVectors(new Vector3(0, 0, 1), new Vector3(BARREL_AXIS.x, BARREL_AXIS.y, BARREL_AXIS.z));
  parts.push(new CylinderGeometry(.075, .095, .29, 10).rotateX(Math.PI / 2).translate(0, 0, .25));
  for (const z of [.12, .18, .4, .49]) parts.push(new TorusGeometry(z === .49 ? .12 : .096, .012, 5, 24).translate(0, 0, z));
  for (let i = 0; i < 6; i++) {
    const a = i * Math.PI / 3;
    parts.push(new ConeGeometry(.025, .29, 4).rotateX(Math.PI / 2).translate(Math.cos(a) * .08, Math.sin(a) * .08, .37));
  }
  const flat = parts.map(g => g.index ? g.toNonIndexed() : g), g = mergeGeometries(flat)!;
  new Set([...parts, ...flat]).forEach(p => p.dispose());
  const gold = new MeshStandardMaterial({ color: '#d4b575', metalness: .8, roughness: .3 });
  const fire = new MeshBasicMaterial({ color: '#ffe6ad', toneMapped: false });
  root.add(new Mesh(g, gold));
  const light = new Mesh(new BoxGeometry(.025, .025, .28), fire); light.position.z = .39; root.add(light);
  source.add(root);
  return () => { root.removeFromParent(); g.dispose(); light.geometry.dispose(); gold.dispose(); fire.dispose(); };
}
