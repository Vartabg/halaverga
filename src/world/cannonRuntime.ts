// The runtime arm cannon (named cannonRuntime.ts: armCannon.ts clashed with ArmCannon.tsx on case-insensitive disks). A clone of
// arm-cannon.glb parented rigidly to forearm_r (the contract frame is that bone's bind frame),
// driven each frame from cannonDrive, and the source of the kicked effects muzzle and the steam vent mouth in world space.
// Per-frame paths (driveArmCannon, stepArmCannon) write only into preallocated objects.
import {
  NearestFilter, NoColorSpace, Quaternion, SRGBColorSpace, Vector3,
  type Group, type Material, type Mesh, type MeshStandardMaterial, type Object3D, type Texture,
} from 'three';
import { BARREL_AXIS, COLORS, NODES, SLIDE_MAX, VENT_DIR, VENT_MAX, type CannonDrive, type CannonLink } from './cannonContract';
import { installEmissiveMask } from './cannonMaterial';

export type ArmCannon = {
  root: Group; shell: Mesh; slide: Mesh; vent: Mesh; muzzle: Object3D; ventMouth: Object3D;
  material: MeshStandardMaterial; uniforms: ReturnType<typeof installEmissiveMask>;
  slideRest: Vector3; ventRest: Quaternion; slideDir: Vector3;
};

/** The hatch may overshoot its VENT_MAX by the follower's ~12%; past 1.15 the drive is treated as a fault and held there. */
const VENT_OVERSHOOT = 1.15;
const TEXTURE_SLOTS = ['map', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'normalMap', 'aoMap'] as const;
const X_AXIS = new Vector3(1, 0, 0), hinge = new Quaternion();
/** Rest drive (restCannonDrive) values, used when a drive value is not finite. */
const REST_CORE = .55, REST_STRIP = .3;

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
const fin = (v: number, rest: number) => (Number.isFinite(v) ? v : rest);

function need(root: Object3D, name: string): Object3D {
  const node = root.getObjectByName(name);
  if (!node) throw new Error('arm-cannon.glb is missing node ' + name);
  return node;
}
function needMesh(root: Object3D, name: string): Mesh {
  const node = need(root, name) as Mesh;
  if (!node.isMesh) throw new Error('arm-cannon.glb node ' + name + ' is not a mesh');
  return node;
}

/** Clones the loaded scene (the loader cache keeps the original) and prepares it. Throws when a contract node is missing. */
export function buildArmCannon(scene: Group): ArmCannon {
  const root = scene.clone(true) as Group;
  const missing = Object.values(NODES).filter((name) => !root.getObjectByName(name));
  if (missing.length) throw new Error('arm-cannon.glb is missing node(s): ' + missing.join(', '));
  const shell = needMesh(root, NODES.shell), slide = needMesh(root, NODES.slide), vent = needMesh(root, NODES.vent);
  const muzzle = need(root, NODES.muzzle), ventMouth = need(root, NODES.ventMouth);
  // One clone shared by the three meshes (one program, one set of uniforms). Its textures are cloned too, so filtering changes
  // and disposal never touch the loader's cached asset; clones share the image source, so the GPU upload is not duplicated.
  const source = (Array.isArray(shell.material) ? shell.material[0] : shell.material) as MeshStandardMaterial;
  const material = source.clone();
  for (const slot of TEXTURE_SLOTS) {
    const tex = material[slot];
    if (!tex) continue;
    const copy = tex.clone();
    copy.magFilter = NearestFilter; copy.minFilter = NearestFilter; copy.generateMipmaps = false;
    copy.colorSpace = slot === 'map' ? SRGBColorSpace : NoColorSpace;
    copy.needsUpdate = true;
    material[slot] = copy;
  }
  const uniforms = installEmissiveMask(material);
  root.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = false; mesh.receiveShadow = false;
  });
  shell.material = material; slide.material = material; vent.material = material;
  // The slide travels along -BARREL_AXIS in the contract (root) frame; convert once into the slide parent's frame, keeping scale.
  root.updateMatrixWorld(true);
  const parent = slide.parent ?? root;
  const a = parent.worldToLocal(root.localToWorld(new Vector3(0, 0, 0)));
  // BARREL_AXIS is unit to 5 digits; normalized here so the slide travel in metres is exact.
  const back = new Vector3(-BARREL_AXIS.x, -BARREL_AXIS.y, -BARREL_AXIS.z).normalize();
  const b = parent.worldToLocal(root.localToWorld(back));
  root.visible = false;
  return {
    root, shell, slide, vent, muzzle, ventMouth, material, uniforms,
    slideRest: slide.position.clone(), ventRest: vent.quaternion.clone(), slideDir: b.sub(a),
  };
}

