import { AdditiveBlending, DoubleSide, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial } from 'three';
import { featherWing } from './featherGeometry';

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

export function createArchangelWings(): ArchangelWings {
  const root = new Group(), leftInner = new Group(), rightInner = new Group(), leftOuter = new Group(), rightOuter = new Group();
  root.position.set(0, .16, .16);
  leftInner.position.set(-.09, .04, 0); rightInner.position.set(.09, .04, 0);
  leftOuter.position.set(-.68, .08, .03); rightOuter.position.set(.68, .08, .03);
  leftInner.add(leftOuter); rightInner.add(rightOuter);
  root.add(leftInner, rightInner);

  const plumeMat = new MeshStandardMaterial({
    vertexColors: true, color: '#eae8dd', emissive: '#3b2b10', emissiveIntensity: .16, metalness: .12, roughness: .62, side: DoubleSide,
  });
  const glowMat = new MeshBasicMaterial({
    color: '#ffcf66', transparent: true, opacity: .12, blending: AdditiveBlending, depthWrite: false, side: DoubleSide,
  });

  const side = (s: number) => ({ inner: featherWing(s, false), outer: featherWing(s, true), glow: featherWing(s, true) });
  const L = side(-1), R = side(1);
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
