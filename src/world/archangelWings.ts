import { AdditiveBlending, BoxGeometry, BufferGeometry, DoubleSide, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export type ArchangelWings = {
  root: Group;
  leftInner: Group;
  rightInner: Group;
  leftOuter: Group;
  rightOuter: Group;
  phase: number;
  unfold: number;
  dispose: () => void;
};

function featherBlade(len: number, width: number, thick: number, x: number, y: number, z: number, rz: number, ry = 0): BufferGeometry {
  const g = new BoxGeometry(len, width, thick);
  g.translate(len * .5, 0, 0);
  g.rotateZ(rz);
  if (ry) g.rotateY(ry);
  g.translate(x, y, z);
  return g.index ? g.toNonIndexed() : g;
}

function buildSideGeometries(side: -1 | 1) {
  const innerParts: BufferGeometry[] = [], outerParts: BufferGeometry[] = [], glowParts: BufferGeometry[] = [];
  // Shoulder crest & covert feathers (inner wing).
  for (let i = 0; i < 7; i++) {
    const u = i / 6, len = .42 + u * .34, w = .09 - u * .02;
    const x = .04 + u * .38, y = .16 - u * .12, z = .02 + u * .03, rz = (.38 - u * .68) * side;
    const g = featherBlade(len * side, w, .022, x * side, y, z, rz, -.12 * side);
    innerParts.push(g);
  }
  // Upper seraphic winglet fan above the shoulder.
  for (let i = 0; i < 4; i++) {
    const u = i / 3, len = .28 + u * .16;
    innerParts.push(featherBlade(len * side, .065, .018, (.03 + u * .12) * side, .24 + u * .06, .04, (.65 - u * .28) * side, -.18 * side));
  }
  // Outer primary flight pinions & radiant trailing veil.
  for (let i = 0; i < 9; i++) {
    const u = i / 8, len = .92 - u * .38, w = .085 - u * .025;
    const x = u * .22, y = .08 - u * .34, z = u * .03, rz = (.18 - u * .92) * side;
    outerParts.push(featherBlade(len * side, w, .016, x * side, y, z, rz, -.08 * side));
    glowParts.push(featherBlade((len + .14) * side, w * 1.45, .008, (x + .03) * side, y, z + .015, rz, -.08 * side));
  }
  const inner = mergeGeometries(innerParts)!, outer = mergeGeometries(outerParts)!, glow = mergeGeometries(glowParts)!;
  innerParts.forEach(g => g.dispose()); outerParts.forEach(g => g.dispose()); glowParts.forEach(g => g.dispose());
  inner.computeVertexNormals(); outer.computeVertexNormals(); glow.computeVertexNormals();
  return { inner, outer, glow };
}

export function createArchangelWings(): ArchangelWings {
  const root = new Group(), leftInner = new Group(), rightInner = new Group(), leftOuter = new Group(), rightOuter = new Group();
  root.position.set(0, .12, .11);
  leftInner.position.set(-.09, .04, 0); rightInner.position.set(.09, .04, 0);
  leftOuter.position.set(-.46, .08, .03); rightOuter.position.set(.46, .08, .03);
  leftInner.add(leftOuter); rightInner.add(rightOuter);
  root.add(leftInner, rightInner);

  const plumeMat = new MeshStandardMaterial({
    color: '#fff4d2', emissive: '#6e4510', emissiveIntensity: .65, metalness: .38, roughness: .32, side: DoubleSide,
  });
  const glowMat = new MeshBasicMaterial({
    color: '#ffcf66', transparent: true, opacity: .34, blending: AdditiveBlending, depthWrite: false, side: DoubleSide,
  });

  const L = buildSideGeometries(-1), R = buildSideGeometries(1);
  const meshes = [
    new Mesh(L.inner, plumeMat), new Mesh(L.outer, plumeMat), new Mesh(L.glow, glowMat),
    new Mesh(R.inner, plumeMat), new Mesh(R.outer, plumeMat), new Mesh(R.glow, glowMat),
  ];
  meshes[0].castShadow = meshes[1].castShadow = meshes[3].castShadow = meshes[4].castShadow = true;
  leftInner.add(meshes[0]); leftOuter.add(meshes[1], meshes[2]);
  rightInner.add(meshes[3]); rightOuter.add(meshes[4], meshes[5]);

  return {
    root, leftInner, rightInner, leftOuter, rightOuter, phase: 0, unfold: 0,
    dispose() {
      L.inner.dispose(); L.outer.dispose(); L.glow.dispose();
      R.inner.dispose(); R.outer.dispose(); R.glow.dispose();
      plumeMat.dispose(); glowMat.dispose();
    },
  };
}

export function stepArchangelWings(
  w: ArchangelWings,
  flying: boolean,
  paused: boolean,
  reduced: boolean,
  speed: number,
  vy: number,
  roll: number,
  dt: number,
) {
  const step = Math.min(dt, .05), targetUnfold = flying ? 1 : 0;
  w.unfold += (targetUnfold - w.unfold) * Math.min(1, step * 8);
  const climb = Math.max(0, vy / 12), effort = flying ? .35 + .65 * Math.min(1, speed / 22 + climb * .7) : .15;
  if (!paused && !reduced) w.phase += step * (flying ? 5.2 + climb * 3.4 + Math.min(1, speed / 28) * 1.8 : 1.4);
  const wave = reduced ? 0 : Math.sin(w.phase), tipWave = reduced ? 0 : Math.sin(w.phase - .65);
  const u = w.unfold;
  // Folded on ground: swept back (+Y rot) and drooped down (-Z rot); spread in flight: wide dihedral with rhythmic stroke.
  const sweep = (1 - u) * .72 + u * (.22 + wave * .38 * effort);
  const dihedral = (1 - u) * -.58 + u * (.18 + wave * .22 * effort);
  const tipSweep = (1 - u) * .48 + u * (.12 + tipWave * .44 * effort);
  const tipFold = (1 - u) * -.65 + u * (.08 + tipWave * .26 * effort);
  w.leftInner.rotation.set(.12 * u, -sweep, -dihedral - roll * .22 * u);
  w.rightInner.rotation.set(.12 * u, sweep, dihedral - roll * .22 * u);
  w.leftOuter.rotation.set(0, -tipSweep, -tipFold);
  w.rightOuter.rotation.set(0, tipSweep, tipFold);
}