/** Writes the slide, hatch and glow from the drive. No allocation; non-finite values fall back to rest. */
export function driveArmCannon(c: ArmCannon, d: CannonDrive): void {
  const s = clamp(fin(d.slide, 0), 0, SLIDE_MAX);
  c.slide.position.copy(c.slideRest).addScaledVector(c.slideDir, s);
  hinge.setFromAxisAngle(X_AXIS, clamp(fin(d.vent, 0), 0, VENT_OVERSHOOT) * VENT_MAX);
  c.vent.quaternion.multiplyQuaternions(c.ventRest, hinge);
  const core = fin(d.core, REST_CORE), heat = fin(d.strip, REST_STRIP), fins = fin(d.fins, 0), ring = fin(d.ring, 0);
  const cc = d.coreColor, sc = d.stripColor, f = COLORS.fringe, cool = COLORS.cool;
  c.uniforms.uCore.value.setRGB(fin(cc.r, f.r) * core, fin(cc.g, f.g) * core, fin(cc.b, f.b) * core);
  c.uniforms.uHeat.value.setRGB(fin(sc.r, cool.r) * heat, fin(sc.g, cool.g) * heat, fin(sc.b, cool.b) * heat);
  c.uniforms.uFin.value.setRGB(fin(sc.r, cool.r) * fins, fin(sc.g, cool.g) * fins, fin(sc.b, cool.b) * fins);
  c.uniforms.uRing.value.setRGB(f.r * ring, f.g * ring, f.b * ring);
}

/** Parents the root to link.forearm with an identity local transform. ready is true only once it is parented there.
 * Returns true when it attached during this call. */
export function attachArmCannon(c: ArmCannon, link: CannonLink): boolean {
  const forearm = link.forearm;
  if (!forearm) { link.ready = false; return false; }
  let attached = false;
  if (c.root.parent !== forearm) {
    forearm.add(c.root);
    c.root.position.set(0, 0, 0); c.root.quaternion.identity(); c.root.scale.set(1, 1, 1);
    c.root.updateMatrixWorld(true);
    attached = c.root.parent === forearm;
  }
  link.ready = c.root.parent === forearm;
  return attached;
}

export function detachArmCannon(c: ArmCannon, link: CannonLink): void {
  c.root.removeFromParent();
  c.root.visible = false;
  link.ready = false; link.ventMouth.valid = false; link.fxMuzzle.valid = false;
}

const scratchMuzzle = new Vector3(), scratchVent = new Vector3(), scratchDir = new Vector3();

/** Priority -19, after Suit (-20) posed and updated the rig. Returns true when the cannon attached during this call. */
export function stepArmCannon(c: ArmCannon, link: CannonLink, d: CannonDrive): boolean {
  let attached = false;
  if (!link.forearm) { if (c.root.parent || link.ready) detachArmCannon(c, link); }
  else if (c.root.parent !== link.forearm || !link.ready) attached = attachArmCannon(c, link);
  const visible = link.ready && link.handHidden;
  c.root.visible = visible;
  driveArmCannon(c, d);
  // Suit's rig.root.updateMatrixWorld(true) already covered the cannon; only the pieces driven just now need refreshing.
  c.slide.updateMatrixWorld();
  c.vent.updateMatrixWorld();
  if (visible) {
    c.muzzle.getWorldPosition(scratchMuzzle);
    c.ventMouth.getWorldPosition(scratchVent);
    link.fxMuzzle.x = scratchMuzzle.x; link.fxMuzzle.y = scratchMuzzle.y; link.fxMuzzle.z = scratchMuzzle.z; link.fxMuzzle.valid = true;
    link.ventMouth.x = scratchVent.x; link.ventMouth.y = scratchVent.y; link.ventMouth.z = scratchVent.z; link.ventMouth.valid = true;
    scratchDir.set(VENT_DIR.x, VENT_DIR.y, VENT_DIR.z).transformDirection(c.root.matrixWorld);
    link.ventDir.x = scratchDir.x; link.ventDir.y = scratchDir.y; link.ventDir.z = scratchDir.z;
  } else { link.fxMuzzle.valid = false; link.ventMouth.valid = false; }
  return attached;
}

/** Frees the clone's GPU resources: the geometries, the shared cloned material and its cloned textures. */
export function disposeArmCannon(c: ArmCannon): void {
  c.root.traverse((o) => { const mesh = o as Mesh; if (mesh.isMesh) mesh.geometry.dispose(); });
  const m = c.material as MeshStandardMaterial & Record<(typeof TEXTURE_SLOTS)[number], Texture | null>;
  for (const slot of TEXTURE_SLOTS) m[slot]?.dispose();
  (c.material as Material).dispose();
}
