import {
  BoxGeometry, BufferGeometry, ConeGeometry, CylinderGeometry, Group, IcosahedronGeometry,
  Mesh, MeshBasicMaterial, MeshStandardMaterial, TorusGeometry, Vector3, type Object3D,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { AXIS_ORIGIN, BARREL_AXIS } from './cannonContract';

function mergeParts(parts: BufferGeometry[]) {
  const flat = parts.map((g) => (g.index ? g.toNonIndexed() : g)), out = mergeGeometries(flat);
  parts.forEach((p) => p.dispose()); flat.forEach((p) => p.dispose());
  if (!out) throw new Error('luminousBracer geometry merge failed');
  return out;
}

/** Archangel Covenant Bracer & Radiant Palm Sigil. Replaces industrial arm-cannon surfaces with holy celestial regalia. */
export function luminousBracer(source: Object3D) {
  source.traverse((o) => { if (o instanceof Mesh) o.visible = false; });
  const root = new Group(), goldParts: BufferGeometry[] = [], fireParts: BufferGeometry[] = [];
  root.position.set(AXIS_ORIGIN.x, AXIS_ORIGIN.y, AXIS_ORIGIN.z);
  root.quaternion.setFromUnitVectors(new Vector3(0, 0, 1), new Vector3(BARREL_AXIS.x, BARREL_AXIS.y, BARREL_AXIS.z));

  // Tapered octagonal forearm vambrace and reinforcement cuffs
  goldParts.push(new CylinderGeometry(.074, .094, .30, 8).rotateX(Math.PI / 2).translate(0, 0, .26));
  goldParts.push(new CylinderGeometry(.095, .098, .04, 8).rotateX(Math.PI / 2).translate(0, 0, .12));
  goldParts.push(new CylinderGeometry(.075, .08, .04, 8).rotateX(Math.PI / 2).translate(0, 0, .42));

  // Triple celestial binding toruses
  goldParts.push(new TorusGeometry(.098, .009, 6, 24).translate(0, 0, .13));
  goldParts.push(new TorusGeometry(.086, .009, 6, 24).translate(0, 0, .27));
  goldParts.push(new TorusGeometry(.08, .009, 6, 24).translate(0, 0, .43));

  // Seraphic quill crests along the top ridge
  for (let i = 0; i < 4; i++) {
    goldParts.push(new ConeGeometry(.02, .14, 4).rotateX(Math.PI / 2).translate(0, .082, .18 + i * .07));
  }

  // Radiant Palm Sigil: outer solar halo, inner star ring, and 8 radiant sunbeams
  goldParts.push(new TorusGeometry(.095, .007, 6, 24).translate(0, 0, .49));
  goldParts.push(new TorusGeometry(.05, .006, 6, 20).translate(0, 0, .49));
  for (let k = 0; k < 8; k++) {
    const a = k * Math.PI / 4;
    goldParts.push(new ConeGeometry(.012, .05, 4).rotateZ(a).translate(Math.sin(a) * .075, Math.cos(a) * .075, .49));
  }

  // Holy fire core jewel and longitudinal channel inlays
  fireParts.push(new IcosahedronGeometry(.028, 1).translate(0, 0, .495));
  fireParts.push(new BoxGeometry(.01, .01, .26).translate(.074, 0, .27));
  fireParts.push(new BoxGeometry(.01, .01, .26).translate(-.074, 0, .27));

  const goldGeo = mergeParts(goldParts), fireGeo = mergeParts(fireParts);
  const gold = new MeshStandardMaterial({ color: '#d4b575', metalness: .82, roughness: .28 });
  const fire = new MeshBasicMaterial({ color: '#fff0bd', toneMapped: false });
  const goldMesh = new Mesh(goldGeo, gold), fireMesh = new Mesh(fireGeo, fire);

  root.add(goldMesh); root.add(fireMesh);
  source.add(root);

  return () => {
    root.removeFromParent();
    goldGeo.dispose(); fireGeo.dispose();
    gold.dispose(); fire.dispose();
  };
}
